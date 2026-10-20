import { useEffect, useRef } from "preact/hooks";

/**
 * Run `fn` once, `ms` after `deps` last changed.
 *
 * The timer is cleared on every change and on unmount, which is what makes this
 * a debounce as much as a delay: a value that keeps changing keeps pushing the
 * call back. Pass `ms: null` to disarm it entirely.
 *
 * The callback is held in a ref, so it always sees current state without the
 * caller listing everything it touches in `deps`.
 */
export function useTimeout(
  fn: () => void,
  ms: number | null,
  deps: readonly unknown[],
) {
  const saved = useRef(fn);
  saved.current = fn;

  useEffect(() => {
    if (ms === null) return;
    const t = setTimeout(() => saved.current(), ms);
    return () => clearTimeout(t);
    // The caller's deps are the trigger; `fn` deliberately is not one.
  }, [ms, ...deps]);
}
