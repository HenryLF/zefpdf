import { mergeAppearance, readJson, type Appearance } from "@/plugins/sdk";

/** The persisted shape of a plugin that draws an overlay of its own. */
export interface WithAppearance {
  appearance: Appearance;
}

/**
 * Stored state merged over `defaults`, one level deeper than `readJson` goes.
 *
 * `readJson` merges a single level, and `appearance` is a nested object, so
 * without this an `Appearance` stored
 * before a field existed would come back missing it. The numbers are clamped
 * for the same reason `mergeConfig` clamps the reader's: a hand-edited or stale
 * value must not be able to make an overlay invisible or fill the screen.
 */
export function hydrate<T extends WithAppearance>(key: string, defaults: T): T {
  const stored = readJson(key, defaults);
  return { ...stored, appearance: mergeAppearance(stored.appearance, defaults.appearance) };
}

/**
 * The `set(key, value)` action every plugin store writes out by hand.
 *
 * A store's persisted fields are a plain record, and one setter over all of
 * them beats a named action per field — the options rows already say which
 * field they edit. Typed against `P`, so `set("visible", 3)` is still an error.
 */
export function fieldSetter<P extends object>(set: (patch: Partial<P>) => void) {
  return <K extends keyof P>(key: K, value: P[K]) => {
    // Built rather than spread from a computed key: an object literal with one
    // is typed `{ [x: string]: … }`, which no longer relates to `Partial<P>`.
    const patch: Partial<P> = {};
    patch[key] = value;
    set(patch);
  };
}

/** The `setAppearance(patch)` action, a merge so a row may send one field. */
export function appearanceSetter<P extends WithAppearance>(
  set: (updater: (state: P) => Partial<P>) => void,
) {
  return (patch: Partial<Appearance>) => {
    set((s) => ({ appearance: { ...s.appearance, ...patch } }) as Partial<P>);
  };
}

/** A zustand hook, as much of it as the helpers below need. */
type StoreHook<S> = <T>(selector: (state: S) => T) => T;

/**
 * The `useToggle` of a plugin switched on and off by one boolean field of its
 * own store — `clock`, `timer`, `planning` and `geogebra` are all this.
 *
 * It stays a hook rather than a value so the switch reads the plugin's own
 * persisted store and core keeps no second copy of the flag.
 */
export function fieldToggle<
  K extends string,
  S extends Record<K, boolean> & { set(key: K, value: boolean): void },
>(useStore: StoreHook<S>, key: K) {
  return () => {
    const on = useStore((s) => s[key]);
    const set = useStore((s) => s.set);
    return { on, setOn: (v: boolean) => set(key, v) };
  };
}
