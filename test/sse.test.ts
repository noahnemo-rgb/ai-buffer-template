import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { drainOpenRouterSse, readOpenRouterSse } from "../src/sse.ts";

function event(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n`;
}

describe("OpenRouter SSE", () => {
  it("reads the next event after a chunk that ended on a newline", () => {
    const first = drainOpenRouterSse(event("A"), 0);
    assert.equal(first.text, "A");
    const combined = event("A") + event("B");
    const second = drainOpenRouterSse(combined, first.parsedThrough);
    assert.equal(second.text, "B");
  });

  it("waits for a line that arrives in two chunks", () => {
    const partial = 'data: {"choices":[{"delta":{"content":"Hel';
    const first = drainOpenRouterSse(partial, 0);
    assert.equal(first.text, "");
    assert.equal(first.parsedThrough, 0);
    const rest = partial + 'lo"}}]}\r\n\r\ndata: [DONE]\r\n';
    const second = drainOpenRouterSse(rest, first.parsedThrough);
    assert.equal(second.text, "Hello");
  });

  it("raises the provider error message", () => {
    const body = `data: ${JSON.stringify({ error: { message: "model not found" } })}\n`;
    assert.throws(() => drainOpenRouterSse(body, 0), /model not found/);
  });

  it("streams decoded text from a response body", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(event("Hello")));
        controller.enqueue(encoder.encode(event(" world").slice(0, 8)));
        controller.enqueue(encoder.encode(event(" world").slice(8)));
        controller.close();
      },
    });
    const chunks: string[] = [];
    const full = await readOpenRouterSse(body, (text) => chunks.push(text));
    assert.equal(full, "Hello world");
    assert.deepEqual(chunks, ["Hello", " world"]);
  });
});
