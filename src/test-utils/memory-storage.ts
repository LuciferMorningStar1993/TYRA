// localStorage en memoria para Jest (en la app lo provee expo-sqlite/localStorage/install).

export type MemoryStorage = Storage & { dump: () => Record<string, string> };

export function installMemoryStorage(): MemoryStorage {
  const data = new Map<string, string>();
  const storage: MemoryStorage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
    dump: () => Object.fromEntries(data),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  return storage;
}
