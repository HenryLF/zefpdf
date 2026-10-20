import { AppearanceOptions } from "@/plugins/sdk";
import { SourceOptions } from "../shared/SourceOptions";
import { useVideo } from "./store";
import { parseVideo } from "./youtube";

const clockTime = (t: number) =>
  `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;

export function Options() {
  const source = useVideo((s) => s.source);
  const appearance = useVideo((s) => s.appearance);
  const set = useVideo((s) => s.set);
  const setAppearance = useVideo((s) => s.setAppearance);

  const video = parseVideo(source);

  return (
    <>
      <SourceOptions
        label="YouTube link or video ID"
        value={source}
        placeholder="https://youtu.be/… or dQw4w9WgXcQ"
        onInput={(v) => set("source", v)}
        hint={
          source.trim() === ""
            ? "Paste a YouTube link or an 11-character video ID. A link's start time is kept."
            : video
              ? `Video ${video.id}${video.start ? `, starting at ${clockTime(video.start)}` : ""}.`
              : "Not a YouTube video link or ID — a playlist or channel link has no single video to play."
        }
        action="Open in the video window"
        onAction={() => set("open", true)}
      />

      {/* The player inside is YouTube's and cannot be restyled; the text and
          background here are the window's own, around it. */}
      <AppearanceOptions value={appearance} onChange={setAppearance} />
    </>
  );
}
