import type { Plugin } from "@/plugins/sdk";
import { fieldToggle } from "../shared/store";
import { Icon } from "./Icon";
import { Options } from "./Options";
import { Overlay } from "./Overlay";
import { usePlacement } from "./store";

export default {
  id: "placement",
  name: "Seating plan",
  icon: Icon,
  /**
   * The button puts the seating plan on screen; classrooms, constraints and
   * the names' size are behind the ⚙ in its title bar.
   */
  useToggle: fieldToggle(usePlacement, "open"),
  options: Options,
  overlay: Overlay,
} satisfies Plugin;
