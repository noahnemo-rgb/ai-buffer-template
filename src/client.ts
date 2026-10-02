import { asAiError } from "./errors.js";
import { buildMessages, buildUserText, DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT } from "./messages.js";
import { streamOpenRouter } from "./openrouter.js";
import { extractPuterText, isAsyncIterable, loadPuterDefault, puterErrorMessage } from "./puter.js";
import type { AiClient, ChatMessage, PuterLike, StreamChatParams } from "./types.js";

export interface PuterClientOptions {
  model?: string;
  defaultSystemPrompt?: string;
  loadPuter?: () => Promise<PuterLike>;
}

export interface OpenRouterClientOptions {
  getApiKey: () => string | null | undefined | Promise<string | null | undefined>;
  getModel?: () => string | null | undefined | Promise<string | null | undefined>;
  model?: string;
  defaultSystemPrompt?: string;
  siteUrl?: string;
  appName?: string;
  /** Use "xhr" in React Native so tokens show up as they arrive. */
  transport?: "fetch" | "xhr";
  fetchImpl?: typeof fetch;
}

export type AiClientOptions =
  | ({ provider: "puter" } & PuterClientOptions)
  | ({ provider: "openrouter" } & OpenRouterClientOptions);

function requireMessage(params: StreamChatParams): void {
  if (!params.message.trim() && !params.context?.trim()) {
    throw new Error("Message is empty.");
  }
}

function messagesFor(params: StreamChatParams, defaultSystemPrompt?: string): ChatMessage[] {
  requireMessage(params);
  return buildMessages({
    systemPrompt: params.systemPrompt ?? defaultSystemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    history: params.history,
    userText: buildUserText(params.message, params.context),
  });
}

export function createPuterClient(options: PuterClientOptions = {}): AiClient {
  const loadPuter = options.loadPuter ?? loadPuterDefault;
  const model = options.model?.trim() || DEFAULT_MODEL;

  return {
    id: "puter",
    async getInfo() {
      try {
        const puter = await loadPuter();
        const signedIn = Boolean(puter.auth?.isSignedIn?.());
        return {
          label: "Puter",
          description: signedIn
            ? "Signed in to Puter. AI usage is billed to that Puter account."
            : "Sign in to Puter when prompted. AI usage is billed to that Puter account.",
          configured: signedIn,
        };
      } catch {
        return {
          label: "Puter",
          description:
            "Puter runs in the browser. Add the Puter script, or install @heyputer/puter.js, then sign in.",
          configured: false,
        };
      }
    },
    async signIn() {
      const puter = await loadPuter();
      if (!puter.auth?.signIn) {
        throw new Error("This Puter build has no sign-in method.");
      }
      await puter.auth.signIn();
    },
    async streamChat(params) {
      try {
        const puter = await loadPuter();
        if (!puter.ai?.chat) {
          throw new Error("Puter.js loaded, but puter.ai.chat is missing.");
        }
        const messages = messagesFor(params, options.defaultSystemPrompt);
        const result = await puter.ai.chat(messages, { model, stream: true });
        let full = "";
        const push = (text: string) => {
          if (!text) return;
          full += text;
          params.onChunk?.(text);
        };
        if (isAsyncIterable(result)) {
          for await (const part of result) {
            const errorMessage = puterErrorMessage(part);
            if (errorMessage) throw new Error(errorMessage);
            push(extractPuterText(part));
          }
          return full;
        }
        push(extractPuterText(result));
        return full;
      } catch (error) {
        throw asAiError(error);
      }
    },
  };
}

export function createOpenRouterClient(options: OpenRouterClientOptions): AiClient {
  async function resolveModel(): Promise<string> {
    const fromGetter = (await options.getModel?.())?.trim();
    return fromGetter || options.model?.trim() || DEFAULT_MODEL;
  }

  return {
    id: "openrouter",
    async getInfo() {
      const key = (await options.getApiKey())?.trim();
      const model = await resolveModel();
      return {
        label: "OpenRouter",
        description: key
          ? `Using model ${model}. Usage is billed to the OpenRouter account for this key.`
          : "Add an OpenRouter API key. On a phone, keep the key on the device. On a server, set OPENROUTER_API_KEY.",
        configured: Boolean(key),
      };
    },
    async streamChat(params) {
      try {
        const apiKey = (await options.getApiKey())?.trim();
        if (!apiKey) {
          throw new Error(
            "OpenRouter API key is not set. Add a key on this device, or set OPENROUTER_API_KEY on the server.",
          );
        }
        const model = await resolveModel();
        const messages = messagesFor(params, options.defaultSystemPrompt);
        return await streamOpenRouter({
          apiKey,
          model,
          messages,
          siteUrl: options.siteUrl,
          appName: options.appName,
          transport: options.transport,
          signal: params.signal,
          onChunk: params.onChunk,
          fetchImpl: options.fetchImpl,
        });
      } catch (error) {
        throw asAiError(error);
      }
    },
  };
}

export function createAiClient(options: AiClientOptions): AiClient {
  if (options.provider === "puter") return createPuterClient(options);
  return createOpenRouterClient(options);
}
