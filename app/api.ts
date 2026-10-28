// The typed client for every server route: one function per route, all going
// through `request`, which turns a non-2xx answer into a throw so callers have
// one failure path rather than two.

import type {
  BrowseResult,
  FileEntry,
  ImportRow,
  NewLink,
  PersonFields,
  RootInfo,
  Snapshot,
} from "@shared/api";
import type { Config } from "@shared/config";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    // The server answers refusals as {error}; anything else keeps the status.
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? `${url} failed (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

const send = <T>(method: string, url: string, body?: unknown) =>
  request<T>(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** A file under the root, as `/file/*` wants it: each segment encoded, the slashes kept. */
export function fileUrl(path: string) {
  return `/file/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** A remote resource fetched by the server, for hosts that send no CORS header. */
export function proxyUrl(url: string) {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

/** A plugin's own static file, served from `plugins/<id>/static/`. */
export function pluginStaticUrl(id: string, path: string) {
  return `/plugins/${id}/static/${path}`;
}

export const api = {
  files: () => request<FileEntry[]>("/api/files"),

  root: {
    get: () => request<RootInfo>("/api/root"),
    set: (path: string) => send<RootInfo>("POST", "/api/root", { path }),
    browse: (dir?: string) =>
      request<BrowseResult>(
        dir ? `/api/browse?dir=${encodeURIComponent(dir)}` : "/api/browse",
      ),
  },

  config: {
    get: () => request<Config>("/api/config"),
    put: (config: Config) => send<Config>("PUT", "/api/config", config),
  },

  db: {
    get: () => request<Snapshot>("/api/db"),
    setActiveClass: (id: number | null) =>
      send<Snapshot>("PUT", "/api/db/active-class", { id }),
    createClass: (name: string) => send<Snapshot>("POST", "/api/classes", { name }),
    updateClass: (id: number, fields: { name?: string; color?: string }) =>
      send<Snapshot>("PUT", `/api/classes/${id}`, fields),
    deleteClass: (id: number) => send<Snapshot>("DELETE", `/api/classes/${id}`),
    addStudent: (classId: number, person: PersonFields) =>
      send<Snapshot>("POST", `/api/classes/${classId}/students`, person),
    importStudents: (classId: number, rows: ImportRow[]) =>
      send<Snapshot>("POST", `/api/classes/${classId}/import`, { rows }),
    updatePerson: (id: number, person: PersonFields) => send<Snapshot>("PUT", `/api/people/${id}`, person),
    deletePerson: (id: number) => send<Snapshot>("DELETE", `/api/people/${id}`),
    deleteEnrolment: (id: number) => send<Snapshot>("DELETE", `/api/enrolments/${id}`),
    addLink: (link: NewLink) => send<Snapshot>("POST", "/api/links", link),
    deleteLink: (id: number) => send<Snapshot>("DELETE", `/api/links/${id}`),
  },

  pluginData: {
    get: (id: string) => request<Record<string, unknown>>(`/api/plugins/${id}/data`),
    put: (id: string, key: string, value: unknown) =>
      send<{ ok: true }>("PUT", `/api/plugins/${id}/data/${encodeURIComponent(key)}`, value ?? null),
    remove: (id: string, key: string) =>
      send<{ ok: true }>("DELETE", `/api/plugins/${id}/data/${encodeURIComponent(key)}`),
  },
};
