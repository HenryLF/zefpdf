import { useUi } from "@/state/ui";
import { RoundButton } from "@/ui/atoms/RoundButton";

/** The way in to the app's own options window. Placed by the Toolbar. */
export function OptionsButton() {
  const showSettings = useUi((s) => s.showSettings);
  const setShowSettings = useUi((s) => s.setShowSettings);

  return (
    <RoundButton
      title="Options"
      aria-pressed={showSettings}
      onClick={() => setShowSettings(!showSettings)}
    >
      ⚙
    </RoundButton>
  );
}
