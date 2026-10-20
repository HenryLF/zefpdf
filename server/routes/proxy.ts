import type { Route } from "../guard";

/**
 * A resource from anywhere on the web, fetched here rather than by the page.
 *
 * A host that sends no CORS header — most of them — is unreachable from the
 * page however correct the URL is (GeoGebra's applet loads a remote .ggb with
 * an XHR). Only http and https are accepted: this must not become a way to read
 * the machine's own files back out through `file:`.
 */
export const proxyRoutes: Record<string, Route> = {
  "/api/proxy": async (req) => {
    const raw = new URL(req.url).searchParams.get("url") ?? "";
    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      return new Response("Bad URL", { status: 400 });
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return new Response("Only http and https", { status: 400 });
    }

    const upstream = await fetch(target, { redirect: "follow" }).catch(() => null);
    if (!upstream?.ok) {
      return new Response(`Could not fetch ${target.host}`, { status: 502 });
    }
    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
        "Cache-Control": "no-store",
      },
    });
  },
};
