import { AiBufferError } from "./errors.js";
import type { ChatMessage } from "./types.js";
import type { SseDelta } from "./sse.js";

/** Gemini API host. Streaming uses `streamGenerateContent` with `alt=sse`. */
export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Model id from the Gemini text-generation docs (checked 2026-10-09).
 * Pass `model` or `GEMINI_MODEL` to use another id. The id is the model name, not `provider/model`.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export const GEMINI_MISSING_KEY = "Gemini API key is not set. Set GEMINI_API_KEY.";

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function readGeminiApiKey(env: { GEMINI_API_KEY?: string }): string | undefined {
  const key = env.GEMINI_API_KEY?.trim();
  return key || undefined;
}

export function geminiStreamUrl(model: string): string {
  const id = model.trim();
  if (!MODEL_ID.test(id)) {
    throw new AiBufferError("provider_error", "Gemini model id is not valid.");
  }
  return `${GEMINI_API_BASE}/models/${encodeURIComponent(id)}:streamGenerateContent?alt=sse`;
}

export function geminiRequestBody(messages: ChatMessage[]): string {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
  const body: Record<string, unknown> = { contents };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  return JSON.stringify(body);
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

interface GeminiChunk {
  error?: { message?: string } | string;
  candidates?: { content?: { parts?: GeminiPart[] } }[];
}

/** SSE chunks from `streamGenerateContent?alt=sse`. Thought parts are skipped. */
export function drainGeminiSse(fullText: string, parsedThrough: number): SseDelta {
  let text = "";
  const slice = fullText.slice(parsedThrough);
  const lines = slice.split("\n");
  const completeLines = lines.slice(0, -1);
  let consumed = parsedThrough;
  for (const rawLine of completeLines) {
    consumed += rawLine.length + 1;
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice("data:".length).trim();
    if (!data || data === "[DONE]") continue;
    let chunk: GeminiChunk;
    try {
      chunk = JSON.parse(data) as GeminiChunk;
    } catch (error) {
      if (error instanceof SyntaxError) continue;
      throw error;
    }
    if (chunk.error) {
      const message = typeof chunk.error === "string" ? chunk.error : chunk.error.message;
      throw new Error(message || "Gemini API stream error");
    }
    const parts = chunk.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.thought) continue;
      if (part.text) text += part.text;
    }
  }
  return { text, parsedThrough: consumed };
}
