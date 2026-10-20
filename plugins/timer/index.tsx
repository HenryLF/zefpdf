import type { Plugin } from "@/plugins/sdk";
import { fieldToggle } from "../shared/store";
import { Icon } from "./Icon";
import { Options } from "./Options";
import { Overlay } from "./Overlay";
import { useTimer } from "./store";

export default {
  id: "timer",
  name: "Timer",
  icon: Icon,
  // The toolbar button is the switch; the store stays the plugin's own.
  useToggle: fieldToggle(useTimer, "visible"),
  options: Options,
  overlay: Overlay,
} satisfies Plugin;
