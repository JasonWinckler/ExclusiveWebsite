import crypto from "node:crypto";
import { Client, ID, Permission, Query, Role, Storage, TablesDB, Users } from "node-appwrite";

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
  .setKey(process.env.APPWRITE_FUNCTION_API_KEY);
const tables = new TablesDB(client);
const storage = new Storage(client);
const users = new Users(client);

const json = (request) => {
  try { return JSON.parse(request.bodyText || "{}"); } catch { throw new Error("INVALID_JSON"); }
};
const userId = (request) => request.headers["x-appwrite-user-id"] || "";
const admin = (request) => (request.headers["x-appwrite-user-labels"] || "").split(",").includes("admin");
const ownRead = (id) => [Permission.read(Role.user(id))];
const doc = (collectionId, documentId) => tables.getRow({ databaseId: DATABASE_ID, tableId: collectionId, rowId: documentId });
const update = (collectionId, documentId, data) => tables.updateRow({ databaseId: DATABASE_ID, tableId: collectionId, rowId: documentId, data });
const list = (collectionId, queries = []) => tables.listRows({ databaseId: DATABASE_ID, tableId: collectionId, queries });
const respond = (res, code, payload) => res.json(payload, code);

async function provision(req, res) {
  const id = userId(req);
  if (!id) return respond(res, 401, { error: "AUTH_REQUIRED" });
  const authUser = await users.get({ userId: id });
  const input = json(req);
  try {
    const existing = await doc("user_profiles", id);
    return respond(res, 200, { id: existing.$id, status: existing.status });
  } catch (error) { if (error.code !== 404) throw error; }
  const profile = await tables.createRow({
    databaseId: DATABASE_ID, tableId: "user_profiles", rowId: id,
    data: { userId: id, displayName: String(input.name || authUser.name || "").slice(0, 128), status: "EMAIL_PENDING", verificationStatus: "NOT_STARTED", tier: "NONE", jurisdiction: "UNASSESSED", retentionUntil: new Date(Date.now() + 365 * 86400000).toISOString(), lastActiveAt: new Date().toISOString() },
    permissions: ownRead(id),
  });
  return respond(res, 201, { id: profile.$id, status: profile.status });
}

async function finalizeVerification(req, res) {
  const id = userId(req);
  if (!id) return respond(res, 401, { error: "AUTH_REQUIRED" });
  const input = json(req);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate || "") || !/^[A-Z]{2}$/.test(input.country || "")) return respond(res, 400, { error: "INVALID_FIELDS" });
  if (![input.documentFileId, input.selfieFileId].every((value) => /^[A-Za-z0-9._-]{1,36}$/.test(value || ""))) return respond(res, 400, { error: "INVALID_FILE_IDS" });
  await Promise.all([input.documentFileId, input.selfieFileId].map((fileId) => storage.getFile({ bucketId: process.env.VERIFICATION_BUCKET_ID, fileId })));
  const caseId = ID.unique();
  await tables.createRow({ databaseId: DATABASE_ID, tableId: "age_verification_cases", rowId: caseId, data: {
    userId: id, legalName: String(input.legalName || "").slice(0, 128), birthDate: input.birthDate, country: input.country,
    documentFileId: input.documentFileId, selfieFileId: input.selfieFileId, status: "PENDING_REVIEW", submittedAt: new Date().toISOString(), retentionUntil: new Date(Date.now() + 90 * 86400000).toISOString(), reviewerId: "", decisionReason: "",
  }, permissions: ownRead(id) });
  await tables.createRow({ databaseId: DATABASE_ID, tableId: "verification_attempts", rowId: ID.unique(), data: { userId: id, caseId, outcome: "SUBMITTED", createdAt: new Date().toISOString(), detail: "" }, permissions: ownRead(id) });
  await update("user_profiles", id, { verificationStatus: "PENDING_REVIEW", jurisdiction: input.country });
  return respond(res, 201, { caseId, status: "PENDING_REVIEW" });
}

async function review(req, res) {
  // Appwrite restricts execution to the administrators Team.
  // Do not duplicate that authorization with browser-supplied role data.
  const input = json(req);
  if (!["APPROVED", "REJECTED"].includes(input.decision)) return respond(res, 400, { error: "INVALID_DECISION" });
  const reviewerId = userId(req);
  const record = await doc("age_verification_cases", input.caseId);
  if (record.status !== "PENDING_REVIEW") return respond(res, 409, { error: "CASE_ALREADY_DECIDED" });
  await update("age_verification_cases", input.caseId, { status: input.decision, reviewerId, decisionReason: String(input.reason || "").slice(0, 500), decidedAt: new Date().toISOString() });
  await update("user_profiles", record.userId, { verificationStatus: input.decision, status: input.decision === "APPROVED" ? "ACTIVE" : "RESTRICTED" });
  await tables.createRow({ databaseId: DATABASE_ID, tableId: "admin_audit_events", rowId: ID.unique(), data: { adminUserId: reviewerId, action: `VERIFICATION_${input.decision}`, targetType: "age_verification_case", targetId: input.caseId, reason: String(input.reason || "").slice(0, 500), createdAt: new Date().toISOString() }, permissions: [] });
  return respond(res, 200, { status: input.decision });
}

async function webhook(req, res) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  const supplied = req.headers["x-webhook-signature"] || "";
  const expected = crypto.createHmac("sha256", secret || "").update(req.bodyText || "").digest("hex");
  const valid = secret && supplied.length === expected.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  if (!valid) return respond(res, 401, { error: "INVALID_SIGNATURE" });
  const input = json(req);
  if (!input.eventId || !input.userId || !input.productId) return respond(res, 400, { error: "INVALID_EVENT" });
  try { await doc("subscriptions", input.eventId); return respond(res, 200, { duplicate: true }); } catch (error) { if (error.code !== 404) throw error; }
  const active = ["active", "renewed"].includes(input.status);
  await tables.createRow({ databaseId: DATABASE_ID, tableId: "subscriptions", rowId: input.eventId, data: { userId: input.userId, productId: input.productId, provider: String(input.provider || "configured-provider"), providerReference: String(input.providerReference || ""), status: active ? "ACTIVE" : "INACTIVE", currentPeriodEnd: input.currentPeriodEnd || new Date().toISOString(), updatedAt: new Date().toISOString() }, permissions: ownRead(input.userId) });
  return respond(res, 202, { accepted: true });
}

async function evaluate(req, res) {
  const input = json(req); const id = input.userId || userId(req);
  if (!id || (input.userId && !admin(req))) return respond(res, 403, { error: "NOT_ALLOWED" });
  const profile = await doc("user_profiles", id);
  const subscriptions = await list("subscriptions", [Query.equal("userId", [id]), Query.equal("status", ["ACTIVE"]), Query.limit(100)]);
  const now = Date.now();
  const eligible = profile.status === "ACTIVE" && profile.verificationStatus === "APPROVED";
  for (const subscription of subscriptions.rows) {
    const product = await doc("products", subscription.productId);
    const expiresAt = subscription.currentPeriodEnd;
    const status = eligible && new Date(expiresAt).getTime() > now ? "ACTIVE" : "INACTIVE";
    const entitlementId = `${id}_${subscription.productId}`.slice(0, 36);
    try { await update("entitlements", entitlementId, { status, expiresAt, evaluatedAt: new Date().toISOString() }); }
    catch (error) { if (error.code !== 404) throw error; await tables.createRow({ databaseId: DATABASE_ID, tableId: "entitlements", rowId: entitlementId, data: { userId: id, productId: product.$id, tier: product.tier, status, expiresAt, evaluatedAt: new Date().toISOString() }, permissions: ownRead(id) }); }
  }
  return respond(res, 200, { evaluated: subscriptions.total });
}

async function authorize(req, res) {
  const id = userId(req); if (!id) return respond(res, 401, { error: "AUTH_REQUIRED" });
  const input = json(req); const content = await doc("content_items", input.contentId);
  const grants = await list("entitlements", [Query.equal("userId", [id]), Query.equal("tier", [content.requiredTier]), Query.equal("status", ["ACTIVE"]), Query.greaterThan("expiresAt", new Date().toISOString()), Query.limit(1)]);
  if (!grants.total) return respond(res, 403, { error: "ENTITLEMENT_REQUIRED" });
  // Return an opaque file identifier only. A trusted delivery service must exchange
  // this authorization for a short-lived response; clients never construct URLs.
  return respond(res, 200, { authorized: true, fileId: content.fileId, expiresIn: 60 });
}

async function retentionCleanup(req, res) {
  const expired = await list("age_verification_cases", [Query.lessThan("retentionUntil", new Date().toISOString()), Query.limit(100)]);
  let removed = 0;
  for (const record of expired.rows) {
    for (const fileId of [record.documentFileId, record.selfieFileId]) await storage.deleteFile({ bucketId: process.env.VERIFICATION_BUCKET_ID, fileId }).catch(() => undefined);
    await tables.deleteRow({ databaseId: DATABASE_ID, tableId: "age_verification_cases", rowId: record.$id }); removed++;
  }
  return respond(res, 200, { removed });
}

async function inactiveCleanup(req, res) {
  const cutoff = new Date(Date.now() - Number(process.env.INACTIVE_DAYS || 730) * 86400000).toISOString();
  const inactive = await list("user_profiles", [Query.lessThan("lastActiveAt", cutoff), Query.limit(100)]);
  for (const profile of inactive.rows) await tables.createRow({ databaseId: DATABASE_ID, tableId: "deletion_jobs", rowId: ID.unique(), data: { userId: profile.userId, status: "PENDING", reason: "INACTIVE_ACCOUNT", scheduledAt: new Date().toISOString(), createdAt: new Date().toISOString() }, permissions: ownRead(profile.userId) });
  return respond(res, 200, { queued: inactive.total });
}

const handlers = { provision, finalizeVerification, review, webhook, evaluate, authorize, retentionCleanup, inactiveCleanup };
export default async ({ req, res, error }) => {
  try { return await handlers[process.env.FUNCTION_KIND](req, res); }
  catch (exception) { error(exception.message); return respond(res, exception.code >= 400 && exception.code < 600 ? exception.code : 500, { error: "REQUEST_FAILED" }); }
};
