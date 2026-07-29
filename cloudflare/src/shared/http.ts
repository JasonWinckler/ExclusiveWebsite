export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

export function parsePositiveInt(value: string | undefined, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= max ? parsed : fallback;
}

export function allowedOrigins(raw: string | undefined): ReadonlySet<string> {
  const values = (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(values);
}

export function requestOrigin(request: Request): string | null {
  const origin = request.headers.get("Origin");
  return origin && origin !== "null" ? origin : null;
}

export function enforceAllowedOrigin(request: Request, origins: ReadonlySet<string>): string | null {
  const origin = requestOrigin(request);
  if (origin && !origins.has(origin)) {
    throw new ApiError(403, "ORIGIN_NOT_ALLOWED");
  }
  return origin;
}

export function corsHeaders(origin: string | null, origins: ReadonlySet<string>): Headers {
  const headers = new Headers(SECURITY_HEADERS);
  if (origin && origins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Expose-Headers", "Content-Disposition, X-Request-Id");
    headers.set("Vary", "Origin");
  }
  return headers;
}

export function preflight(request: Request, origins: ReadonlySet<string>): Response {
  const origin = enforceAllowedOrigin(request, origins);
  if (!origin) {
    throw new ApiError(403, "ORIGIN_REQUIRED");
  }
  const headers = corsHeaders(origin, origins);
  headers.set(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Idempotency-Key, X-Admin-Session, X-Device-Token",
  );
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Max-Age", "600");
  return new Response(null, { status: 204, headers });
}

export function jsonResponse(
  data: unknown,
  options: {
    status?: number;
    origin?: string | null;
    origins?: ReadonlySet<string>;
    requestId?: string;
  } = {},
): Response {
  const headers = corsHeaders(options.origin ?? null, options.origins ?? new Set());
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (options.requestId) headers.set("X-Request-Id", options.requestId);
  return Response.json(data, { status: options.status ?? 200, headers });
}

export function errorResponse(
  error: unknown,
  options: {
    origin?: string | null;
    origins?: ReadonlySet<string>;
    requestId?: string;
  } = {},
): Response {
  const apiError = error instanceof ApiError
    ? error
    : new ApiError(500, "INTERNAL_ERROR");
  return jsonResponse(
    { error: { code: apiError.code }, requestId: options.requestId },
    {
      status: apiError.status,
      origin: options.origin,
      origins: options.origins,
      requestId: options.requestId,
    },
  );
}

async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
  contentLength: string | null,
  maxBytes: number,
): Promise<Uint8Array> {
  const declaredLength = Number.parseInt(contentLength ?? "0", 10);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ApiError(413, "REQUEST_BODY_TOO_LARGE");
  }
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, "REQUEST_BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readJsonBody<T>(request: Request, maxBytes: number): Promise<T> {
  const contentType = request.headers.get("Content-Type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new ApiError(415, "JSON_CONTENT_TYPE_REQUIRED");
  }
  const bytes = await readBoundedBody(
    request.body,
    request.headers.get("Content-Length"),
    maxBytes,
  );
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new ApiError(400, "INVALID_JSON");
  }
}

export async function readRawBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  return readBoundedBody(
    request.body,
    request.headers.get("Content-Length"),
    maxBytes,
  );
}

export async function readJsonResponse<T>(
  response: Response,
  maxBytes: number,
  invalidCode = "INVALID_UPSTREAM_RESPONSE",
): Promise<T> {
  const contentType = response.headers.get("Content-Type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new ApiError(503, invalidCode);
  }
  let bytes: Uint8Array;
  try {
    bytes = await readBoundedBody(
      response.body,
      response.headers.get("Content-Length"),
      maxBytes,
    );
  } catch {
    throw new ApiError(503, invalidCode);
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new ApiError(503, invalidCode);
  }
}

export function requireIdempotencyKey(request: Request): string {
  const value = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(value)) {
    throw new ApiError(400, "VALID_IDEMPOTENCY_KEY_REQUIRED");
  }
  return value;
}

export function requestId(request: Request): string {
  return request.headers.get("cf-ray")?.slice(0, 64) || crypto.randomUUID();
}

export function logEvent(
  level: "info" | "warn" | "error",
  event: string,
  details: Readonly<Record<string, string | number | boolean | null>>,
): void {
  const payload = JSON.stringify({ level, event, ...details });
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}

export async function enforceRateLimit(
  limiter: RateLimit,
  key: string,
): Promise<void> {
  let result: { success: boolean };
  try {
    result = await limiter.limit({ key });
  } catch {
    throw new ApiError(503, "RATE_LIMIT_SERVICE_UNAVAILABLE");
  }
  if (!result.success) throw new ApiError(429, "RATE_LIMITED");
}
