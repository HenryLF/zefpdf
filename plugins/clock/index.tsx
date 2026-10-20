import type { Plugin } from "@/plugins/sdk";
import { fieldToggle } from "../shared/store";
import { Icon } from "./Icon";
import { Options } from "./Options";
import { Overlay } from "./Overlay";
import { useClock } from "./store";

export default {
  id: "clock",
  name: "Clock",
  icon: Icon,
  // The toolbar button is the switch; the store stays the plugin's own.
  useToggle: fieldToggle(useClock, "visible"),
  options: Options,
  overlay: Overlay,
} satisfies Plugin;
