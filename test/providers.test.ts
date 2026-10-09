import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAiClient } from "../src/client.ts";
import { AiBufferError } from "../src/errors.ts";
import { DEFAULT_GEMINI_MODEL } from "../src/gemini.ts";
import { DEFAULT_NVIDIA_MODEL, NVIDIA_URL } from "../src/nvidia.ts";
import { DEFAULT_LLMAPI_MODEL, LLMAPI_URL } from "../src/llmapi.ts";
import { createCallRouter } from "../src/router.ts";
import { readGatewayApiKey, VERCEL_GATEWAY_URL } from "../src/vercel-gateway.ts";

function event(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n`;
}

function sseResponse(text: string, status = 200): Response {
  return new Response(text, {
    status,
    headers: { "content-type": status === 200 ? "text/event-stream" : "application/json" },
  });
}

describe("Vercel Gateway", () => {
  it("streams chat completions with the gateway key and model", async () => {
    let payload: { model?: string; messages?: { content: string }[]; stream?: boolean } = {};
    const chunks: string[] = [];
    const client = createAiClient({
      provider: "vercel-gateway",
      appName: "Seed Feast",
      siteUrl: "https://example.com",
      getApiKey: () => readGatewayApiKey({ AI_GATEWAY_API_KEY: "gw-key", VERCEL_OIDC_TOKEN: "oidc" }),
      model: "openai/gpt-4o-mini",
      fetchImpl: async (input, init) => {
        assert.equal(String(input), VERCEL_GATEWAY_URL);
        const headers = init?.headers as Record<string, string>;
        assert.equal(headers.Authorization, "Bearer gw-key");
        assert.equal(headers["X-Title"], "Seed Feast");
        payload = JSON.parse(String(init?.body));
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(event("Gate")));
            controller.enqueue(encoder.encode(`${event("way")}data: [DONE]\n`));
            controller.close();
          },
        });
        return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
      },
    });
    const info = await client.getInfo();
    assert.equal(info.label, "Vercel Gateway");
    assert.equal(info.configured, true);
    const full = await client.streamChat({
      message: "Hi",
      systemPrompt: "Be brief.",
      onChunk: (text) => chunks.push(text),
    });
    assert.equal(full, "Gateway");
    assert.deepEqual(chunks, ["Gate", "way"]);
    assert.equal(payload.model, "openai/gpt-4o-mini");
    assert.equal(payload.stream, true);
    assert.equal(payload.messages?.[0]?.content, "Be brief.");
  });

  it("uses the OIDC token when the API key is empty", () => {
    assert.equal(readGatewayApiKey({ AI_GATEWAY_API_KEY: "  ", VERCEL_OIDC_TOKEN: "oidc-token" }), "oidc-token");
    assert.equal(readGatewayApiKey({ VERCEL_OIDC_TOKEN: "oidc-token" }), "oidc-token");
    assert.equal(readGatewayApiKey({}), undefined);
  });

  it("explains a missing key without calling the gateway", async () => {
    const client = createAiClient({
      provider: "vercel-gateway",
      getApiKey: () => "",
      fetchImpl: async () => {
        throw new Error("fetch should not run");
      },
    });
    assert.equal((await client.getInfo()).configured, false);
    await assert.rejects(
      () => client.streamChat({ message: "Hi" }),
      (error: unknown) => error instanceof AiBufferError && error.code === "missing_key",
    );
  });

  it("maps HTTP 429 and 402", async () => {
    const limited = createAiClient({
      provider: "vercel-gateway",
      getApiKey: () => "gw",
      fetchImpl: async () => sseResponse("slow", 429),
    });
    await assert.rejects(
      () => limited.streamChat({ message: "Hi" }),
      (error: unknown) => error instanceof AiBufferError && error.code === "rate_limited",
    );
    const unpaid = createAiClient({
      provider: "vercel-gateway",
      getApiKey: () => "gw",
      fetchImpl: async () => sseResponse("empty", 402),
    });
    await assert.rejects(
      () => unpaid.streamChat({ message: "Hi" }),
      (error: unknown) => error instanceof AiBufferError && error.code === "payment_required",
    );
  });

  it("stops when the caller aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = createAiClient({
      provider: "vercel-gateway",
      getApiKey: () => "gw",
      fetchImpl: async () => {
        const error = new Error("The operation was aborted.");
        error.name = "AbortError";
        throw error;
      },
    });
    await assert.rejects(
      () => client.streamChat({ message: "Hi", signal: controller.signal }),
      (error: unknown) => error instanceof AiBufferError && error.code === "cancelled",
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
        this.responseText += event(" gw");
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
        provider: "vercel-gateway",
        transport: "xhr",
        getApiKey: async () => "gw-phone",
      });
      const full = await client.streamChat({
        message: "Hi",
        onChunk: (text) => chunks.push(text),
      });
      assert.equal(full, "Phone gw");
      assert.deepEqual(chunks, ["Phone", " gw"]);
    } finally {
      if (previous) (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = previous;
      else delete (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
    }
  });
});

describe("Gemini API", () => {
  it("posts streamGenerateContent and skips thought parts", async () => {
    let url = "";
    let payload: {
      systemInstruction?: { parts: { text: string }[] };
      contents?: { role: string; parts: { text: string }[] }[];
    } = {};
    const chunks: string[] = [];
    const client = createAiClient({
      provider: "gemini",
      getApiKey: () => "gem-key",
      fetchImpl: async (input, init) => {
        url = String(input);
        const headers = init?.headers as Record<string, string>;
        assert.equal(headers["x-goog-api-key"], "gem-key");
        assert.equal(url.includes("key="), false);
        payload = JSON.parse(String(init?.body));
        const encoder = new TextEncoder();
        const thought = `data: ${JSON.stringify({
          candidates: [{ content: { parts: [{ thought: true, text: "hidden" }, { text: "Hi" }] } }],
        })}\n`;
        const next = `data: ${JSON.stringify({
          candidates: [{ content: { parts: [{ text: " there" }] } }],
        })}\n`;
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(thought));
            controller.enqueue(encoder.encode(next));
            controller.close();
          },
        });
        return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
      },
    });
    const info = await client.getInfo();
    assert.equal(info.label, "Gemini API");
    assert.equal(info.configured, true);
    const full = await client.streamChat({
      message: "Name it",
      systemPrompt: "You name plants.",
      history: [{ role: "assistant", content: "Earlier" }],
      onChunk: (text) => chunks.push(text),
    });
    assert.equal(full, "Hi there");
    assert.deepEqual(chunks, ["Hi", " there"]);
    assert.match(url, /\/models\/gemini-3\.8-flash:streamGenerateContent\?alt=sse$/);
    assert.equal(payload.systemInstruction?.parts[0]?.text, "You name plants.");
    assert.deepEqual(
      payload.contents?.map((item) => `${item.role}:${item.parts[0]?.text}`),
      ["model:Earlier", "user:Name it"],
    );
    assert.equal(DEFAULT_GEMINI_MODEL, "gemini-3.8-flash");
  });

  it("rejects a model id that is not a single path segment", async () => {
    let called = false;
    const client = createAiClient({
      provider: "gemini",
      getApiKey: () => "gem-key",
      model: "../other",
      fetchImpl: async () => {
        called = true;
        return sseResponse("nope");
      },
    });
    await assert.rejects(
      () => client.streamChat({ message: "Hi" }),
      (error: unknown) => error instanceof AiBufferError && error.code === "provider_error",
    );
    assert.equal(called, false);
  });

  it("explains a missing key and maps 429 and 402", async () => {
    const missing = createAiClient({
      provider: "gemini",
      getApiKey: () => " ",
      fetchImpl: async () => {
        throw new Error("fetch should not run");
      },
    });
    await assert.rejects(
      () => missing.streamChat({ message: "Hi" }),
      (error: unknown) => error instanceof AiBufferError && error.code === "missing_key" && /GEMINI_API_KEY/.test(error.message),
    );
    const limited = createAiClient({
      provider: "gemini",
      getApiKey: () => "gem",
      fetchImpl: async () => sseResponse("slow", 429),
    });
    await assert.rejects(
      () => limited.streamChat({ message: "Hi" }),
      (error: unknown) => error instanceof AiBufferError && error.code === "rate_limited",
    );
    const unpaid = createAiClient({
      provider: "gemini",
      getApiKey: () => "gem",
      fetchImpl: async () => sseResponse("credits", 402),
    });
    await assert.rejects(
      () => unpaid.streamChat({ message: "Hi" }),
      (error: unknown) => error instanceof AiBufferError && error.code === "payment_required",
    );
  });

  it("stops a stalled request when the time limit fires", async () => {
    const client = createAiClient({
      provider: "gemini",
      getApiKey: () => "gem",
      timeoutMs: 30,
      fetchImpl: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("The operation was aborted.");
            error.name = "AbortError";
            reject(error);
          });
        }),
    });
    await assert.rejects(
      () => client.streamChat({ message: "Hi" }),
      (error: unknown) => error instanceof AiBufferError && error.code === "cancelled" && /timed out/.test(error.message),
    );
  });
});

describe("LLMAPI", () => {
  it("calls the documented chat completions host", async () => {
    let payload: { model?: string } = {};
    const client = createAiClient({
      provider: "llmapi",
      getApiKey: () => "llm-key",
      fetchImpl: async (input, init) => {
        assert.equal(String(input), LLMAPI_URL);
        const headers = init?.headers as Record<string, string>;
        assert.equal(headers.Authorization, "Bearer llm-key");
        payload = JSON.parse(String(init?.body));
        return sseResponse(`${event("llm")}\ndata: [DONE]\n`);
      },
    });
    assert.equal((await client.getInfo()).label, "LLMAPI");
    assert.equal(await client.streamChat({ message: "Hi" }), "llm");
    assert.equal(payload.model, DEFAULT_LLMAPI_MODEL);
  });

  it("explains a missing key and maps 429", async () => {
    const missing = createAiClient({
      provider: "llmapi",
      getApiKey: () => "",
      fetchImpl: async () => {
        throw new Error("fetch should not run");
      },
    });
    await assert.rejects(
      () => missing.streamChat({ message: "Hi" }),
      (error: unknown) => error instanceof AiBufferError && error.code === "missing_key" && /LLM_API_KEY/.test(error.message),
    );
    const limited = createAiClient({
      provider: "llmapi",
      getApiKey: () => "llm",
      fetchImpl: async () => sseResponse("slow", 429),
    });
    await assert.rejects(
      () => limited.streamChat({ message: "Hi" }),
      (error: unknown) => error instanceof AiBufferError && error.code === "rate_limited",
    );
  });
});

describe("NVIDIA NIM", () => {
  it("calls the Nemotron chat completions host", async () => {
    let payload: { model?: string; stream?: boolean } = {};
    const client = createAiClient({
      provider: "nvidia",
      getApiKey: () => "nv-key",
      fetchImpl: async (input, init) => {
        assert.equal(String(input), NVIDIA_URL);
        const headers = init?.headers as Record<string, string>;
        assert.equal(headers.Authorization, "Bearer nv-key");
        payload = JSON.parse(String(init?.body));
        return sseResponse(`${event("nemo")}\ndata: [DONE]\n`);
      },
    });
    assert.equal((await client.getInfo()).label, "NVIDIA NIM");
    assert.equal(await client.streamChat({ message: "Hi" }), "nemo");
    assert.equal(payload.model, DEFAULT_NVIDIA_MODEL);
    assert.equal(payload.stream, true);
  });

  it("explains a missing key and maps 429 and 402", async () => {
    const missing = createAiClient({
      provider: "nvidia",
      getApiKey: () => "",
      fetchImpl: async () => {
        throw new Error("fetch should not run");
      },
    });
    await assert.rejects(
      () => missing.streamChat({ message: "Hi" }),
      (error: unknown) => error instanceof AiBufferError && error.code === "missing_key" && /NVIDIA_API_KEY/.test(error.message),
    );
    const limited = createAiClient({
      provider: "nvidia",
      getApiKey: () => "nv",
      fetchImpl: async () => sseResponse("slow", 429),
    });
    await assert.rejects(
      () => limited.streamChat({ message: "Hi" }),
      (error: unknown) => error instanceof AiBufferError && error.code === "rate_limited",
    );
    const unpaid = createAiClient({
      provider: "nvidia",
      getApiKey: () => "nv",
      fetchImpl: async () => sseResponse("credits", 402),
    });
    await assert.rejects(
      () => unpaid.streamChat({ message: "Hi" }),
      (error: unknown) => error instanceof AiBufferError && error.code === "payment_required",
    );
  });
});

describe("router with the new routes", () => {
  it("uses a named Vercel Gateway route", async () => {
    let geminiCalls = 0;
    const router = createCallRouter({
      vercelGateway: { getApiKey: () => "gw", fetchImpl: async () => sseResponse(`${event("gw")}\n`) },
      gemini: {
        getApiKey: () => "gem",
        fetchImpl: async () => {
          geminiCalls += 1;
          return sseResponse(`${event("gem")}\n`);
        },
      },
    });
    assert.equal(await router.streamChat({ route: "vercel-gateway", message: "Hi" }), "gw");
    assert.equal(geminiCalls, 0);
  });

  it("moves from Gemini API to LLMAPI when Gemini is rate limited", async () => {
    const router = createCallRouter({
      gemini: { getApiKey: () => "gem", fetchImpl: async () => sseResponse("slow", 429) },
      llmapi: { getApiKey: () => "llm", fetchImpl: async () => sseResponse(`${event("next")}\n`) },
      order: ["gemini", "llmapi"],
    });
    assert.equal(await router.streamChat({ message: "Hi" }), "next");
  });
});
