import { create } from "zustand";

/**
 * Exactly three kinds of tab: the library (permanent), a PDF in the reader,
 * and the classes dashboard (one tab, reused). Plugins never open tabs.
 */
export type Tab =
  | { id: number; kind: "library" }
  | {
      id: number;
      kind: "file";
      path: string;
      /** reading position, so switching tabs and coming back keeps your place */
      scrollTop: number;
    }
  | { id: number; kind: "database" };

interface TabsStore {
  tabs: Tab[];
  activeId: number;
  /** Open a PDF in its own tab, or go to the tab already showing it. */
  openFile(path: string): void;
  /** Open the classes dashboard, or go to it. */
  openDatabase(): void;
  /** Close the active tab (Escape while reading). */
  close(): void;
  closeTab(id: number): void;
  selectTab(id: number): void;
  cycleTab(step?: number): void;
  setScroll(id: number, top: number): void;
  /** Back to the library alone — the root changed, so no open file is valid any more. */
  resetTabs(): void;
}

/** The library tab is always present and can never be closed. */
export const LIBRARY_TAB = 0;
const LIBRARY: Tab = { id: LIBRARY_TAB, kind: "library" };

let nextId = 1;

/** What a hash asks for: `#`, `#/f/<path>`, `#/db`. */
type Route = { kind: "library" } | { kind: "file"; path: string } | { kind: "database" };

function parseHash(hash = location.hash): Route {
  const h = hash.replace(/^#/, "");
  if (h === "/db") return { kind: "database" };
  if (h.startsWith("/f/")) {
    try {
      const path = h.slice(3).split("/").map(decodeURIComponent).join("/");
      if (path) return { kind: "file", path };
    } catch {
      /* a malformed hash reads as the library */
    }
  }
  return { kind: "library" };
}

function hashOf(tab: Tab | undefined) {
  if (!tab || tab.kind === "library") return "";
  if (tab.kind === "database") return "#/db";
  return `#/f/${tab.path.split("/").map(encodeURIComponent).join("/")}`;
}

/** The address bar follows the active tab, so a reload reopens it. */
function syncHash(tab: Tab | undefined) {
  const want = hashOf(tab);
  if (location.hash !== want) {
    if (want) location.hash = want;
    // Assigning "" would leave a bare "#" behind; pushState clears it and keeps Back working.
    else history.pushState(null, "", location.pathname + location.search);
  }
}

function initialTabs(): { tabs: Tab[]; activeId: number } {
  const r = parseHash();
  if (r.kind === "library") return { tabs: [LIBRARY], activeId: LIBRARY_TAB };
  const tab: Tab =
    r.kind === "file"
      ? { id: nextId++, kind: "file", path: r.path, scrollTop: 0 }
      : { id: nextId++, kind: "database" };
  return { tabs: [LIBRARY, tab], activeId: tab.id };
}

export const useTabs = create<TabsStore>()((set, get) => ({
  ...initialTabs(),

  openFile(path) {
    const existing = get().tabs.find((t) => t.kind === "file" && t.path === path);
    if (existing) return get().selectTab(existing.id);
    const tab: Tab = { id: nextId++, kind: "file", path, scrollTop: 0 };
    syncHash(tab);
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }));
  },

  openDatabase() {
    const existing = get().tabs.find((t) => t.kind === "database");
    if (existing) return get().selectTab(existing.id);
    const tab: Tab = { id: nextId++, kind: "database" };
    syncHash(tab);
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }));
  },

  close() {
    get().closeTab(get().activeId);
  },

  closeTab(id) {
    if (id === LIBRARY_TAB) return;
    const { tabs, activeId } = get();
    const i = tabs.findIndex((t) => t.id === id);
    if (i === -1) return;

    const rest = tabs.filter((t) => t.id !== id);
    const nextActive =
      id === activeId ? (rest[Math.min(i, rest.length - 1)]?.id ?? LIBRARY_TAB) : activeId;

    set({ tabs: rest, activeId: nextActive });
    syncHash(rest.find((t) => t.id === nextActive));
  },

  selectTab(id) {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    syncHash(tab);
    set({ activeId: id });
  },

  cycleTab(step = 1) {
    const { tabs, activeId } = get();
    if (tabs.length < 2) return;
    const i = tabs.findIndex((t) => t.id === activeId);
    const next = tabs[(i + step + tabs.length) % tabs.length]!;
    get().selectTab(next.id);
  },

  setScroll(id, top) {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id && t.kind === "file" ? { ...t, scrollTop: top } : t)),
    }));
  },

  resetTabs() {
    set((s) => ({
      tabs: s.tabs.filter((t) => t.kind !== "file"),
      activeId: s.tabs.find((t) => t.id === s.activeId)?.kind === "file" ? LIBRARY_TAB : s.activeId,
    }));
    syncHash(get().tabs.find((t) => t.id === get().activeId));
  },
}));

/** The tab currently on screen. */
export function useActiveTab(): Tab {
  return useTabs((s) => s.tabs.find((t) => t.id === s.activeId) ?? s.tabs[0]!);
}

/** The path of the PDF on screen, or null outside the reader. */
export function useActivePath(): string | null {
  return useTabs((s) => {
    const t = s.tabs.find((t) => t.id === s.activeId);
    return t?.kind === "file" ? t.path : null;
  });
}

// Back/Forward and a hand-typed hash move between tabs, opening one if needed.
addEventListener("hashchange", () => {
  const r = parseHash();
  const s = useTabs.getState();
  if (r.kind === "file") s.openFile(r.path);
  else if (r.kind === "database") s.openDatabase();
  else s.selectTab(LIBRARY_TAB);
});
