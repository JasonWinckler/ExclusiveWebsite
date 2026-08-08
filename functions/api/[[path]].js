const TARGETS = Object.freeze({
  auth: "AUTH_API",
  member: "MEMBERSHIP_API",
  admin: "ADMIN_API",
});

export async function onRequest(context) {
  const rawPath = Array.isArray(context.params.path)
    ? context.params.path.join("/")
    : String(context.params.path || "");
  const segments = rawPath.split("/").filter(Boolean);
  const targetName = segments.shift();
  if (targetName === "health") {
    return Response.json({
      status: "ok",
      services: Object.values(TARGETS).every((binding) => Boolean(context.env[binding])),
    }, { headers: {
      "Cache-Control": "no-store",
      "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
      "X-Content-Type-Options": "nosniff",
    } });
  }
  const binding = TARGETS[targetName];
  const service = binding ? context.env[binding] : null;
  if (!service) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const source = new URL(context.request.url);
  const upstream = new URL(`https://${targetName}.internal/${segments.join("/")}`);
  upstream.search = source.search;
  const headers = new Headers(context.request.headers);
  // The gateway is the sole public origin. Internal Workers still enforce the
  // canonical site origin and cannot be called through arbitrary browser CORS.
  headers.set("Origin", "https://exclusive.jason-shadow.com");
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
  responseHeaders.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}
