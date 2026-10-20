import type { Plugin } from "@/plugins/sdk";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";
import { useZoom } from "./store";

/**
 * No options window: the panel *is* the tool. Its button switches it on, which
 * also turns pan mode on — see `Overlay`.
 */
export default {
  id: "zoom",
  name: "Zoom",
  icon: Icon,
  useToggle: () => {
    const on = useZoom((s) => s.on);
    const setOn = useZoom((s) => s.setOn);
    return { on, setOn };
  },
  overlay: Overlay,
} satisfies Plugin;
