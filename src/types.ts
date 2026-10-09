export type ChatRole = "system" | "user" | "assistant";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface StreamChatParams {
  /** The user's new message. */
  message: string;
  /** Earlier turns. The adapter keeps the most recent 20. */
  history?: ChatTurn[];
  /**
   * Instructions for this app. A coding app, a joke app, and a palm-reading
   * app each pass their own text. The adapter does not invent a persona.
   */
  systemPrompt?: string;
  /** Extra text placed above the user message, such as the file they have open. */
  context?: string;
  onChunk?: (text: string) => void;
  signal?: AbortSignal;
  /** `0` waits without a limit. Falls back to the client's timeout, then two minutes. */
  timeoutMs?: number;
}

export interface AiProviderInfo {
  label: string;
  description: string;
  configured: boolean;
}

export interface AiClient {
  readonly id: "puter" | "openrouter" | "space-bunny" | "vercel-gateway" | "gemini" | "laya" | "llmapi";
  getInfo(): Promise<AiProviderInfo>;
  /** Present when the provider has its own sign-in. Puter does. OpenRouter does not. */
  signIn?(): Promise<void>;
  streamChat(params: StreamChatParams): Promise<string>;
}

export interface SecretStore {
  get(key: string): Promise<string | null> | string | null;
  set(key: string, value: string): Promise<void> | void;
  delete(key: string): Promise<void> | void;
}

export interface PuterAuth {
  isSignedIn?: () => boolean;
  signIn?: () => Promise<void>;
}

export interface PuterChunk {
  type?: string;
  text?: string;
  message?: string | { content?: unknown };
}

export interface PuterLike {
  auth?: PuterAuth;
  ai?: {
    chat?: (
      prompt: string | ChatMessage[],
      options?: { model?: string; stream?: boolean },
    ) => Promise<unknown> | AsyncIterable<unknown>;
  };
}
