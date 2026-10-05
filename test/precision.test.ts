import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAiClient } from "../src/client.ts";
import { AiBufferError } from "../src/errors.ts";
import { fullPrecisionExtra, FULL_PRECISION_QUANTIZATIONS } from "../src/precision.ts";
import { SPACE_BUNNY_MODEL } from "../src/space-bunny.ts";

function sse(text: string): Response {
  const body = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\ndata: [DONE]\n`;
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("fullPrecisionExtra", () => {
  it("asks OpenRouter for bf16, fp16, or fp32 on an open-weight model", () => {
    assert.deepEqual(fullPrecisionExtra("meta-llama/llama-3.1-70b-instruct"), {
      provider: { quantizations: [...FULL_PRECISION_QUANTIZATIONS] },
    });
  });

  it("refuses closed models and the cheap suffixes", () => {
    for (const model of [
      "openai/gpt-4o-mini",
      "anthropic/claude-3.5-sonnet",
      SPACE_BUNNY_MODEL,
      "meta-llama/llama-3.1-8b-instruct:free",
      "qwen/qwen-2.5-72b-instruct:floor",
      "  ",
    ]) {
      assert.throws(
        () => fullPrecisionExtra(model),
        (error: unknown) => error instanceof AiBufferError && error.code === "provider_error",
      );
    }
  });
});

describe("OpenRouter precision on the wire", () => {
  it("leaves the default request without a provider filter", async () => {
    let payload: { provider?: unknown } = {};
    const client = createAiClient({
      provider: "openrouter",
      getApiKey: () => "sk-test",
      model: "openai/gpt-4o-mini",
      fetchImpl: async (_input, init) => {
        payload = JSON.parse(String(init?.body));
        return sse("ok");
      },
    });
    await client.streamChat({ message: "Hi" });
    assert.equal(payload.provider, undefined);
  });

  it("sends the precision filter only when the caller asks for it", async () => {
    const model = "meta-llama/llama-3.1-70b-instruct";
    let payload: { model?: string; provider?: { quantizations?: string[] } } = {};
    const client = createAiClient({
      provider: "openrouter",
      getApiKey: () => "sk-test",
      model,
      extra: fullPrecisionExtra(model),
      fetchImpl: async (_input, init) => {
        payload = JSON.parse(String(init?.body));
        return sse("precise");
      },
    });
    assert.equal(await client.streamChat({ message: "Explain the migration." }), "precise");
    assert.equal(payload.model, model);
    assert.deepEqual(payload.provider?.quantizations, ["bf16", "fp16", "fp32"]);
  });

  it("keeps Space Bunny Alpha on its single provider", async () => {
    let payload: { provider?: unknown; model?: string } = {};
    const client = createAiClient({
      provider: "space-bunny",
      getApiKey: () => "sk-test",
      fetchImpl: async (_input, init) => {
        payload = JSON.parse(String(init?.body));
        return sse("bunny");
      },
    });
    await client.streamChat({ message: "Hi" });
    assert.equal(payload.model, SPACE_BUNNY_MODEL);
    assert.equal(payload.provider, undefined);
  });
});
