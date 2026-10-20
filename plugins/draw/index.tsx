import type { Plugin } from "@/plugins/sdk";
import { Icon } from "./Icon";
import { Options } from "./Options";
import { Overlay } from "./Overlay";

export default {
  id: "draw",
  name: "Random student",
  icon: Icon,
  // The draw itself is the key; the toolbar button opens the options window,
  // where the pill's look is set and a draw can be tried.
  options: Options,
  overlay: Overlay,
} satisfies Plugin;
