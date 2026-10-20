/**
 * What the geogebra plugin accepts as a source, as plain functions: the options
 * field, the overlay and a clicked link all read a source the same way, and the
 * smoke test checks these without a browser.
 */

/** A geogebra.org link to a material, in either shape the site hands out. */
const MATERIAL_LINK =
  /geogebra\.org\/(?:m|material\/(?:iframe|show)\/(?:material_)?id)[/=]([\w-]+)/;

/** A bare material id, as geogebra.org shows it. */
const MATERIAL_ID = /^[\w-]+$/;

/** A source, read: a material the applet loads itself, or a file fetched by URL. */
type Source = { materialId: string } | { url: string };

/**
 * Read what was typed into the one source field: a geogebra.org material link
 * (turned back into its id), any other `http(s)` link (a `.ggb` to fetch), or a
 * bare material id. Null when it is empty or none of those.
 */
export function parseSource(input: string): Source | null {
  const text = input.trim();
  if (!text) return null;
  const id = MATERIAL_LINK.exec(text)?.[1];
  if (id) return { materialId: id };
  if (/^https?:\/\//i.test(text)) return { url: text };
  if (MATERIAL_ID.test(text)) return { materialId: text };
  return null;
}

/**
 * Is a clicked link one for the calculator: a geogebra.org material, or a
 * `.ggb` over `http(s)` — the only schemes `/api/proxy` will fetch.
 */
export function claimsLink(url: URL): boolean {
  if (MATERIAL_LINK.test(url.href)) return true;
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    url.pathname.toLowerCase().endsWith(".ggb")
  );
}
