import { create } from "zustand";
import { persistShape, APPEARANCE_DEFAULTS, type Appearance } from "@/plugins/sdk";
import {
  appearanceSetter,
  fieldSetter,
  hydrate,
  type WithAppearance,
} from "../shared/store";

const KEY = "zefpdf.plugin.video";

interface Persisted extends WithAppearance {
  /** is the video window on screen — the toolbar button switches this */
  open: boolean;
  /**
   * What the user typed: a video id or a YouTube link, kept as written. The
   * video is derived from it on render, so the field shows exactly what was
   * pasted rather than a normalised id the user never typed.
   */
  source: string;
}

const DEFAULTS: Persisted = {
  open: false,
  source: "",
  appearance: { ...APPEARANCE_DEFAULTS },
};

interface VideoStore extends Persisted {
  set<K extends keyof Persisted>(key: K, value: Persisted[K]): void;
  setAppearance(patch: Partial<Appearance>): void;
}

export const useVideo = create<VideoStore>()((set) => ({
  ...hydrate(KEY, DEFAULTS),

  set: fieldSetter<Persisted>(set),
  setAppearance: appearanceSetter<Persisted>(set),
}));

persistShape(useVideo, KEY, DEFAULTS);
