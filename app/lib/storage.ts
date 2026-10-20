// localStorage is a nice-to-have here: private windows and blocked site data
// both make it throw. Every access is wrapped, and a failure only costs the
// user their remembered state, never the feature itself.

/**
 * Stored JSON merged over `fallback`, which also stands in when it is absent.
 *
 * Always a fresh object, never `fallback` itself — callers clamp and adjust the
 * result in place, and handing back the caller's defaults object would let that
 * write through to it.
 *
 * The merge is one level deep, which is why persisted shapes here are flat.
 */
export function readJson<T extends object>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...fallback };
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return { ...fallback };
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked — it just won't be remembered */
  }
}

/** The fields of `shape`, read off `state` as it currently stands. */
function pickShape<T extends object>(state: unknown, shape: T): T {
  const src = state as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(shape)) out[k] = src[k];
  return out as T;
}

interface StoreLike<S> {
  subscribe(listener: (state: S) => void): () => void;
}

/**
 * Write a store's data back to `key` on every change.
 *
 * The fields to persist are taken from `shape` — in practice the store's
 * defaults — so adding a setting is a one-line change and the store's own
 * methods are left out without being listed.
 */
export function persistShape<S, T extends object>(
  store: StoreLike<S>,
  key: string,
  shape: T,
) {
  store.subscribe((s) => writeJson(key, pickShape(s, shape)));
}
