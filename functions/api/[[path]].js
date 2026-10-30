const TARGETS = Object.freeze({
  auth: "AUTH_API",
  member: "MEMBERSHIP_API",
  admin: "ADMIN_API",
});

const CANONICAL_HOST = "exclusive.jason-shadow.com";
const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;

function securityHeaders(extra = {}) {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    ...extra,
  };
}

function reject(status, code) {
  return Response.json({ error: { code } }, {
    status,
    headers: securityHeaders(),
  });
}

export async function onRequest(context) {
  const source = new URL(context.request.url);
  const requestOrigin = context.request.headers.get("Origin");
  const fetchSite = context.request.headers.get("Sec-Fetch-Site");
  const rawPath = Array.isArray(context.params.path)
    ? context.params.path.join("/")
    : String(context.params.path || "");

  // Webmail opens signed newsletter links as cross-site document navigations.
  // This exception is confined to the token endpoint, never browser fetches or
  // account APIs. The membership Worker still validates the real one-use token.
  const newsletterNavigation = context.request.method === "GET" &&
    source.pathname === "/api/member/v1/newsletter/action" &&
    rawPath === "member/v1/newsletter/action" &&
    context.request.headers.get("Sec-Fetch-Mode") === "navigate" &&
    context.request.headers.get("Sec-Fetch-Dest") === "document" &&
    source.searchParams.getAll("purpose").length === 1 &&
    ["confirm", "unsubscribe"].includes(source.searchParams.get("purpose")) &&
    source.searchParams.getAll("token").length === 1 &&
    /^[A-Za-z0-9_-]{43}$/.test(source.searchParams.get("token") || "") &&
    [...source.searchParams.keys()].every((key) => ["purpose", "token"].includes(key));

  // Pages preview domains and arbitrary hosts must never inherit production
  // service bindings. Validate the browser-visible request before rewriting
  // any internal headers.
  if (source.origin !== CANONICAL_ORIGIN) {
    return reject(421, "CANONICAL_HOST_REQUIRED");
  }
  if (requestOrigin && requestOrigin !== CANONICAL_ORIGIN) {
    return reject(403, "CROSS_ORIGIN_REQUEST_BLOCKED");
  }
  if (fetchSite && !["same-origin", "none"].includes(fetchSite) && !newsletterNavigation) {
    return reject(403, "CROSS_SITE_REQUEST_BLOCKED");
  }

  const segments = rawPath.split("/").filter(Boolean);
  const targetName = segments.shift();
  if (targetName === "health") {
    return Response.json({
      status: "ok",
      services: Object.values(TARGETS).every((binding) => Boolean(context.env[binding])),
    }, { headers: securityHeaders() });
  }
  const binding = TARGETS[targetName];
  const service = binding ? context.env[binding] : null;
  if (!service) return reject(404, "NOT_FOUND");

  const upstream = new URL(`https://${targetName}.internal/${segments.join("/")}`);
  upstream.search = source.search;
  const headers = new Headers(context.request.headers);
  // The gateway is the sole public origin. Internal Workers still enforce the
  // canonical site origin and cannot be called through arbitrary browser CORS.
  headers.set("Origin", CANONICAL_ORIGIN);
  headers.set("X-Forwarded-Host", source.host);

  const request = new Request(upstream, {
    method: context.request.method,
    headers,
    body: ["GET", "HEAD"].includes(context.request.method) ? undefined : context.request.body,
    redirect: "manual",
  });
  const response = await service.fetch(request);
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("Access-Control-Allow-Origin");
  responseHeaders.delete("Access-Control-Allow-Credentials");
  responseHeaders.delete("Vary");
  const publicCatalog = ["GET", "HEAD"].includes(context.request.method) &&
    targetName === "member" && segments.join("/") === "v1/products" && response.ok;
  if (!publicCatalog || !/^public\b/i.test(responseHeaders.get("Cache-Control") || "")) {
    responseHeaders.set("Cache-Control", "no-store, max-age=0");
  }
  responseHeaders.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}
