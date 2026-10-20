import { useEffect } from "preact/hooks";
import { create } from "zustand";
import { api } from "@/api";

interface PluginDataStore {
  /** plugin id → its key-value record, once loaded */
  data: Record<string, Record<string, unknown>>;
}

const useData = create<PluginDataStore>()(() => ({
  data: {},
}));

/** First GET per plugin, shared by every caller until it settles. */
const loading = new Map<string, Promise<void>>();

function ensure(id: string) {
  if (useData.getState().data[id]) return Promise.resolve();
  let p = loading.get(id);
  if (!p) {
    p = api.pluginData
      .get(id)
      .catch(() => ({}))
      .then((record) => {
        useData.setState((s) => ({ data: { ...s.data, [id]: { ...record, ...s.data[id] } } }));
      })
      .finally(() => loading.delete(id));
    loading.set(id, p);
  }
  return p;
}

function patch(id: string, key: string, value: unknown, remove = false) {
  useData.setState((s) => {
    const record = { ...s.data[id] };
    if (remove) delete record[key];
    else record[key] = value;
    return { data: { ...s.data, [id]: record } };
  });
}

export interface PluginStore {
  /** The stored value of `key`, or `fallback` until loaded or when absent. */
  useValue<T>(key: string, fallback: T): T;
  /** The value right now, outside a component. */
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  /** Resolves once the plugin's record has been fetched. */
  ready(): Promise<void>;
}

const stores = new Map<string, PluginStore>();

/**
 * A plugin's JSON key-value store, kept in the app's database — for data that
 * belongs with the classes rather than with the browser.
 * Loaded lazily on first use; writes are optimistic. Plugins never see SQL.
 */
export function pluginStore(id: string): PluginStore {
  let store = stores.get(id);
  if (store) return store;
  store = {
    useValue<T>(key: string, fallback: T) {
      useEffect(() => void ensure(id), []);
      const v = useData((s) => s.data[id]?.[key]);
      return v === undefined ? fallback : (v as T);
    },
    get<T>(key: string, fallback: T) {
      const v = useData.getState().data[id]?.[key];
      return v === undefined ? fallback : (v as T);
    },
    async set(key, value) {
      patch(id, key, value);
      await api.pluginData.put(id, key, value);
    },
    async remove(key) {
      patch(id, key, undefined, true);
      await api.pluginData.remove(id, key);
    },
    ready: () => ensure(id),
  };
  stores.set(id, store);
  return store;
}
