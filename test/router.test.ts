import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAiClient } from "../src/client.ts";
import { AiBufferError } from "../src/errors.ts";
import { SPACE_BUNNY_MODEL } from "../src/space-bunny.ts";
import { createCallRouter } from "../src/router.ts";

function sse(text: string): Response {
  const body = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\ndata: [DONE]\n`;
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("Space Bunny Alpha", () => {
  it("asks OpenRouter for stealth/space-bunny-alpha and a medium reasoning effort", async () => {
    let payload: { model?: string; reasoning?: { effort?: string } } = {};
    const client = createAiClient({
      provider: "space-bunny",
      getApiKey: () => "sk-test",
      appName: "Idea Forge",
      fetchImpl: async (_input, init) => {
        payload = JSON.parse(String(init?.body));
        return sse("Routed");
      },
    });

    const info = await client.getInfo();
    assert.equal(client.id, "space-bunny");
    assert.equal(info.label, "Space Bunny Alpha");
    assert.equal(info.configured, true);
    assert.equal(await client.streamChat({ message: "Sketch an API", systemPrompt: "Be brief." }), "Routed");
    assert.equal(payload.model, SPACE_BUNNY_MODEL);
    assert.equal(payload.reasoning?.effort, "medium");
  });

  it("sends a chosen reasoning effort", async () => {
    let effort = "";
    const client = createAiClient({
      provider: "space-bunny",
      getApiKey: () => "sk-test",
      reasoningEffort: "high",
      fetchImpl: async (_input, init) => {
        effort = JSON.parse(String(init?.body)).reasoning.effort;
        return sse("ok");
      },
    });
    await client.streamChat({ message: "Hi" });
    assert.equal(effort, "high");
  });

  it("rejects an unknown reasoning effort before any request", () => {
    assert.throws(
      () =>
        createAiClient({
          provider: "space-bunny",
          getApiKey: () => "sk-test",
          reasoningEffort: "huge" as "low",
        }),
      (error: unknown) => error instanceof AiBufferError && error.code === "provider_error",
    );
  });
});

describe("call router", () => {
  it("sends a named route to Space Bunny and leaves OpenRouter unused", async () => {
    let openrouterCalls = 0;
    const router = createCallRouter({
      spaceBunny: {
        getApiKey: () => "sk-bunny",
        fetchImpl: async () => sse("bunny"),
      },
      openrouter: {
        getApiKey: () => "sk-or",
        fetchImpl: async () => {
          openrouterCalls += 1;
          return sse("other");
        },
      },
    });

    const reply = await router.streamChat({ route: "space-bunny", message: "Hello" });
    assert.equal(reply, "bunny");
    assert.equal(openrouterCalls, 0);
    assert.equal(router.route("space-bunny").id, "space-bunny");
  });

  it("moves to OpenRouter when Space Bunny is rate limited", async () => {
    const router = createCallRouter({
      spaceBunny: {
        getApiKey: () => "sk-bunny",
        fetchImpl: async () => new Response("slow down", { status: 429 }),
      },
      openrouter: {
        getApiKey: () => "sk-or",
        model: "openai/gpt-4o-mini",
        fetchImpl: async (_input, init) => {
          const payload = JSON.parse(String(init?.body));
          assert.equal(payload.model, "openai/gpt-4o-mini");
          return sse("fallback");
        },
      },
    });

    assert.equal(await router.streamChat({ message: "Hello" }), "fallback");
  });

  it("keeps an empty message on the first route", async () => {
    let openrouterCalls = 0;
    const router = createCallRouter({
      spaceBunny: {
        getApiKey: () => "sk-bunny",
        fetchImpl: async () => sse("should not run"),
      },
      openrouter: {
        getApiKey: () => "sk-or",
        fetchImpl: async () => {
          openrouterCalls += 1;
          return sse("nope");
        },
      },
    });

    await assert.rejects(
      () => router.streamChat({ message: "   " }),
      (error: unknown) => error instanceof AiBufferError && error.code === "empty_message",
    );
    assert.equal(openrouterCalls, 0);
  });

  it("reports a route that was not configured", async () => {
    const router = createCallRouter({
      openrouter: { getApiKey: () => "sk-or", fetchImpl: async () => sse("ok") },
    });
    await assert.rejects(
      () => router.streamChat({ route: "space-bunny", message: "Hi" }),
      (error: unknown) => error instanceof AiBufferError && /space-bunny route is not configured/.test(error.message),
    );
  });
});
