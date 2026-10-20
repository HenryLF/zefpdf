// config.json: read once at startup, rewritten whenever the UI changes it.
// Everything that reaches it goes through `mergeConfig`, so the file on disk is
// always a valid, complete Config.

import { dirname, resolve } from "node:path";
import { DEFAULT_CONFIG, mergeConfig, type Config } from "@shared/config";
import { isDirectory, setCwd } from "./root";

let configPath = resolve(import.meta.dir, "..", "config.json");
let config: Config = DEFAULT_CONFIG;

export function getConfig() {
  return config;
}

export function getConfigPath() {
  return configPath;
}

/** The configured root, absolute: a relative `server.cwd` is taken from config.json's folder. */
export function configuredRoot(c: Config = config) {
  return resolve(dirname(configPath), c.server.cwd);
}

/** Read and validate config.json. A missing or unreadable file means the defaults. */
export async function loadConfig(path = configPath) {
  configPath = resolve(path);
  const file = Bun.file(configPath);
  const raw = (await file.exists()) ? await file.json().catch(() => null) : null;
  if (raw === null && (await file.exists())) {
    console.warn(`${configPath} is not valid JSON; using the defaults.`);
  }
  config = mergeConfig(raw);
  return config;
}

export async function writeConfig(next: Config) {
  config = mergeConfig(next);
  await Bun.write(configPath, JSON.stringify(config, null, 2) + "\n");
  return config;
}

/**
 * Serve another folder: validate it and persist it as `server.cwd`.
 * Returns an error message, or null on success.
 */
export async function setRoot(path: unknown): Promise<string | null> {
  if (typeof path !== "string" || !path) return "path required";
  const abs = resolve(path);
  if (!(await isDirectory(abs))) return "not a directory";
  setCwd(abs);
  await writeConfig({ ...config, server: { ...config.server, cwd: abs } });
  return null;
}

/**
 * A config sent by the UI, laid over the current one. A changed `server.cwd`
 * goes through `setRoot`; `server.port` only applies at the next start.
 */
export async function updateConfig(raw: unknown): Promise<{ config: Config } | { error: string }> {
  const next = mergeConfig(raw, config);
  if (configuredRoot(next) !== configuredRoot()) {
    const err = await setRoot(configuredRoot(next));
    if (err) return { error: err };
    next.server.cwd = config.server.cwd;
  }
  return { config: await writeConfig(next) };
}
