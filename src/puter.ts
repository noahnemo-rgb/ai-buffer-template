import { AiBufferError, codeFor } from "./errors.js";
import type { PuterChunk, PuterLike } from "./types.js";

export async function loadPuterDefault(): Promise<PuterLike> {
  const existing = (globalThis as { puter?: PuterLike }).puter;
  if (existing?.ai?.chat) return existing;
  try {
    const mod = await import("@heyputer/puter.js");
    if (mod.puter?.ai?.chat) return mod.puter;
  } catch {
    throw new Error(
      'Puter.js is not available. In a browser page, add <script src="https://js.puter.com/v2/"></script> before your app. In a bundler, install @heyputer/puter.js.',
    );
  }
  throw new Error("Puter.js loaded, but puter.ai.chat is missing.");
}

export function extractPuterText(part: unknown): string {
  if (typeof part === "string") return part;
  if (!part || typeof part !== "object") return "";
  const chunk = part as PuterChunk;
  if (chunk.type === "reasoning" || chunk.type === "usage" || chunk.type === "error") return "";
  if (typeof chunk.text === "string" && chunk.text) return chunk.text;
  const content = chunk.message && typeof chunk.message === "object" ? chunk.message.content : undefined;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object" && "text" in block && typeof block.text === "string") {
          return block.text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

export function puterErrorMessage(part: unknown): string | undefined {
  if (!part || typeof part !== "object") return undefined;
  const chunk = part as PuterChunk;
  if (chunk.type !== "error") return undefined;
  if (typeof chunk.message === "string" && chunk.message.trim()) return chunk.message;
  if (typeof chunk.text === "string" && chunk.text.trim()) return chunk.text;
  return "Puter stream error";
}

export function puterChunkError(part: unknown): AiBufferError | undefined {
  const message = puterErrorMessage(part);
  if (!message) return undefined;
  const code = part && typeof part === "object" && "code" in part ? (part as { code?: string }).code : undefined;
  const mapped = codeFor({ code, message });
  return new AiBufferError(mapped === "provider_error" ? "provider_error" : mapped, message);
}

export function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(value) && typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function";
}
