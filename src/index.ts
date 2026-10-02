export { createAiClient, createOpenRouterClient, createPuterClient } from "./client.js";
export type { AiClientOptions, OpenRouterClientOptions, PuterClientOptions } from "./client.js";
export { asAiError, formatAiError } from "./errors.js";
export {
  buildMessages,
  buildUserText,
  DEFAULT_MODEL,
  DEFAULT_SYSTEM_PROMPT,
  formatCodeContext,
} from "./messages.js";
export { OPENROUTER_URL, streamOpenRouter } from "./openrouter.js";
export { drainOpenRouterSse } from "./sse.js";
export { createLocalStorageStore, createMemoryStore, createOpenRouterKeyStore } from "./store.js";
export type { OpenRouterKeyStore } from "./store.js";
export type {
  AiClient,
  AiProviderInfo,
  ChatMessage,
  ChatRole,
  ChatTurn,
  PuterLike,
  SecretStore,
  StreamChatParams,
} from "./types.js";
