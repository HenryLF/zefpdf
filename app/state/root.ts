import { create } from "zustand";
import { api } from "@/api";
import { useConfig } from "./config";
import { useFiles } from "./files";
import { useTabs } from "./tabs";

interface RootStore {
  /** the folder being served, absolute */
  path: string;
  setPath(path: string): void;
  /** Serve another folder: everything that came from the old one is reloaded. */
  change(path: string): Promise<void>;
}

export const useRoot = create<RootStore>()((set) => ({
  path: "",
  setPath: (path) => set({ path }),
  async change(path) {
    const info = await api.root.set(path);
    set({ path: info.path });
    // Another folder: its files. The class database and plugin data stay.
    useTabs.getState().resetTabs();
    await Promise.all([
      useFiles.getState().refresh(),
      api.config.get().then((c) => useConfig.getState().replace(c)),
    ]);
  },
}));
