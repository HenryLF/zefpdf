// The served folder and the three things every consumer of it needs: a
// filtered recursive listing, the confinement check, and a folder browser for
// picking a new root.

import { readdir, stat } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { BrowseResult, FileEntry } from "@shared/api";
import { getConfig } from "./config";

let cwd = resolve(process.cwd());

/** The folder of files being served, absolute. */
export function getRoot() {
  return cwd;
}

/** Point the server at another folder. Callers validate it first (see `setRoot`). */
export function setCwd(abs: string) {
  cwd = resolve(abs);
}

export async function isDirectory(path: string) {
  const s = await stat(path).catch(() => null);
  return s?.isDirectory() ?? false;
}

/**
 * Every file under the root, sorted by path.
 *
 * Skipped with everything under them: folders named in `server.ignore` (at any
 * depth) and folders holding a `server.ignoreFiles` marker. Re-walked on every call, so a file dropped in needs no restart.
 */
export async function listFiles(): Promise<FileEntry[]> {
  const { ignore, ignoreFiles } = getConfig().server;
  const skip = new Set(ignore);
  const out: FileEntry[] = [];

  async function walk(abs: string, rel: string) {
    const entries = await readdir(abs, { withFileTypes: true }).catch(() => []);
    // A marker hides its folder — but never the root itself, which would hide everything.
    if (rel !== "" && ignoreFiles && entries.some((e) => e.isFile() && e.name === ignoreFiles)) {
      return;
    }
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!skip.has(e.name)) await walk(join(abs, e.name), childRel);
      } else if (e.isFile() && e.name !== ignoreFiles) {
        out.push({ path: childRel, name: e.name, dir: rel });
      }
    }
  }

  await walk(cwd, "");
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Resolve a client-supplied path, refusing anything that escapes the root. */
export function safeResolve(rel: string) {
  const target = resolve(cwd, rel);
  if (target !== cwd && !target.startsWith(cwd + sep)) return null;
  return target;
}

export async function browse(dir: string): Promise<BrowseResult | null> {
  const abs = resolve(dir);
  if (!(await isDirectory(abs))) return null;
  const entries = await readdir(abs, { withFileTypes: true }).catch(() => null);
  if (!entries) return null;
  const dirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
  const parent = dirname(abs);
  return { dir: abs, parent: parent === abs ? null : parent, dirs };
}
