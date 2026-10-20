import { join, resolve, sep } from "node:path";
import { PLUGIN_ID } from "@shared/config";
import type { Route } from "../guard";
import { Forbidden, pathAfter, serveFile } from "../response";

const PLUGINS_DIR = resolve(import.meta.dir, "../../plugins");

/**
 * A plugin's own static files: `/plugins/<id>/static/<rest>` from
 * `plugins/<id>/static/`, and nothing outside that folder. Parsed by hand so
 * neither a strange id nor a `..` can reach the plugin's source or the repo.
 */
export const pluginRoutes: Record<string, Route> = {
  "/plugins/*": async (req) => {
    const rel = pathAfter(req, "/plugins/");
    if (rel === null) return Forbidden();
    const [id, staticDir, ...rest] = rel.split("/");
    if (!id || !PLUGIN_ID.test(id) || staticDir !== "static" || rest.length === 0) {
      return Forbidden();
    }
    const base = join(PLUGINS_DIR, id, "static");
    const abs = resolve(base, rest.join("/"));
    if (!abs.startsWith(base + sep)) return Forbidden();
    return serveFile(abs);
  },
};
