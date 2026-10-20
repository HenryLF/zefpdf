import type { Plugin } from "@/plugins/sdk";
import { fieldToggle } from "../shared/store";
import { Icon } from "./Icon";
import { Options } from "./Options";
import { Overlay } from "./Overlay";
import { useVideo } from "./store";
import { parseVideo } from "./youtube";

export default {
  id: "video",
  name: "Video",
  icon: Icon,
  /**
   * The button puts the video window on screen; which video, and how the
   * window looks, are behind the ⚙ in its title bar — as with GeoGebra.
   */
  useToggle: fieldToggle(useVideo, "open"),
  /** A YouTube video link plays in the window; the link is kept as written. */
  openLink(url) {
    if (!parseVideo(url.href)) return false;
    useVideo.setState({ source: url.href, open: true });
    return true;
  },
  options: Options,
  overlay: Overlay,
} satisfies Plugin;
