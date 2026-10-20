import type { Database } from "bun:sqlite";
import type { NewLink } from "@shared/api";
import { PLUGIN_ID } from "@shared/config";
import { getConfigPath } from "../config";
import * as q from "../db";
import type { Handler, Route } from "../guard";
import { BadRequest, body, json } from "../response";

/**
 * A write against the app's database, answered with the new Snapshot.
 * A refusal (DbError) becomes its status with `{error}`.
 */
function write(fn: (db: Database, req: Bun.BunRequest, b: Record<string, unknown>) => unknown): Handler {
  return async (req) => {
    const b = (await body(req)) ?? {};
    try {
      const d = db();
      fn(d, req, b);
      return json(q.snapshot(d));
    } catch (e) {
      if (e instanceof q.DbError) return json({ error: e.message }, e.status);
      throw e;
    }
  };
}

const db = () => q.dbFor(q.dbFile(getConfigPath()));

const param = (req: Bun.BunRequest, name: string) =>
  (req.params as Record<string, string>)[name];

/** Plugin ids are folder names; anything else would be a key nobody can own. */
function pluginId(req: Bun.BunRequest) {
  const id = param(req, "id") ?? "";
  return PLUGIN_ID.test(id) ? id : null;
}

export const dbRoutes: Record<string, Route> = {
  "/api/db": () => json(q.snapshot(db())),

  "/api/db/active-class": {
    PUT: write((db, _req, b) => q.setActiveClass(db, b.id ?? null)),
  },

  "/api/classes": {
    POST: write((db, _req, b) => q.createClass(db, b.name)),
  },
  "/api/classes/:id": {
    PUT: write((db, req, b) => q.renameClass(db, param(req, "id"), b.name)),
    DELETE: write((db, req) => q.deleteClass(db, param(req, "id"))),
  },
  "/api/classes/:id/students": {
    POST: write((db, req, b) => q.addStudent(db, param(req, "id"), b)),
  },
  "/api/classes/:id/import": {
    POST: write((db, req, b) => q.importStudents(db, param(req, "id"), b.rows)),
  },
  "/api/people/:id": {
    PUT: write((db, req, b) => q.updatePerson(db, param(req, "id"), b)),
    DELETE: write((db, req) => q.deletePerson(db, param(req, "id"))),
  },
  "/api/enrolments/:id": {
    DELETE: write((db, req) => q.deleteEnrolment(db, param(req, "id"))),
  },

  "/api/links": {
    POST: write((db, _req, b) => q.addLink(db, b as Partial<NewLink>)),
  },
  "/api/links/:id": {
    DELETE: write((db, req) => q.deleteLink(db, param(req, "id"))),
  },

  // A plugin's own JSON key-value store, kept in the same app-wide database.
  "/api/plugins/:id/data": {
    GET: (req) => {
      const id = pluginId(req);
      if (!id) return BadRequest("bad plugin id");
      return json(q.pluginData(db(), id));
    },
  },
  "/api/plugins/:id/data/:key": {
    PUT: async (req) => {
      const id = pluginId(req);
      const key = param(req, "key");
      if (!id || !key) return BadRequest("bad plugin id or key");
      const text = await req.text();
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        return BadRequest("JSON required");
      }
      q.putPluginData(db(), id, key, value);
      return json({ ok: true });
    },
    DELETE: (req) => {
      const id = pluginId(req);
      const key = param(req, "key");
      if (!id || !key) return BadRequest("bad plugin id or key");
      q.deletePluginData(db(), id, key);
      return json({ ok: true });
    },
  },
};
