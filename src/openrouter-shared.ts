import type { ChatMessage } from "./types.js";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface OpenRouterStreamOptions {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  siteUrl?: string;
  appName?: string;
  transport?: "fetch" | "xhr";
  signal?: AbortSignal;
  /** Fires when the request has run past its time limit. Combined with `signal` for the socket. */
  timeoutSignal?: AbortSignal;
  onChunk?: (text: string) => void;
  fetchImpl?: typeof fetch;
}
