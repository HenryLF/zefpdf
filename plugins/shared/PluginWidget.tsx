import type { ComponentChildren } from "preact";
import { Widget, type WidgetPosition, useUi } from "@/plugins/sdk";

interface Props {
  /** the plugin's id — its storage key and its options window both follow */
  id: string;
  /**
   * where it first appears, as fractions of the free room (see
   * `WidgetPosition`); after that the user's own position is what counts
   */
  defaults: WidgetPosition;
  children: ComponentChildren;
}

/**
 * A plugin's overlay parked on the page: the clock, the timer, the calendar.
 *
 * `Widget` itself knows nothing about plugins — it takes a storage key and a
 * callback. This is the convention laid over it: the key is
 * `zefpdf.widget.<id>`, and clicking without dragging opens that plugin's
 * own options, which is where a widget's settings are reached from since it has
 * no title bar to hang a ⚙ on.
 */
export function PluginWidget({ id, defaults, children }: Props) {
  const openOptions = useUi((s) => s.openPluginOptions);

  return (
    <Widget
      storageKey={`zefpdf.widget.${id}`}
      defaults={defaults}
      title="Drag to move — click for options"
      onActivate={() => openOptions(id)}
    >
      {children}
    </Widget>
  );
}
