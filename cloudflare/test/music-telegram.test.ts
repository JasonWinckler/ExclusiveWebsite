import { afterEach, describe, expect, it, vi } from "vitest";
import { handleTelegramWebhook } from "../src/shared/telegram";
import type { MembershipEnv } from "../src/shared/types";

afterEach(() => vi.unstubAllGlobals());

describe("music community cutover", () => {
  it.each(["false", undefined])("revokes a pre-cutover invitation and removes a new join when review is %s", async (MUSIC_COMMUNITY_REVIEWED) => {
    const statements: string[] = [];
    const DB = {
      prepare(sql: string) {
        statements.push(sql);
        const statement = {
          bind: () => statement,
          async first() {
            if (sql.includes("FROM telegram_invites")) return { id: "invite", appwrite_user_id: "test-user", telegram_user_id: "12345", expires_at: "2099-01-01T00:00:00.000Z" };
            if (sql.includes("FROM telegram_connections")) return { appwrite_user_id: "test-user", status: "INVITE_SENT" };
            return null;
          },
          run: async () => ({ meta: { changes: 1 }, success: true }),
        };
        return statement;
      },
    } as unknown as D1Database;
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ ok: true, result: true }));
    vi.stubGlobal("fetch", fetchMock);
    const env = { DB, MUSIC_COMMUNITY_REVIEWED, TELEGRAM_BOT_TOKEN: "x".repeat(40), TELEGRAM_CHAT_ID: "-123",
      TELEGRAM_BOT_USERNAME: "TestBot", TELEGRAM_INVITE_ENCRYPTION_KEY: "test-key", TELEGRAM_WEBHOOK_SECRET: "test-secret" } as unknown as MembershipEnv;
    const result = await handleTelegramWebhook(new Request("https://membership.internal/v1/telegram/webhook", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "test-secret" },
      body: JSON.stringify({ update_id: 1, chat_member: { chat: { id: -123 },
        new_chat_member: { status: "member", user: { id: 12345 } }, invite_link: { invite_link: "https://t.me/+test-only" } } }),
    }), env);
    expect(result).toEqual({ ok: true });
    expect(fetchMock.mock.calls.map((call) => String(call[0]).split("/").at(-1)))
      .toEqual(["revokeChatInviteLink", "banChatMember", "unbanChatMember"]);
    expect(statements.some((sql) => sql.includes("SET status = 'ACTIVE'"))).toBe(false);
    expect(statements.some((sql) => sql.includes("MUSIC_ACCESS_NOT_AVAILABLE"))).toBe(true);
  });
});
