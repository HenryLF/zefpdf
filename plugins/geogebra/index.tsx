import type { Plugin } from "@/plugins/sdk";
import { fieldToggle } from "../shared/store";
import { Icon } from "./Icon";
import { claimsLink } from "./links";
import { Options } from "./Options";
import { Overlay } from "./Overlay";
import { useGeogebra } from "./store";

export default {
  id: "geogebra",
  name: "GeoGebra",
  icon: Icon,
  /**
   * The button puts the calculator on screen — empty, since a file is
   * something you go and choose, behind the ⚙ in the calculator's title bar.
   */
  useToggle: fieldToggle(useGeogebra, "open"),
  /**
   * A material or a `.ggb` link opens in the calculator, as Load would: the
   * folder's file is cleared because it would outrank the link, and the fresh
   * applet replaces a construction in progress — the click asked for that.
   */
  openLink(url) {
    if (!claimsLink(url)) return false;
    useGeogebra.setState({ file: "", source: url.href });
    useGeogebra.getState().load();
    return true;
  },
  options: Options,
  overlay: Overlay,
} satisfies Plugin;
