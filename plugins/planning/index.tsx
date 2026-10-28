import type { Plugin } from "@/plugins/sdk";
import { fieldToggle } from "../shared/store";
import { Icon } from "./Icon";
import { Options } from "./Options";
import { Overlay } from "./Overlay";
import { usePlanningLook } from "./store";

export default {
  id: "planning",
  name: "Planning",
  icon: Icon,
  // The toolbar button is the switch; the store stays the plugin's own.
  useToggle: fieldToggle(usePlanningLook, "visible"),
  options: Options,
  overlay: Overlay,
} satisfies Plugin;
