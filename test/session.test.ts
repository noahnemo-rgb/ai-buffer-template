import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AiBufferError } from "../src/errors.ts";
import { createChatSession } from "../src/session.ts";
import type { AiClient, StreamChatParams } from "../src/types.ts";

function fakeClient(streamChat: AiClient["streamChat"]): AiClient {
  return {
    id: "puter",
    getInfo: async () => ({ label: "Puter", description: "", configured: true }),
    streamChat,
  };
}

describe("chat session", () => {
  it("remembers completed turns and keeps the app prompt", async () => {
    const seen: StreamChatParams[] = [];
    const chat = createChatSession(
      fakeClient(async (params) => {
        seen.push(params);
        params.onChunk?.("Reply");
        return "Reply";
      }),
      { systemPrompt: "You plan simple meals." },
    );

    const first = await chat.send("Eggs?", { onChunk: () => undefined });
    const second = await chat.send("Rice?");
    assert.equal(first, "Reply");
    assert.equal(second, "Reply");
    assert.equal(seen[0]?.systemPrompt, "You plan simple meals.");
    assert.deepEqual(seen[1]?.history, [
      { role: "user", content: "Eggs?" },
      { role: "assistant", content: "Reply" },
    ]);
    assert.equal(chat.history.length, 4);
    assert.equal(chat.busy, false);
  });

  it("rejects a second send while a reply is streaming", async () => {
    let release: (text: string) => void = () => undefined;
    const chat = createChatSession(
      fakeClient(
        (params) =>
          new Promise((resolve) => {
            params.onChunk?.("Hi");
            release = resolve;
          }),
      ),
    );

    const pending = chat.send("Hello");
    await assert.rejects(
      () => chat.send("Again"),
      (error: unknown) => error instanceof AiBufferError && error.code === "busy",
    );
    release("Hi");
    assert.equal(await pending, "Hi");
    assert.deepEqual(chat.history, [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ]);
  });

  it("leaves history unchanged when a send fails or is stopped", async () => {
    const failing = createChatSession(
      fakeClient(async () => {
        throw new AiBufferError("rate_limited", "Too many AI requests. Wait a few seconds and try again.");
      }),
    );
    await assert.rejects(() => failing.send("Hi"), (error: unknown) => error instanceof AiBufferError);
    assert.deepEqual(failing.history, []);
    assert.equal(failing.busy, false);

    const stopping = createChatSession(
      fakeClient(
        (params) =>
          new Promise((_resolve, reject) => {
            params.signal?.addEventListener("abort", () => {
              reject(new AiBufferError("cancelled", "The AI request was cancelled."));
            });
          }),
      ),
    );
    const pending = stopping.send("Stay");
    stopping.stop();
    await assert.rejects(pending, (error: unknown) => error instanceof AiBufferError && error.code === "cancelled");
    assert.deepEqual(stopping.history, []);
    assert.equal(stopping.busy, false);
  });

  it("clears history on reset", async () => {
    const chat = createChatSession(fakeClient(async () => "Ok"), { history: [{ role: "user", content: "Old" }] });
    await chat.send("New");
    chat.reset();
    assert.deepEqual(chat.history, []);
  });
});
