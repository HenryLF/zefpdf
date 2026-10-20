import type { RefObject } from "preact";
import { useEffect, useState } from "preact/hooks";

interface Options {
  /**
   * Scroll container, or `"parent"` for the element's own parent, resolved
   * after the ref is attached. Omit for the viewport.
   *
   * This matters: `rootMargin` only expands the root's own box, so an element
   * that scrolls inside a container must name that container or the container
   * clips the margin away and nothing pre-renders. An element that scrolls with
   * the page must NOT, or the margin is measured against the wrong box.
   */
  root?: HTMLElement | "parent" | null;
  rootMargin?: string;
  /**
   * Latch on the first sighting and stop observing. Thumbnails do this — once
   * rendered they stay rendered. Reader pages do not: they drop their canvas
   * again on the way out, so they need every crossing.
   */
  once?: boolean;
}

/** Whether `ref` is inside the root's expanded box. */
export function useInView(
  ref: RefObject<HTMLElement | null>,
  { root, rootMargin, once = false }: Options = {},
) {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (once) {
          if (hit) {
            setInView(true);
            io.disconnect();
          }
          return;
        }
        setInView(hit);
      },
      { root: root === "parent" ? el.parentElement : root, rootMargin },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [ref, root, rootMargin, once]);

  return inView;
}
