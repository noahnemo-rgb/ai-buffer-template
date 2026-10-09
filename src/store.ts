import { AiBufferError } from "./errors.js";
import { DEFAULT_MODEL } from "./messages.js";
import { looksLikeSecret } from "./redact.js";
import type { SecretStore } from "./types.js";

const WEB_DURABLE = Symbol.for("ai-buffer.web-durable-storage");

function markWebDurable<T extends object>(store: T): T {
  Object.defineProperty(store, WEB_DURABLE, { value: true });
  return store;
}

export function isWebDurableStore(store: object): boolean {
  return Boolean((store as { [WEB_DURABLE]?: boolean })[WEB_DURABLE]);
}

function assertKeyStore(store: SecretStore): void {
  if (isWebDurableStore(store)) {
    throw new AiBufferError(
      "provider_error",
      "API keys cannot be saved in localStorage or sessionStorage. On a phone, use expo-secure-store. On the web, use createMemoryKeyStore for this page load, or send the key once to the server vault.",
    );
  }
}

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
  return markWebDurable({
    get: (key: string) => storage.getItem(key),
    set: (key: string, value: string) => {
      storage.setItem(key, value);
    },
    delete: (key: string) => {
      storage.removeItem(key);
    },
  });
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

export const PROVIDER_KEY_NAMES = {
  openrouter: "ai-buffer.openrouter_key",
  "space-bunny": "ai-buffer.openrouter_key",
  "vercel-gateway": "ai-buffer.gateway_key",
  gemini: "ai-buffer.gemini_key",
  nvidia: "ai-buffer.nvidia_key",
  llmapi: "ai-buffer.llmapi_key",
} as const;

export type KeyedProviderId = keyof typeof PROVIDER_KEY_NAMES;

export interface ProviderKeyStore {
  getKey: () => Promise<string | null>;
  setKey: (value: string) => Promise<void>;
  clearKey: () => Promise<void>;
}

/**
 * Saves one provider key in device secure storage or in memory.
 * `createLocalStorageStore` is rejected. The key is not written to the web page.
 */
export function createProviderKeyStore(
  store: SecretStore,
  provider: KeyedProviderId,
  keyName = PROVIDER_KEY_NAMES[provider],
): ProviderKeyStore {
  assertKeyStore(store);
  return {
    getKey: async () => {
      const value = await store.get(keyName);
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    },
    setKey: (value) => Promise.resolve(store.set(keyName, value.trim())),
    clearKey: () => Promise.resolve(store.delete(keyName)),
  };
}

/** Key lives in this process only. A reload drops it. */
export function createMemoryKeyStore(provider: KeyedProviderId = "openrouter"): ProviderKeyStore {
  return createProviderKeyStore(createMemoryStore(), provider);
}

/**
 * Saves an OpenRouter key in device secure storage or in memory.
 * Passing `createLocalStorageStore` throws. Use `createMemoryKeyStore` on the web,
 * or send the key once to the server vault.
 */
export function createOpenRouterKeyStore(
  store: SecretStore,
  names?: { key?: string; model?: string },
): OpenRouterKeyStore {
  assertKeyStore(store);
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
    setModel: (value) => {
      const trimmed = value.trim();
      if (looksLikeSecret(trimmed)) {
        return Promise.reject(new AiBufferError("provider_error", "The model field cannot store an API key."));
      }
      return Promise.resolve(store.set(modelName, trimmed));
    },
  };
}
