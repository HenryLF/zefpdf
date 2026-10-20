// Everything a plugin may import from the app. Plugins import from here and
// from their own folder (and plugins/shared), nothing else — so the app can
// move its internals around without breaking them.

export type { Plugin } from "./types";

// ui
export { Button } from "@/ui/atoms/Button";
export { Checkbox } from "@/ui/atoms/Checkbox";
export { ColorInput } from "@/ui/atoms/ColorInput";
export { IconButton } from "@/ui/atoms/IconButton";
export { MicroTitle } from "@/ui/atoms/MicroTitle";
export { Notice } from "@/ui/atoms/Notice";
export { Pill } from "@/ui/atoms/Pill";
export { RangeInput } from "@/ui/atoms/RangeInput";
export { RoundButton } from "@/ui/atoms/RoundButton";
export { Select } from "@/ui/atoms/Select";
export { TextInput } from "@/ui/atoms/TextInput";
export { FloatingPanel, type PanelState } from "@/ui/molecules/FloatingPanel";
export { Widget, type WidgetPosition } from "@/ui/molecules/Widget";
export { AppearanceOptions } from "@/ui/molecules/AppearanceOptions";
export {
  CheckOption,
  ColorOption,
  OptionHint,
  SelectOption,
  SliderOption,
} from "@/ui/molecules/OptionRow";

// hooks and helpers
export { useEventListener } from "@/hooks/useEventListener";
export { useInterval } from "@/hooks/useInterval";
export { useTimeout } from "@/hooks/useTimeout";
export { isTypingTarget, keyLabel, matches } from "@/lib/keys";
export { cx } from "@/lib/cx";
export { clamp } from "@/lib/math";
export { randomItem } from "@/lib/random";
export { errorMessage } from "@/lib/error";
export { persistShape, readJson, writeJson } from "@/lib/storage";
export { appearanceVars } from "@/lib/appearance";
export {
  APPEARANCE_DEFAULTS,
  APPEARANCE_LIMITS,
  mergeAppearance,
  type Appearance,
} from "@shared/appearance";

// app state
export { useView, rotationOf, effectiveRatio } from "@/state/view";
export { useUi } from "@/state/ui";
export { useTabs, useActiveTab, useActivePath } from "@/state/tabs";
export { useFiles } from "@/state/files";
export {
  useClasses,
  useActiveClass,
  useStudents,
  useLinks,
  studentName,
} from "@/state/db";
export { pluginStore, type PluginStore } from "@/state/pluginData";

// server services
export { fileUrl, proxyUrl, pluginStaticUrl } from "@/api";
export type { FileEntry, Class, Student, Gender, StudentLink } from "@shared/api";
