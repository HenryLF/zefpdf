#!/usr/bin/env bun
/**
 * End-to-end smoke test: builds the app, serves a fixture folder, drives it in
 * headless Chromium and asserts on the real DOM.
 *
 *   bun test/smoke.ts            # build, run, report
 *   bun test/smoke.ts --keep     # leave the fixture folder and config behind
 *
 * Everything is asserted from measured geometry or read-back state rather than
 * from screenshots; a screenshot is only written when something fails.
 */
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Snapshot } from "@shared/api";
import { DEFAULT_CONFIG } from "@shared/config";
import { Browser, Page, seedSettings, waitFor } from "./cdp";
import { writeFixtures } from "./fixtures";
import { claimsLink, parseSource } from "../plugins/geogebra/links";

const PORT = 4399;
const CDP_PORT = 9333;
/** The test's own workspace: the served folder and, beside it, its config.json. */
const WORK = join(tmpdir(), `local-pdf-smoke-${process.pid}`);
const FIXTURES = join(WORK, "root");
const CONFIG = join(WORK, "config.json");

/** A request as the app's own page would send it: the server refuses anything else. */
function get(path: string, headers: Record<string, string> = {}) {
  return fetch(`http://localhost:${PORT}${path}`, {
    headers: { "Sec-Fetch-Site": "same-origin", ...headers },
  });
}

const results: { name: string; ok: boolean; detail?: string }[] = [];

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok   ${name}`);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    results.push({ name, ok: false, detail });
    console.log(`  FAIL ${name}\n       ${detail}`);
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

/** Wait for the library to have finished its first listing. */
async function openApp(browser: Browser) {
  const page = await browser.open(`http://localhost:${PORT}/`);
  // Attaching can win the race against the navigation, leaving the first
  // evaluate running against about:blank — where localStorage throws.
  await waitFor("navigation to the app", () =>
    page.eval<boolean>(`location.port === "${PORT}"`),
  );
  // Settings are read at boot, so seed them and reload before asserting.
  await seedSettings(page);
  await page.reload();
  await waitFor("app root", () =>
    page.eval<boolean>(`!!document.querySelector("#root")?.firstChild`),
  );
  return page;
}

/**
 * Write a plugin's own store before the app boots.
 *
 * Each plugin keeps its state under its own key, so this is how a test sets one
 * plugin's appearance without touching another's — which is the behaviour it
 * then asserts on.
 */
/**
 * Let the app finish what it has scheduled: Preact attaches effects — every
 * key listener among them — a frame after it renders, so a key pressed as soon
 * as something shows up after a reload can arrive before anyone is listening.
 */
async function settled(page: Page) {
  await page.eval(`new Promise((r) => requestAnimationFrame(() => setTimeout(() => setTimeout(r))))`);
}

async function seedPlugin(page: Page, id: string, state: object) {
  const json = JSON.stringify(JSON.stringify(state));
  await page.eval(`localStorage.setItem("zefpdf.plugin.${id}", ${json})`);
}

/**
 * Unfold the plugin bar if it is folded. The `+` is a toggle whose title says
 * which way it goes, so its presence *is* the folded state — clicking blindly
 * would put the buttons back out of reach.
 */
async function unfoldBar(page: Page) {
  // The bar may still be mounting after a reload; without this the click lands
  // on nothing and the wait that follows it never comes true.
  await waitFor("the plugin bar", () =>
    page.eval<boolean>(
      `!!document.querySelector('button[title="Plugins"], button[title="Hide plugins"]')`,
    ),
  );
  await page.eval(
    `(() => {
      const b = document.querySelector('button[title="Plugins"]');
      if (b) b.click();
    })()`,
  );
}

/**
 * Click a button by its title, saying what *was* there when it is missing. The
 * app renders only once its config and class database have loaded, so a button
 * is waited for rather than expected the moment a reload returns.
 */
async function clickButton(page: Page, title: string) {
  await waitFor(`the "${title}" button`, () =>
    page.eval<boolean>(`!!document.querySelector('button[title="${title}"]')`),
  ).catch(() => {});
  await page.eval(
    `(() => {
      const b = document.querySelector('button[title="${title}"]');
      if (!b) {
        const titles = [...document.querySelectorAll("button[title]")].map(x => x.title);
        throw new Error("no \\"${title}\\" button; present: " + titles.join(", "));
      }
      b.click();
    })()`,
  );
}

/** Where alpha.pdf's external link sits on its page, as fractions of the page box. */
interface LinkBox {
  target: string;
  angle: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Measures `LinkBox`, or null while the link is not laid out yet. */
const linkBox = `(() => {
  const a = document.querySelector('.annotationLayer a[href="https://example.com/"]');
  if (!a) return null;
  const p = a.closest("[data-page]").getBoundingClientRect();
  const r = a.getBoundingClientRect();
  if (!r.width) return null;
  return {
    target: a.target,
    angle: Number(a.closest(".annotationLayer").dataset.mainRotation ?? 0),
    x: (r.left - p.left) / p.width,
    y: (r.top - p.top) / p.height,
    w: r.width / p.width,
    h: r.height / p.height,
  };
})()`;

/**
 * The link is /Rect [20 250 120 280] on a 200x300 page: 10% in, 1/15 down,
 * half the width and a tenth of the height. Turning the page carries that box
 * round with it.
 */
function assertBox(a: LinkBox, angle: number) {
  const [x, y, w, h] = [0.1, 20 / 300, 0.5, 0.1];
  const want = {
    0: { x, y, w, h },
    90: { x: 1 - y - h, y: x, w: h, h: w },
    180: { x: 1 - x - w, y: 1 - y - h, w, h },
    270: { x: y, y: 1 - x - w, w: h, h: w },
  }[angle];
  assert(want, `unexpected rotation ${angle}`);
  const off = (["x", "y", "w", "h"] as const).filter(
    (k) => Math.abs(a[k] - want[k]) > 0.02,
  );
  assert(
    off.length === 0,
    `at ${angle}° the link is at ${JSON.stringify(a)}, expected ${JSON.stringify(want)}`,
  );
}

/**
 * Click the link annotation with this href and say whether the app cancelled the
 * navigation. The spy sits on `window`, so it runs after the anchor's own
 * handler, and then cancels whatever is left — the test must never open a tab.
 */
const clickLink = (href: string) => `new Promise((resolve, reject) => {
  const a = document.querySelector('.annotationLayer a[href="${href}"]');
  if (!a) return reject(new Error("no link to ${href}"));
  const spy = (e) => {
    window.removeEventListener("click", spy);
    const prevented = e.defaultPrevented;
    e.preventDefault();
    resolve(prevented);
  };
  window.addEventListener("click", spy);
  a.click();
})`;

/** Scroll offset that shows page `n` at the top, as far as the reader can go. */
const pageTop = (n: number) => `(() => {
  const r = document.querySelector("[data-page]").parentElement;
  const p = document.querySelectorAll("[data-page]")[${n - 1}];
  const top = r.scrollTop + p.getBoundingClientRect().top - r.getBoundingClientRect().top;
  return Math.min(top, r.scrollHeight - r.clientHeight);
})()`;

async function main() {
  console.log("building…");
  const build = Bun.spawnSync(["bun", "run", "build"], {
    cwd: `${import.meta.dir}/..`,
  });
  assert(build.exitCode === 0, "bun run build failed");

  await writeFixtures(FIXTURES);
  // Fullscreen off from the start: while fullscreen, the browser claims Escape.
  await Bun.write(
    CONFIG,
    JSON.stringify({
      ...DEFAULT_CONFIG,
      server: { ...DEFAULT_CONFIG.server, cwd: FIXTURES, openBrowser: false },
      reader: { ...DEFAULT_CONFIG.reader, fullscreen: false },
    }),
  );

  const server = Bun.spawn(
    ["bun", `${import.meta.dir}/../server/index.ts`, "--port", String(PORT), "--config", CONFIG, "--no-open"],
    { stdout: "ignore", stderr: "inherit" },
  );
  await waitFor("server", async () => {
    const r = await get("/api/files").catch(() => null);
    return r?.ok ?? false;
  });

  const browser = await Browser.launch(CDP_PORT);
  let page: Page | null = null;

  try {
    console.log("\nserver");

    await check("/api/files lists every file, recursively", async () => {
      const files = (await (await get("/api/files")).json()) as { path: string }[];
      const paths = files.map((f) => f.path).join();
      assert(paths === "alpha.pdf,graph.ggb,nested/beta.pdf", `got ${paths}`);
    });

    await check("/file/* serves a PDF", async () => {
      const r = await get("/file/alpha.pdf");
      assert(r.ok, `status ${r.status}`);
      assert(r.headers.get("content-type") === "application/pdf", `type ${r.headers.get("content-type")}`);
    });

    await check("path traversal is refused", async () => {
      const r = await get("/file/%2e%2e%2f%2e%2e%2fetc%2fpasswd");
      assert(r.status === 403, `expected 403, got ${r.status}`);
    });

    await check("a request from another site is refused", async () => {
      const r = await get("/api/files", { "Sec-Fetch-Site": "cross-site" });
      assert(r.status === 403, `expected 403, got ${r.status}`);
    });

    await check("/file/* serves a non-PDF as its own type", async () => {
      const r = await get("/file/graph.ggb");
      assert(r.ok, `status ${r.status}`);
      const type = r.headers.get("content-type") ?? "";
      assert(!type.startsWith("application/pdf"), `served as ${type}`);
    });

    await check("the vendored GeoGebra loader is served from the plugin's static folder", async () => {
      const r = await get("/plugins/geogebra/static/deployggb.js");
      assert(r.ok, `status ${r.status}`);
      assert((await r.text()).includes("GGBApplet"), "not the loader");
    });

    await check("the proxy takes only http and https", async () => {
      const bad = await get(`/api/proxy?url=${encodeURIComponent("file:///etc/passwd")}`);
      assert(bad.status === 400, `file: URL gave ${bad.status}`);
      const none = await get("/api/proxy");
      assert(none.status === 400, `missing url gave ${none.status}`);
    });

    await check("plugin statics refuse traversal", async () => {
      const r = await get("/plugins/geogebra/static/%2e%2e%2f%2e%2e%2fconfig.json");
      assert(r.status === 403, `expected 403, got ${r.status}`);
    });

    console.log("\nlibrary");
    page = await openApp(browser);

    await check("cards render a first-page preview", async () => {
      // An encoded image, not a live canvas: the card keeps no document behind it.
      const drawn = await waitFor("a thumbnail image", () =>
        page!.eval<number>(
          `[...document.querySelectorAll("button img")].filter(i => i.naturalWidth > 0 && i.src.startsWith("data:image/jpeg")).length`,
        ),
      );
      assert(drawn >= 1, `no thumbnail drawn (${drawn})`);
    });

    await check("both PDFs and the folder section are listed", async () => {
      const text = await page!.eval<string>(`document.body.innerText`);
      for (const want of ["alpha.pdf", "beta.pdf", "nested"]) {
        assert(text.includes(want), `"${want}" missing from the library`);
      }
    });

    console.log("\nreader");

    await check("opening a PDF renders page 1 with a text layer", async () => {
      await page!.eval(
        `[...document.querySelectorAll("button")].find(b => b.innerText.includes("alpha.pdf")).click()`,
      );
      const text = await waitFor("text layer content", () =>
        page!.eval<string>(
          `document.querySelector(".textLayer")?.innerText?.trim() ?? ""`,
        ),
      );
      assert(text.includes("Alpha"), `text layer read "${text}"`);
    });

    await check("page boxes keep each page's own shape", async () => {
      const boxes = await page!.eval<{ w: number; h: number }[]>(
        `[...document.querySelectorAll("[data-page]")].map(p => ({ w: p.clientWidth, h: p.clientHeight }))`,
      );
      assert(boxes.length === 3, `expected 3 pages, got ${boxes.length}`);
      const [first, second] = boxes as [
        { w: number; h: number },
        { w: number; h: number },
      ];
      // 200x300 is portrait, 400x250 landscape: the ratios must differ.
      assert(
        first.h / first.w > second.h / second.w,
        `page 1 (${first.w}x${first.h}) and page 2 (${second.w}x${second.h}) share a shape`,
      );
    });

    await check("an external link is an anchor over its rect", async () => {
      const a = await waitFor("the link annotation", () =>
        page!.eval<LinkBox | null>(linkBox),
      );
      assert(a.target === "_blank", `the link opens in "${a.target}"`);
      assertBox(a, 0);
    });

    await check("an internal link scrolls to its page", async () => {
      const expected = await page!.eval<number>(pageTop(3));
      await page!.eval(`document.querySelector('.annotationLayer a[href="#"]').click()`);
      await waitFor(`the reader at ${expected}px`, () =>
        page!.eval<boolean>(
          `Math.abs(document.querySelector("[data-page]").parentElement.scrollTop - ${expected}) < 2`,
        ),
      );
      await page!.eval(`document.querySelector("[data-page]").parentElement.scrollTo({ top: 0 })`);
    });

    await check("a link no plugin claims is left to the browser", async () => {
      const prevented = await page!.eval<boolean>(clickLink("https://example.com/"));
      assert(!prevented, "the app cancelled a link no plugin claims");
    });

    await check("a YouTube link opens in the video window", async () => {
      const href = "https://youtu.be/dQw4w9WgXcQ?t=1m30s";
      await waitFor("the YouTube link", () =>
        page!.eval<boolean>(`!!document.querySelector('.annotationLayer a[href="${href}"]')`),
      );
      const prevented = await page!.eval<boolean>(clickLink(href));
      assert(prevented, "the link was left to the browser");
      const src = await waitFor("the player", () =>
        page!.eval<string | false>(
          `document.querySelector('[data-video="player"]')?.src ?? false`,
        ),
      );
      assert(
        src === "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&start=90",
        `player src is ${src}`,
      );
      // Put the window away again for the checks that follow.
      await seedPlugin(page!, "video", { open: false, source: "" });
      await page!.reload();
      await waitFor("reader open", () =>
        page!.eval<boolean>(`!!document.querySelector("[data-page]")`),
      );
    });

    await check("geogebra claims .ggb and material links, and nothing else", async () => {
      const cases: [string, boolean][] = [
        ["https://www.geogebra.org/m/abcd1234", true],
        ["https://example.org/lesson/worksheet.GGB", true],
        ["ftp://example.org/worksheet.ggb", false],
        ["https://example.com/", false],
        ["https://youtu.be/dQw4w9WgXcQ", false],
      ];
      for (const [href, want] of cases) {
        assert(claimsLink(new URL(href)) === want, `claimsLink(${href}) is not ${want}`);
      }
      // The one field reads all three shapes of source.
      const read = [
        "https://www.geogebra.org/m/abcd1234",
        "https://x.org/a.ggb",
        "mMFYnJDT",
        "not a source",
      ].map((t) => JSON.stringify(parseSource(t)));
      const want = [
        `{"materialId":"abcd1234"}`,
        `{"url":"https://x.org/a.ggb"}`,
        `{"materialId":"mMFYnJDT"}`,
        "null",
      ];
      assert(
        read.join() === want.join(),
        `parseSource read ${read.join(" | ")}`,
      );
    });

    await check("the page strip opens on its key and lists every page", async () => {
      await page!.press("Tab");
      const count = await waitFor("strip items", () =>
        page!.eval<number>(
          `[...(document.querySelector('aside[aria-label="Pages"]')?.querySelectorAll("button") ?? [])].filter(b => b.querySelector("canvas")).length`,
        ),
      );
      // Only the branch holding the selected page is expanded, so a collapsed
      // branch's previews are not there to count; the tree checks below count
      // them exactly.
      assert(count >= 1, `strip has ${count} page previews`);
    });

    await check("the strip's page number is watermarked over the preview", async () => {
      const num = await waitFor("the number on a preview", () =>
        page!.eval<{ inBox: boolean; backdrop: number } | null>(
          `(() => {
            // The strip's own close button comes first in the DOM: the item
            // wanted here is the first one holding a preview.
            const item = [...document.querySelectorAll('aside[aria-label="Pages"] button')]
              .find(b => b.querySelector("canvas"));
            if (!item) return null;
            // The innermost span: its ancestors read "1" as well.
            const span = [...item.querySelectorAll("span")]
              .find(s => s.children.length === 0 && s.innerText.trim() === "1");
            if (!span) return null;
            // The box is whatever holds the canvas: the number must be inside
            // it, not a caption beside it.
            const box = item.querySelector("canvas")?.parentElement;
            // Its backing's alpha: rgba(r, g, b, a), or rgb(…) when opaque.
            const bg = getComputedStyle(span).backgroundColor.match(/[\\d.]+/g) ?? [];
            return {
              inBox: !!box && box.contains(span),
              backdrop: bg.length === 4 ? parseFloat(bg[3]) : bg.length ? 1 : 0,
            };
          })()`,
        ),
      );
      assert(num.inBox, "the page number is not inside the preview box");
      // The number is solid ink on a see-through backing, so the page under
      // it still shows: a watermark, not a label pasted over the preview.
      assert(
        num.backdrop > 0 && num.backdrop < 1,
        `page number backing alpha is ${num.backdrop}`,
      );
    });

    await check("the page counter steps aside for the strip", async () => {
      // `right` is transitioned over 0.22s, so this has to settle rather than
      // be sampled once — measuring immediately catches it still at its inset.
      const gap = () =>
        page!.eval<number>(
          `(() => {
            const el = [...document.querySelectorAll("div")].find(d => /^\\d+ \\/ \\d+$/.test(d.innerText.trim()));
            return el ? window.innerWidth - el.getBoundingClientRect().right : -1;
          })()`,
        );
      // The strip is 196px wide with a 20px inset; the counter must clear it.
      const shifted = await waitFor("the counter to clear the strip", async () => {
        const g = await gap();
        return g > 196 ? g : false;
      }, 5_000).catch(async () => {
        throw new Error(`counter settled ${await gap()}px from the right edge`);
      });
      assert(shifted > 196, `counter is ${shifted}px from the right edge`);
    });

    await check("the page counter takes its look from the options", async () => {
      const look = await page!.eval<{ size: string; color: string } | null>(`(() => {
        const el = [...document.querySelectorAll("div")].find(d => /^\\d+ \\/ \\d+$/.test(d.innerText.trim()));
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { size: cs.fontSize, color: cs.color };
      })()`);
      const want = DEFAULT_CONFIG.reader.pageCounter;
      assert(look?.size === `${want.fontSize}px`, `counter font size is ${look?.size}`);
      // #9aa3ad, fully opaque: color-mix() computes to color(srgb …), in 0–1 channels.
      const channels = (look?.color.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3);
      const hex = channels.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("");
      assert(`#${hex}` === want.textColor, `counter colour is ${look?.color}`);
    });

    /**
     * The strip's tree as it stands: each preview on screen, as its page and the
     * headings it hangs under, and the headings that are expanded.
     */
    const tree = () =>
      page!.eval<{ leaves: string[]; expanded: string[] }>(
        `(() => {
          const strip = document.querySelector('aside[aria-label="Pages"]');
          const title = (item) => item.querySelector(":scope > button").title;
          const leaves = [...strip.querySelectorAll("[data-tree-page]")].map((leaf) => {
            const path = [];
            let item = leaf.parentElement.closest('[role="treeitem"]');
            while (item) {
              path.unshift(title(item));
              item = item.parentElement.closest('[role="treeitem"]');
            }
            return leaf.dataset.treePage + ":" + path.join("/");
          });
          const expanded = [...strip.querySelectorAll('[role="treeitem"][aria-expanded="true"]')].map(title);
          return { leaves, expanded };
        })()`,
      );

    /** Wait until the tree shows exactly these leaves, and return it. */
    const treeShows = (leaves: string) =>
      waitFor(`the tree to show ${leaves}`, async () => {
        const t = await tree();
        return t.leaves.join() === leaves ? t : false;
      }).catch(async () => {
        throw new Error(`the tree is ${JSON.stringify(await tree())}, wanted ${leaves}`);
      });

    await check("the strip is the outline as a tree, with previews for leaves", async () => {
      // Opened on page 1: its branch is expanded, and everything else is one line.
      const t = await treeShows("1:Part one/Opening");
      assert(
        t.expanded.join() === "Part one,Opening",
        `expanded: ${t.expanded.join()}`,
      );
    });

    await check("a preview fills its slot in the tree, indent included", async () => {
      // Page 1 hangs two levels down, so its slot is narrower than the strip by
      // two indents. The drawn canvas must fit that slot, not the strip.
      const m = await waitFor("a drawn preview", () =>
        page!.eval<{ canvas: number; slot: number; overflow: number; strip: number } | false>(
          `(() => {
            const leaf = document.querySelector('aside[aria-label="Pages"] [data-tree-page="1"]');
            const c = leaf?.querySelector("canvas");
            if (!c || !c.width) return false;
            const box = c.parentElement.getBoundingClientRect();
            const r = c.getBoundingClientRect();
            const list = leaf.closest('[role="tree"]').getBoundingClientRect();
            return { canvas: r.width, slot: box.width, overflow: r.right - box.right, strip: list.width };
          })()`,
        ),
      );
      assert(m.overflow <= 0.5, `the preview overflows its slot by ${m.overflow}px`);
      assert(
        Math.abs(m.canvas - m.slot) <= 1,
        `the preview is ${m.canvas}px in a ${m.slot}px slot`,
      );
      assert(m.slot < m.strip - 20, `the nested slot (${m.slot}px) is not indented from the strip (${m.strip}px)`);
    });

    await check("moving the selection collapses the branches it leaves", async () => {
      await page!.press("PageDown");
      let t = await treeShows("2:Part one/Landscape");
      assert(t.expanded.join() === "Part one,Landscape", `expanded: ${t.expanded.join()}`);

      await page!.press("PageDown");
      t = await treeShows("3:The end");
      assert(t.expanded.join() === "The end", `expanded: ${t.expanded.join()}`);

      await page!.press("PageUp");
      await treeShows("2:Part one/Landscape");
      await page!.press("PageUp");
      await treeShows("1:Part one/Opening");
    });

    await check("a heading opens on one click and goes there on the next", async () => {
      const expected = await page!.eval<number>(pageTop(3));
      const clickHeading = () =>
        page!.eval(
          `document.querySelector('[role="treeitem"] > button[title="The end"]').click()`,
        );
      // Collapsed: the first click only opens it, selecting its page.
      await clickHeading();
      await treeShows("3:The end");
      assert(
        await page!.eval<boolean>(`!!document.querySelector('aside[aria-label="Pages"]')`),
        "the first click closed the strip",
      );
      // Open: the second goes to the heading.
      await clickHeading();
      await waitFor("the strip to close", () =>
        page!.eval<boolean>(`!document.querySelector('aside[aria-label="Pages"]')`),
      );
      await waitFor(`the reader at ${expected}px`, () =>
        page!.eval<boolean>(
          `Math.abs(document.querySelector("[data-page]").parentElement.scrollTop - ${expected}) < 2`,
        ),
      );
      // Back to where the next check expects: at the top, with the strip open.
      await page!.eval(
        `document.querySelector("[data-page]").parentElement.scrollTo({ top: 0 }); document.activeElement?.blur()`,
      );
      await page!.press("Tab");
      await waitFor("the strip again", () =>
        page!.eval<boolean>(`!!document.querySelector('aside[aria-label="Pages"]')`),
      );
    });

    await check("Escape closes the strip, then the tab", async () => {
      await page!.press("Escape");
      await waitFor("strip closed", () =>
        page!.eval<boolean>(
          `!document.querySelector('aside[aria-label="Pages"]')`,
        ),
      );
      await page!.press("Escape");
      await waitFor("back to the library", () =>
        page!.eval<boolean>(`document.body.innerText.includes("Library")`),
      );
    });

    await check("a PDF without an outline shows only previews", async () => {
      await page!.eval(
        `[...document.querySelectorAll("button")].find(b => b.innerText.includes("beta.pdf")).click()`,
      );
      await waitFor("reader open", () =>
        page!.eval<boolean>(`!!document.querySelector("[data-page]")`),
      );
      await page!.eval(`document.activeElement?.blur()`);
      await page!.press("Tab");
      await waitFor("the strip", () =>
        page!.eval<boolean>(`!!document.querySelector('aside[aria-label="Pages"] canvas')`),
      );
      // The outline loads on its own; give it the time it would take to show.
      await page!.eval(`new Promise(r => setTimeout(r, 500))`);
      const shown = await page!.eval<boolean>(
        `!!document.querySelector('aside[aria-label="Pages"] [role="treeitem"]')`,
      );
      assert(!shown, "contents are shown for a PDF with no outline");

      await page!.press("Escape");
      await waitFor("strip closed", () =>
        page!.eval<boolean>(`!document.querySelector('aside[aria-label="Pages"]')`),
      );
      await page!.press("Escape");
      await waitFor("back to the library", () =>
        page!.eval<boolean>(`document.body.innerText.includes("Library")`),
      );
    });

    console.log("\noptions and plugins");

    await check("the options window opens", async () => {
      await page!.eval(
        `document.querySelector('button[title="Options"]').click()`,
      );
      const title = await waitFor("panel", () =>
        page!.eval<string>(`document.querySelector("aside")?.innerText ?? ""`),
      );
      assert(title.includes("OPTIONS"), `panel reads "${title}"`);
    });

    console.log("\nwide pages, rotation and zoom");

    await check("at 100% max page width nothing scrolls sideways", async () => {
      await seedSettings(page!, { maxPageWidth: 100 });
      await page!.eval(`location.hash = ""`);
      await page!.reload();
      await waitFor("the library", () =>
        page!.eval<boolean>(
          `[...document.querySelectorAll("button")].some(b => b.innerText.includes("alpha.pdf"))`,
        ),
      );
      await page!.eval(
        `[...document.querySelectorAll("button")].find(b => b.innerText.includes("alpha.pdf")).click()`,
      );
      await waitFor("reader open", () =>
        page!.eval<boolean>(`!!document.querySelector("[data-page]")`),
      );

      // The page must fill the reader and stop there: the padding that used to
      // sit beside it made every setting near 100% overflow by 48px.
      const m = await waitFor("a page sized to the reader", () =>
        page!
          .eval<{ page: number; client: number; scroll: number }>(
            `(() => {
              const p = document.querySelector("[data-page]");
              const r = p.parentElement;
              return { page: p.clientWidth, client: r.clientWidth, scroll: r.scrollWidth };
            })()`,
          )
          .then((m) => (m.page > 0 ? m : false)),
      );
      assert(
        m.scroll <= m.client + 1,
        `the reader scrolls sideways: ${m.scroll} in ${m.client}`,
      );
      assert(
        m.page >= m.client - 1,
        `the page is ${m.page} in a ${m.client} reader, so 100% is not full width`,
      );
    });

    await check("a stored width above 100% is clamped, not overflowed", async () => {
      // The setting is bounded by the server, so a hand-edited or stale value
      // cannot put the window into a sideways scroll the slider can no longer undo.
      await seedSettings(page!, { maxPageWidth: 140 });
      await page!.reload();
      await waitFor("reader open", () =>
        page!.eval<boolean>(`!!document.querySelector("[data-page]")`),
      );

      const m = await waitFor("a measured page", () =>
        page!
          .eval<{ page: number; client: number; scroll: number }>(
            `(() => {
              const p = document.querySelector("[data-page]");
              const r = p.parentElement;
              return { page: p.clientWidth, client: r.clientWidth, scroll: r.scrollWidth };
            })()`,
          )
          .then((m) => (m.page > 0 ? m : false)),
      );
      assert(
        m.scroll <= m.client + 1,
        `140% still scrolls sideways: ${m.scroll} in ${m.client}`,
      );
      assert(
        m.page <= m.client + 1,
        `the page is ${m.page} in a ${m.client} reader`,
      );
    });

    await check("the rotate key turns the page a quarter turn", async () => {
      const ratio = () =>
        page!.eval<number>(
          `(() => { const p = document.querySelector("[data-page]"); return p.clientHeight / p.clientWidth; })()`,
        );
      const before = await ratio();
      // The key is ignored while the clicked card still has focus.
      await page!.eval(`document.activeElement?.blur()`);
      await page!.press("r");

      const after = await waitFor("the page box to turn", async () => {
        const r = await ratio();
        return Math.abs(r - before) > 0.05 ? r : false;
      });
      assert(
        Math.abs(after - 1 / before) < 0.05,
        `ratio went ${before} → ${after}, expected ${1 / before}`,
      );
    });

    await check("the rotate button turns the page from the toolbar", async () => {
      const ratio = () =>
        page!.eval<number>(
          `(() => { const p = document.querySelector("[data-page]"); return p.clientHeight / p.clientWidth; })()`,
        );
      const before = await ratio();

      await unfoldBar(page!);
      await waitFor("bar unfolded", () =>
        page!.eval<boolean>(
          `document.querySelector('button[title="Rotate"]')?.tabIndex === 0`,
        ),
      );
      await clickButton(page!, "Rotate");

      const after = await waitFor("the page box to turn", async () => {
        const r = await ratio();
        return Math.abs(r - before) > 0.05 ? r : false;
      });
      assert(
        Math.abs(after - 1 / before) < 0.05,
        `ratio went ${before} → ${after}, expected ${1 / before}`,
      );
      // Rotate has no options window of its own to open.
      const panel = await page!.eval<boolean>(
        `[...document.querySelectorAll("aside")].some(a => a.innerText.trim().startsWith("ROTATE"))`,
      );
      assert(!panel, "a Rotate options panel opened");
    });

    await check("a turned page keeps its link on the same spot of the paper", async () => {
      const a = await waitFor("the link on the turned page", () =>
        page!.eval<LinkBox | null>(
          `(() => { const b = ${linkBox}; return b && b.angle !== 0 ? b : null; })()`,
        ),
      );
      assertBox(a, a.angle);
    });

    await check("the zoom window turns pan mode on, and off again", async () => {
      const cursor = () =>
        page!.eval<string>(
          `(() => {
            const r = document.querySelector("[data-page]")?.parentElement;
            return r ? getComputedStyle(r).cursor : "";
          })()`,
        );

      await unfoldBar(page!);
      await waitFor("bar unfolded", () =>
        page!.eval<boolean>(
          `document.querySelector('button[title="Zoom"]')?.tabIndex === 0`,
        ),
      );
      await clickButton(page!, "Zoom");

      await waitFor("pan mode on", async () => (await cursor()) === "grab");
      // The map is measured on the frame after the window mounts, so this has
      // to poll rather than be sampled the moment pan mode turns on.
      await waitFor("the page map", () =>
        page!.eval<boolean>(
          `!!document.querySelector('aside [title="Drag to move the page"]')`,
        ),
      );

      // The map's rectangle is a handle: a press alone leaves the document
      // where it is, and dragging carries it.
      const scrollTop = () =>
        page!.eval<number>(
          `document.querySelector("[data-page]").parentElement.scrollTop`,
        );
      const centre = await page!.eval<{ x: number; y: number }>(
        `(() => {
          const r = document.querySelector('[title="Drag to move the page"]').getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        })()`,
      );

      // Overflow is this tool's job, not the setting's: zoom past the fit and
      // the reader gains a sideways scroll.
      const setZoom = (percent: number) =>
        page!.eval(
          `(() => {
            const panel = [...document.querySelectorAll("aside")]
              .find(a => a.innerText.trim().startsWith("ZOOM"));
            const range = panel.querySelector('input[type="range"]');
            range.value = "${percent}";
            range.dispatchEvent(new Event("input", { bubbles: true }));
          })()`,
        );
      const sideways = () =>
        page!.eval<{ scroll: number; client: number }>(
          `(() => {
            const r = document.querySelector("[data-page]").parentElement;
            return { scroll: r.scrollWidth, client: r.clientWidth };
          })()`,
        );

      const fitted = await sideways();
      assert(
        fitted.scroll <= fitted.client + 1,
        `the reader scrolls sideways before zooming: ${fitted.scroll} in ${fitted.client}`,
      );

      await setZoom(200);
      const zoomed = await waitFor("the page to outgrow the reader", async () => {
        const now = await sideways();
        return now.scroll > now.client + 1 ? now : false;
      });
      assert(zoomed.scroll > zoomed.client, "zoom did not widen the page");
      await setZoom(100);
      await waitFor("the page back inside the reader", async () => {
        const now = await sideways();
        return now.scroll <= now.client + 1;
      });

      const before = await scrollTop();
      await page!.click(centre.x, centre.y);
      const pressed = await scrollTop();
      assert(
        Math.abs(pressed - before) < 2,
        `a press alone moved the document from ${before} to ${pressed}`,
      );

      await page!.drag([centre.x, centre.y], [centre.x, centre.y + 20]);
      const dragged = await waitFor("the document to follow the map", async () => {
        const now = await scrollTop();
        return now > before + 10 ? now : false;
      });
      assert(dragged > before, `scrolled to ${dragged} from ${before}`);

      // The window's contents must fit it at every width. A range input
      // carries a UA margin, which made a 100%-wide one overflow by 4px and
      // put a horizontal scrollbar under the slider at any panel size.
      const widest = await page!.eval<{ width: number; over: number }[]>(
        `(() => {
          const panel = [...document.querySelectorAll("aside")]
            .find(a => a.innerText.trim().startsWith("ZOOM"));
          const body = panel.querySelector('input[type="range"]').parentElement;
          const was = panel.style.width;
          const out = [180, 240, 320, 480].map(width => {
            panel.style.width = width + "px";
            return { width, over: body.scrollWidth - body.clientWidth };
          });
          panel.style.width = was;
          return out;
        })()`,
      );
      const overflowing = widest.filter((w) => w.over > 0);
      assert(
        overflowing.length === 0,
        `the zoom window scrolls sideways at ${overflowing
          .map((w) => `${w.width}px (by ${w.over})`)
          .join(", ")}`,
      );

      // Switching the tool off must end pan mode: a reader that swallows text
      // selection with nothing on screen to explain it reads as a bug.
      await page!.eval(`document.querySelector('button[title="Zoom"]').click()`);
      await waitFor("pan mode off", async () => (await cursor()) !== "grab");
    });

    console.log("\nclock, planning, timer and geogebra");

    /**
     * Open one plugin's panel, unfolding the bar first only if it is folded —
     * the `+` is a toggle, and clicking it with the bar already open puts the
     * buttons back out of reach.
     */
    const openPlugin = async (title: string) => {
      await unfoldBar(page!);
      await waitFor(`${title} reachable`, () =>
        page!.eval<boolean>(
          `document.querySelector('button[title="${title}"]')?.tabIndex === 0`,
        ),
      );
      await clickButton(page!, title);
    };

    await check("the clock shows 24-hour time and a French date", async () => {
      // Back to a plain library: the reader tests left a PDF in the hash and a
      // 140% page width behind.
      await seedSettings(page!);
      await seedPlugin(page!, "clock", {
        visible: true,
        showSeconds: true,
        showDate: true,
      });
      await page!.eval(`location.hash = ""`);
      await page!.reload();

      const time = await waitFor("the clock", () =>
        page!.eval<string>(
          `document.querySelector('[data-clock="time"]')?.innerText?.trim() ?? ""`,
        ),
      );
      assert(/^\d{2}:\d{2}:\d{2}$/.test(time), `clock read "${time}"`);

      const date = await page!.eval<string>(
        `document.querySelector('[data-clock="date"]')?.innerText?.trim() ?? ""`,
      );
      assert(
        /^\p{L}+ \d{2}-\d{2}-\d{4}$/u.test(date),
        `date read "${date}", expected e.g. "lundi 07-09-2026"`,
      );
    });

    await check("the clock widget is dragged and remembers where it went", async () => {
      const at = () =>
        page!.eval<{ x: number; y: number }>(
          `(() => {
            const w = document.querySelector('[data-clock="time"]').closest("div[style*=left]");
            const r = w.getBoundingClientRect();
            return { x: Math.round(r.left), y: Math.round(r.top) };
          })()`,
        );

      const before = await at();
      await page!.drag(
        [before.x + 20, before.y + 10],
        [before.x + 160, before.y + 120],
      );
      const after = await waitFor("the clock to move", async () => {
        const now = await at();
        return Math.abs(now.x - before.x) > 100 ? now : false;
      }, 8_000).catch(async () => {
        const now = await at();
        const hit = await page!.eval<string>(
          `(() => {
            const el = document.elementFromPoint(${before.x + 20}, ${before.y + 10});
            return el ? el.tagName + "." + (el.className ?? "") : "nothing";
          })()`,
        );
        throw new Error(
          `dragged from ${JSON.stringify(before)} and it is at ${JSON.stringify(now)}; the press landed on ${hit}`,
        );
      });

      // Written to localStorage under the widget's own key — debounced, so
      // wait for the write rather than racing the reload against it. Stored as
      // a fraction of the room the widget has to move in, never in pixels.
      await waitFor("the position stored", () =>
        page!.eval<boolean>(
          `(() => {
            const v = JSON.parse(localStorage.getItem("zefpdf.widget.clock") ?? "null");
            const w = document.querySelector('[data-clock="time"]').closest("div[style*=left]");
            const x = (innerWidth - w.offsetWidth) * (v?.x ?? NaN);
            const y = (innerHeight - w.offsetHeight) * (v?.y ?? NaN);
            return v.x <= 1 && v.y <= 1 && Math.abs(x - ${after.x}) < 3 && Math.abs(y - ${after.y}) < 3;
          })()`,
        ),
      );
      await page!.reload();
      const restored = await waitFor("the clock back where it was", async () => {
        const now = await at().catch(() => null);
        return now && Math.abs(now.x - after.x) < 3 ? now : false;
      });
      assert(
        Math.abs(restored.y - after.y) < 3,
        `reopened at ${restored.y}, left at ${after.y}`,
      );
    });

    await check("a widget keeps its place across window sizes", async () => {
      // Parked flush in the bottom-right corner, then reloaded in a smaller
      // and a larger window: it must be flush in that corner each time. In
      // pixels it was pushed in from a smaller screen's edge, and left short
      // of a larger one's.
      await page!.eval(
        `localStorage.setItem("zefpdf.widget.clock", JSON.stringify({ x: 1, y: 1 }))`,
      );
      const gaps = async (w: number, h: number) => {
        await page!.send("Emulation.setDeviceMetricsOverride", {
          width: w,
          height: h,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await page!.reload();
        return waitFor(`the clock in a ${w}×${h} window`, () =>
          page!.eval<{ right: number; bottom: number } | false>(`(() => {
            const t = document.querySelector('[data-clock="time"]');
            if (!t || innerWidth !== ${w}) return false;
            const r = t.closest("div[style*=left]").getBoundingClientRect();
            return { right: innerWidth - r.right, bottom: innerHeight - r.bottom };
          })()`),
        );
      };
      try {
        for (const [w, h] of [[640, 480], [1400, 900]] as const) {
          const g = await gaps(w, h);
          assert(
            Math.abs(g.right) < 2 && Math.abs(g.bottom) < 2,
            `at ${w}×${h} the clock is ${g.right}px from the right, ${g.bottom}px from the bottom`,
          );
        }
        // Still a fraction after all that: nothing wrote pixels back.
        const v = await page!.eval<{ x: number; y: number }>(
          `JSON.parse(localStorage.getItem("zefpdf.widget.clock"))`,
        );
        assert(v.x === 1 && v.y === 1, `stored ${JSON.stringify(v)}`);
      } finally {
        await page!.send("Emulation.clearDeviceMetricsOverride");
        await page!.reload();
        await waitFor("the clock back", () =>
          page!.eval<boolean>(`!!document.querySelector('[data-clock="time"]')`),
        );
      }
    });

    await check("the clock carries no border", async () => {
      const border = await page!.eval<string>(
        `(() => {
          const card = document.querySelector('[data-clock="time"]').parentElement;
          return getComputedStyle(card).borderTopColor;
        })()`,
      );
      // Transparent reads either as the keyword or as a zero-alpha colour.
      assert(
        /transparent|,\s*0\)|\/ 0\)/.test(border),
        `clock border is ${border}`,
      );
    });

    await check("clicking a widget opens that plugin's options", async () => {
      const box = await page!.eval<{ x: number; y: number }>(
        `(() => {
          const r = document.querySelector('[data-clock="time"]').getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        })()`,
      );
      // A press that goes nowhere is a click; a press that moves is a drag.
      await page!.click(box.x, box.y);
      await waitFor("the clock's options panel", () =>
        page!.eval<boolean>(
          `[...document.querySelectorAll("aside")].some(a => a.innerText.trim().startsWith("CLOCK"))`,
        ),
      );
    });

    await check("the panel opened or touched last is the one in front", async () => {
      // A small window opened over a big one must land on top of it, and the
      // big one must come back when it is next touched — including across the
      // toolbar/app split, which is where a stacking context once decided the
      // order for good.
      await page!.eval(
        `localStorage.setItem("zefpdf.settings-panel", JSON.stringify({ x: 0.25, y: 0.12, w: 0.7, h: 0.8, collapsed: false }))`,
      );
      await page!.eval(
        `localStorage.setItem("zefpdf.plugin-panel.clock", JSON.stringify({ x: 0.4, y: 0.3, w: 0.35, h: 0.4, collapsed: false }))`,
      );
      // Clear of the big window, so the click that opens its options lands on
      // the widget rather than on whatever is drawn over it.
      await page!.eval(
        `localStorage.setItem("zefpdf.widget.clock", JSON.stringify({ x: 20, y: 380 }))`,
      );
      await page!.reload();
      // The options window is not remembered across reloads: open it.
      await clickButton(page!, "Options");

      await waitFor("the options window", () =>
        page!.eval<boolean>(
          `[...document.querySelectorAll("aside")].some(a => a.innerText.trim().startsWith("OPTIONS"))`,
        ),
      );
      const clock = await page!.eval<{ x: number; y: number }>(
        `(() => {
          const r = document.querySelector('[data-clock="time"]').getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        })()`,
      );
      await page!.click(clock.x, clock.y);
      await waitFor("the clock's options panel", () =>
        page!.eval<boolean>(
          `[...document.querySelectorAll("aside")].some(a => a.innerText.trim().startsWith("CLOCK"))`,
        ),
      );

      /** A point both windows cover, so the hit test says which one is in front. */
      const overlap = await page!.eval<{ x: number; y: number } | false>(
        `(() => {
          const at = (t) => [...document.querySelectorAll("aside")]
            .find(a => a.innerText.trim().startsWith(t))?.getBoundingClientRect();
          const small = at("CLOCK"), big = at("OPTIONS");
          if (!small || !big) return false;
          const p = { x: Math.round(small.left + small.width / 2), y: Math.round(small.top + small.height / 2) };
          const inside = p.x > big.left && p.x < big.right && p.y > big.top && p.y < big.bottom;
          return inside && p;
        })()`,
      );
      assert(overlap, "the two windows were laid out without an overlap to test");

      /** The panel drawn over the overlap, by the title its bar carries. */
      const frontAt = () =>
        page!.eval<string>(
          `(() => {
            const el = document.elementFromPoint(${overlap.x}, ${overlap.y});
            const panel = el?.closest("aside");
            return panel ? panel.innerText.trim().split("\\n")[0] : "nothing";
          })()`,
        );

      const opened = await frontAt();
      assert(opened === "CLOCK", `the newly opened window is behind: ${opened} is in front`);

      // Pressed on its title bar, the big one comes back to the front.
      const bar = await page!.eval<{ x: number; y: number }>(
        `(() => {
          const panel = [...document.querySelectorAll("aside")]
            .find(a => a.innerText.trim().startsWith("OPTIONS"));
          const r = panel.querySelector("header").getBoundingClientRect();
          return { x: Math.round(r.left + 30), y: Math.round(r.top + r.height / 2) };
        })()`,
      );
      await page!.click(bar.x, bar.y);
      const touched = await frontAt();
      assert(
        touched === "OPTIONS",
        `the touched window stayed behind: ${touched} is in front`,
      );

      await page!.reload();
    });

    await check("a panel parked in the tab bar's strip stays there, over the bar", async () => {
      // Both a panel and a widget may be left in the strip the bar slides out
      // of: the panel draws above it (--z-panel over --z-tab-bar), so its title
      // bar — the only handle it has — is still there to grab when the bar is
      // out. Nothing is pushed anywhere.
      await page!.eval(
        `localStorage.setItem("zefpdf.settings-panel", JSON.stringify({ x: 0.4, y: 0, w: 0.38, h: 0.6, collapsed: false }))`,
      );
      await page!.eval(
        `localStorage.setItem("zefpdf.widget.clock", JSON.stringify({ x: 60, y: 0 }))`,
      );
      await page!.reload();
      await clickButton(page!, "Options");

      const tops = await waitFor("the panel and the widget", () =>
        page!.eval<{ panel: number; widget: number } | false>(
          `(() => {
            const panel = document.querySelector("aside");
            const clock = document.querySelector('[data-clock="time"]');
            if (!panel || !clock) return false;
            return {
              panel: panel.getBoundingClientRect().top,
              widget: clock.closest("div[style*=left]").getBoundingClientRect().top,
            };
          })()`,
        ),
      );
      assert(tops.panel < 0.5, `the panel was pushed to ${tops.panel}`);
      assert(tops.widget < 0.5, `the widget was pushed to ${tops.widget}`);

      // The bar comes out when the pointer nears the top — which is exactly the
      // gesture of dragging something up there, so that is when the panel has
      // to win.
      await page!.eval(
        `window.dispatchEvent(new MouseEvent("mousemove", { clientY: 4 }))`,
      );
      await waitFor("the tab bar out", () =>
        page!.eval<boolean>(`document.body.classList.contains("tabs-shown")`),
      );
      const hit = await page!.eval<string>(
        `(() => {
          const bar = document.querySelector("aside header").getBoundingClientRect();
          const el = document.elementFromPoint(bar.left + bar.width / 2, bar.top + bar.height / 2);
          return el?.closest("aside") ? "panel" : (el?.tagName ?? "nothing") + " " + (el?.className ?? "");
        })()`,
      );
      assert(hit === "panel", `the tab bar covered the title bar: hit ${hit}`);

      // A widget is over the bar too — it is dragged from anywhere on itself,
      // so all of it has to stay pressable — but under the panels, which are
      // the thing the user opened last.
      const overBar = await page!.eval<boolean>(
        `(() => {
          const clock = document.querySelector('[data-clock="time"]');
          const r = clock.getBoundingClientRect();
          const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !!el && clock.closest("div[style*=left]").contains(el);
        })()`,
      );
      assert(overBar, "the tab bar covered the widget");

      const layers = await page!.eval<{ widget: number; bar: number; panel: number }>(
        `(() => {
          const z = (el) => parseInt(getComputedStyle(el).zIndex, 10);
          const root = getComputedStyle(document.documentElement);
          return {
            widget: z(document.querySelector('[data-clock="time"]').closest("div[style*=left]")),
            // The bar comes and goes; its layer is the token it is drawn at.
            bar: parseInt(root.getPropertyValue("--z-tab-bar"), 10),
            panel: z(document.querySelector("aside")),
          };
        })()`,
      );
      assert(
        layers.widget > layers.bar && layers.widget < layers.panel,
        `widget ${layers.widget} is not between the bar ${layers.bar} and the panel ${layers.panel}`,
      );

      // Leave the options window shut for the checks that follow.
      await page!.reload();
      await waitFor("the clock back", () =>
        page!.eval<boolean>(`!!document.querySelector('[data-clock="time"]')`),
      );
    });

    await check("the toolbar button switches the clock on and off", async () => {
      await openPlugin("Clock");
      await waitFor("the clock switched off", () =>
        page!.eval<boolean>(`!document.querySelector('[data-clock="time"]')`),
      );
      await page!.eval(`document.querySelector('button[title="Clock"]').click()`);
      await waitFor("the clock back", () =>
        page!.eval<boolean>(`!!document.querySelector('[data-clock="time"]')`),
      );
    });

    await check("each plugin's appearance is set independently", async () => {
      await seedPlugin(page!, "clock", {
        visible: true,
        appearance: { textColor: "#ff0000", textOpacity: 100 },
      });
      await seedPlugin(page!, "planning", {
        visible: true,
        appearance: { textColor: "#00ff00", textOpacity: 100 },
      });
      await page!.reload();

      const colors = await waitFor("both overlays", () =>
        page!.eval<{ clock: string; planning: string } | false>(
          `(() => {
            const c = document.querySelector('[data-clock="time"]');
            // Any day but today, which carries its own highlight colour.
            const d = document.querySelector('[data-day]:not([data-today])');
            if (!c || !d) return false;
            return {
              clock: getComputedStyle(c).color,
              planning: getComputedStyle(d).color,
            };
          })()`,
        ),
      );
      // `color-mix` computes to either notation depending on the engine.
      const red = /\b255,\s*0,\s*0\b|srgb 1 0 0/;
      const green = /\b0,\s*255,\s*0\b|srgb 0 1 0/;
      assert(red.test(colors.clock), `clock is ${colors.clock}, expected red`);
      assert(
        green.test(colors.planning),
        `planning is ${colors.planning}, expected green`,
      );
    });

    await check("the planning shows this week, and @ links a PDF in a note", async () => {
      // Every weekday gets one item, so whichever day the test runs has one.
      // A class of its own, deleted again at the end: the classes checks
      // further down start from an empty database.
      const made = await page!.eval<{ classes: { id: number; name: string }[] }>(
        `fetch("/api/classes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Planning", color: "#00ff00" }),
        }).then(r => r.json())`,
      );
      const classId = made.classes.find((c) => c.name === "Planning")!.id;
      const items = [0, 1, 2, 3, 4].map((day) => ({
        id: `smoke-${day}`,
        day,
        name: `Lesson ${day}`,
        classId: day === 2 ? classId : null,
      }));
      const now = new Date();
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
      const key = [monday.getFullYear(), monday.getMonth() + 1, monday.getDate()]
        .map((n) => String(n).padStart(2, "0"))
        .join("-");
      const notes = { [`${key}:smoke-2`]: "Read first. " };
      // Through the app's own page, so the request carries its origin.
      await page!.eval(
        `(async () => {
          const put = (k, v) => fetch("/api/plugins/planning/data/" + k, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(v),
          });
          await put("planning", ${JSON.stringify({ even: items, odd: items })});
          await put("notes", ${JSON.stringify(notes)});
        })()`,
      );
      await seedPlugin(page!, "planning", { visible: true });
      await page!.reload();

      const week = await waitFor("the week", () =>
        page!.eval<{ days: number; today: number; items: number } | false>(
          `(() => {
            const days = [...document.querySelectorAll("[data-day]")];
            const items = document.querySelectorAll("[data-item]").length;
            if (!items) return false;
            return {
              days: days.length,
              today: days.filter(d => d.dataset.today === "true").length,
              items,
            };
          })()`,
        ),
      );
      assert(week.days === 5, `${week.days} day columns, expected 5`);
      const weekday = (now.getDay() + 6) % 7 < 5;
      assert(week.today === (weekday ? 1 : 0), `${week.today} columns marked today`);
      assert(week.items === 5, `${week.items} items, expected 5`);

      const edges = await page!.eval<{ colored: string; plain: string }>(
        `({
          colored: getComputedStyle(document.querySelector('[data-item="smoke-2"]')).borderLeftColor,
          plain: getComputedStyle(document.querySelector('[data-item="smoke-1"]')).borderLeftColor,
        })`,
      );
      assert(/\b0,\s*255,\s*0\b/.test(edges.colored), `the class's item is edged ${edges.colored}`);
      assert(edges.plain !== edges.colored, "an item without a class took a colour");

      await page!.eval(`document.querySelector('[data-item="smoke-2"] [data-select]').click()`);
      await waitFor("the note", () =>
        page!.eval<boolean>(`document.querySelector("textarea")?.value === "Read first. "`),
      );
      assert(
        !(await page!.eval<boolean>(`!!document.querySelector('[data-note="rendered"]')`)),
        "the note is still read back under the textarea",
      );

      // Typed for real, so the caret and key handling are the browser's own.
      await page!.eval(`(() => {
        const t = document.querySelector("textarea");
        t.focus();
        t.setSelectionRange(t.value.length, t.value.length);
      })()`);
      for (const k of ["@", "a", "l"]) await page!.press(k);
      await waitFor("alpha.pdf suggested", () =>
        page!.eval<boolean>(`!!document.querySelector('[data-suggest="alpha.pdf"]')`),
      );
      await page!.press("Enter");
      const typed = await waitFor("the reference completed", () =>
        page!.eval<string | false>(
          `(() => { const v = document.querySelector("textarea").value; return v.includes("@[") ? v : false; })()`,
        ),
      );
      assert(typed === "Read first. @[alpha]", `the note reads "${typed}"`);

      // Ctrl+click inside the reference opens the PDF.
      await page!.eval(`(() => {
        const t = document.querySelector("textarea");
        t.setSelectionRange(15, 15);
        t.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
      })()`);
      await waitFor("alpha.pdf opened", () =>
        page!.eval<boolean>(`location.hash === "#/f/alpha.pdf"`),
      );

      // The card shows the note's links, not its text, and one opens the PDF.
      await page!.eval(`location.hash = ""`);
      await waitFor("back to the library", () => page!.eval<boolean>(`location.hash === ""`));
      const card = await page!.eval<{ links: string[]; text: string }>(
        `(() => {
          const c = document.querySelector('[data-item="smoke-2"]');
          return { links: [...c.querySelectorAll("[data-ref]")].map(b => b.dataset.ref), text: c.innerText };
        })()`,
      );
      assert(card.links.join() === "alpha.pdf", `the card links ${card.links.join()}`);
      assert(!card.text.includes("Read first"), `the card previews the note: ${card.text}`);
      await page!.eval(`document.querySelector('[data-item="smoke-2"] [data-ref="alpha.pdf"]').click()`);
      await waitFor("alpha.pdf opened from the card", () =>
        page!.eval<boolean>(`location.hash === "#/f/alpha.pdf"`),
      );
      // A panel this size would sit over the widgets the next checks click.
      await seedPlugin(page!, "planning", { visible: false });
      await page!.eval(`fetch("/api/classes/${classId}", { method: "DELETE" })`);
      await page!.eval(`location.hash = ""`);
    });

    await check("the timer counts down and Reset puts the time back", async () => {
      await seedPlugin(page!, "timer", { durationMs: 60_000 });
      await page!.reload();
      await waitFor("the app", () =>
        page!.eval<boolean>(`!!document.querySelector('button[title="Plugins"]')`),
      );
      await openPlugin("Timer");

      const press = (label: string) =>
        page!.eval(
          `[...document.querySelectorAll("button")].find(b => b.innerText.trim() === "${label}").click()`,
        );
      const shown = () =>
        page!.eval<string>(
          `document.querySelector("[data-timer]")?.innerText?.trim() ?? ""`,
        );

      await waitFor("the timer panel", () =>
        page!.eval<boolean>(
          `[...document.querySelectorAll("button")].some(b => b.innerText.trim() === "Start")`,
        ),
      );
      await press("Start");

      const first = await waitFor("the countdown", async () => {
        const t = await shown();
        return /^\d{2}:\d{2}$/.test(t) ? t : false;
      });
      // Derived from an end instant, so it must actually advance in real time.
      await waitFor("the countdown to advance", async () =>
        (await shown()) !== first ? true : false,
      );

      await press("Reset");
      await waitFor(
        "the full minute back",
        async () => (await shown()) === "01:00",
      );

      // The countdown and its buttons are one widget the user can place —
      // a positioned card, not a window with a title bar.
      const shape = await page!.eval<{ widget: boolean; panel: boolean }>(
        `(() => {
          const t = document.querySelector("[data-timer]");
          const widget = t?.closest("div[style*=left]");
          return {
            widget: !!widget && widget.innerText.includes("Reset"),
            panel: !!t?.closest("aside"),
          };
        })()`,
      );
      assert(shape.widget, "the countdown and its buttons are not one widget");
      assert(!shape.panel, "the countdown is still inside a window");
    });

    await check("clicking the timer opens its options", async () => {
      const box = await page!.eval<{ x: number; y: number }>(
        `(() => {
          const r = document.querySelector("[data-timer]").getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        })()`,
      );
      await page!.click(box.x, box.y);
      await waitFor("the timer's options panel", () =>
        page!.eval<boolean>(
          `[...document.querySelectorAll("aside")].some(a => a.innerText.trim().startsWith("TIMER") && a.innerText.includes("Minutes"))`,
        ),
      );
    });

    await check("collapsing a panel hides its body without unmounting it", async () => {
      // GeoGebra's applet is a whole application living in the panel's DOM:
      // unmounting on collapse would throw the construction away.
      const body = `document.querySelector('button[title="Options"]')`;
      await page!.eval(`(() => {
        const open = document.querySelector('aside');
        if (!open || !open.innerText.includes("OPTIONS")) ${body}.click();
      })()`);
      const sliders = () =>
        page!.eval<number>(
          `document.querySelectorAll('aside input[type="range"]').length`,
        );
      await waitFor("the options body", async () => (await sliders()) > 0);

      await page!.eval(
        `[...document.querySelectorAll('aside button[title="Collapse"]')][0].click()`,
      );
      await waitFor("the panel to collapse", () =>
        page!.eval<boolean>(
          `!!document.querySelector('aside button[title="Expand"]')`,
        ),
      );

      const after = await page!.eval<{ count: number; visible: boolean }>(
        `(() => {
          const inputs = document.querySelectorAll('aside input[type="range"]');
          const first = inputs[0];
          return {
            count: inputs.length,
            visible: !!first && first.getClientRects().length > 0,
          };
        })()`,
      );
      assert(after.count > 0, "the collapsed panel unmounted its body");
      assert(!after.visible, "the collapsed panel still shows its body");

      // And back, so the rest of the run sees a normal panel.
      await page!.eval(
        `document.querySelector('aside button[title="Expand"]').click()`,
      );
    });

    await check("a panel follows the viewport and never leaves it", async () => {
      // Position and size are fractions of the viewport: shrinking the window
      // scales the panel down with it and keeps all of it on screen, and growing
      // it back returns the panel to the same place and size.
      type Box = { x: number; y: number; w: number; h: number; vw: number; vh: number };
      const box = () =>
        page!.eval<Box>(`(() => {
          const r = document.querySelector('aside').getBoundingClientRect();
          return { x: r.left, y: r.top, w: r.width, h: r.height,
                   vw: innerWidth, vh: innerHeight };
        })()`);
      const before = await box();
      const inside = (b: Box) =>
        b.x >= 0 && b.y >= 0 && b.x + b.w <= b.vw + 0.5 && b.y + b.h <= b.vh + 0.5;
      assert(inside(before), `the panel starts off screen: ${JSON.stringify(before)}`);

      for (const [width, height] of [[640, 420], [420, 300]]) {
        await page!.send("Emulation.setDeviceMetricsOverride", {
          width, height, deviceScaleFactor: 1, mobile: false,
        });
        const small = await waitFor(`the ${width}×${height} layout`, async () => {
          const b = await box();
          return b.vw === width && inside(b) ? b : false;
        });
        assert(
          small.w <= before.w,
          `the panel grew in a smaller window: ${before.w} → ${small.w}`,
        );
      }

      await page!.send("Emulation.clearDeviceMetricsOverride");
      const after = await waitFor("the original viewport", async () => {
        const b = await box();
        return b.vw === before.vw ? b : false;
      });
      assert(
        ["x", "y", "w", "h"].every(
          (k) => Math.abs(after[k as keyof Box] - before[k as keyof Box]) < 1,
        ),
        `the panel did not come back: ${JSON.stringify(before)} → ${JSON.stringify(after)}`,
      );
    });

    await check("the geogebra window opens, and its ⚙ opens the options", async () => {
      // The toolbar button is a switch over the calculator itself; the picker
      // lives behind the ⚙ in that window's title bar.
      await openPlugin("GeoGebra");
      await waitFor("the calculator window", () =>
        page!.eval<boolean>(
          `[...document.querySelectorAll("aside")].some(a => a.innerText.trim().startsWith("GEOGEBRA"))`,
        ),
      );
      await clickButton(page!, "GeoGebra options");

      // The listing is fetched when the options open, so this has to wait for
      // the option to arrive rather than read the select once.
      const options = await waitFor("the .ggb in the picker", async () => {
        const text = await page!.eval<string>(
          `[...document.querySelectorAll("select")].map(s => s.innerText).join("|")`,
        );
        return text.includes("graph.ggb") ? text : false;
      }).catch(() => "");
      assert(options.includes("graph.ggb"), `selects read "${options}"`);

      // Closed again, from its switch: left open, the applet would load from
      // geogebra.org (there is no offline bundle here) and stay on screen
      // through every later check.
      await openPlugin("GeoGebra");
      await waitFor("the calculator window to close", () =>
        page!.eval<boolean>(`!document.getElementById("ggb-host")`),
      );
      // …and its options window, which has the same title.
      await page!.eval(`(() => {
        const opts = [...document.querySelectorAll("aside")].find(a => a.innerText.trim().startsWith("GEOGEBRA"));
        opts?.querySelector('button[title="Close"]').click();
      })()`);
      await waitFor("the options window to close", () =>
        page!.eval<boolean>(
          `![...document.querySelectorAll("aside")].some(a => a.innerText.trim().startsWith("GEOGEBRA"))`,
        ),
      );
    });

    await check("the video window embeds a pasted YouTube link, and shows its appearance", async () => {
      // A bad source first: the window must say what is wrong rather than
      // embed nothing and look broken.
      await seedPlugin(page!, "video", {
        open: true,
        source: "https://www.youtube.com/playlist?list=PL123",
        appearance: { bgOpacity: 0, textColor: "#00ff00", textOpacity: 100, fontSize: 20 },
      });
      await page!.reload();
      const empty = await waitFor("the empty state", () =>
        page!.eval<{ color: string; size: string } | false>(
          `(() => {
            const p = document.querySelector('[data-video="empty"]');
            if (!p) return false;
            const cs = getComputedStyle(p);
            return { color: cs.color, size: cs.fontSize };
          })()`,
        ),
      );
      // `color-mix` resolves to `color(srgb 0 1 0)`, not `rgb(0, 255, 0)`.
      assert(
        /0,\s*255,\s*0|srgb 0 1 0/.test(empty.color),
        `empty state is ${empty.color}`,
      );
      assert(empty.size === "20px", `empty state is ${empty.size}`);

      // Typing a link with a timestamp replaces it with the player. Only the
      // iframe's address is asserted — the test must not depend on YouTube.
      await clickButton(page!, "Video options");
      await page!.eval(
        `(() => {
          const input = document.querySelector('input[placeholder^="https://youtu.be"]');
          input.value = "youtu.be/dQw4w9WgXcQ?t=1m30s";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        })()`,
      );
      const src = await waitFor("the player", () =>
        page!.eval<string | false>(
          `document.querySelector('[data-video="player"]')?.src ?? false`,
        ),
      );
      assert(
        src === "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&start=90",
        `player src is ${src}`,
      );
    });

    await check("a window worked in through an iframe stays opaque until the user goes elsewhere", async () => {
      // Two iframe windows side by side, both local so the test needs no
      // network: the clock's options window and the video window, each given a
      // frame of its own.
      await page!.eval(`(() => {
        const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
        set("zefpdf.plugin-panel.clock", { x: 0.02, y: 0.15, w: 0.48, h: 0.6, collapsed: false });
        set("zefpdf.widget.clock", { x: 0.5, y: 1 });
        set("zefpdf.plugin.video", { open: true, source: "" });
        set("zefpdf.plugin.video.window", { x: 0.52, y: 0.15, w: 0.46, h: 0.6, collapsed: false });
      })()`);
      await page!.reload();
      await waitFor("the clock and the video window", () =>
        page!.eval<boolean>(
          `!!document.querySelector('[data-clock="time"]') && !!document.querySelector('[data-video="empty"]')`,
        ),
      );
      const clock = await page!.eval<{ x: number; y: number }>(
        `(() => {
          const r = document.querySelector('[data-clock="time"]').getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        })()`,
      );
      await page!.click(clock.x, clock.y);
      await waitFor("the clock's options window", () =>
        page!.eval<boolean>(
          `[...document.querySelectorAll("aside")].some(a => a.innerText.trim().startsWith("CLOCK"))`,
        ),
      );
      await page!.eval(`(() => {
        const frame = (id) => {
          const f = document.createElement("iframe");
          f.srcdoc = "<body>frame</body>";
          f.dataset.frame = id;
          f.style.cssText = "position: absolute; left: 0; right: 0; bottom: 0; top: 40px; width: 100%; height: calc(100% - 40px); border: 0; background: #fff";
          return f;
        };
        [...document.querySelectorAll("aside")].find(a => a.innerText.trim().startsWith("CLOCK")).append(frame("a"));
        document.querySelector('[data-video="empty"]').closest("aside").append(frame("b"));
      })()`);

      const panel = (frame: string) => `document.querySelector('${frame}').closest("aside")`;
      const FIRST = panel('[data-frame="a"]');
      const VIDEO = panel('[data-frame="b"]');
      const settle = (what: string, js: string, want: string) =>
        waitFor(what, () =>
          page!.eval<string>(js).then((got) => (got === want ? got : false)),
        ).catch(() => page!.eval<string>(js));
      const states = `[${FIRST}, ${VIDEO}].map(a => a.dataset.panelActive ? "on" : "off").join(" ")`;
      const centre = (js: string) =>
        page!.eval<{ x: number; y: number }>(
          `(() => { const r = ${js}.querySelector("iframe").getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
        );
      const a = await centre(FIRST);
      const b = await centre(VIDEO);
      const outside = await page!.eval<{ x: number; y: number }>(`({ x: Math.round(innerWidth / 2), y: innerHeight - 10 })`);

      // Into a frame: the only thing this document sees is its own blur.
      await page!.click(a.x, a.y);
      // …and the pointer then leaving the window must not fade it.
      await page!.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: outside.x, y: outside.y });
      const opacity = await settle("the first window at full opacity", `getComputedStyle(${FIRST}).opacity`, "1");
      assert(opacity === "1", `the first window faded to ${opacity}`);

      // Straight from one frame into the other: no event reaches this document.
      await page!.click(b.x, b.y);
      let got = await settle("the video window active", states, "off on");
      assert(got === "off on", `after the video frame: ${got}`);

      // Pressing on the page outside both idles both.
      await page!.click(outside.x, outside.y);
      got = await settle("both idle", states, "off off");
      assert(got === "off off", `after the page: ${got}`);

      await seedPlugin(page!, "video", { open: false, source: "" });
      await page!.reload();
    });

    console.log("\nclasses");

    /** Wait for a class database write to land, by reading it back. */
    const snapshot = () => page!.eval<Snapshot>(`fetch("/api/db").then(r => r.json())`);

    /** Type into an input found by its aria-label, firing the input event preact listens to. */
    const type = (selector: string, value: string) =>
      page!.eval(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error("no " + ${JSON.stringify(selector)});
        el.value = ${JSON.stringify(value)};
        el.dispatchEvent(new Event("input", { bubbles: true }));
      })()`);
    const submit = (selector: string) =>
      page!.eval(`document.querySelector(${JSON.stringify(selector)}).closest("form").requestSubmit()`);

    await check("the classes key opens the database tab", async () => {
      await waitFor("the app", () => page!.eval<boolean>(`!!document.querySelector("#root")?.firstChild`));
      await page!.eval(`location.hash = ""; document.activeElement?.blur()`);
      await waitFor("the library", () => page!.eval<boolean>(`document.body.innerText.includes("Library")`));
      await settled(page!);
      await page!.press("c");
      await waitFor("the classes tab", () =>
        page!.eval<boolean>(`location.hash === "#/db" && !!document.querySelector('input[aria-label="New class name"]')`),
      );
    });

    await check("a class is created and becomes the active class", async () => {
      await type('input[aria-label="New class name"]', "5A");
      await submit('input[aria-label="New class name"]');
      const snap = await waitFor("the class stored and active", async () => {
        const s = await snapshot();
        return s.classes.some((c) => c.name === "5A") && s.activeClassId !== null ? s : false;
      });
      assert(snap.classes[0]!.id === snap.activeClassId, "the new class is not the active one");
      await waitFor("the roster form", () =>
        page!.eval<boolean>(`!!document.querySelector('input[placeholder="Last name"]')`),
      );
    });

    await check("a class's colour is picked from its swatch and kept", async () => {
      await page!.eval(`(() => {
        const el = document.querySelector('[data-class-color="5A"] input[type="color"]');
        el.value = "#123456";
        el.dispatchEvent(new Event("input", { bubbles: true }));
      })()`);
      await waitFor("the colour stored", async () =>
        (await snapshot()).classes.find((c) => c.name === "5A")?.color === "#123456",
      );
      await page!.reload();
      await waitFor("the swatch after a reload", () =>
        page!.eval<boolean>(
          `document.querySelector('[data-class-color="5A"] input[type="color"]')?.value === "#123456"`,
        ),
      );
    });

    await check("students are added row by row", async () => {
      for (const [last, first] of [["Curie", "Marie"], ["Noether", "Emmy"]] as const) {
        await type('input[placeholder="Last name"]', last);
        await type('input[placeholder="First name"]', first);
        await submit('input[placeholder="Last name"]');
        await waitFor(`${last} stored`, async () => (await snapshot()).people.some((p) => p.last === last));
      }
      const text = await page!.eval<string>(`document.body.innerText`);
      assert(text.includes("Curie") && text.includes("Noether"), "the roster does not show both students");
    });

    await check("a seating link is added between two students", async () => {
      const ids = (await snapshot()).enrolments.map((e) => e.id);
      await page!.eval(`(() => {
        const pick = (label, value) => {
          const el = document.querySelector('select[aria-label="' + label + '"]');
          el.value = value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        };
        pick("First student", "${ids[1]}");
        pick("Constraint", "together");
        pick("Second student", "${ids[0]}");
      })()`);
      await submit('select[aria-label="First student"]');
      const snap = await waitFor("the link stored", async () => {
        const s = await snapshot();
        return s.links.length === 1 ? s : false;
      });
      const link = snap.links[0]!;
      assert(link.aId < link.bId && link.kind === "together", `stored ${JSON.stringify(link)}`);
      assert(
        (await page!.eval<string>(`document.body.innerText`)).includes("sit together"),
        "the link is not listed",
      );
    });

    await check("reloading on #/db reopens the classes tab", async () => {
      await page!.reload();
      await waitFor("the classes tab again", () =>
        page!.eval<boolean>(`location.hash === "#/db" && document.body.innerText.includes("Roster")`),
      );
    });

    await check("the tab bar switches class", async () => {
      await type('input[aria-label="New class name"]', "5B");
      await submit('input[aria-label="New class name"]');
      const snap = await waitFor("5B active", async () => {
        const s = await snapshot();
        const b = s.classes.find((c) => c.name === "5B");
        return b && s.activeClassId === b.id ? s : false;
      });
      const a = snap.classes.find((c) => c.name === "5A")!;
      // Back to 5A from the switcher in the tab bar.
      await page!.eval(`(() => {
        const sel = document.querySelector('select[aria-label="Class"]');
        sel.value = "${a.id}";
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      })()`);
      await waitFor("5A active", async () => (await snapshot()).activeClassId === a.id);
      // Back on the library, as the next checks expect.
      await page!.eval(`location.hash = ""`);
    });

    await check("a CSV roster imports, asking about a name already known", async () => {
      const before = await snapshot();
      const b = before.classes.find((c) => c.name === "5B")!;
      await page!.eval(`(() => {
        location.hash = "#/db";
        const sel = document.querySelector('select[aria-label="Class"]');
        sel.value = "${b.id}";
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      })()`);
      await waitFor("5B active", async () => (await snapshot()).activeClassId === b.id);
      await waitFor("5B's roster", () =>
        page!.eval<boolean>(`document.body.innerText.includes("Import CSV")`),
      );
      // Curie is already in 5A; Lovelace is new.
      const csv = "Élèves,Né(e) le,Sexe\nCURIE Marie,07/11/1867,Féminin\nLOVELACE Ada,10/12/1815,Féminin\n";
      await page!.eval(`(() => {
        const input = document.querySelector('input[type="file"]');
        const dt = new DataTransfer();
        dt.items.add(new File([${JSON.stringify(csv)}], "5B.csv", { type: "text/csv" }));
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      })()`);
      const button = (label: string) =>
        `[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === ${JSON.stringify(label)})`;
      await waitFor("the import to ask", () => page!.eval<boolean>(`!!${button("1 to decide")}`));
      await page!.eval(`${button("Link all to existing")}.click()`);
      await waitFor("the import to be ready", () => page!.eval<boolean>(`!!${button("Import 2 students")}`));
      await page!.eval(`${button("Import 2 students")}.click()`);

      const snap = await waitFor("both imported", async () => {
        const s = await snapshot();
        return s.enrolments.filter((e) => e.classId === b.id).length === 2 ? s : false;
      });
      const curies = snap.people.filter((p) => p.last === "Curie");
      assert(curies.length === 1, `${curies.length} Curies, not one linked person`);
      const classes = snap.enrolments.filter((e) => e.personId === curies[0]!.id).length;
      assert(classes === 2, `Curie sits in ${classes} classes`);
      assert(curies[0]!.birthDate === "1867-11-07", `Curie's birth date is ${curies[0]!.birthDate}`);
      await waitFor("the roster to say so", () =>
        page!.eval<boolean>(`document.body.innerText.includes("also in 5A")`),
      );
      await page!.eval(`location.hash = ""`);
    });

    await check("Enter draws a student of the active class into a pill at the top left, for a while", async () => {
      // A short stay, so the check also sees it go.
      await seedPlugin(page!, "draw", { seconds: 1 });
      await page!.reload();
      await waitFor("the library", () => page!.eval<boolean>(`document.body.innerText.includes("Library")`));
      await page!.eval(`document.activeElement?.blur()`);
      await settled(page!);
      await page!.press("Enter");
      const pill = await waitFor("the pill", () =>
        page!.eval<{ text: string; left: number; top: number } | null>(`(() => {
          const el = document.querySelector('[data-draw="pill"]');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { text: el.textContent, left: r.left, top: r.top };
        })()`),
      );
      // 5B is active since the import: Curie or Lovelace.
      assert(/Curie|Lovelace/i.test(pill.text), `drew "${pill.text}"`);
      assert(pill.left < 60 && pill.top < 60, `the pill is at ${pill.left},${pill.top}`);
      await waitFor(
        "the pill to go",
        () => page!.eval<boolean>(`!document.querySelector('[data-draw="pill"]')`),
        5_000,
      );
    });

    await check("removing a student asks: from the class, or the profile; All students lists the rest", async () => {
      const before = await snapshot();
      const b = before.classes.find((c) => c.name === "5B")!;
      await page!.eval(`location.hash = "#/db"`);
      await waitFor("5B's roster", () => page!.eval<boolean>(`document.body.innerText.includes("LOVELACE")`));
      /** The list row naming `name`, as an expression to evaluate in the page. */
      const row = (name: string) =>
        `[...document.querySelectorAll("li")].find((li) => li.innerText.includes(${JSON.stringify(name)}))`;
      const inRow = (name: string, selector: string) => `${row(name)}?.querySelector(${JSON.stringify(selector)})`;
      const buttonIn = (name: string, label: string) =>
        `[...(${row(name)}?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === ${JSON.stringify(label)})`;

      // Imported as written: LOVELACE. Out of 5B only — she stays a person, in no class.
      await page!.eval(`${inRow("LOVELACE", 'button[title="Remove…"]')}.click()`);
      await waitFor("the question", () => page!.eval<boolean>(`!!${buttonIn("LOVELACE", "From this class")}`));
      await page!.eval(`${buttonIn("LOVELACE", "From this class")}.click()`);
      let snap = await waitFor("Lovelace out of 5B", async () => {
        const s = await snapshot();
        return s.enrolments.filter((e) => e.classId === b.id).length === 1 ? s : false;
      });
      const ada = snap.people.find((p) => p.last === "LOVELACE");
      assert(ada, "removing from the class deleted the person");

      // Curie: the profile itself — out of 5A as well.
      await page!.eval(`${inRow("Curie", 'button[title="Remove…"]')}.click()`);
      await waitFor("the question", () => page!.eval<boolean>(`!!${buttonIn("Curie", "Delete profile")}`));
      await page!.eval(`${buttonIn("Curie", "Delete profile")}.click()`);
      snap = await waitFor("Curie deleted", async () => {
        const s = await snapshot();
        return s.people.some((p) => p.last === "Curie") ? false : s;
      });
      assert(snap.enrolments.every((e) => e.personId !== ada.id), "Lovelace is back in a class");

      // All students: Lovelace, in no class, can still be deleted.
      await page!.eval(`[...document.querySelectorAll("button")].find((b) => b.innerText.startsWith("All students")).click()`);
      await waitFor("everyone listed", () =>
        page!.eval<boolean>(`!!${inRow("LOVELACE", 'button[title="Delete"]')} && document.body.innerText.includes("no class")`),
      );
      await page!.eval(`window.confirm = () => true; ${inRow("LOVELACE", 'button[title="Delete"]')}.click()`);
      await waitFor("Lovelace deleted", async () => !(await snapshot()).people.some((p) => p.last === "LOVELACE"));
      await page!.eval(`location.hash = ""`);
    });

    console.log("\nplugin switches");

    await check("disabling a plugin in the options removes its button and overlay", async () => {
      await seedPlugin(page!, "clock", { visible: true });
      await page!.reload();
      await waitFor("the clock", () => page!.eval<boolean>(`!!document.querySelector('[data-clock="time"]')`));
      await clickButton(page!, "Options");
      await waitFor("the options window", () =>
        page!.eval<boolean>(`[...document.querySelectorAll("aside")].some(a => a.innerText.trim().startsWith("OPTIONS"))`),
      );
      const toggle = (label: string) =>
        page!.eval(`(() => {
          const panel = [...document.querySelectorAll("aside")].find(a => a.innerText.trim().startsWith("OPTIONS"));
          const row = [...panel.querySelectorAll("label")].find(l => l.innerText.trim() === "${label}");
          if (!row) throw new Error("no ${label} row");
          row.querySelector("input").click();
        })()`);
      await toggle("Clock");
      await waitFor("the clock and its button gone", () =>
        page!.eval<boolean>(`!document.querySelector('[data-clock="time"]') && !document.querySelector('button[title="Clock"]')`),
      );
      const stored = await waitFor("config.json updated", async () => {
        const c = (await (await get("/api/config")).json()) as { plugins: { enabled: string[] } };
        return !c.plugins.enabled.includes("clock") ? c : false;
      });
      assert(!stored.plugins.enabled.includes("clock"), "clock still enabled on the server");
      await toggle("Clock");
      await waitFor("the clock back", () =>
        page!.eval<boolean>(`!!document.querySelector('[data-clock="time"]') && !!document.querySelector('button[title="Clock"]')`),
      );
      await waitFor("config.json updated back", async () => {
        const c = (await (await get("/api/config")).json()) as { plugins: { enabled: string[] } };
        return c.plugins.enabled.includes("clock");
      });
    });


  } finally {
    if (page) {
      const failed = results.some((r) => !r.ok);
      if (failed) {
        await page.screenshot("/tmp/local-pdf-smoke-failure.png").catch(() => {});
        console.log("\nscreenshot: /tmp/local-pdf-smoke-failure.png");
      }
      page.close();
    }
    browser.close();
    server.kill();
    if (!Bun.argv.includes("--keep")) {
      await rm(WORK, { recursive: true, force: true });
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) process.exit(1);
}

await main();
