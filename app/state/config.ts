import { create } from "zustand";
import { DEFAULT_CONFIG, type Config } from "@shared/config";
import { api } from "@/api";
import { errorMessage } from "@/lib/error";

/** Edits within this window go to the server as one PUT. */
const SAVE_DELAY_MS = 300;

interface ConfigStore {
  config: Config;
  status: "idle" | "saving" | "error";
  error: string | null;
  /** Replace wholesale, as loaded at boot or answered by the server. */
  replace(config: Config): void;
  /** Change one field, optimistically; saved to config.json shortly after. */
  set<S extends keyof Config, K extends keyof Config[S]>(section: S, key: K, value: Config[S][K]): void;
  /** Reader preferences and key bindings back to their defaults. */
  reset(): void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * config.json as the app sees it. The server owns the file and validates every
 * write; the browser edits a copy and sends it, then takes the server's answer
 * as the truth — unless more edits arrived in the meantime, which another save
 * is already on its way for.
 */
export const useConfig = create<ConfigStore>()((set, get) => {
  function scheduleSave() {
    if (timer) clearTimeout(timer);
    set({ status: "saving", error: null });
    timer = setTimeout(async () => {
      timer = null;
      try {
        const saved = await api.config.put(get().config);
        if (!timer) set({ config: saved, status: "idle" });
      } catch (e) {
        set({ status: "error", error: errorMessage(e) });
      }
    }, SAVE_DELAY_MS);
  }

  return {
    config: DEFAULT_CONFIG,
    status: "idle",
    error: null,

    replace(config) {
      set({ config, status: "idle", error: null });
    },

    set(section, key, value) {
      set((s) => ({
        config: { ...s.config, [section]: { ...s.config[section], [key]: value } },
      }));
      scheduleSave();
    },

    reset() {
      set((s) => ({
        config: { ...s.config, reader: { ...DEFAULT_CONFIG.reader }, keys: { ...DEFAULT_CONFIG.keys } },
      }));
      scheduleSave();
    },
  };
});

/** The reader preferences, the section most of the app reads. */
export function useReaderConfig<K extends keyof Config["reader"]>(key: K): Config["reader"][K] {
  return useConfig((s) => s.config.reader[key]);
}
