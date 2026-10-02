import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SYSTEM_PROMPT, buildMessages, buildUserText, formatCodeContext } from "../src/messages.ts";

describe("messages", () => {
  it("uses a generic system prompt when the app does not pass one", () => {
    const messages = buildMessages({ userText: "Hello" });
    assert.equal(messages[0]?.content, DEFAULT_SYSTEM_PROMPT);
    assert.equal(messages.at(-1)?.content, "Hello");
    assert.equal(JSON.stringify(messages).includes("Syntax"), false);
  });

  it("keeps the app's own instructions", () => {
    const messages = buildMessages({
      systemPrompt: "You write one-line jokes.",
      history: [
        { role: "user", content: "  " },
        { role: "assistant", content: "Prior joke" },
      ],
      userText: "Another",
    });
    assert.deepEqual(
      messages.map((message) => message.content),
      ["You write one-line jokes.", "Prior joke", "Another"],
    );
  });

  it("keeps only the latest 20 turns", () => {
    const history = Array.from({ length: 25 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `turn-${index}`,
    }));
    const messages = buildMessages({ history, userText: "now" });
    assert.equal(messages[1]?.content, "turn-5");
    assert.equal(messages.at(-2)?.content, "turn-24");
    assert.equal(messages.length, 22);
  });

  it("places file context above the question", () => {
    const text = buildUserText(
      "Why is this empty?",
      formatCodeContext({ code: "let x = null", language: "javascript", maxChars: 6 }),
    );
    assert.match(text, /javascript/);
    assert.match(text, /```\nlet x \n```/);
    assert.equal(text.includes("= null"), false);
    assert.match(text, /User question: Why is this empty\?$/);
  });
});
