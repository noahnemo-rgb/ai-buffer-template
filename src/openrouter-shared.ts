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
  onChunk?: (text: string) => void;
  fetchImpl?: typeof fetch;
}
