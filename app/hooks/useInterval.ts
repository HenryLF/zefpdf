import { useEffect, useRef } from "preact/hooks";

/**
 * Run `fn` every `ms` for as long as `deps` hold, and stop on unmount.
 *
 * The sibling of `useTimeout`: same ref'd callback, so the tick always sees
 * current state without the caller listing everything it touches in `deps`, and
 * the same `ms: null` to disarm — which is how a hidden clock stops ticking
 * rather than rendering into nothing.
 */
export function useInterval(
  fn: () => void,
  ms: number | null,
  deps: readonly unknown[],
) {
  const saved = useRef(fn);
  saved.current = fn;

  useEffect(() => {
    if (ms === null) return;
    const t = setInterval(() => saved.current(), ms);
    return () => clearInterval(t);
    // The caller's deps re-arm the interval; `fn` deliberately is not one.
  }, [ms, ...deps]);
}
