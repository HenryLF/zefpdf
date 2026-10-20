import { useActivePath, useView, type Plugin } from "@/plugins/sdk";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";

export default {
  id: "rotate",
  name: "Rotate",
  icon: Icon,
  /**
   * No options window: there is nothing to configure, only something to do.
   * The toolbar button is the action, and does exactly what the key does.
   */
  useAction: () => {
    const page = useView((s) => s.page);
    const rotate = useView((s) => s.rotate);
    const path = useActivePath();
    return { run: () => rotate(page), enabled: !!path };
  },
  overlay: Overlay,
} satisfies Plugin;
