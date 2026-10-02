import type { ChatMessage, ChatTurn } from "./types.js";

/** Model id used when a caller does not pass one. Override it per app. */
export const DEFAULT_MODEL = "openai/gpt-4o-mini";

export const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful assistant. When you write code, enclose it in a markdown fence and name the language.";

const MAX_HISTORY_TURNS = 20;

export function buildUserText(message: string, context?: string): string {
  const trimmedContext = context?.trim();
  if (!trimmedContext) return message;
  return `${trimmedContext}\n\nUser question: ${message}`;
}

/**
 * Turn an open file into the `context` string for `streamChat`.
 * Each app decides whether to send code at all.
 */
export function formatCodeContext(input: { code: string; language?: string; maxChars?: number }): string {
  const maxChars = input.maxChars ?? 4000;
  const code = input.code.slice(0, maxChars);
  const language = input.language?.trim() || "unknown";
  return `[Current file language: ${language}]\n[Current file content]\n\`\`\`\n${code}\n\`\`\``;
}

export function buildMessages(input: {
  systemPrompt?: string;
  history?: ChatTurn[];
  userText: string;
}): ChatMessage[] {
  const systemPrompt = input.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];
  for (const turn of (input.history ?? []).slice(-MAX_HISTORY_TURNS)) {
    if (turn.content.trim() && (turn.role === "user" || turn.role === "assistant")) {
      messages.push({ role: turn.role, content: turn.content });
    }
  }
  messages.push({ role: "user", content: input.userText });
  return messages;
}
