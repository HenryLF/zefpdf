/** A YouTube video, as much of one as the embed needs. */
interface VideoRef {
  id: string;
  /** seconds into the video, from a link's `t` or `start`; 0 for the beginning */
  start: number;
}

/** Every YouTube id is eleven characters of this alphabet. */
const ID = /^[\w-]{11}$/;

/** Path prefixes that carry the id as their next segment. */
const ID_PATHS = new Set(["embed", "shorts", "live", "v"]);

/** "90", "90s" or "1h2m3s" — the shapes a shared link's `t` comes in. */
function seconds(raw: string | null) {
  if (!raw) return 0;
  if (/^\d+s?$/.test(raw)) return parseInt(raw, 10);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  if (!m) return 0;
  return (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0));
}

/**
 * A bare video id, or any link YouTube hands out: `watch?v=`, `youtu.be/`,
 * `/embed/`, `/shorts/`, `/live/`, with or without the scheme or `www.`/`m.`.
 * Null for anything else — including a playlist or channel link, which has no
 * single video to play.
 */
export function parseVideo(input: string): VideoRef | null {
  const text = input.trim();
  if (ID.test(text)) return { id: text, start: 0 };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^(www|m|music)\./, "");
  const [first, second] = url.pathname.split("/").filter(Boolean);
  let id: string | null | undefined = null;

  if (host === "youtu.be") id = first;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = first === "watch" ? url.searchParams.get("v") : ID_PATHS.has(first ?? "") ? second : null;
  }

  if (!id || !ID.test(id)) return null;
  return {
    id,
    start: seconds(url.searchParams.get("t") ?? url.searchParams.get("start")),
  };
}

/**
 * The player's address. `youtube-nocookie.com` is YouTube's own privacy-enhanced
 * host: nothing is stored in the browser until the video is played. `rel=0`
 * keeps the suggestions at the end to the same channel.
 */
export function embedUrl({ id, start }: VideoRef) {
  const q = new URLSearchParams({ rel: "0" });
  if (start > 0) q.set("start", String(start));
  return `https://www.youtube-nocookie.com/embed/${id}?${q}`;
}
