import type { RootInfo } from "@shared/api";
import { setRoot } from "../config";
import type { Route } from "../guard";
import { BadRequest, body, json } from "../response";
import { browse, getRoot } from "../root";

const info = (): RootInfo => ({ path: getRoot() });

export const rootRoutes: Record<string, Route> = {
  "/api/root": {
    GET: () => json(info()),
    // Serve another folder: persisted to config.json. The class database
    // does not depend on it.
    POST: async (req) => {
      const b = await body<{ path: string }>(req);
      const err = await setRoot(b?.path);
      if (err) return BadRequest(err);
      return json(info());
    },
  },
  // GET /api/browse?dir=/some/path -> BrowseResult; defaults to the current root
  "/api/browse": async (req) => {
    const dir = new URL(req.url).searchParams.get("dir") || getRoot();
    const result = await browse(dir);
    if (!result) return BadRequest("not a directory");
    return json(result);
  },
};
