import { OptionsButton } from "./OptionsButton";
import { PluginBar, PluginOptions } from "./PluginBar";
import s from "./Toolbar.module.css";

/** Everything that sits quietly in the bottom-left corner. */
export function Toolbar() {
  return (
    <>
      <div class={s.toolbar}>
        <OptionsButton />
        <PluginBar />
      </div>

      {/* Outside the toolbar, which is a stacking context of its own — a window
          in there could never come out in front of another. */}
      <PluginOptions />
    </>
  );
}
