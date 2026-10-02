import { haltError, raceAbort, startTimeout, DEFAULT_TIMEOUT_MS } from "./abort.js";
import { AiBufferError, asAiError } from "./errors.js";
import { buildMessages, buildUserText, DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT } from "./messages.js";
import { streamOpenRouter } from "./openrouter.js";
import { extractPuterText, isAsyncIterable, loadPuterDefault, puterChunkError } from "./puter.js";
import type { AiClient, ChatMessage, PuterLike, StreamChatParams } from "./types.js";

export interface PuterClientOptions {
  /** Model id from Puter's catalog. This is separate from the OpenRouter model. */
  model?: string;
  defaultSystemPrompt?: string;
  loadPuter?: () => Promise<PuterLike>;
  /** `0` waits without a limit. The default is two minutes. */
  timeoutMs?: number;
}

export interface OpenRouterClientOptions {
  getApiKey: () => string | null | undefined | Promise<string | null | undefined>;
  getModel?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Model id from OpenRouter's catalog. This is separate from the Puter model. */
  model?: string;
  defaultSystemPrompt?: string;
  siteUrl?: string;
  appName?: string;
  /** Use "xhr" in React Native so tokens show up as they arrive. */
  transport?: "fetch" | "xhr";
  fetchImpl?: typeof fetch;
  /** `0` waits without a limit. The default is two minutes. */
  timeoutMs?: number;
}

export type AiClientOptions =
  | ({ provider: "puter" } & PuterClientOptions)
  | ({ provider: "openrouter" } & OpenRouterClientOptions);

function requireMessage(params: StreamChatParams): void {
  if (!params.message.trim() && !params.context?.trim()) {
    throw new AiBufferError("empty_message", "Message is empty.");
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

function resolveTimeout(request: number | undefined, clientDefault: number | undefined): number {
  if (request !== undefined) return request;
  if (clientDefault !== undefined) return clientDefault;
  return DEFAULT_TIMEOUT_MS;
}

async function readPuterStream(
  result: unknown,
  params: StreamChatParams,
  signals: { user?: AbortSignal; timeout?: AbortSignal },
): Promise<string> {
  let full = "";
  const push = (text: string) => {
    if (!text) return;
    full += text;
    params.onChunk?.(text);
  };
  if (!isAsyncIterable(result)) {
    push(extractPuterText(result));
    return full;
  }
  const iterator = result[Symbol.asyncIterator]();
  while (true) {
    const step = await raceAbort(iterator.next(), signals);
    if (step.done) break;
    const failure = puterChunkError(step.value);
    if (failure) throw failure;
    push(extractPuterText(step.value));
  }
  return full;
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
      try {
        const puter = await loadPuter();
        if (!puter.auth?.signIn) {
          throw new Error("This Puter build has no sign-in method.");
        }
        await puter.auth.signIn();
      } catch (error) {
        throw asAiError(error);
      }
    },
    async streamChat(params) {
      const timeoutMs = resolveTimeout(params.timeoutMs, options.timeoutMs);
      const timeout = timeoutMs > 0 ? startTimeout(timeoutMs) : undefined;
      const signals = { user: params.signal, timeout: timeout?.signal };
      try {
        const stopped = haltError(signals);
        if (stopped) throw stopped;
        const puter = await raceAbort(loadPuter(), signals);
        if (puter.auth?.isSignedIn && !puter.auth.isSignedIn()) {
          throw new AiBufferError("signed_out", "Sign in to Puter to send a message.");
        }
        if (!puter.ai?.chat) {
          throw new Error("Puter.js loaded, but puter.ai.chat is missing.");
        }
        const messages = messagesFor(params, options.defaultSystemPrompt);
        const result = await raceAbort(
          Promise.resolve(puter.ai.chat(messages, { model, stream: true })),
          signals,
        );
        return await readPuterStream(result, params, signals);
      } catch (error) {
        throw asAiError(haltError(signals) ?? error);
      } finally {
        timeout?.cancel();
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
      const timeoutMs = resolveTimeout(params.timeoutMs, options.timeoutMs);
      const timeout = timeoutMs > 0 ? startTimeout(timeoutMs) : undefined;
      const signals = { user: params.signal, timeout: timeout?.signal };
      try {
        const stopped = haltError(signals);
        if (stopped) throw stopped;
        const apiKey = (await options.getApiKey())?.trim();
        if (!apiKey) {
          throw new AiBufferError(
            "missing_key",
            "OpenRouter API key is not set. Add a key on this device, or set OPENROUTER_API_KEY on the server.",
          );
        }
        const model = await resolveModel();
        const messages = messagesFor(params, options.defaultSystemPrompt);
        return await raceAbort(
          streamOpenRouter({
            apiKey,
            model,
            messages,
            siteUrl: options.siteUrl,
            appName: options.appName,
            transport: options.transport,
            signal: params.signal,
            timeoutSignal: timeout?.signal,
            onChunk: params.onChunk,
            fetchImpl: options.fetchImpl,
          }),
          signals,
        );
      } catch (error) {
        throw asAiError(haltError(signals) ?? error);
      } finally {
        timeout?.cancel();
      }
    },
  };
}

export function createAiClient(options: AiClientOptions): AiClient {
  if (options.provider === "puter") return createPuterClient(options);
  return createOpenRouterClient(options);
}
