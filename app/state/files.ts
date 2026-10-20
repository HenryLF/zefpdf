import { create } from "zustand";
import { isPdf, type FileEntry } from "@shared/api";
import { api } from "@/api";
import { errorMessage } from "@/lib/error";

interface FilesStore {
  /** every file under the root, from /api/files */
  files: FileEntry[];
  /** the PDFs among them — kept as state, so selecting it never builds a new array */
  pdfs: FileEntry[];
  status: "idle" | "loading" | "error";
  error: string | null;
  refresh(): Promise<void>;
}

/**
 * The files of the served folder. Plugins read the same list and filter their
 * own type (geogebra keeps the `.ggb` ones).
 */
export const useFiles = create<FilesStore>()((set) => ({
  files: [],
  pdfs: [],
  status: "idle",
  error: null,

  async refresh() {
    set({ status: "loading", error: null });
    try {
      const files = await api.files();
      set({ files, pdfs: files.filter(isPdf), status: "idle" });
    } catch (e) {
      set({ status: "error", error: errorMessage(e) });
    }
  },
}));
