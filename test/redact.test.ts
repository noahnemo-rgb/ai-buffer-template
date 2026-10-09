import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { asAiError, formatAiError, providerHttpError } from "../src/errors.ts";
import { drainGeminiSse } from "../src/gemini.ts";
import { looksLikeSecret, maskKeyHint, redactSecrets } from "../src/redact.ts";
import { drainOpenRouterSse } from "../src/sse.ts";

const OWNER = "sk-testOWNERKEY1234567890abcd";
const GEMINI = "AIzaSyOWNERGEMINIKEY1234567890";

describe("redactSecrets", () => {
  it("strips bearer tokens, prefixed keys, query keys, and header assignments", () => {
    const raw = [
      `Authorization: Bearer ${OWNER}`,
      `x-goog-api-key: ${GEMINI}`,
      `https://example.test/v1?key=${GEMINI}&alt=sse`,
      `{"api_key":"${OWNER}"}`,
      `nvapi-OWNERNVIDIAKEY1234567890`,
    ].join("\n");
    const safe = redactSecrets(raw);
    assert.equal(safe.includes(OWNER), false);
    assert.equal(safe.includes(GEMINI), false);
    assert.equal(safe.includes("nvapi-OWNERNVIDIAKEY1234567890"), false);
    assert.match(safe, /Bearer \[redacted\]/);
    assert.match(safe, /key=\[redacted\]/);
    assert.equal(redactSecrets(safe), safe);
  });

  it("leaves ordinary error text in place", () => {
    assert.equal(redactSecrets("model not found"), "model not found");
    assert.equal(redactSecrets("Set GEMINI_API_KEY."), "Set GEMINI_API_KEY.");
  });

  it("masks a hint to the last 4 characters", () => {
    assert.equal(maskKeyHint(OWNER), "••••abcd");
    assert.equal(maskKeyHint("••••abcd"), "••••abcd");
    assert.equal(maskKeyHint("ab"), "");
    assert.equal(maskKeyHint(""), "");
  });

  it("treats key-shaped strings as secrets and model ids as models", () => {
    assert.equal(looksLikeSecret(OWNER), true);
    assert.equal(looksLikeSecret(GEMINI), true);
    assert.equal(looksLikeSecret("openai/gpt-4o-mini"), false);
    assert.equal(looksLikeSecret("gemini-3.8-flash"), false);
    assert.equal(looksLikeSecret("nvidia/nemotron-3-nano-30b-a3b"), false);
  });
});

describe("error redaction", () => {
  it("drops a key from an HTTP body before the message is built", () => {
    const error = providerHttpError("Gemini API", 401, `bad key ${GEMINI}`);
    assert.equal(error.message.includes(GEMINI), false);
    assert.match(error.message, /Gemini API HTTP 401/);
    const wrapped = asAiError(error);
    assert.equal(wrapped.message.includes(GEMINI), false);
  });

  it("drops a key from a formatted message", () => {
    const text = formatAiError(new Error(`upstream said ${OWNER}`));
    assert.equal(text.includes(OWNER), false);
  });

  it("drops a key from an SSE error event", () => {
    const body = `data: ${JSON.stringify({ error: { message: `rejected ${OWNER}` } })}\n`;
    assert.throws(() => drainOpenRouterSse(body, 0), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message.includes(OWNER), false);
      return true;
    });
    const gemini = `data: ${JSON.stringify({ error: { message: GEMINI } })}\n`;
    assert.throws(() => drainGeminiSse(gemini, 0), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message.includes(GEMINI), false);
      return true;
    });
  });
});
