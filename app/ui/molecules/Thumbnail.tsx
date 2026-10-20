import { useEffect, useRef, useState } from "preact/hooks";
import { useInView } from "@/hooks/useInView";
import { cachedThumbnail, thumbnail } from "@/lib/thumbnails";
import { cx } from "@/lib/cx";
import { Skeleton } from "@/ui/atoms/Skeleton";
import s from "./Thumbnail.module.css";

type Status = "pending" | "done" | "error";

/**
 * First page of a PDF, rendered once the card scrolls into view and kept as an
 * image (`lib/thumbnails.ts`), so a card coming back after a tab switch paints
 * straight away instead of parsing the file again.
 */
export function Thumbnail({ path }: { path: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState(() => cachedThumbnail(path));
  const [status, setStatus] = useState<Status>(url ? "done" : "pending");

  // The grid scrolls with the page, so the root stays the viewport.
  const visible = useInView(holder, { rootMargin: "300px", once: true });

  useEffect(() => {
    if (!visible || url) return;
    let cancelled = false;
    thumbnail(path).then(
      (u) => {
        if (!cancelled) setUrl(u);
      },
      () => {
        if (!cancelled) setStatus("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path, visible, url]);

  return (
    <div class={s.thumb} ref={holder}>
      {status === "error" ? (
        <div class={s.error}>Can’t preview</div>
      ) : (
        <>
          {status === "pending" && <Skeleton class={s.skeleton} />}
          {url && (
            <img
              src={url}
              alt=""
              class={cx(s.image, status !== "done" && s.pending)}
              onLoad={() => setStatus("done")}
              onError={() => setStatus("error")}
            />
          )}
        </>
      )}
    </div>
  );
}
