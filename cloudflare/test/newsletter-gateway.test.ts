import { describe, expect, it, vi } from "vitest";

// Import the actual Pages gateway; exercise its request/response behavior with
// an in-memory service binding, so these tests never contact production.
const gateway = await import(new URL("../../functions/api/[[path]].js", import.meta.url).href);
const onRequest = gateway.onRequest as (context: {
  request: Request;
  params: { path: string[] };
  env: { MEMBERSHIP_API: { fetch: (request: Request) => Promise<Response> } };
}) => Promise<Response>;

const origin = "https://exclusive.jason-shadow.com";
const actionPath = "/api/member/v1/newsletter/action";
const token = "A".repeat(43);
const navigationHeaders = {
  "Sec-Fetch-Site": "cross-site",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Dest": "document",
};

async function requestGateway({
  url = `${origin}${actionPath}?purpose=confirm&token=${token}`,
  method = "GET",
  headers = navigationHeaders,
  route,
  upstreamHeaders = {},
}: {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  route?: string[];
  upstreamHeaders?: Record<string, string>;
} = {}) {
  const service = vi.fn(async (_request: Request) => Response.json(
    { ok: true }, { headers: upstreamHeaders },
  ));
  const response = await onRequest({
    request: new Request(url, { method, headers }),
    params: { path: route || new URL(url).pathname.slice("/api/".length).split("/") },
    env: { MEMBERSHIP_API: { fetch: service } },
  });
  return { response, service };
}

describe("newsletter links through the canonical Pages gateway", () => {
  it.each(["confirm", "unsubscribe"])("accepts a webmail document navigation for %s", async (purpose) => {
    const { response, service } = await requestGateway({
      url: `${origin}${actionPath}?purpose=${purpose}&token=${token}`,
    });
    expect(response.status).toBe(200);
    expect(service).toHaveBeenCalledTimes(1);
    const forwarded = service.mock.calls[0]![0];
    expect(forwarded.url).toBe(`https://member.internal/v1/newsletter/action?purpose=${purpose}&token=${token}`);
    expect(forwarded.headers.get("Origin")).toBe(origin);
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
  });

  it.each([
    { label: "POST", method: "POST" },
    { label: "HEAD", method: "HEAD" },
    { label: "fetch/cors", headers: { ...navigationHeaders, "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty" } },
    { label: "iframe", headers: { ...navigationHeaders, "Sec-Fetch-Dest": "iframe" } },
    { label: "missing navigation headers", headers: { "Sec-Fetch-Site": "cross-site" } },
    { label: "wrong endpoint", url: `${origin}/api/member/v1/products?purpose=confirm&token=${token}` },
    { label: "mismatched internal route", route: ["member", "v1", "products"] },
    { label: "missing token", url: `${origin}${actionPath}?purpose=confirm` },
    { label: "short token", url: `${origin}${actionPath}?purpose=confirm&token=${"A".repeat(42)}` },
    { label: "invalid token character", url: `${origin}${actionPath}?purpose=confirm&token=${"A".repeat(42)}%2B` },
    { label: "repeated token", url: `${origin}${actionPath}?purpose=confirm&token=${token}&token=${token}` },
    { label: "missing purpose", url: `${origin}${actionPath}?token=${token}` },
    { label: "invalid purpose", url: `${origin}${actionPath}?purpose=delete&token=${token}` },
    { label: "repeated purpose", url: `${origin}${actionPath}?purpose=confirm&purpose=unsubscribe&token=${token}` },
    { label: "unexpected parameter", url: `${origin}${actionPath}?purpose=confirm&token=${token}&redirect=/admin` },
  ])("rejects cross-site $label without contacting a service", async ({ label: _label, ...options }) => {
    const { response, service } = await requestGateway(options);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "CROSS_SITE_REQUEST_BLOCKED" } });
    expect(service).not.toHaveBeenCalled();
  });

  it("retains the foreign Origin rejection for otherwise valid newsletter links", async () => {
    const { response, service } = await requestGateway({
      headers: { ...navigationHeaders, Origin: "https://webmail.example" },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "CROSS_ORIGIN_REQUEST_BLOCKED" } });
    expect(service).not.toHaveBeenCalled();
  });

  it.each(["https://preview.pages.dev", "http://exclusive.jason-shadow.com", `${origin}:8443`])(
    "rejects noncanonical origin %s", async (host) => {
      const { response, service } = await requestGateway({
        url: `${host}${actionPath}?purpose=confirm&token=${token}`,
      });
      expect(response.status).toBe(421);
      expect(service).not.toHaveBeenCalled();
    },
  );

  it("preserves the same-origin public product catalog and its cache policy", async () => {
    const { response, service } = await requestGateway({
      url: `${origin}/api/member/v1/products?locale=en`,
      headers: { "Sec-Fetch-Site": "same-origin", Origin: origin },
      upstreamHeaders: { "Cache-Control": "public, max-age=300" },
    });
    expect(response.status).toBe(200);
    expect(service).toHaveBeenCalledTimes(1);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
  });
});
