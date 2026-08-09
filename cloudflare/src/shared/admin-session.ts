import { isoNow } from "./db";
import { ApiError } from "./http";
import { sha256Hex, validateDeviceToken } from "./security";

export async function requireActiveAdminSession(
  request: Request,
  db: D1Database,
  administratorUserId: string,
): Promise<void> {
  const token = request.headers.get("X-Admin-Session")?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new ApiError(401, "ADMIN_SESSION_REQUIRED");
  }
  const deviceToken = validateDeviceToken(request.headers.get("X-Device-Token"));
  const now = isoNow();
  const session = await db.prepare(`
    SELECT id, last_seen_at FROM admin_sessions
    WHERE administrator_appwrite_user_id = ? AND session_token_sha256 = ?
      AND device_token_sha256 = ? AND revoked_at IS NULL AND expires_at > ?
  `).bind(
    administratorUserId,
    await sha256Hex(token),
    await sha256Hex(deviceToken),
    now,
  ).first<{ id: string; last_seen_at: string }>();
  if (!session) throw new ApiError(401, "ADMIN_SESSION_EXPIRED");
  if (Date.parse(session.last_seen_at) < Date.now() - 60_000) {
    await db.prepare(`
      UPDATE admin_sessions SET last_seen_at = ?
      WHERE id = ? AND last_seen_at = ?
    `).bind(now, session.id, session.last_seen_at).run();
  }
}
