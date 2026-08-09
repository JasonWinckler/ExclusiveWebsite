import { isoNow } from "./db";
import { ApiError, parsePositiveInt, readJsonBody, readJsonResponse } from "./http";
import { sendTelegramAccessConfirmation } from "./membership-email";
import { randomBase64Url, secretsEqual, sha256Hex } from "./security";
import { decryptTotpSecret, encryptTotpSecret } from "./totp";
import type { MembershipEnv } from "./types";

type TelegramConnectionStatus =
  | "LINKED"
  | "INVITE_SENT"
  | "ACTIVE"
  | "MEMBERSHIP_INACTIVE"
  | "LEFT"
  | "ADMIN_SUSPENDED"
  | "ERROR";

interface TelegramAccess {
  appwrite_user_id: string;
  entitlement_id: string;
  tier: string;
  expires_at: string;
  preferred_locale: "de" | "en";
}

interface TelegramConnection {
  appwrite_user_id: string;
  telegram_user_id: string;
  entitlement_id: string | null;
  status: TelegramConnectionStatus;
  linked_at: string;
  joined_at: string | null;
  removed_at: string | null;
  access_email_sent_at: string | null;
  last_invite_created_at: string | null;
  last_synced_at: string;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
}

interface TelegramApiEnvelope<T> {
  ok?: boolean;
  result?: T;
  description?: string;
}

interface TelegramInviteResult {
  invite_link?: string;
}

function requireTelegramConfiguration(env: MembershipEnv): {
  token: string;
  chatId: string;
  username: string;
  encryptionKey: string;
} {
  const token = env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const chatId = env.TELEGRAM_CHAT_ID?.trim() ?? "";
  const username = env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") ?? "";
  const encryptionKey = env.TELEGRAM_INVITE_ENCRYPTION_KEY?.trim() ?? "";
  if (
    token.length < 32 ||
    !/^-?\d{1,24}$/.test(chatId) ||
    !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) ||
    !encryptionKey
  ) throw new ApiError(503, "PREMIUM_TELEGRAM_NOT_CONFIGURED");
  return { token, chatId, username, encryptionKey };
}

async function telegramApi<T>(
  env: MembershipEnv,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { token } = requireTelegramConfiguration(env);
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    await recordTelegramMetric(env.DB, "API_FAILED");
    throw new ApiError(503, "TELEGRAM_API_UNAVAILABLE");
  }
  const payload = await readJsonResponse<TelegramApiEnvelope<T>>(
    response,
    parsePositiveInt(env.MAX_UPSTREAM_JSON_BYTES, 65_536, 262_144),
    "INVALID_TELEGRAM_RESPONSE",
  );
  if (!response.ok || payload.ok !== true || payload.result === undefined) {
    await recordTelegramMetric(env.DB, "API_FAILED");
    throw new ApiError(503, "TELEGRAM_API_REQUEST_FAILED");
  }
  return payload.result;
}

async function recordTelegramMetric(
  db: D1Database,
  eventName:
    | "CLAIM_CREATED"
    | "BOT_LINKED"
    | "INVITE_CREATED"
    | "INVITE_USED"
    | "INVITE_REVOKED"
    | "MEMBER_REMOVED"
    | "MEMBER_RESTORED"
    | "API_FAILED",
): Promise<void> {
  const day = isoNow().slice(0, 10);
  await db.prepare(`INSERT INTO telegram_daily_metrics (day, event_name, event_count)
    VALUES (?, ?, 1)
    ON CONFLICT(day, event_name) DO UPDATE SET event_count = event_count + 1`)
    .bind(day, eventName).run();
}

async function eligibleTelegramAccess(
  env: MembershipEnv,
  userId: string,
): Promise<TelegramAccess | null> {
  const now = isoNow();
  return env.DB.prepare(`
    SELECT p.appwrite_user_id, e.id AS entitlement_id, e.tier, e.expires_at,
      CASE WHEN p.preferred_locale = 'en' THEN 'en' ELSE 'de' END AS preferred_locale
    FROM user_profiles p
    JOIN entitlements e ON e.appwrite_user_id = p.appwrite_user_id
      AND e.tier IN ('EXCLUSIVE_PREMIUM', 'EXCLUSIVE_VIP')
      AND e.status = 'ACTIVE' AND e.starts_at <= ? AND e.expires_at > ?
      AND e.paused_at IS NULL
    WHERE p.appwrite_user_id = ? AND p.account_status = 'ACTIVE'
      AND p.email_verified = 1 AND p.age_status = 'APPROVED'
    ORDER BY CASE e.tier WHEN 'EXCLUSIVE_VIP' THEN 2 ELSE 1 END DESC,
      e.expires_at DESC
    LIMIT 1
  `).bind(now, now, userId).first<TelegramAccess>();
}

async function connectionForUser(
  env: MembershipEnv,
  userId: string,
): Promise<TelegramConnection | null> {
  return env.DB.prepare(`SELECT * FROM telegram_connections WHERE appwrite_user_id = ?`)
    .bind(userId).first<TelegramConnection>();
}

function telegramStatusPayload(
  env: MembershipEnv,
  access: TelegramAccess,
  connection: TelegramConnection | null,
): Record<string, unknown> {
  const { username } = requireTelegramConfiguration(env);
  return {
    available: true,
    tier: access.tier,
    entitlementExpiresAt: access.expires_at,
    connectionStatus: connection?.status ?? "NOT_LINKED",
    linked: Boolean(connection),
    active: connection?.status === "ACTIVE",
    linkedAt: connection?.linked_at ?? null,
    joinedAt: connection?.joined_at ?? null,
    lastErrorCode: connection?.last_error_code ?? null,
    botUsername: `@${username}`,
    botUrl: `https://t.me/${username}`,
    privacy: {
      stored: ["telegram_user_id", "access_status", "timestamps"],
      notStored: ["telegram_username", "profile_photo", "chat_content"],
    },
  };
}

export async function telegramPerkStatus(
  env: MembershipEnv,
  userId: string,
): Promise<Record<string, unknown>> {
  requireTelegramConfiguration(env);
  const access = await eligibleTelegramAccess(env, userId);
  if (!access) throw new ApiError(403, "ACTIVE_PREMIUM_OR_VIP_REQUIRED");
  return telegramStatusPayload(env, access, await connectionForUser(env, userId));
}

async function revokeStoredInvites(
  env: MembershipEnv,
  userId: string,
  failClosed = false,
): Promise<void> {
  const config = requireTelegramConfiguration(env);
  const rows = await env.DB.prepare(`SELECT id, invite_ciphertext, expires_at
    FROM telegram_invites WHERE appwrite_user_id = ?`)
    .bind(userId).all<{ id: string; invite_ciphertext: string; expires_at: string }>();
  let failed = false;
  for (const row of rows.results) {
    try {
      const invite = await decryptTotpSecret(row.invite_ciphertext, config.encryptionKey);
      await telegramApi<boolean>(env, "revokeChatInviteLink", {
        chat_id: config.chatId,
        invite_link: invite,
      });
      await recordTelegramMetric(env.DB, "INVITE_REVOKED");
      await env.DB.prepare(`DELETE FROM telegram_invites WHERE id = ?`).bind(row.id).run();
    } catch {
      if (Date.parse(row.expires_at) <= Date.now()) {
        await env.DB.prepare(`DELETE FROM telegram_invites WHERE id = ?`).bind(row.id).run();
      } else {
        failed = true;
        await env.DB.prepare(`UPDATE telegram_invites SET last_error_code =
          'TELEGRAM_INVITE_REVOCATION_FAILED', updated_at = ? WHERE id = ?`)
          .bind(isoNow(), row.id).run();
      }
    }
  }
  if (failed && failClosed) throw new ApiError(503, "TELEGRAM_INVITE_REVOCATION_FAILED");
}

function invitationMessage(locale: "de" | "en", inviteUrl: string, expiresAt: string): string {
  const expiration = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(expiresAt));
  return locale === "de"
    ? `<b>Dein persönlicher Zugang ist bereit.</b>\n\nDieser Link ist nur deinem Telegram-Konto zugeordnet und läuft am ${expiration} ab. Nach deinem Beitritt wird er sofort entwertet.\n\n<a href="${inviteUrl}">Privatem Kanal beitreten</a>`
    : `<b>Your personal access is ready.</b>\n\nThis link is assigned only to your Telegram account and expires on ${expiration}. It is revoked immediately after you join.\n\n<a href="${inviteUrl}">Join the private channel</a>`;
}

async function issueInvite(
  env: MembershipEnv,
  access: TelegramAccess,
  telegramUserId: string,
  restored = false,
): Promise<void> {
  const config = requireTelegramConfiguration(env);
  await revokeStoredInvites(env, access.appwrite_user_id, true);
  const now = isoNow();
  const ttlMinutes = parsePositiveInt(env.TELEGRAM_INVITE_TTL_MINUTES, 15, 60);
  const expiresAtMs = Math.min(
    Date.parse(access.expires_at),
    Date.now() + ttlMinutes * 60_000,
  );
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now() + 30_000) {
    throw new ApiError(409, "TELEGRAM_MEMBERSHIP_EXPIRING");
  }
  const invite = await telegramApi<TelegramInviteResult>(env, "createChatInviteLink", {
    chat_id: config.chatId,
    name: `Member ${access.entitlement_id.slice(0, 8)}`,
    expire_date: Math.floor(expiresAtMs / 1_000),
    member_limit: 1,
    creates_join_request: false,
  });
  if (typeof invite.invite_link !== "string" || !invite.invite_link.startsWith("https://t.me/")) {
    throw new ApiError(503, "TELEGRAM_INVITE_CREATION_FAILED");
  }
  const inviteId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO telegram_invites (
      id, appwrite_user_id, entitlement_id, invite_ciphertext,
      encryption_key_version, expires_at, created_at, telegram_user_id,
      invite_link_sha256, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ISSUED', ?)`)
      .bind(
        inviteId,
        access.appwrite_user_id,
        access.entitlement_id,
        await encryptTotpSecret(invite.invite_link, config.encryptionKey),
        env.TELEGRAM_INVITE_KEY_VERSION?.trim() || "v1",
        new Date(expiresAtMs).toISOString(),
        now,
        telegramUserId,
        await sha256Hex(invite.invite_link),
        now,
      ),
    env.DB.prepare(`UPDATE telegram_connections SET entitlement_id = ?,
      status = 'INVITE_SENT', removed_at = NULL, access_email_sent_at = NULL,
      last_invite_created_at = ?, last_synced_at = ?, last_error_code = NULL,
      updated_at = ? WHERE appwrite_user_id = ? AND telegram_user_id = ?`)
      .bind(access.entitlement_id, now, now, now, access.appwrite_user_id, telegramUserId),
  ]);
  try {
    await telegramApi<{ message_id?: number }>(env, "sendMessage", {
      chat_id: telegramUserId,
      text: invitationMessage(access.preferred_locale, invite.invite_link, new Date(expiresAtMs).toISOString()),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  } catch (error) {
    await revokeStoredInvites(env, access.appwrite_user_id);
    await env.DB.prepare(`UPDATE telegram_connections SET status = 'ERROR',
      last_error_code = 'TELEGRAM_MESSAGE_DELIVERY_FAILED', updated_at = ?
      WHERE appwrite_user_id = ?`).bind(isoNow(), access.appwrite_user_id).run();
    throw error;
  }
  await recordTelegramMetric(env.DB, restored ? "MEMBER_RESTORED" : "INVITE_CREATED");
}

export async function createTelegramClaim(
  env: MembershipEnv,
  userId: string,
): Promise<Record<string, unknown>> {
  const config = requireTelegramConfiguration(env);
  const access = await eligibleTelegramAccess(env, userId);
  if (!access) throw new ApiError(403, "ACTIVE_PREMIUM_OR_VIP_REQUIRED");
  const connection = await connectionForUser(env, userId);
  if (connection?.status === "ADMIN_SUSPENDED") {
    throw new ApiError(403, "TELEGRAM_ACCESS_ADMIN_SUSPENDED");
  }
  if (connection?.status === "ACTIVE") return telegramStatusPayload(env, access, connection);
  if (connection) {
    await issueInvite(env, access, connection.telegram_user_id, connection.status === "MEMBERSHIP_INACTIVE");
    return {
      ...telegramStatusPayload(env, access, await connectionForUser(env, userId)),
      openTelegram: true,
    };
  }
  const rawToken = randomBase64Url(32);
  const now = isoNow();
  const expiresAt = new Date(
    Date.now() + parsePositiveInt(env.TELEGRAM_LINK_TOKEN_TTL_MINUTES, 10, 30) * 60_000,
  ).toISOString();
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM telegram_link_tokens WHERE appwrite_user_id = ?`).bind(userId),
    env.DB.prepare(`INSERT INTO telegram_link_tokens (
      id, appwrite_user_id, entitlement_id, token_sha256, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), userId, access.entitlement_id, await sha256Hex(rawToken), expiresAt, now),
  ]);
  await recordTelegramMetric(env.DB, "CLAIM_CREATED");
  return {
    ...telegramStatusPayload(env, access, null),
    connectionStatus: "AWAITING_BOT",
    claimExpiresAt: expiresAt,
    botUrl: `https://t.me/${config.username}?start=${rawToken}`,
  };
}

async function sendBotNotice(
  env: MembershipEnv,
  telegramUserId: string,
  locale: "de" | "en",
  kind: "INVALID" | "ALREADY_USED" | "SUSPENDED",
): Promise<void> {
  const messages = {
    de: {
      INVALID: "Dieser Verknüpfungslink ist ungültig oder abgelaufen. Erzeuge im Membership-Dashboard bitte einen neuen Link.",
      ALREADY_USED: "Dieses Telegram-Konto ist bereits mit einem anderen Membership-Konto verbunden.",
      SUSPENDED: "Der Telegram-Zugang wurde administrativ pausiert. Bitte wende dich an den Support.",
    },
    en: {
      INVALID: "This connection link is invalid or expired. Please create a new one in your membership dashboard.",
      ALREADY_USED: "This Telegram account is already linked to another membership account.",
      SUSPENDED: "Telegram access has been administratively paused. Please contact support.",
    },
  };
  await telegramApi(env, "sendMessage", { chat_id: telegramUserId, text: messages[locale][kind] });
}

async function handleStartMessage(env: MembershipEnv, update: Record<string, unknown>): Promise<void> {
  const message = update.message as Record<string, unknown> | undefined;
  const chat = message?.chat as Record<string, unknown> | undefined;
  const from = message?.from as Record<string, unknown> | undefined;
  if (chat?.type !== "private" || from?.is_bot === true) return;
  const telegramUserId = String(from?.id ?? "");
  const text = typeof message?.text === "string" ? message.text.trim() : "";
  const match = /^\/start(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9_-]{43})$/.exec(text);
  if (!/^\d{1,24}$/.test(telegramUserId) || !match) return;
  const tokenHash = await sha256Hex(match[1]!);
  const now = isoNow();
  const claim = await env.DB.prepare(`SELECT appwrite_user_id, entitlement_id
    FROM telegram_link_tokens WHERE token_sha256 = ? AND expires_at > ?`)
    .bind(tokenHash, now).first<{ appwrite_user_id: string; entitlement_id: string }>();
  if (!claim) {
    await sendBotNotice(env, telegramUserId, "de", "INVALID");
    return;
  }
  const access = await eligibleTelegramAccess(env, claim.appwrite_user_id);
  if (!access || access.entitlement_id !== claim.entitlement_id) {
    await env.DB.prepare(`DELETE FROM telegram_link_tokens WHERE token_sha256 = ?`).bind(tokenHash).run();
    await sendBotNotice(env, telegramUserId, "de", "INVALID");
    return;
  }
  const [byTelegram, byUser] = await Promise.all([
    env.DB.prepare(`SELECT appwrite_user_id FROM telegram_connections WHERE telegram_user_id = ?`)
      .bind(telegramUserId).first<{ appwrite_user_id: string }>(),
    connectionForUser(env, claim.appwrite_user_id),
  ]);
  if (byTelegram && byTelegram.appwrite_user_id !== claim.appwrite_user_id) {
    await sendBotNotice(env, telegramUserId, access.preferred_locale, "ALREADY_USED");
    return;
  }
  if (byUser?.status === "ADMIN_SUSPENDED") {
    await sendBotNotice(env, telegramUserId, access.preferred_locale, "SUSPENDED");
    return;
  }
  if (byUser && byUser.telegram_user_id !== telegramUserId) {
    await sendBotNotice(env, telegramUserId, access.preferred_locale, "ALREADY_USED");
    return;
  }
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO telegram_connections (
      appwrite_user_id, telegram_user_id, entitlement_id, status,
      linked_at, last_synced_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'LINKED', ?, ?, ?, ?)
    ON CONFLICT(appwrite_user_id) DO UPDATE SET entitlement_id = excluded.entitlement_id,
      status = 'LINKED', last_synced_at = excluded.last_synced_at,
      last_error_code = NULL, updated_at = excluded.updated_at`)
      .bind(claim.appwrite_user_id, telegramUserId, access.entitlement_id, now, now, now, now),
    env.DB.prepare(`DELETE FROM telegram_link_tokens WHERE appwrite_user_id = ?`)
      .bind(claim.appwrite_user_id),
  ]);
  await recordTelegramMetric(env.DB, "BOT_LINKED");
  await issueInvite(env, access, telegramUserId);
}

async function removeTelegramMember(
  env: MembershipEnv,
  telegramUserId: string,
): Promise<void> {
  const { chatId } = requireTelegramConfiguration(env);
  await telegramApi<boolean>(env, "banChatMember", {
    chat_id: chatId,
    user_id: telegramUserId,
    revoke_messages: false,
  });
  await telegramApi<boolean>(env, "unbanChatMember", {
    chat_id: chatId,
    user_id: telegramUserId,
    only_if_banned: true,
  });
  await recordTelegramMetric(env.DB, "MEMBER_REMOVED");
}

async function handleChatMemberUpdate(env: MembershipEnv, update: Record<string, unknown>): Promise<void> {
  const change = update.chat_member as Record<string, unknown> | undefined;
  const chat = change?.chat as Record<string, unknown> | undefined;
  const nextMember = change?.new_chat_member as Record<string, unknown> | undefined;
  const nextUser = nextMember?.user as Record<string, unknown> | undefined;
  const telegramUserId = String(nextUser?.id ?? "");
  if (String(chat?.id ?? "") !== requireTelegramConfiguration(env).chatId || !/^\d{1,24}$/.test(telegramUserId)) return;
  const nextStatus = String(nextMember?.status ?? "");
  const inviteLink = (change?.invite_link as Record<string, unknown> | undefined)?.invite_link;
  if (["member", "administrator", "creator"].includes(nextStatus) && typeof inviteLink === "string") {
    const inviteHash = await sha256Hex(inviteLink);
    const assignment = await env.DB.prepare(`SELECT id, appwrite_user_id, telegram_user_id
      FROM telegram_invites WHERE invite_link_sha256 = ? AND status IN ('ISSUED', 'USED')`)
      .bind(inviteHash).first<{ id: string; appwrite_user_id: string; telegram_user_id: string | null }>();
    if (!assignment) return;
    if (assignment.telegram_user_id !== telegramUserId) {
      await telegramApi<boolean>(env, "revokeChatInviteLink", {
        chat_id: requireTelegramConfiguration(env).chatId,
        invite_link: inviteLink,
      });
      await removeTelegramMember(env, telegramUserId);
      await env.DB.prepare(`DELETE FROM telegram_invites WHERE id = ?`).bind(assignment.id).run();
      return;
    }
    const now = isoNow();
    const existing = await connectionForUser(env, assignment.appwrite_user_id);
    await env.DB.batch([
      env.DB.prepare(`UPDATE telegram_connections SET status = 'ACTIVE', joined_at = ?,
        removed_at = NULL, last_synced_at = ?, last_error_code = NULL, updated_at = ?
        WHERE appwrite_user_id = ? AND telegram_user_id = ?`)
        .bind(now, now, now, assignment.appwrite_user_id, telegramUserId),
      env.DB.prepare(`UPDATE telegram_invites SET status = 'USED', used_at = ?, updated_at = ?
        WHERE id = ?`).bind(now, now, assignment.id),
    ]);
    let revoked = false;
    try {
      await telegramApi<boolean>(env, "revokeChatInviteLink", {
        chat_id: requireTelegramConfiguration(env).chatId,
        invite_link: inviteLink,
      });
      revoked = true;
      await recordTelegramMetric(env.DB, "INVITE_REVOKED");
    } finally {
      if (revoked) await env.DB.prepare(`DELETE FROM telegram_invites WHERE id = ?`).bind(assignment.id).run();
    }
    await recordTelegramMetric(env.DB, "INVITE_USED");
    if (existing?.status !== "ACTIVE") {
      await sendTelegramAccessConfirmation(env, assignment.appwrite_user_id, now);
    }
    return;
  }
  if (["left", "kicked"].includes(nextStatus)) {
    await env.DB.prepare(`UPDATE telegram_connections SET status = 'LEFT', removed_at = ?,
      last_synced_at = ?, updated_at = ? WHERE telegram_user_id = ? AND status = 'ACTIVE'`)
      .bind(isoNow(), isoNow(), isoNow(), telegramUserId).run();
  }
}

export async function handleTelegramWebhook(
  request: Request,
  env: MembershipEnv,
): Promise<Record<string, unknown>> {
  const expected = env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
  const supplied = request.headers.get("X-Telegram-Bot-Api-Secret-Token")?.trim() ?? "";
  if (!expected || !await secretsEqual(expected, supplied)) {
    throw new ApiError(401, "INVALID_TELEGRAM_WEBHOOK_SECRET");
  }
  const update = await readJsonBody<Record<string, unknown>>(request, 65_536);
  if (!Number.isInteger(update.update_id)) throw new ApiError(400, "INVALID_TELEGRAM_UPDATE");
  if (update.message) await handleStartMessage(env, update);
  if (update.chat_member) await handleChatMemberUpdate(env, update);
  return { ok: true };
}

export async function configureTelegramWebhook(env: MembershipEnv): Promise<Record<string, unknown>> {
  const webhookUrl = env.TELEGRAM_WEBHOOK_URL?.trim() ?? "";
  const secret = env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
  if (!/^https:\/\/exclusive\.jason-shadow\.com\/api\/member\/v1\/telegram\/webhook$/.test(webhookUrl)) {
    throw new ApiError(503, "TELEGRAM_WEBHOOK_URL_NOT_CONFIGURED");
  }
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(secret)) {
    throw new ApiError(503, "TELEGRAM_WEBHOOK_SECRET_NOT_CONFIGURED");
  }
  await telegramApi<boolean>(env, "setWebhook", {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message", "chat_member"],
    drop_pending_updates: true,
  });
  return { configured: true, url: webhookUrl, allowedUpdates: ["message", "chat_member"] };
}

export async function listTelegramConnections(env: MembershipEnv): Promise<Record<string, unknown>> {
  const now = isoNow();
  const rows = await env.DB.prepare(`SELECT c.appwrite_user_id, c.status, c.linked_at,
      c.joined_at, c.removed_at, c.last_invite_created_at, c.last_synced_at,
      c.last_error_code, p.display_name, p.email, p.account_status,
      (SELECT e.tier FROM entitlements e WHERE e.appwrite_user_id = c.appwrite_user_id
        AND e.tier IN ('EXCLUSIVE_PREMIUM','EXCLUSIVE_VIP') AND e.status = 'ACTIVE'
        AND e.starts_at <= ? AND e.expires_at > ? AND e.paused_at IS NULL
        ORDER BY e.expires_at DESC LIMIT 1) AS active_tier
    FROM telegram_connections c JOIN user_profiles p
      ON p.appwrite_user_id = c.appwrite_user_id
    ORDER BY c.updated_at DESC LIMIT 250`).bind(now, now).all();
  return { connections: rows.results };
}

async function writeTelegramAudit(
  env: MembershipEnv,
  administratorUserId: string,
  userId: string,
  action: string,
  previousStatus: string | null,
  nextStatus: string | null,
  reason: string,
  correlationId: string,
): Promise<void> {
  await env.DB.prepare(`INSERT INTO admin_audit_events (
    id, administrator_appwrite_user_id, action, target_type, target_id,
    subject_appwrite_user_id, previous_state_json, new_state_json,
    reason, correlation_id, created_at
  ) VALUES (?, ?, ?, 'TELEGRAM_CONNECTION', ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      crypto.randomUUID(), administratorUserId, action, userId, userId,
      JSON.stringify({ status: previousStatus }), JSON.stringify({ status: nextStatus }),
      reason, correlationId, isoNow(),
    ).run();
}

export async function administerTelegramConnection(
  env: MembershipEnv,
  administratorUserId: string,
  userId: string,
  action: "REMOVE" | "RESTORE" | "UNLINK",
  reason: string,
  correlationId: string,
): Promise<Record<string, unknown>> {
  if (reason.trim().length < 3 || reason.length > 500) throw new ApiError(400, "REASON_REQUIRED");
  const connection = await connectionForUser(env, userId);
  if (!connection) throw new ApiError(404, "TELEGRAM_CONNECTION_NOT_FOUND");
  if (action === "REMOVE" || action === "UNLINK") {
    await revokeStoredInvites(env, userId, true);
    await removeTelegramMember(env, connection.telegram_user_id).catch(async () => {
      await env.DB.prepare(`UPDATE telegram_connections SET status = 'ERROR',
        last_error_code = 'TELEGRAM_MEMBER_REMOVAL_FAILED', updated_at = ?
        WHERE appwrite_user_id = ?`).bind(isoNow(), userId).run();
      throw new ApiError(503, "TELEGRAM_MEMBER_REMOVAL_FAILED");
    });
    if (action === "UNLINK") {
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM telegram_link_tokens WHERE appwrite_user_id = ?`).bind(userId),
        env.DB.prepare(`DELETE FROM telegram_connections WHERE appwrite_user_id = ?`).bind(userId),
      ]);
      await writeTelegramAudit(env, administratorUserId, userId, "TELEGRAM_ACCOUNT_UNLINKED", connection.status, null, reason.trim(), correlationId);
      return { userId, status: "NOT_LINKED" };
    }
    const now = isoNow();
    await env.DB.prepare(`UPDATE telegram_connections SET status = 'ADMIN_SUSPENDED',
      removed_at = ?, last_synced_at = ?, last_error_code = NULL, updated_at = ?
      WHERE appwrite_user_id = ?`).bind(now, now, now, userId).run();
    await writeTelegramAudit(env, administratorUserId, userId, "TELEGRAM_ACCESS_SUSPENDED", connection.status, "ADMIN_SUSPENDED", reason.trim(), correlationId);
    return { userId, status: "ADMIN_SUSPENDED" };
  }
  const access = await eligibleTelegramAccess(env, userId);
  if (!access) throw new ApiError(409, "ACTIVE_PREMIUM_OR_VIP_REQUIRED");
  await issueInvite(env, access, connection.telegram_user_id, true);
  await writeTelegramAudit(env, administratorUserId, userId, "TELEGRAM_ACCESS_RESTORED", connection.status, "INVITE_SENT", reason.trim(), correlationId);
  return { userId, status: "INVITE_SENT" };
}

export async function removeTelegramBeforeAccountDeletion(
  env: MembershipEnv,
  userId: string,
): Promise<void> {
  const connection = await connectionForUser(env, userId);
  if (!connection) return;
  try {
    await revokeStoredInvites(env, userId, true);
    await removeTelegramMember(env, connection.telegram_user_id);
    await env.DB.prepare(`DELETE FROM telegram_connections WHERE appwrite_user_id = ?`)
      .bind(userId).run();
  } catch {
    await env.DB.prepare(`UPDATE telegram_connections SET status = 'ERROR',
      last_error_code = 'ACCOUNT_DELETION_REMOVAL_PENDING', updated_at = ?
      WHERE appwrite_user_id = ?`).bind(isoNow(), userId).run();
  }
}

export async function syncTelegramAccess(env: MembershipEnv): Promise<{
  checked: number;
  removed: number;
  restored: number;
  deleted: number;
}> {
  requireTelegramConfiguration(env);
  const now = isoNow();
  const expiredInvites = await env.DB.prepare(`SELECT id, appwrite_user_id, invite_ciphertext
    FROM telegram_invites WHERE expires_at <= ? OR status = 'USED' LIMIT 100`)
    .bind(now).all<{ id: string; appwrite_user_id: string; invite_ciphertext: string }>();
  for (const invite of expiredInvites.results) {
    await revokeStoredInvites(env, invite.appwrite_user_id);
  }
  await env.DB.prepare(`DELETE FROM telegram_link_tokens WHERE expires_at <= ?`).bind(now).run();

  const connections = await env.DB.prepare(`SELECT c.*, p.account_status
    FROM telegram_connections c JOIN user_profiles p
      ON p.appwrite_user_id = c.appwrite_user_id
    ORDER BY c.updated_at ASC LIMIT 100`).all<TelegramConnection & { account_status: string }>();
  let removed = 0;
  let restored = 0;
  let deleted = 0;
  for (const connection of connections.results) {
    const access = await eligibleTelegramAccess(env, connection.appwrite_user_id);
    if (connection.account_status === "DELETED") {
      try {
        await revokeStoredInvites(env, connection.appwrite_user_id, true);
        await removeTelegramMember(env, connection.telegram_user_id);
        await env.DB.prepare(`DELETE FROM telegram_connections WHERE appwrite_user_id = ?`)
          .bind(connection.appwrite_user_id).run();
        deleted += 1;
      } catch {
        await env.DB.prepare(`UPDATE telegram_connections SET status = 'ERROR',
          last_error_code = 'ACCOUNT_DELETION_REMOVAL_PENDING', updated_at = ?
          WHERE appwrite_user_id = ?`).bind(isoNow(), connection.appwrite_user_id).run();
      }
      continue;
    }
    if (!access && ["LINKED", "INVITE_SENT", "ACTIVE", "ERROR"].includes(connection.status)) {
      try {
        await revokeStoredInvites(env, connection.appwrite_user_id, true);
        await removeTelegramMember(env, connection.telegram_user_id);
        await env.DB.prepare(`UPDATE telegram_connections SET status = 'MEMBERSHIP_INACTIVE',
          entitlement_id = NULL, removed_at = ?, last_synced_at = ?,
          last_error_code = NULL, updated_at = ? WHERE appwrite_user_id = ?`)
          .bind(now, now, now, connection.appwrite_user_id).run();
        removed += 1;
      } catch {
        await env.DB.prepare(`UPDATE telegram_connections SET status = 'ERROR',
          last_error_code = 'TELEGRAM_MEMBER_REMOVAL_FAILED', updated_at = ?
          WHERE appwrite_user_id = ?`).bind(isoNow(), connection.appwrite_user_id).run();
      }
      continue;
    }
    if (access && connection.status === "MEMBERSHIP_INACTIVE") {
      await issueInvite(env, access, connection.telegram_user_id, true).catch(async () => {
        await env.DB.prepare(`UPDATE telegram_connections SET status = 'MEMBERSHIP_INACTIVE',
          last_error_code = 'TELEGRAM_RESTORE_FAILED', updated_at = ?
          WHERE appwrite_user_id = ?`).bind(isoNow(), connection.appwrite_user_id).run();
      });
      restored += 1;
      continue;
    }
    await env.DB.prepare(`UPDATE telegram_connections SET last_synced_at = ?, updated_at = ?
      WHERE appwrite_user_id = ?`).bind(now, now, connection.appwrite_user_id).run();
  }
  return { checked: connections.results.length, removed, restored, deleted };
}
