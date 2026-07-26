import { Account, Client, Functions, ID, Permission, Query, Role, Storage, TablesDB } from "appwrite";

export const appwriteConfig = Object.freeze({
  endpoint: import.meta.env.VITE_APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1",
  projectId: import.meta.env.VITE_APPWRITE_PROJECT_ID || "6a64cbeb0009826c9efc",
  databaseId: import.meta.env.VITE_APPWRITE_DATABASE_ID || "6a64f96800187b534953",
  usersCollectionId: import.meta.env.VITE_APPWRITE_USERS_COLLECTION_ID || "user_profiles",
  ageVerificationCollectionId: import.meta.env.VITE_APPWRITE_AGE_COLLECTION_ID || "age_verification_cases",
  storageBucketId: import.meta.env.VITE_APPWRITE_STORAGE_BUCKET_ID || "6a657e2b0008347358ee",
  provisionFunctionId: import.meta.env.VITE_APPWRITE_PROVISION_FUNCTION_ID || "account-provisioning",
  verificationFunctionId: import.meta.env.VITE_APPWRITE_VERIFICATION_FUNCTION_ID || "age-verification-finalize",
});

const client = new Client().setEndpoint(appwriteConfig.endpoint).setProject(appwriteConfig.projectId);
const account = new Account(client);
const tables = new TablesDB(client);
const storage = new Storage(client);
const functions = new Functions(client);

// Browser permissions are deliberately limited to reading the user's own records.
// Status, tier, expiry, payment, jurisdiction, and entitlement fields are written
// only by the server Functions.
const privateReadPermission = (userId) => [Permission.read(Role.user(userId))];

export async function getCurrentUser() {
  try { return await account.get(); } catch (error) {
    if (error?.code === 401) return null;
    throw error;
  }
}

export async function registerAccount({ name, email, password }) {
  const user = await account.create({ userId: ID.unique(), email, password, name });
  await account.createEmailPasswordSession({ email, password });
  try {
    await functions.createExecution({
      functionId: appwriteConfig.provisionFunctionId,
      body: JSON.stringify({ name }),
      async: false,
    });
  } catch (error) {
    await account.deleteSession({ sessionId: "current" }).catch(() => undefined);
    throw error;
  }
  await account.createVerification({ url: `${window.location.origin}/?action=verify-email` });
  return user;
}

export const login = (email, password) => account.createEmailPasswordSession({ email, password });
export const logout = () => account.deleteSession({ sessionId: "current" });
export const resendVerification = () => account.createVerification({ url: `${window.location.origin}/?action=verify-email` });
export const requestPasswordReset = (email) => account.createRecovery({ email, url: `${window.location.origin}/?action=recover` });
export const completePasswordReset = (userId, secret, password) => account.updateRecovery({ userId, secret, password });
export const completeEmailVerification = (userId, secret) => account.updateVerification({ userId, secret });

export async function getMemberProfile(userId) {
  try {
    return await tables.getRow({ databaseId: appwriteConfig.databaseId, tableId: appwriteConfig.usersCollectionId, rowId: userId });
  } catch (error) {
    if (error?.code === 404) return null;
    throw error;
  }
}

export async function getAgeVerification(userId) {
  try {
    const result = await tables.listRows({ databaseId: appwriteConfig.databaseId, tableId: appwriteConfig.ageVerificationCollectionId, queries: [Query.equal("userId", [userId]), Query.orderDesc("submittedAt"), Query.limit(1)] });
    return result.rows[0] || null;
  } catch (error) {
    if (error?.code === 404) return null;
    throw error;
  }
}

const acceptedVerificationTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const validateVerificationFile = (file) => {
  if (!(file instanceof File) || !file.size) throw new Error("VERIFICATION_FILES_REQUIRED");
  if (!acceptedVerificationTypes.has(file.type)) throw new Error("VERIFICATION_FILE_TYPE");
  if (file.size > 10 * 1024 * 1024) throw new Error("VERIFICATION_FILE_SIZE");
};

export async function submitAgeVerification(user, { birthDate, country, legalName, identityDocument, selfie }) {
  const age = Math.floor((Date.now() - new Date(`${birthDate}T00:00:00Z`).getTime()) / 31557600000);
  if (!Number.isFinite(age) || age < 18) throw new Error("AGE_REQUIREMENT_NOT_MET");
  validateVerificationFile(identityDocument);
  validateVerificationFile(selfie);
  const uploaded = [];
  try {
    for (const file of [identityDocument, selfie]) {
      uploaded.push(await storage.createFile({
        bucketId: appwriteConfig.storageBucketId,
        fileId: ID.unique(),
        file,
        permissions: privateReadPermission(user.$id),
      }));
    }
  } catch (error) {
    throw error;
  }
  const request = {
    legalName,
    birthDate,
    country: country.toUpperCase(),
    documentFileId: uploaded[0].$id,
    selfieFileId: uploaded[1].$id,
  };
  try {
    const execution = await functions.createExecution({
      functionId: appwriteConfig.verificationFunctionId,
      body: JSON.stringify(request),
      async: false,
    });
    if (execution.status === "failed") throw new Error("AGE_SUBMISSION_FAILED");
  } catch (error) {
    // Files have no browser-side delete permission, so a reviewer can audit and
    // remove an orphan safely if document creation fails.
    if (error?.code === 409) throw new Error("AGE_REQUEST_EXISTS");
    throw error;
  }
  return { ...request, status: "PENDING_REVIEW" };
}

export { account, client, functions, storage, tables };
