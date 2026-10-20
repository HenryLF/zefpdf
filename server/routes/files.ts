import { join } from "node:path";
import type { Route } from "../guard";
import { Forbidden, json, pathAfter, serveFile } from "../response";
import { listFiles, safeResolve } from "../root";

const WORKER = join(
  import.meta.dir,
  "../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
);

export const fileRoutes: Record<string, Route> = {
  // Every file under the root, not only PDFs: the library filters PDFs, and a
  // plugin listing its own file type (geogebra's .ggb) reads the same list.
  "/api/files": async () => json(await listFiles()),

  "/file/*": async (req) => {
    const rel = pathAfter(req, "/file/");
    const abs = rel === null ? null : safeResolve(rel);
    if (!abs) return Forbidden();
    return serveFile(abs);
  },

  "/pdf.worker.mjs": () =>
    new Response(Bun.file(WORKER), {
      headers: { "Content-Type": "text/javascript" },
    }),
};
