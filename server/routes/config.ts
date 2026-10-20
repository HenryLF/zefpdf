import { getConfig, updateConfig } from "../config";
import type { Route } from "../guard";
import { BadRequest, body, json } from "../response";

export const configRoutes: Record<string, Route> = {
  "/api/config": {
    GET: () => json(getConfig()),
    // The whole Config (or any part of it), laid over the current one and
    // validated; the answer is what was actually stored.
    PUT: async (req) => {
      const b = await body(req);
      if (!b) return BadRequest("JSON object required");
      const result = await updateConfig(b);
      if ("error" in result) return BadRequest(result.error);
      return json(result.config);
    },
  },
};
