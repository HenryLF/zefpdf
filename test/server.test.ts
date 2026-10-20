import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FileEntry, RootInfo, Snapshot } from "@shared/api";
import { DEFAULT_CONFIG, type Config } from "@shared/config";
import { startServer } from "../server/index";

let dir: string;
let root: string;
let configPath: string;
let srv: Awaited<ReturnType<typeof startServer>>;
let base: string;
let host: string;

/** A request as the app's own page would send it. */
function req(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  return fetch(base + path, {
    ...init,
    headers: { Host: host, "Sec-Fetch-Site": "same-origin", ...init.headers },
  });
}

const send = (path: string, method: string, body: unknown) =>
  req(path, {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "local-pdf-server-"));
  root = join(dir, "root");
  await Bun.write(join(root, "a.pdf"), "%PDF-1.4\n");
  await Bun.write(join(root, "sub/b.pdf"), "%PDF-1.4\n");
  await Bun.write(join(root, "sub/notes.ggb"), "x");
  await Bun.write(join(root, "hidden/.localignore"), "");
  await Bun.write(join(root, "hidden/secret.pdf"), "%PDF-1.4\n");
  await Bun.write(join(root, "node_modules/pkg/x.pdf"), "%PDF-1.4\n");
  await Bun.write(join(root, "deep/node_modules/y.pdf"), "%PDF-1.4\n");
  configPath = join(dir, "config.json");
  await Bun.write(configPath, JSON.stringify({ server: { cwd: "root", openBrowser: false } }));
  srv = await startServer({ port: 0, configPath });
  base = srv.url.replace("localhost", "127.0.0.1");
  host = `127.0.0.1:${srv.server.port}`;
});

afterAll(async () => {
  await srv.stop();
  await rm(dir, { recursive: true, force: true });
});

describe("guard", () => {
  test("a foreign Origin is refused", async () => {
    const res = await req("/api/files", { headers: { Origin: "http://evil.example" } });
    expect(res.status).toBe(403);
  });

  test("a request without Sec-Fetch-Site is refused", async () => {
    const res = await fetch(base + "/api/files", { headers: { Host: host } });
    expect(res.status).toBe(403);
  });

  test("a foreign Host is refused", async () => {
    const res = await req("/api/files", { headers: { Host: "evil.example" } });
    expect(res.status).toBe(403);
  });
});

describe("files", () => {
  test("/api/files lists files, minus ignored and marker folders", async () => {
    const files = (await (await req("/api/files")).json()) as FileEntry[];
    expect(files.map((f) => f.path)).toEqual(["a.pdf", "sub/b.pdf", "sub/notes.ggb"]);
    expect(files[1]).toEqual({ path: "sub/b.pdf", name: "b.pdf", dir: "sub" });
  });

  test("/file/* serves a file and refuses traversal", async () => {
    const ok = await req("/file/sub/b.pdf");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toContain("pdf");
    expect((await req("/file/..%2Fconfig.json")).status).toBe(403);
    expect((await req("/file/missing.pdf")).status).toBe(404);
  });
});

describe("config", () => {
  test("PUT /api/config clamps and drops unknown keys", async () => {
    const res = await send("/api/config", "PUT", {
      reader: { scrollStep: 9999, pageGap: -5, bogus: 1 },
      nonsense: true,
    });
    expect(res.status).toBe(200);
    const c = (await res.json()) as Config & { nonsense?: unknown };
    expect(c.reader.scrollStep).toBe(200);
    expect(c.reader.pageGap).toBe(0);
    expect(c.nonsense).toBeUndefined();
    expect((c.reader as unknown as Record<string, unknown>).bogus).toBeUndefined();
  });

  test("the page counter's look is clamped, a bad colour dropped", async () => {
    const res = await send("/api/config", "PUT", {
      reader: { pageCounter: { fontSize: 999, textColor: "red", bgOpacity: 40 } },
    });
    const { pageCounter } = ((await res.json()) as Config).reader;
    expect(pageCounter).toEqual({ ...DEFAULT_CONFIG.reader.pageCounter, fontSize: 72, bgOpacity: 40 });
    const disk = (await Bun.file(configPath).json()) as Config;
    expect(disk.reader.scrollStep).toBe(200);
  });
});

describe("root", () => {
  test("a file path is refused", async () => {
    const res = await send("/api/root", "POST", { path: join(root, "a.pdf") });
    expect(res.status).toBe(400);
  });

  test("a folder becomes the root, is persisted, and keeps the classes", async () => {
    await send("/api/classes", "POST", { name: "Kept class" });
    const other = join(dir, "other");
    await Bun.write(join(other, "c.pdf"), "%PDF-1.4\n");
    const res = await send("/api/root", "POST", { path: other });
    expect(res.status).toBe(200);
    expect(((await res.json()) as RootInfo).path).toBe(other);
    expect(((await Bun.file(configPath).json()) as Config).server.cwd).toBe(other);
    const snap = (await (await req("/api/db")).json()) as Snapshot;
    expect(snap.classes.map((c) => c.name)).toEqual(["Kept class"]);
    expect(await Bun.file(join(dir, "data.sqlite")).exists()).toBe(true);
    const files = (await (await req("/api/files")).json()) as FileEntry[];
    expect(files.map((f) => f.path)).toEqual(["c.pdf"]);
  });

  test("/api/browse lists folders", async () => {
    const res = await req(`/api/browse?dir=${encodeURIComponent(dir)}`);
    const b = (await res.json()) as { dirs: string[] };
    expect(b.dirs).toContain("root");
    expect(b.dirs).toContain("other");
  });
});

describe("db routes", () => {
  test("writes answer with the snapshot; refusals with a status", async () => {
    let res = await send("/api/classes", "POST", { name: "5A" });
    let snap = (await res.json()) as Snapshot;
    const cls = snap.classes.find((c) => c.name === "5A")!;
    expect(cls).toBeDefined();

    expect((await send("/api/classes", "POST", { name: "5A" })).status).toBe(409);
    expect((await send("/api/classes", "POST", { name: "" })).status).toBe(400);

    res = await send(`/api/classes/${cls.id}/students`, "POST", {
      last: "Doe",
      first: "Jo",
      gender: "f",
      birthDate: "2000-05-03",
    });
    snap = (await res.json()) as Snapshot;
    expect(snap.people.map((p) => [p.last, p.gender, p.birthDate])).toEqual([["Doe", "f", "2000-05-03"]]);
    const pid = snap.people[0]!.id;
    res = await send(`/api/people/${pid}`, "PUT", { last: "Doe", first: "Jo", gender: null, birthDate: null });
    expect(((await res.json()) as Snapshot).people[0]!).toMatchObject({ gender: null, birthDate: null });
    expect((await send(`/api/people/${pid}`, "PUT", { last: "Doe", gender: "x" })).status).toBe(400);
    expect((await send(`/api/people/${pid}`, "PUT", { last: "Doe", birthDate: "03/05/2000" })).status).toBe(400);

    res = await send(`/api/classes/${cls.id}/import`, "POST", {
      rows: [
        { last: "Doe", first: "Jo", gender: null, birthDate: null, personId: pid },
        { last: "Roe", first: "Al", gender: "m", birthDate: null },
      ],
    });
    snap = (await res.json()) as Snapshot;
    expect(snap.enrolments).toHaveLength(2);
    expect((await send(`/api/classes/${cls.id}/import`, "POST", { rows: [{ last: "" }] })).status).toBe(400);

    res = await send(`/api/enrolments/${snap.enrolments[0]!.id}`, "DELETE", {});
    snap = (await res.json()) as Snapshot;
    expect([snap.enrolments.length, snap.people.length]).toEqual([1, 2]);

    // The person left in no class can still be deleted, and only once.
    const orphan = snap.people.find((p) => !snap.enrolments.some((e) => e.personId === p.id))!;
    res = await send(`/api/people/${orphan.id}`, "DELETE", {});
    expect(((await res.json()) as Snapshot).people).toHaveLength(1);
    expect((await send(`/api/people/${orphan.id}`, "DELETE", {})).status).toBe(404);

    res = await send("/api/db/active-class", "PUT", { id: cls.id });
    expect(((await res.json()) as Snapshot).activeClassId).toBe(cls.id);
  });

  test("plugin data round-trips", async () => {
    expect((await send("/api/plugins/timer/data/last", "PUT", { minutes: 5 })).status).toBe(200);
    const data = await (await req("/api/plugins/timer/data")).json();
    expect(data).toEqual({ last: { minutes: 5 } });
    await req("/api/plugins/timer/data/last", { method: "DELETE" });
    expect(await (await req("/api/plugins/timer/data")).json()).toEqual({});
    expect((await req("/api/plugins/Bad_Id/data")).status).toBe(400);
  });
});

describe("proxy and plugin statics", () => {
  test("/api/proxy refuses file:", async () => {
    const res = await req(`/api/proxy?url=${encodeURIComponent("file:///etc/passwd")}`);
    expect(res.status).toBe(400);
  });

  test("/plugins/* is confined to plugins/<id>/static/", async () => {
    expect((await req("/plugins/geogebra/static/deployggb.js")).status).toBe(200);
    expect((await req("/plugins/geogebra/static/../../config.json")).status).toBe(403);
    expect((await req("/plugins/geogebra/static/..%2F..%2F..%2Fconfig.json")).status).toBe(403);
    expect((await req("/plugins/geogebra/index.tsx")).status).toBe(403);
    expect((await req("/plugins/geogebra/static/nope.js")).status).toBe(404);
  });
});
