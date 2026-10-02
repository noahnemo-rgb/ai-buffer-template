import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAiClient } from "../src/client.ts";
import { OPENROUTER_URL } from "../src/openrouter-shared.ts";
import { createMemoryStore, createOpenRouterKeyStore } from "../src/store.ts";
import type { PuterLike } from "../src/types.ts";

function event(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n`;
}

function sseResponse(text: string, status = 200): Response {
  return new Response(text, {
    status,
    headers: { "content-type": status === 200 ? "text/event-stream" : "application/json" },
  });
}

describe("OpenRouter client", () => {
  it("streams tokens and sends the app prompt, not a built-in persona", async () => {
    let payload: { model?: string; messages?: { role: string; content: string }[] } = {};
    const chunks: string[] = [];
    const client = createAiClient({
      provider: "openrouter",
      appName: "Joke Generator",
      siteUrl: "https://example.com",
      getApiKey: () => "sk-test",
      model: "openai/gpt-4o-mini",
      fetchImpl: async (input, init) => {
        assert.equal(String(input), OPENROUTER_URL);
        const headers = init?.headers as Record<string, string>;
        assert.equal(headers["X-Title"], "Joke Generator");
        assert.equal(headers["HTTP-Referer"], "https://example.com");
        assert.equal(headers.Authorization, "Bearer sk-test");
        payload = JSON.parse(String(init?.body));
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(event("Ha")));
            controller.enqueue(encoder.encode(`${event("!")}data: [DONE]\n`));
            controller.close();
          },
        });
        return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
      },
    });

    const full = await client.streamChat({
      message: "Tell me a joke",
      systemPrompt: "You write one-line jokes.",
      history: [{ role: "user", content: "Earlier" }],
      onChunk: (text) => chunks.push(text),
    });

    assert.equal(full, "Ha!");
    assert.deepEqual(chunks, ["Ha", "!"]);
    assert.equal(payload.model, "openai/gpt-4o-mini");
    assert.deepEqual(
      payload.messages?.map((message) => message.content),
      ["You write one-line jokes.", "Earlier", "Tell me a joke"],
    );
  });

  it("explains a missing key without calling OpenRouter", async () => {
    const client = createAiClient({
      provider: "openrouter",
      getApiKey: () => "  ",
      fetchImpl: async () => {
        throw new Error("fetch should not run");
      },
    });
    const info = await client.getInfo();
    assert.equal(info.configured, false);
    await assert.rejects(
      () => client.streamChat({ message: "Hi" }),
      /OpenRouter API key is not set/,
    );
  });

  it("turns an HTTP 429 into a short wait message", async () => {
    const client = createAiClient({
      provider: "openrouter",
      getApiKey: () => "sk-test",
      fetchImpl: async () => sseResponse("slow down", 429),
    });
    await assert.rejects(() => client.streamChat({ message: "Hi" }), /Too many AI requests/);
  });

  it("stops when the caller aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = createAiClient({
      provider: "openrouter",
      getApiKey: () => "sk-test",
      fetchImpl: async () => {
        const error = new Error("The operation was aborted.");
        error.name = "AbortError";
        throw error;
      },
    });
    await assert.rejects(
      () => client.streamChat({ message: "Hi", signal: controller.signal }),
      (error: unknown) => error instanceof Error && error.name === "AbortError",
    );
  });

  it("uses XMLHttpRequest progress on the phone transport", async () => {
    const chunks: string[] = [];
    class FakeXHR {
      responseText = "";
      status = 200;
      onprogress: (() => void) | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      open(): void {}
      setRequestHeader(): void {}
      send(): void {
        this.responseText = event("Phone");
        this.onprogress?.();
        this.responseText += event(" line");
        this.onload?.();
      }
      abort(): void {
        this.onabort?.();
      }
    }
    const previous = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = FakeXHR;
    try {
      const client = createAiClient({
        provider: "openrouter",
        transport: "xhr",
        getApiKey: async () => "sk-phone",
      });
      const full = await client.streamChat({
        message: "Hi",
        onChunk: (text) => chunks.push(text),
      });
      assert.equal(full, "Phone line");
      assert.deepEqual(chunks, ["Phone", " line"]);
    } finally {
      if (previous) (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = previous;
      else delete (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
    }
  });
});

describe("Puter client", () => {
  it("streams text and skips reasoning", async () => {
    const chunks: string[] = [];
    async function* stream() {
      yield { type: "text", text: "Hello" };
      yield { type: "reasoning", text: "hidden" };
      yield { message: { content: " there" } };
    }
    const puter: PuterLike = {
      auth: { isSignedIn: () => true, signIn: async () => undefined },
      ai: {
        chat: async (prompt, options) => {
          assert.equal(options?.stream, true);
          assert.equal(options?.model, "openai/gpt-4o-mini");
          const messages = prompt as { content: string }[];
          assert.equal(messages[0]?.content, "You name plants.");
          return stream();
        },
      },
    };
    const client = createAiClient({
      provider: "puter",
      loadPuter: async () => puter,
    });
    const info = await client.getInfo();
    assert.equal(info.configured, true);
    assert.equal(info.label, "Puter");
    const full = await client.streamChat({
      message: "What is this?",
      systemPrompt: "You name plants.",
      onChunk: (text) => chunks.push(text),
    });
    assert.equal(full, "Hello there");
    assert.deepEqual(chunks, ["Hello", " there"]);
  });

  it("reports an error chunk from the stream", async () => {
    async function* stream() {
      yield { type: "error", message: "allowance spent" };
    }
    const client = createAiClient({
      provider: "puter",
      loadPuter: async () => ({
        auth: { isSignedIn: () => true },
        ai: { chat: async () => stream() },
      }),
    });
    await assert.rejects(() => client.streamChat({ message: "Hi" }), /allowance spent/);
  });

  it("reads a non-streaming reply", async () => {
    const client = createAiClient({
      provider: "puter",
      loadPuter: async () => ({
        ai: { chat: async () => ({ message: { content: [{ text: "Done" }] } }) },
      }),
    });
    assert.equal(await client.streamChat({ message: "Hi" }), "Done");
  });

  it("says Puter is unavailable when the loader fails", async () => {
    const client = createAiClient({
      provider: "puter",
      loadPuter: async () => {
        throw new Error("missing");
      },
    });
    const info = await client.getInfo();
    assert.equal(info.configured, false);
    await assert.rejects(() => client.signIn?.(), /missing/);
  });
});

describe("key store", () => {
  it("trims the saved key and falls back to the default model", async () => {
    const secrets = createOpenRouterKeyStore(createMemoryStore());
    assert.equal(await secrets.getKey(), null);
    assert.equal(await secrets.getModel(), "openai/gpt-4o-mini");
    await secrets.setKey("  sk-live  ");
    await secrets.setModel(" anthropic/claude-3.5 ");
    assert.equal(await secrets.getKey(), "sk-live");
    assert.equal(await secrets.getModel(), "anthropic/claude-3.5");
    await secrets.clearKey();
    assert.equal(await secrets.getKey(), null);
  });
});
