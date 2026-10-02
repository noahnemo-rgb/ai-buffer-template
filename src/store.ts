import { DEFAULT_MODEL } from "./messages.js";
import type { SecretStore } from "./types.js";

export function createMemoryStore(initial: Record<string, string> = {}): SecretStore {
  const values = new Map(Object.entries(initial));
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => {
      values.set(key, value);
    },
    delete: (key) => {
      values.delete(key);
    },
  };
}

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createLocalStorageStore(
  storage: KeyValueStorage | undefined = (globalThis as { localStorage?: KeyValueStorage }).localStorage,
): SecretStore {
  if (!storage) {
    throw new Error("localStorage is not available. Pass a store, or use createMemoryStore for tests.");
  }
  return {
    get: (key) => storage.getItem(key),
    set: (key, value) => {
      storage.setItem(key, value);
    },
    delete: (key) => {
      storage.removeItem(key);
    },
  };
}

const DEFAULT_KEY_NAME = "ai-buffer.openrouter_key";
const DEFAULT_MODEL_NAME = "ai-buffer.openrouter_model";

export interface OpenRouterKeyStore {
  getKey: () => Promise<string | null>;
  setKey: (value: string) => Promise<void>;
  clearKey: () => Promise<void>;
  getModel: () => Promise<string>;
  setModel: (value: string) => Promise<void>;
}

/**
 * Saves an OpenRouter key in whatever store the app already has.
 * Phones can pass expo-secure-store. Browsers can pass localStorage.
 * The key is never sent anywhere except OpenRouter.
 */
export function createOpenRouterKeyStore(
  store: SecretStore,
  names?: { key?: string; model?: string },
): OpenRouterKeyStore {
  const keyName = names?.key ?? DEFAULT_KEY_NAME;
  const modelName = names?.model ?? DEFAULT_MODEL_NAME;
  return {
    getKey: async () => {
      const value = await store.get(keyName);
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    },
    setKey: (value) => Promise.resolve(store.set(keyName, value.trim())),
    clearKey: () => Promise.resolve(store.delete(keyName)),
    getModel: async () => {
      const value = (await store.get(modelName))?.trim();
      return value || DEFAULT_MODEL;
    },
    setModel: (value) => Promise.resolve(store.set(modelName, value.trim())),
  };
}
