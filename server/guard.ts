import { Forbidden } from "./response";

export type Handler = (req: Bun.BunRequest) => Response | Promise<Response>;
export type Route = Handler | Partial<Record<"GET" | "POST" | "PUT" | "DELETE" | "HEAD", Handler>>;

/**
 * The hosts and origins the guard accepts. Filled in once the server knows its
 * port — which, started on port 0 by the tests, is only after `Bun.serve`.
 */
export interface Allowed {
  hosts: Set<string>;
  origins: Set<string>;
}

export function allowedFor(port: number): Allowed {
  const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
  return { hosts, origins: new Set([...hosts].map((h) => `http://${h}`)) };
}

// Only accepts requests made by a browser on this app's own origin (or typed in the address bar).
// - Host check blocks DNS rebinding (evil.com resolving to 127.0.0.1).
// - Sec-Fetch-Site is sent by every modern browser to localhost; a request without it is not
//   from a browser page on this origin, so it is rejected.
// - Origin, when present, must be ours.
export function guard(req: Request, allowed: Allowed): Response | null {
  const host = req.headers.get("host");
  if (!host || !allowed.hosts.has(host)) return Forbidden();
  const site = req.headers.get("sec-fetch-site");
  if (site !== "same-origin" && site !== "none") return Forbidden();
  const origin = req.headers.get("origin");
  if (origin && !allowed.origins.has(origin)) return Forbidden();
  return null;
}

export function guarded(route: Route, allowed: Allowed): Route {
  const wrap =
    (handler: Handler): Handler =>
    (req) =>
      guard(req, allowed) ?? handler(req);
  if (typeof route === "function") return wrap(route);
  return Object.fromEntries(
    Object.entries(route).map(([method, handler]) => [method, wrap(handler)]),
  );
}
