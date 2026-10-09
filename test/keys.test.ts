import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createProviderSelectionStore } from "../src/dashboard.ts";
import {
  createLocalStorageStore,
  createMemoryKeyStore,
  createMemoryStore,
  createOpenRouterKeyStore,
  createProviderKeyStore,
} from "../src/store.ts";

const OWNER = "sk-testOWNERKEY1234567890abcd";

function webStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    dump: () => Object.fromEntries(values),
  };
}

describe("key stores", () => {
  it("refuses to write a raw key through the localStorage store", () => {
    const storage = webStorage();
    const store = createLocalStorageStore(storage);
    assert.throws(() => createOpenRouterKeyStore(store), /localStorage or sessionStorage/);
    assert.throws(() => createProviderKeyStore(store, "gemini"), /localStorage or sessionStorage/);
    assert.deepEqual(storage.dump(), {});
  });

  it("keeps a web session key in memory and a native key in the secure store", async () => {
    const memory = createMemoryKeyStore("nvidia");
    await memory.setKey(OWNER);
    assert.equal(await memory.getKey(), OWNER);

    const saved = new Map<string, string>();
    const secure = createProviderKeyStore(
      {
        get: (key) => saved.get(key) ?? null,
        set: (key, value) => {
          saved.set(key, value);
        },
        delete: (key) => {
          saved.delete(key);
        },
      },
      "gemini",
    );
    await secure.setKey("AIzaSyOWNERGEMINIKEY1234567890");
    assert.equal(saved.has("ai-buffer.gemini_key"), true);
    assert.equal([...saved.keys()].some((key) => key.startsWith("ai-buffer.model.")), false);
  });

  it("persists provider and model choices and refuses a key in the model field", async () => {
    const saved = new Map<string, string>();
    const backing = {
      get: (key: string) => saved.get(key) ?? null,
      set: (key: string, value: string) => {
        saved.set(key, value);
      },
      delete: (key: string) => {
        saved.delete(key);
      },
    };
    const selection = createProviderSelectionStore(backing);
    await selection.setProvider("gemini");
    await selection.setModel("gemini", "gemini-3.8-flash");
    await assert.rejects(selection.setModel("gemini", OWNER), /cannot store an API key/);
    const openrouter = createOpenRouterKeyStore(createMemoryStore());
    await assert.rejects(openrouter.setModel(OWNER), /cannot store an API key/);

    for (const [key, value] of saved) {
      assert.ok(key === "ai-buffer.active_provider" || key.startsWith("ai-buffer.model."));
      assert.equal(value.includes(OWNER), false);
      assert.equal(value, key === "ai-buffer.active_provider" ? "gemini" : "gemini-3.8-flash");
    }
    assert.equal(saved.size, 2);

    const seeded = createProviderSelectionStore(
      createMemoryStore({ "ai-buffer.active_provider": "gemini", "ai-buffer.model.gemini": OWNER }),
    );
    assert.equal(await seeded.getModel("gemini"), "gemini-3.8-flash");
  });
});
