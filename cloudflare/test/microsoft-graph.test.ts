import { afterEach, describe, expect, it, vi } from "vitest";
import { sendMicrosoftGraphEmail } from "../src/shared/microsoft-graph";

const baseInput = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  clientId: "22222222-2222-4222-8222-222222222222",
  clientSecret: "test-only-client-secret",
  senderMailbox: "info@exclusive.example",
  recipientEmail: "member@example.test",
  recipientName: "Member",
  messageId: "message-123",
  subject: "Your access",
  html: "<p>Welcome.</p>",
  inlineImage: {
    contentType: "image/png" as const,
    name: "brand-banner.png",
    contentId: "shadow-brand-banner",
    contentBytes: "YnJhbmQ=",
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Microsoft Graph transactional email", () => {
  it("uses app-only OAuth and sends through the configured mailbox", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        token_type: "Bearer",
        expires_in: 3_600,
        access_token: "a".repeat(64),
      }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendMicrosoftGraphEmail(baseInput);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]!;
    expect(tokenUrl).toBe(
      "https://login.microsoftonline.com/11111111-1111-4111-8111-111111111111/oauth2/v2.0/token",
    );
    expect(tokenInit.method).toBe("POST");
    expect(String(tokenInit.body)).toContain("scope=https%3A%2F%2Fgraph.microsoft.com%2F.default");
    expect(String(tokenInit.body)).toContain("grant_type=client_credentials");

    const [sendUrl, sendInit] = fetchMock.mock.calls[1]!;
    expect(sendUrl).toBe(
      "https://graph.microsoft.com/v1.0/users/info%40exclusive.example/sendMail",
    );
    expect(sendInit.headers.Authorization).toBe(`Bearer ${"a".repeat(64)}`);
    const payload = JSON.parse(String(sendInit.body));
    expect(payload.message.toRecipients[0].emailAddress.address).toBe("member@example.test");
    expect(payload.message.internetMessageHeaders).toEqual([{
      name: "X-Shadow-Message-Id",
      value: "message-123",
    }]);
    expect(payload.message.attachments).toEqual([{
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: "brand-banner.png",
      contentType: "image/png",
      contentId: "shadow-brand-banner",
      isInline: true,
      contentBytes: "YnJhbmQ=",
    }]);
    expect(payload.saveToSentItems).toBe(true);
  });

  it("fails closed when Graph credentials are absent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendMicrosoftGraphEmail({
      ...baseInput,
      clientSecret: "",
    })).rejects.toMatchObject({
      status: 503,
      code: "GRAPH_EMAIL_NOT_CONFIGURED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not disclose upstream OAuth errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { error: "invalid_client", error_description: "sensitive upstream detail" },
      { status: 401 },
    )));

    await expect(sendMicrosoftGraphEmail(baseInput)).rejects.toMatchObject({
      status: 503,
      code: "GRAPH_EMAIL_AUTH_FAILED",
    });
  });
});
