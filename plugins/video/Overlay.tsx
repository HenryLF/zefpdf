import { useUi, IconButton, FloatingPanel, cx, appearanceVars } from "@/plugins/sdk";
import { useVideo } from "./store";
import { embedUrl, parseVideo } from "./youtube";
import s from "./Overlay.module.css";

export function Overlay() {
  const open = useVideo((s) => s.open);
  const source = useVideo((s) => s.source);
  const appearance = useVideo((s) => s.appearance);
  const set = useVideo((s) => s.set);
  const openOptions = useUi((s) => s.openPluginOptions);

  if (!open) return null;

  const video = parseVideo(source);

  return (
    <FloatingPanel
      storageKey="zefpdf.plugin.video.window"
      title="Video"
      defaults={{ x: 0.1, y: 0.1, w: 0.4, h: 0.45, collapsed: false }}
      // The panel's own background would sit under the card and make the
      // Appearance's background opacity do nothing; the card draws it instead.
      style={{ background: "transparent" }}
      actions={
        <IconButton title="Video options" onClick={() => openOptions("video")}>
          ⚙
        </IconButton>
      }
      onClose={() => set("open", false)}
    >
      <div class={cx(s.card, video && s.playing)} style={appearanceVars(appearance)}>
        {video ? (
          <iframe
            class={s.player}
            data-video="player"
            src={embedUrl(video)}
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            // YouTube refuses to play an embed that sends no referrer.
            referrerpolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <p class={s.empty} data-video="empty">
            {source.trim() === ""
              ? "No video yet — choose one with ⚙."
              : "That is not a YouTube video link or ID — fix it with ⚙."}
          </p>
        )}
      </div>
    </FloatingPanel>
  );
}
