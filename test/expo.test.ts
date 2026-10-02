import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createExpoClient as createNativeClient, expoPlatform as nativePlatform } from "../src/expo-native.ts";
import { createExpoClient as createWebClient, expoPlatform as webPlatform } from "../src/expo-web.ts";

function event(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n`;
}

describe("Expo platform clients", () => {
  it("uses Puter and the website model on web", async () => {
    assert.equal(webPlatform, "web");
    let model = "";
    const ai = createWebClient({
      puterModel: "puter-model",
      openrouterModel: "phone-model",
      loadPuter: async () => ({
        auth: { isSignedIn: () => true },
        ai: {
          chat: async (_prompt, options) => {
            model = options?.model ?? "";
            return { message: { content: "web" } };
          },
        },
      }),
    });
    assert.equal(ai.id, "puter");
    assert.equal(await ai.streamChat({ message: "Hi" }), "web");
    assert.equal(model, "puter-model");
  });

  it("uses OpenRouter, the phone model, and xhr on native", async () => {
    assert.equal(nativePlatform, "native");
    let model = "";
    class FakeXHR {
      responseText = "";
      status = 200;
      onprogress: (() => void) | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      open(): void {}
      setRequestHeader(): void {}
      send(body?: string): void {
        model = JSON.parse(body ?? "{}").model;
        this.responseText = `${event("phone")}\n`;
        this.onload?.();
      }
      abort(): void {
        this.onabort?.();
      }
    }
    const previous = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = FakeXHR;
    try {
      const ai = createNativeClient({
        puterModel: "puter-model",
        openrouterModel: "fallback-model",
        getApiKey: () => "sk-phone",
        getOpenRouterModel: async () => "phone-model",
        appName: "Syntax Mobile IDE",
      });
      assert.equal(ai.id, "openrouter");
      assert.equal(await ai.streamChat({ message: "Hi" }), "phone");
      assert.equal(model, "phone-model");
    } finally {
      if (previous) (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = previous;
      else delete (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
    }
  });
});
