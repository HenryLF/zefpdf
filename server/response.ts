import { stat } from "node:fs/promises";

export const NotFound = () => new Response("NotFound", { status: 404 });
export const Forbidden = () => new Response("Forbidden", { status: 403 });
export const BadRequest = (message = "BadRequest") =>
  Response.json({ error: message }, { status: 400 });

/** JSON that must never be cached: everything here is re-read from disk or the DB. */
export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** A request body as JSON, or null when it is missing or malformed. */
export async function body<T = Record<string, unknown>>(req: Request): Promise<Partial<T> | null> {
  const value = await req.json().catch(() => null);
  return typeof value === "object" && value !== null ? (value as Partial<T>) : null;
}

/** A path segment from a URL, decoded; null when it cannot be. */
export function pathAfter(req: Request, prefix: string) {
  try {
    return decodeURIComponent(new URL(req.url).pathname.slice(prefix.length));
  } catch {
    return null;
  }
}

/** A regular file's bytes with its type, 404 for anything else (missing, a folder). */
export async function serveFile(abs: string) {
  const s = await stat(abs).catch(() => null);
  if (!s?.isFile()) return NotFound();
  const file = Bun.file(abs);
  // A file Bun cannot place is sent as bytes rather than mislabelled.
  return new Response(file, {
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });
}
