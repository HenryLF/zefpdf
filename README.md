# zefpdf

**The PDF viewer for the classroom.** Open your lesson folder, project your worksheets
full screen, and keep everything a lesson needs one key away: a timer, a clock, a
random student, the seating plan, GeoGebra, a video.

- **Your whole folder, at a glance.** Every PDF in your lessons folder shows up with a
  preview of its first page, grouped by subfolder. No uploading, no importing: drop a file
  in the folder and it is there.
- **Made for the projector and the clicker.** Full screen, pages fit the board, big
  readable page counter. Everything is driven by `PageUp`, `PageDown` and `Tab` — the keys
  a presentation remote sends — so you can walk the room and still turn pages, open the
  next worksheet or switch documents.
- **Your classes, built in.** Import a roster straight from Pronote (the *Élèves* CSV
  export), or type it in. Record who should sit together and who should sit apart.
- **Classroom tools on top of the page.** Draw a random student with `Enter`; generate a
  seating plan that respects your constraints; run a countdown; show the time or the date;
  zoom into a figure; open GeoGebra or a video without leaving the lesson.
- **Private by design.** zefpdf runs on your own computer and answers only your own
  browser. Your files and your students' names never leave the machine — no account, no
  cloud, no tracking.
- **Make it yours.** Every key can be rebound, every tool switched on or off, and the
  look of each one tuned. New tools are small plugins.

## Install

Linux or macOS, with `git`:

```bash
curl -fsSL https://raw.githubusercontent.com/HenryLF/zefpdf/main/install.sh | bash
```

This clones zefpdf into `~/.local/share/zefpdf` (or the folder given as an argument, or
`$ZEFPDF_DIR`), installs [Bun](https://bun.sh) if it is missing, builds the app, and puts a
`zefpdf` command on your PATH. Then:

```bash
zefpdf               # serve the folder named in config.json and open the browser
zefpdf ~/Lessons     # serve another folder (this run only)
```

**Update** by running `./install.sh` again in the install folder, or `bun run update`: it
pulls the latest version from GitHub, reinstalls dependencies and rebuilds. Your
`config.json` and your classes (`data.sqlite`) are kept.

### Run from a checkout

```bash
bun install
bun run build          # once, and after any change to app/ or plugins/
bun server/index.ts    # serve the folder named in config.json
```

Or in one go: `bun run start`.

```bash
bun server/index.ts ~/Lessons        # serve another folder (this run only)
bun server/index.ts --port 4000      # another port
bun server/index.ts --config my.json # another config file
bun server/index.ts --no-open        # don't launch a browser
```

`bun link` in a checkout puts the `zefpdf` command on your PATH.

| Script | Does |
| --- | --- |
| `bun run update` | pull from GitHub, reinstall, rebuild (`./install.sh`) |
| `bun run gen` | regenerate the plugin registry (run by `build`, `dev`, `typecheck`) |
| `bun run build` / `dev` | build `app/` into `dist/`, once / on every change |
| `bun run typecheck` | `tsc --noEmit` over everything |
| `bun run test` | server and database tests (`bun test`) |
| `bun run test:smoke` | build, then drive the real app in headless Chromium |

## A tour

- **Library** — every PDF under the folder, with a preview of its first page, grouped by
  subfolder. Filter by name; **Refresh** re-scans. `PageUp`/`PageDown` move a cursor,
  `Tab` opens the highlighted PDF or folds the folder. The folder's name in the header
  opens the folder picker.
- **Reader** — pages fit the window, text stays selectable, links work. `PageUp`/`PageDown`
  scroll by a share of a page (a whole page when pressed twice quickly); `Tab` opens the
  page strip and outline; `Escape` closes the strip, then the tab.
- **Classes** — `c`, or **Manage** in the tab bar, opens the classes tab: create, rename
  and delete classes; add students one row at a time, or **Import CSV…** a roster (Pronote's
  *Élèves* export: name, *Né(e) le*, *Sexe*; other columns are ignored); record seating
  constraints (*sit together* / *sit apart*).
  A person outlives their classes: when an imported name is already known, you choose to
  link that person (one record, shown in both classes, edited once) or make a new copy.
  🗑 on a student asks whether to take them out of this class only, or delete the profile
  (out of every class). **All students**, at the top of the class list, shows everyone —
  including people in no class any more — to edit or delete. The class picker at the right
  of the tab bar sets the active class, which plugins can read.
- **Tabs** — exactly three kinds: the library (always there), one per open PDF, and the
  classes tab. The strip appears when the mouse reaches the top of the window; `b`
  cycles tabs (`Shift`+`b` backwards). The address bar follows the tab (`#/f/<path>`,
  `#/db`), so a reload, Back and Forward all work.
- **Options** — the ⚙ in the bottom-left corner: reader preferences, the page counter's
  look (size, colour, opacities), which plugins are on, every key binding, skipped folders
  and the port. Saved to `config.json`.
- **Tools** — **+** beside the ⚙ unfolds one button per enabled plugin.
- **Random student** — `Enter` draws a student of the active class and shows the name in a
  pill at the top left for a few seconds. Its toolbar button opens a window to set how long
  the pill stays and how it looks (size, colours, opacity), with a *Draw now* to try it.

### Tools

| Tool | For |
| --- | --- |
| **draw** | random student of the active class, shown in a pill for a few seconds |
| **placement** | seating plan: lay out your classroom, then place the active class, honouring *together* / *apart* |
| **timer** | countdown for an activity |
| **clock** / **calendar** | the time, or the date, on screen |
| **zoom** | magnify and pan a part of the page |
| **rotate** | turn a scanned page the right way up |
| **geogebra** | the GeoGebra calculator, online or fully offline, with your `.ggb` files |
| **video** | a video beside the worksheet |

## Folders and workspaces

The server serves one folder, the *root*. Change it from the folder picker (library
header, or Options → Folder and server); the choice is written to `config.json`.

The class database is one file for the whole app, `data.sqlite` beside `config.json`,
created the first time it is needed. Classes, students and seating links stay the same
whatever folder is served.

Skipped when listing: folders named in `server.ignore` (at any depth), and any folder
that contains a `.localignore` file (the name is `server.ignoreFiles`). Nothing outside
the root is ever served.

## config.json

```jsonc
{
  "server":  { "cwd": "test", "port": 3000, "ignore": ["node_modules"], "ignoreFiles": ".localignore", "openBrowser": true },
  "plugins": { "enabled": ["rotate", "zoom", "clock", "timer", "calendar", "geogebra", "video", "draw", "placement"] },
  "keys":    { "tab.cycle": "b", "reader.close": "Escape", "classes.open": "c", "rotate.page": "r", "draw.pick": "Enter" /* … */ },
  "reader":  { "scrollStep": 90, "pageGap": 20, "maxPageWidth": 85, "smoothScroll": false,
               "cardWidth": 200, "panelOpacity": 55, "fullscreen": true,
               "pageCounter": { "bgOpacity": 90, "textColor": "#9aa3ad", "textOpacity": 100, "fontSize": 12 } }
}
```

- `server.cwd` — the root; a relative path is taken from `config.json`'s folder.
- `server.port` — applies at the next start (`--port` still wins).
- `plugins.enabled` — which plugins run, and in what order their buttons appear. Takes
  effect immediately; a disabled plugin loses its button and its overlay.
- `keys` — `KeyboardEvent.key` values; an array binds several keys to one action.
- `reader` — the preferences in the Options window, clamped to sane bounds;
  `pageCounter` is an Appearance like a plugin's (colour as `#rrggbb`).

The server fills in anything missing and drops anything it does not know, so a
hand-edited file can't break the app. Window positions and each plugin's look stay in
the browser's localStorage, as before.

## Plugins

A plugin is frontend-only: one folder, `plugins/<id>/`, whose `index.tsx` default-exports
a `Plugin` (see `app/plugins/types.ts`):

```tsx
import { useView, type Plugin } from "@/plugins/sdk";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

export default {
  id: "rotate",            // must equal the folder name
  name: "Rotate",
  icon: Icon,              // an SVG in currentColor
  useAction: () => {       // or useToggle, or neither (the button opens `options`)
    const page = useView((s) => s.page);
    const rotate = useView((s) => s.rotate);
    return { run: () => rotate(page) };
  },
  overlay: Overlay,        // always mounted; renders a Widget or FloatingPanel when on
  // options?: () => JSX   — its options panel
  // openLink?: (url) => boolean — claim a link clicked in a PDF
} satisfies Plugin;
```

- **Discovery** — `scripts/gen-registry.ts` finds every `plugins/*/index.tsx` and writes
  `app/plugins/registry.generated.ts` (not committed) before each build. Adding or
  removing a plugin folder needs `bun run build`; switching one on or off does not.
- **Imports** — a plugin imports the app only through `@/plugins/sdk`: UI pieces
  (`FloatingPanel`, `Widget`, option rows, buttons), hooks, `useView`, `useUi`,
  `useTabs`, `useFiles`, and the class database hooks `useClasses`, `useActiveClass`,
  `useStudents(classId)`, `useLinks(classId)`.
- **On screen** — only as a `Widget` (parked, dragged from anywhere, clicked for options)
  or a `FloatingPanel` (title bar, resizable), from its overlay. Plugins never open tabs.
- **Storage** — look and position in localStorage (`plugins/shared/store.ts` helpers);
  data that belongs with the classes in `pluginStore("<id>")`, a JSON key-value store in
  the app's database: `const s = pluginStore("timer"); s.useValue("last", 5); s.set("last", 10)`.
- **Server services** — a plugin has no server code. It gets two generic services:
  its own static files, served from `plugins/<id>/static/` at
  `pluginStaticUrl(id, path)`, and a proxy for remote resources whose host sends no
  CORS header, `proxyUrl(url)` (http and https only).

Shipped: rotate, zoom, clock, timer, calendar, geogebra, video, draw, placement (see *Tools* above).

### GeoGebra offline

Out of the box the calculator is fetched from geogebra.org. To run it offline, download
the *GeoGebra Math Apps Bundle* and unzip it into `plugins/geogebra/static/bundle/`,
**dropping the versioned top folder**, so that this file exists:

```
plugins/geogebra/static/bundle/GeoGebra/HTML5/5.0/web3d/web3d.nocache.js
```

The plugin checks for that file when the calculator opens; its options say which mode
it is in. `.ggb` files anywhere under the root appear in the calculator's options; a link
to a remote `.ggb` is fetched through the proxy, a geogebra.org material link is loaded
by the applet itself.

## Layout

```
shared/    types and config validation used by both sides
server/    Bun.serve: guard, config, root, db (bun:sqlite), routes/
app/       the Preact app: state/ (zustand), ui/, views/{library,reader,database}, plugins/
plugins/   one folder per plugin, plus plugins/shared
scripts/   gen-registry.ts
install.sh install from GitHub, or update and rebuild
test/      bun tests, and the CDP smoke test
```

Every API route only answers a browser page on this app's own origin (Host,
`Sec-Fetch-Site` and `Origin` are checked), so another site open in the same browser
cannot read your files or your classes.
