import { ApiError, readJsonResponse } from "./http";

interface MicrosoftGraphTokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
}

export interface MicrosoftGraphEmailInput {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  senderMailbox: string;
  recipientEmail: string;
  recipientName?: string;
  messageId: string;
  subject: string;
  html: string;
  inlineImage?: {
    contentType: "image/jpeg" | "image/png" | "image/webp";
    name: string;
    contentId: string;
    contentBytes: string;
  };
}

function requireGuid(value: string, code: string): string {
  const normalized = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new ApiError(503, code);
  }
  return normalized;
}

function requireEmail(value: string, code: string): string {
  const normalized = value.trim();
  if (
    normalized.length < 3 ||
    normalized.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) throw new ApiError(503, code);
  return normalized;
}

async function requestApplicationToken(input: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const tenantId = requireGuid(input.tenantId, "GRAPH_EMAIL_NOT_CONFIGURED");
  const clientId = requireGuid(input.clientId, "GRAPH_EMAIL_NOT_CONFIGURED");
  if (
    !input.clientSecret ||
    input.clientSecret.length > 2_048 ||
    /[\u0000-\u001f\u007f]/.test(input.clientSecret)
  ) throw new ApiError(503, "GRAPH_EMAIL_NOT_CONFIGURED");

  let response: Response;
  try {
    response = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: input.clientSecret,
          grant_type: "client_credentials",
          scope: "https://graph.microsoft.com/.default",
        }),
      },
    );
  } catch {
    throw new ApiError(503, "GRAPH_EMAIL_AUTH_UNAVAILABLE");
  }
  if (!response.ok) throw new ApiError(503, "GRAPH_EMAIL_AUTH_FAILED");

  const payload = await readJsonResponse<MicrosoftGraphTokenResponse>(
    response,
    65_536,
    "GRAPH_EMAIL_AUTH_INVALID_RESPONSE",
  );
  if (
    payload.token_type !== "Bearer" ||
    typeof payload.access_token !== "string" ||
    payload.access_token.length < 32 ||
    payload.access_token.length > 16_384
  ) throw new ApiError(503, "GRAPH_EMAIL_AUTH_INVALID_RESPONSE");
  return payload.access_token;
}

export async function sendMicrosoftGraphEmail(input: MicrosoftGraphEmailInput): Promise<void> {
  const senderMailbox = requireEmail(input.senderMailbox, "GRAPH_EMAIL_NOT_CONFIGURED");
  const recipientEmail = requireEmail(input.recipientEmail, "GRAPH_EMAIL_RECIPIENT_INVALID");
  if (
    !/^[A-Za-z0-9._-]{1,36}$/.test(input.messageId) ||
    input.subject.length < 1 ||
    input.subject.length > 255 ||
    input.html.length < 1 ||
    input.html.length > 131_072
  ) throw new ApiError(400, "INVALID_TRANSACTIONAL_EMAIL");
  if (
    input.inlineImage &&
    (
      !/^[A-Za-z0-9._-]{1,128}$/.test(input.inlineImage.name) ||
      !/^[A-Za-z0-9._-]{1,128}$/.test(input.inlineImage.contentId) ||
      input.inlineImage.contentBytes.length < 4 ||
      input.inlineImage.contentBytes.length > 1_048_576 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(input.inlineImage.contentBytes)
    )
  ) throw new ApiError(503, "GRAPH_EMAIL_INLINE_IMAGE_INVALID");

  const accessToken = await requestApplicationToken(input);
  const requestId = crypto.randomUUID();
  let response: Response;
  try {
    response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderMailbox)}/sendMail`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          "client-request-id": requestId,
          "Content-Type": "application/json",
          "return-client-request-id": "true",
        },
        body: JSON.stringify({
          message: {
            subject: input.subject,
            body: {
              contentType: "HTML",
              content: input.html,
            },
            toRecipients: [{
              emailAddress: {
                address: recipientEmail,
                name: input.recipientName?.trim() || undefined,
              },
            }],
            internetMessageHeaders: [{
              name: "X-Shadow-Message-Id",
              value: input.messageId,
            }],
            attachments: input.inlineImage ? [{
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: input.inlineImage.name,
              contentType: input.inlineImage.contentType,
              contentId: input.inlineImage.contentId,
              isInline: true,
              contentBytes: input.inlineImage.contentBytes,
            }] : undefined,
          },
          saveToSentItems: true,
        }),
      },
    );
  } catch {
    throw new ApiError(503, "GRAPH_EMAIL_DELIVERY_UNAVAILABLE");
  }
  if (response.status !== 202) {
    throw new ApiError(503, "GRAPH_EMAIL_DELIVERY_FAILED");
  }
}
