#!/usr/bin/env bun
// zefpdf server: `bun server/index.ts [folder] [--port N] [--config path] [--no-open]`
//         update: `bun server/index.ts update` (pull main, reinstall, rebuild)
//
// Serves the built app from dist/, the files of one folder (the root), and the
// JSON API the app runs on. Every API route is `guarded`: only a browser page on
// this app's own origin gets an answer.

import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { configuredRoot, getConfig, loadConfig } from "./config";
import { closeDb } from "./db";
import { allowedFor, guarded, type Allowed, type Route } from "./guard";
import { getRoot, isDirectory, setCwd } from "./root";
import { configRoutes } from "./routes/config";
import { dbRoutes } from "./routes/db";
import { fileRoutes } from "./routes/files";
import { pluginRoutes } from "./routes/plugins";
import { proxyRoutes } from "./routes/proxy";
import { rootRoutes } from "./routes/root";

const DIST = join(import.meta.dir, "..", "dist");

export interface ServerOptions {
  /** 0 picks a free port (the tests do) */
  port?: number;
  /** the folder to serve; defaults to config.json's `server.cwd` */
  cwd?: string;
  configPath?: string;
}

export async function startServer(opts: ServerOptions = {}) {
  await loadConfig(opts.configPath);
  const config = getConfig();

  const root = opts.cwd !== undefined ? resolve(opts.cwd) : configuredRoot(config);
  if (!(await isDirectory(root))) throw new Error(`${root}: not a directory`);
  setCwd(root);

  // Filled in once the port is known: with port 0 that is only after serve().
  const allowed: Allowed = { hosts: new Set(), origins: new Set() };
  const api: Record<string, Route> = {
    ...fileRoutes,
    ...rootRoutes,
    ...configRoutes,
    ...dbRoutes,
    ...proxyRoutes,
    ...pluginRoutes,
  };

  const server = Bun.serve({
    port: opts.port ?? config.server.port,
    hostname: "127.0.0.1",
    routes: {
      ...Object.fromEntries(
        Object.entries(api).map(([path, route]) => [path, guarded(route, allowed)]),
      ),
      // Last: it catches everything that no route above claimed.
      "/*": (await isDirectory(DIST))
        ? { dir: DIST }
        : () => new Response("dist/ is not built yet: run `bun run build`.", { status: 503 }),
    },
  });

  const fresh = allowedFor(server.port!);
  fresh.hosts.forEach((h) => allowed.hosts.add(h));
  fresh.origins.forEach((o) => allowed.origins.add(o));

  return {
    server,
    url: `http://localhost:${server.port}`,
    async stop() {
      await server.stop(true);
      closeDb();
    },
  };
}

if (import.meta.main && Bun.argv[2] === "update") {
  // install.sh on this checkout: it pulls, reinstalls dependencies and rebuilds.
  // A folder named `update` is still served as `zefpdf ./update`.
  const repo = join(import.meta.dir, "..");
  const proc = Bun.spawn(["bash", join(repo, "install.sh"), repo], {
    stdio: ["inherit", "inherit", "inherit"],
  });
  process.exit(await proc.exited);
} else if (import.meta.main) {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      port: { type: "string" },
      config: { type: "string" },
      "no-open": { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const port = values.port === undefined ? undefined : Number(values.port);
  if (port !== undefined && !Number.isInteger(port)) {
    console.error(`--port: not a number: ${values.port}`);
    process.exit(1);
  }

  try {
    const { url } = await startServer({
      port,
      cwd: positionals[0],
      configPath: values.config,
    });
    console.log(`Serving ${getRoot()}\n        ${url}`);
    console.log(`Plugins: ${getConfig().plugins.enabled.join(", ") || "none"}`);
    if (!(await isDirectory(DIST))) console.warn("dist/ is not built yet: run `bun run build`.");
    if (getConfig().server.openBrowser && !values["no-open"]) {
      const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
      Bun.spawn([opener, url], { stdout: "ignore", stderr: "ignore" }).unref();
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
