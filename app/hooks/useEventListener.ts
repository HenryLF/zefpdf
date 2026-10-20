import { useEffect, useRef } from "preact/hooks";

type Target = Window | Document | HTMLElement | null | undefined;

/**
 * Subscribe for the life of the component.
 *
 * The handler is held in a ref and read at dispatch time, so it always sees
 * fresh props and state without the listener being torn down and re-attached
 * on every render. That is what keeps callers from needing a dep array listing
 * everything the handler happens to touch.
 */
export function useEventListener<K extends keyof WindowEventMap>(
  type: K,
  handler: (e: WindowEventMap[K]) => void,
  target: Target = window,
  options?: AddEventListenerOptions,
) {
  const saved = useRef(handler);
  saved.current = handler;

  // Options are read once, on attach; spreading them into the dep list keeps a
  // caller passing an object literal from re-subscribing on every render.
  const capture = options?.capture ?? false;
  const passive = options?.passive;

  useEffect(() => {
    if (!target) return;
    const listener = (e: Event) => saved.current(e as WindowEventMap[K]);
    target.addEventListener(type, listener, { capture, passive });
    return () => target.removeEventListener(type, listener, { capture });
  }, [type, target, capture, passive]);
}
