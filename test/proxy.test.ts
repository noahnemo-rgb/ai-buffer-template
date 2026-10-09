import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAiProxy, createMemoryRateLimit, createVaultHandler } from "../src/proxy.ts";
import { createKeyVault, createMemoryVaultStorage } from "../src/vault.ts";
import { randomBytes } from "node:crypto";

const OWNER = "sk-testOWNERKEY1234567890abcd";
const GEMINI = "AIzaSyOWNERGEMINIKEY1234567890";
const BYOK = "sk-testUSERBYOK1234567890zzzz";

function sse(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
}

function geminiSse(text: string): string {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`;
}

describe("createAiProxy", () => {
  it("calls Gemini with the owner key in a header and does not echo the key", async () => {
    const seen: { url: string; headers: Headers }[] = [];
    const proxy = createAiProxy({
      allowedOrigins: ["https://app.example"],
      env: { GEMINI_API_KEY: GEMINI },
      models: { gemini: ["gemini-3.8-flash"] },
      fetchImpl: async (input, init) => {
        seen.push({ url: String(input), headers: new Headers(init?.headers) });
        return new Response(geminiSse("Hi"), { status: 200 });
      },
    });
    const response = await proxy(
      new Request("https://proxy.example/chat", {
        method: "POST",
        headers: { origin: "https://app.example", "content-type": "application/json" },
        body: JSON.stringify({
          provider: "gemini",
          model: "gemini-3.8-flash",
          messages: [{ role: "user", content: "Hi" }],
        }),
      }),
    );
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.equal(seen[0]?.headers.get("x-goog-api-key"), GEMINI);
    assert.equal(seen[0]?.headers.get("authorization"), null);
    assert.equal(seen[0]?.url.includes("key="), false);
    assert.equal(text.includes(GEMINI), false);
    assert.match(text, /Hi/);
  });

  it("rejects a foreign origin, a provider outside the allowlist, and a model outside the allowlist", async () => {
    const proxy = createAiProxy({
      allowedOrigins: ["https://app.example"],
      providers: ["openrouter"],
      models: { openrouter: ["openai/gpt-4o-mini"] },
      env: { OPENROUTER_API_KEY: OWNER },
    });
    const origin = await proxy(
      new Request("https://proxy.example/chat", {
        method: "POST",
        headers: { origin: "https://evil.example", "content-type": "application/json" },
        body: JSON.stringify({ provider: "openrouter", model: "openai/gpt-4o-mini", message: "Hi" }),
      }),
    );
    assert.equal(origin.status, 403);
    const provider = await proxy(
      new Request("https://proxy.example/chat", {
        method: "POST",
        headers: { origin: "https://app.example", "content-type": "application/json" },
        body: JSON.stringify({ provider: "nvidia", model: "nvidia/nemotron-3-nano-30b-a3b", message: "Hi" }),
      }),
    );
    assert.equal(provider.status, 400);
    const model = await proxy(
      new Request("https://proxy.example/chat", {
        method: "POST",
        headers: { origin: "https://app.example", "content-type": "application/json" },
        body: JSON.stringify({ provider: "openrouter", model: "other/model", message: "Hi" }),
      }),
    );
    assert.equal(model.status, 400);
    assert.equal((await origin.text()).includes(OWNER), false);
  });

  it("stops a caller when the rate-limit hook returns false", async () => {
    let calls = 0;
    const proxy = createAiProxy({
      allowedOrigins: ["https://app.example"],
      allowMissingOrigin: true,
      env: { OPENROUTER_API_KEY: OWNER },
      rateLimit: () => {
        calls += 1;
        return false;
      },
    });
    const response = await proxy(
      new Request("https://proxy.example/chat", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.8" },
        body: JSON.stringify({ provider: "openrouter", model: "openai/gpt-4o-mini", message: "Hi" }),
      }),
    );
    assert.equal(calls, 1);
    assert.equal(response.status, 429);
    const limit = createMemoryRateLimit({ limit: 1, windowMs: 60_000 });
    assert.equal(limit({ ip: "203.0.113.8", userId: null, provider: "openrouter" }), true);
    assert.equal(limit({ ip: "203.0.113.8", userId: null, provider: "openrouter" }), false);
  });

  it("uses a one-request BYOK key and redacts it from an upstream error", async () => {
    const seen: string[] = [];
    const proxy = createAiProxy({
      allowedOrigins: ["https://app.example"],
      env: { OPENROUTER_API_KEY: OWNER },
      fetchImpl: async (_input, init) => {
        seen.push(new Headers(init?.headers).get("authorization") ?? "");
        return new Response(`invalid ${BYOK}`, { status: 401 });
      },
    });
    const response = await proxy(
      new Request("https://proxy.example/chat", {
        method: "POST",
        headers: { origin: "https://app.example", "content-type": "application/json" },
        body: JSON.stringify({
          provider: "openrouter",
          model: "openai/gpt-4o-mini",
          message: "Hi",
          byok: BYOK,
        }),
      }),
    );
    const text = await response.text();
    assert.equal(seen[0], `Bearer ${BYOK}`);
    assert.equal(text.includes(BYOK), false);
    assert.equal(text.includes(OWNER), false);
    assert.match(text, /\[redacted\]/);
  });

  it("does not put the owner key on the wire when the browser omits byok", async () => {
    let authorization = "";
    const proxy = createAiProxy({
      allowedOrigins: ["https://app.example"],
      env: { OPENROUTER_API_KEY: OWNER },
      fetchImpl: async (_input, init) => {
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        return new Response(sse("Ok"), { status: 200 });
      },
    });
    const response = await proxy(
      new Request("https://proxy.example/chat", {
        method: "POST",
        headers: { origin: "https://app.example", "content-type": "application/json" },
        body: JSON.stringify({ provider: "openrouter", model: "openai/gpt-4o-mini", message: "Hi" }),
      }),
    );
    assert.equal(authorization, `Bearer ${OWNER}`);
    assert.equal((await response.text()).includes(OWNER), false);
  });
});

describe("key vault", () => {
  it("stores ciphertext and returns only a masked hint", async () => {
    const storage = createMemoryVaultStorage();
    const vault = createKeyVault({ encryptionKey: randomBytes(32), storage });
    const saved = await vault.put("user-1", "openrouter", OWNER);
    assert.equal(saved.configured, true);
    assert.equal(saved.hint, "••••abcd");
    assert.equal(JSON.stringify(saved).includes(OWNER), false);
    const record = await storage.get("ai-buffer.vault.user-1.openrouter");
    assert.ok(record);
    assert.equal(record.includes(OWNER), false);
    assert.equal(await vault.read("user-1", "openrouter"), OWNER);
    assert.deepEqual(await vault.status("user-1", "openrouter"), { configured: true, hint: "••••abcd" });

    const handler = createVaultHandler({
      vault,
      allowedOrigins: ["https://app.example"],
      resolveUser: () => "user-1",
    });
    const response = await handler(
      new Request("https://proxy.example/vault", {
        method: "POST",
        headers: { origin: "https://app.example", "content-type": "application/json" },
        body: JSON.stringify({ provider: "gemini", apiKey: GEMINI }),
      }),
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.hint, "••••7890");
    assert.equal(JSON.stringify(body).includes(GEMINI), false);
    const listed = await handler(
      new Request("https://proxy.example/vault?provider=gemini", {
        method: "GET",
        headers: { origin: "https://app.example" },
      }),
    );
    assert.equal(JSON.stringify(await listed.json()).includes(GEMINI), false);
  });
});
