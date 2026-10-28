# zefpdf — design record

zefpdf is a PDF viewer for teachers: a lesson folder projected in the browser, with the
class roster and classroom tools (random student, seating plan, timer…) beside it.
It is v2 of local-pdf, a ground-up rebuild of v1 (`../local-pdf`): class data moves out of one plugin's
localStorage into an app-wide SQLite database, plugins become frontend-only and are
discovered at build time, config becomes a validated `config.json` owned by the server,
and the served folder can be changed from the UI.

**Status (2026-10-20):** the original build plan (scaffold → server → DB → app port →
classes tab → plugin system → geogebra/video → smoke test → README) is complete.
Since then: people outlive their classes (people + enrolments), CSV roster import, the
`draw` plugin (random student), the `placement` plugin (seating plan, ported from the
standalone class-placement app), one database for the whole app instead of one per root
(the per-root import script is gone), the rename to zefpdf, and `install.sh` (install
from GitHub, or update and rebuild).
How to run and extend it is in the README; this file keeps the *why*.

## Decisions

| Topic | Decision |
| --- | --- |
| Database | `bun:sqlite`, one file for the app: `data.sqlite` beside `config.json`, created on demand. Same classes whatever folder is served. |
| Data model | `classes` (name, `color` `#rrggbb`: a new class takes the least used of `CLASS_COLORS`; migration 2 added the column in place and spread the existing classes over that palette); `people` (last, first, gender, birth date); `enrolments` (a person's seat in a class, with a position); `seating_links` (`together` / `apart` between two enrolments of one class, `a_id < b_id`, cross-class links refused by composite foreign keys); `plugin_data(plugin_id, key, json)`; `meta(key, json)` for the active class. Deleting a class or an enrolment keeps the person; deleting a person takes them out of every class. **No bookmarks, no sub-groups, no class↔PDF assignment.** Schema in `server/db.ts` (`MIGRATIONS`, counted by `PRAGMA user_version`). |
| Writes | Every write route answers with the whole `Snapshot`; the client replaces its copy. No optimistic bookkeeping for class data. |
| Roster | Row by row, or CSV import (Pronote *Élèves* export and similar). An imported name that matches a known person asks: link that person, or make a new one. Removing a student asks: from this class, or delete the profile. "All students" lists everyone, those in no class included. |
| Appearance | One shape (`shared/appearance.ts`: size, colour, opacities) for plugin overlays (localStorage, per plugin) and the page counter (`config.reader.pageCounter`, validated by the server). |
| Memory | A parsed PDF is kept only while a tab shows it, destroyed when the last one closes (so a changed file is re-read on reopening). Library thumbnails are kept as small JPEG data URLs, LRU-capped. |
| Plugins | Frontend-only, one `plugins/<id>/index.tsx` default-exporting a `Plugin`. Server services: static files from `plugins/<id>/static/` and `/api/proxy?url=` (http/https only). Plugins import the app only through `@/plugins/sdk`, never open tabs of their own (they may open a PDF in the reader with `useTabs().openFile`, as the planning's `@[…]` links do), and put things on screen only as a `Widget` or `FloatingPanel`. |
| Discovery | `scripts/gen-registry.ts` writes `app/plugins/registry.generated.ts` (git-ignored) before every build. `config.plugins.enabled` switches plugins on and off at runtime and orders their buttons. |
| State split | `config.json`: server, enabled plugins, keys, reader preferences (via `/api/config`, validated by `mergeConfig`). localStorage: window positions and each plugin's look. Database: classes, people, links, plugin data, active class. |
| Tabs | Exactly three kinds: library (permanent), one per open PDF, the classes tab (one, reused). The hash follows the tab: `#`, `#/f/<path>`, `#/db`. |
| Plugin DB API | `useClasses`, `useActiveClass`, `useStudents(classId)`, `useLinks(classId)`, `studentName`, and `pluginStore(id)` as a JSON key-value store. Plugins never see SQL. |
| Plugins shipped | rotate, zoom, clock, timer, planning (was calendar), geogebra, video, draw, placement. Not ported from v1: classroom (replaced by placement), students (now core). |
| Seating plan | `placement` keeps its classrooms in `pluginStore("placement")` under `rooms` (written 400 ms after a change), its options in localStorage, and the placement itself only in memory. Students, gender and `together`/`apart` links come from the active class; the standalone app's score, front-row flag, themes, i18n, roster and backup screens were dropped (the core covers the roster; the data model has no score or front-row). |
| Planning | `planning` (renamed from `calendar`: `mergeConfig` maps the old id, migration 3 moves its `plugin_data`, its localStorage keys are carried over once) is a week view (FloatingPanel) of two plannings, even and odd weeks by ISO week number (a 53-week year has two odd weeks in a row). Items are day + order, name, `classId`, and are drawn in their class's colour. Kept in `pluginStore("calendar")` under `planning` (`{even, odd}`) and `notes` (`"<monday yyyy-mm-dd>:<itemId>"` → text), two keys so typing a note never rewrites the plannings, each written 400 ms after a change. Notes are per dated occurrence; on load, those of weeks before this Monday minus one month, and of deleted items, are purged. Typing `@` (at the start of a word) suggests the folder's PDFs and inserts `@[title]`; Ctrl+click on one in the textarea opens it. A lesson's card shows its note's links as buttons that open the PDF, never the note's text; the note itself is only the textarea. `@[title]` resolves to a PDF by path, then by name (any case, `.pdf` optional, shortest path wins). The panel's look stays in localStorage. |
| Security | Every API route is `guarded`: Host must be ours (DNS rebinding), `Sec-Fetch-Site` must be `same-origin`/`none`, `Origin` if present must be ours. Server binds `127.0.0.1`. File and plugin-static paths are confined. |
| Stack | Bun, Preact 11, zustand 5, pdfjs-dist ^6.3 (legacy build), CSS modules. |

## Server API

All JSON answers carry `Cache-Control: no-store`.

| Route | Body | Answer |
| --- | --- | --- |
| `GET /api/files` | | `FileEntry[]` (every file, minus ignored and marker folders) |
| `GET /file/*`, `GET /pdf.worker.mjs` | | bytes |
| `GET/POST /api/root`, `GET /api/browse?dir=` | `{path}` | `RootInfo` / `BrowseResult` |
| `GET/PUT /api/config` | `Config` (or part) | validated `Config` |
| `GET /api/db` | | `Snapshot` |
| `PUT /api/db/active-class` | `{id: number \| null}` | `Snapshot` |
| `POST /api/classes` | `{name, color?}` | `Snapshot` |
| `PUT/DELETE /api/classes/:id` | `{name?, color?}` (at least one) | `Snapshot` |
| `POST /api/classes/:id/students` | `PersonFields` | `Snapshot` |
| `POST /api/classes/:id/import` | `{rows: ImportRow[]}` (all or none) | `Snapshot` |
| `PUT/DELETE /api/people/:id` | `PersonFields` | `Snapshot` |
| `DELETE /api/enrolments/:id` | | `Snapshot` |
| `POST /api/links`, `DELETE /api/links/:id` | `{classId, aId, bId, kind}` | `Snapshot` |
| `GET /api/plugins/:id/data`, `PUT/DELETE /api/plugins/:id/data/:key` | JSON | record / `{ok}` |
| `GET /api/proxy?url=` | | upstream body, 400 for non-http(s), 502 on failure |
| `GET /plugins/<id>/static/*` | | file, confined to that folder |

Refusals answer `{error}` with 400, 404 or 409.

## Verification

- `bun run test`: `test/db.test.ts` (migrations, cascades, link rules, import), `test/server.test.ts` (guard, confinement, config clamping, root switching,
  routes), `test/roster.test.ts` (CSV parsing and matching), `test/placement.test.ts`
  (seating algorithm against brute force, room geometry, reading stored classrooms).
- `bun run test:smoke`: builds, then drives the real app in headless Chromium over CDP
  (reader, links, strip, plugins, panels, classes tab, roster import, draw, disabling a plugin).
- `bun run typecheck`.

## Open items and risks

- The proxy accepts any http/https host (v1 parity), LAN hosts included.
- WAL side files (`-wal`, `-shm`) next to `config.json` may confuse a sync tool
  (Dropbox, NFS); fall back to `journal_mode=DELETE` if it bites.
- `/api/files` re-walks the tree on every call, as v1; fine for a lesson folder.
- Switching tabs remounts the Reader, which resets rotation, zoom and pan mode (the zoom
  panel stays open with panning off). Intended for now.
- localStorage keys start with `zefpdf.` since the rename (they were `local-pdf.`), with
  no migration: window positions and plugin looks saved before it are back to defaults.
- `install.sh` needs `git` and Bun (installed if missing); there is no Windows path.
