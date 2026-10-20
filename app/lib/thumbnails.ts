import { renderPage, withLimit, withTransientDocument } from "./pdf";

/**
 * Rendered first pages, kept as encoded images.
 *
 * A library card used to hold a live `<canvas>`: at the 400px top of the
 * `cardWidth` setting on a 2× screen that is around a megabyte of backing store
 * each, never reclaimed while the element is mounted — and behind it a fully
 * parsed document, for the life of the page. An encoded JPEG is a fraction of
 * that, and an `<img>` hands the decoded bitmap to the browser, which is free to
 * evict it while the image is off screen. So what a big library costs stops
 * scaling with how far it has been scrolled.
 *
 * Memory only, and deliberately: nothing here goes to disk, so there is no
 * stale cache to invalidate when a file changes and no `mtime` on the wire.
 */

/**
 * One render size for every card, scaled by CSS afterwards, so the key is just
 * the path — a `cardWidth` of 120 and one of 400 must not each get an entry.
 * Slightly above the 400px top of that setting, which is as large as a card can
 * be asked to be.
 */
const RENDER_WIDTH = 480;

/**
 * Rendered at a fixed ratio rather than the screen's, so a cached image is the
 * same size whatever monitor happened to fill it.
 */
const RENDER_DPR = 1;

/** A preview, not a page: below this the text starts to shimmer. */
const QUALITY = 0.7;

/**
 * A folder can hold thousands of PDFs. This cache exists to survive a tab
 * switch, not to hold the whole library — tens of kilobytes each, so the cap is
 * the difference between a few megabytes and an unbounded map.
 */
const MAX_ENTRIES = 240;

/**
 * What is stored is the *promise*, not the string: the Library unmounts
 * whenever a reader tab is shown, so a card can ask again while its first
 * render is still in flight, and both asks must wait on the single parse.
 */
const cache = new Map<string, Promise<string>>();

/** The settled ones, so a card coming back can paint without a frame of skeleton. */
const ready = new Map<string, string>();

async function render(path: string) {
  return withTransientDocument(path, async (doc) => {
    const page = await doc.getPage(1);

    // Deliberately not in the document: this canvas exists only to be encoded.
    const canvas = document.createElement("canvas");
    try {
      const { task } = renderPage(page, canvas, RENDER_WIDTH, 0, RENDER_DPR);
      await task.promise;
      return canvas.toDataURL("image/jpeg", QUALITY);
    } finally {
      // Give the backing store back now rather than waiting for the canvas to
      // be collected — failed or not: four of these run at once.
      canvas.width = canvas.height = 0;
    }
  });
}

/**
 * Move `path` to the back of both maps. A Map iterates in insertion order, so
 * re-inserting on every use makes the front the least recently *used* entry —
 * a card still being looked at is never the one evicted.
 */
function touch(path: string) {
  const pending = cache.get(path);
  if (!pending) return;
  cache.delete(path);
  cache.set(path, pending);
  const url = ready.get(path);
  if (url === undefined) return;
  ready.delete(path);
  ready.set(path, url);
}

function evictOldest(keep: string) {
  if (cache.size <= MAX_ENTRIES) return;
  // Least recently used first: see `touch`.
  for (const key of cache.keys()) {
    if (key === keep) continue;
    cache.delete(key);
    ready.delete(key);
    return;
  }
}

/** The thumbnail for `path` if it has already been rendered, for a first paint. */
export function cachedThumbnail(path: string) {
  touch(path);
  return ready.get(path);
}

/**
 * Page 1 of `path`, parsed once and then thrown away.
 *
 * The grid used to hold a parsed document *and* a full-resolution canvas per
 * card, both for the life of the page, purely to show a preview. This keeps the
 * picture and lets go of everything that drew it.
 */
export function thumbnail(path: string): Promise<string> {
  const hit = cache.get(path);
  if (hit) {
    touch(path);
    return hit;
  }

  // Through the shared limit, so the whole parse — not just the render — is
  // what a big folder is throttled on: at most four documents exist at once.
  const pending = withLimit(() => render(path));
  cache.set(path, pending);

  // Both guarded on this still being the entry in hand, so `ready` stays a
  // subset of `cache`: a render that was evicted while still in flight must not
  // reappear in one map having been dropped from the other.
  pending.then(
    (url) => {
      if (cache.get(path) === pending) ready.set(path, url);
    },
    // A failure is not remembered as one; re-visiting the folder retries.
    () => {
      if (cache.get(path) === pending) cache.delete(path);
    },
  );

  evictOldest(path);
  return pending;
}
