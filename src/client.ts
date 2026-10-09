import { haltError, raceAbort, startTimeout, DEFAULT_TIMEOUT_MS } from "./abort.js";
import { streamChatCompletions, streamSsePost } from "./chat-completions.js";
import { AiBufferError, asAiError } from "./errors.js";
import { drainGeminiSse, geminiRequestBody, geminiStreamUrl, GEMINI_MISSING_KEY, DEFAULT_GEMINI_MODEL } from "./gemini.js";
import { DEFAULT_NVIDIA_MODEL, NVIDIA_MISSING_KEY, NVIDIA_URL } from "./nvidia.js";
import { buildMessages, buildUserText, DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT } from "./messages.js";
import { DEFAULT_LLMAPI_MODEL, LLMAPI_MISSING_KEY, LLMAPI_URL } from "./llmapi.js";
import { streamOpenRouter } from "./openrouter.js";
import { providerLabel } from "./providers.js";
import { DEFAULT_SPACE_BUNNY_EFFORT, SPACE_BUNNY_MODEL, spaceBunnyExtra, type SpaceBunnyReasoningEffort } from "./space-bunny.js";
import { extractPuterText, isAsyncIterable, loadPuterDefault, puterChunkError } from "./puter.js";
import type { AiClient, ChatMessage, PuterLike, StreamChatParams } from "./types.js";
import { DEFAULT_VERCEL_GATEWAY_MODEL, VERCEL_GATEWAY_MISSING_KEY, VERCEL_GATEWAY_URL } from "./vercel-gateway.js";

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
  /** Merged into the chat-completions JSON. Space Bunny Alpha uses this for reasoning effort. */
  extra?: Record<string, unknown>;
  /** `0` waits without a limit. The default is two minutes. */
  timeoutMs?: number;
}

export interface SpaceBunnyClientOptions extends Omit<OpenRouterClientOptions, "model" | "getModel" | "extra"> {
  /** Default is `medium`. The model accepts low, medium, high, xhigh, and max. */
  reasoningEffort?: SpaceBunnyReasoningEffort;
}

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
          label: providerLabel("puter"),
          description: signedIn
            ? "Signed in to Puter. AI usage is billed to that Puter account."
            : "Sign in to Puter when prompted. AI usage is billed to that Puter account.",
          configured: signedIn,
        };
      } catch {
        return {
          label: providerLabel("puter"),
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
        label: providerLabel("openrouter"),
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
            extra: options.extra,
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

export function createSpaceBunnyClient(options: SpaceBunnyClientOptions): AiClient {
  const effort = options.reasoningEffort ?? DEFAULT_SPACE_BUNNY_EFFORT;
  const inner = createOpenRouterClient({
    getApiKey: options.getApiKey,
    model: SPACE_BUNNY_MODEL,
    defaultSystemPrompt: options.defaultSystemPrompt,
    siteUrl: options.siteUrl,
    appName: options.appName,
    transport: options.transport,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    extra: spaceBunnyExtra(effort),
  });
  return {
    id: "space-bunny",
    async getInfo() {
      const key = (await options.getApiKey())?.trim();
      return {
        label: providerLabel("space-bunny"),
        description: key
          ? `Calling ${SPACE_BUNNY_MODEL} through OpenRouter. Reasoning effort is ${effort}. The preview does not charge for tokens.`
          : "Add an OpenRouter API key. Space Bunny Alpha is requested as stealth/space-bunny-alpha.",
        configured: Boolean(key),
      };
    },
    streamChat: (params) => inner.streamChat(params),
  };
}

export interface VercelGatewayClientOptions {
  getApiKey: () => string | null | undefined | Promise<string | null | undefined>;
  getModel?: () => string | null | undefined | Promise<string | null | undefined>;
  /** `provider/model` id from `GET https://ai-gateway.vercel.sh/v1/models`. */
  model?: string;
  defaultSystemPrompt?: string;
  siteUrl?: string;
  appName?: string;
  /** Use "xhr" in React Native so tokens show up as they arrive. */
  transport?: "fetch" | "xhr";
  fetchImpl?: typeof fetch;
  extra?: Record<string, unknown>;
  /** `0` waits without a limit. The default is two minutes. */
  timeoutMs?: number;
}

export interface GeminiClientOptions {
  getApiKey: () => string | null | undefined | Promise<string | null | undefined>;
  getModel?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Gemini model id, such as `gemini-3.8-flash`. */
  model?: string;
  defaultSystemPrompt?: string;
  /** Use "xhr" in React Native so tokens show up as they arrive. */
  transport?: "fetch" | "xhr";
  fetchImpl?: typeof fetch;
  /** `0` waits without a limit. The default is two minutes. */
  timeoutMs?: number;
}

export interface LlmapiClientOptions {
  getApiKey: () => string | null | undefined | Promise<string | null | undefined>;
  getModel?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Model id accepted by the LLMAPI host. */
  model?: string;
  /** Defaults to `https://api.llmapi.ai/v1/chat/completions`. */
  url?: string;
  defaultSystemPrompt?: string;
  siteUrl?: string;
  appName?: string;
  /** Use "xhr" in React Native so tokens show up as they arrive. */
  transport?: "fetch" | "xhr";
  fetchImpl?: typeof fetch;
  extra?: Record<string, unknown>;
  /** `0` waits without a limit. The default is two minutes. */
  timeoutMs?: number;
}

export interface NvidiaClientOptions {
  getApiKey: () => string | null | undefined | Promise<string | null | undefined>;
  getModel?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Model id from the NVIDIA NIM catalog, such as `nvidia/nemotron-3-nano-30b-a3b`. */
  model?: string;
  defaultSystemPrompt?: string;
  siteUrl?: string;
  appName?: string;
  /** Use "xhr" in React Native so tokens show up as they arrive. */
  transport?: "fetch" | "xhr";
  fetchImpl?: typeof fetch;
  extra?: Record<string, unknown>;
  /** `0` waits without a limit. The default is two minutes. */
  timeoutMs?: number;
}

export type AiClientOptions =
  | ({ provider: "puter" } & PuterClientOptions)
  | ({ provider: "openrouter" } & OpenRouterClientOptions)
  | ({ provider: "space-bunny" } & SpaceBunnyClientOptions)
  | ({ provider: "vercel-gateway" } & VercelGatewayClientOptions)
  | ({ provider: "gemini" } & GeminiClientOptions)
  | ({ provider: "nvidia" } & NvidiaClientOptions)
  | ({ provider: "llmapi" } & LlmapiClientOptions);

export function createVercelGatewayClient(options: VercelGatewayClientOptions): AiClient {
  async function resolveModel(): Promise<string> {
    const fromGetter = (await options.getModel?.())?.trim();
    return fromGetter || options.model?.trim() || DEFAULT_VERCEL_GATEWAY_MODEL;
  }

  return {
    id: "vercel-gateway",
    async getInfo() {
      const key = (await options.getApiKey())?.trim();
      const model = await resolveModel();
      return {
        label: providerLabel("vercel-gateway"),
        description: key
          ? `Using model ${model}. Send AI_GATEWAY_API_KEY, or VERCEL_OIDC_TOKEN when that key is unset.`
          : "Set AI_GATEWAY_API_KEY, or VERCEL_OIDC_TOKEN on Vercel. Keep the key on the server or in device secure storage.",
        configured: Boolean(key),
      };
    },
    async streamChat(params) {
      return runProviderChat(params, options.timeoutMs, async (signals) => {
        const apiKey = (await options.getApiKey())?.trim();
        if (!apiKey) throw new AiBufferError("missing_key", VERCEL_GATEWAY_MISSING_KEY);
        const model = await resolveModel();
        const messages = messagesFor(params, options.defaultSystemPrompt);
        return raceAbort(
          streamChatCompletions({
            url: VERCEL_GATEWAY_URL,
            apiKey,
            model,
            messages,
            providerName: providerLabel("vercel-gateway"),
            missingKeyMessage: VERCEL_GATEWAY_MISSING_KEY,
            siteUrl: options.siteUrl,
            appName: options.appName,
            transport: options.transport,
            signal: params.signal,
            timeoutSignal: signals.timeout,
            onChunk: params.onChunk,
            fetchImpl: options.fetchImpl,
            extra: options.extra,
          }),
          signals,
        );
      });
    },
  };
}

export function createGeminiClient(options: GeminiClientOptions): AiClient {
  async function resolveModel(): Promise<string> {
    const fromGetter = (await options.getModel?.())?.trim();
    return fromGetter || options.model?.trim() || DEFAULT_GEMINI_MODEL;
  }

  return {
    id: "gemini",
    async getInfo() {
      const key = (await options.getApiKey())?.trim();
      const model = await resolveModel();
      return {
        label: providerLabel("gemini"),
        description: key
          ? `Using model ${model}. Requests use the Gemini API key in the x-goog-api-key header.`
          : "Set GEMINI_API_KEY. Keep the key on the server or in device secure storage.",
        configured: Boolean(key),
      };
    },
    async streamChat(params) {
      return runProviderChat(params, options.timeoutMs, async (signals) => {
        const apiKey = (await options.getApiKey())?.trim();
        if (!apiKey) throw new AiBufferError("missing_key", GEMINI_MISSING_KEY);
        const model = await resolveModel();
        const messages = messagesFor(params, options.defaultSystemPrompt);
        const url = geminiStreamUrl(model);
        return raceAbort(
          streamSsePost({
            url,
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: geminiRequestBody(messages),
            providerName: providerLabel("gemini"),
            transport: options.transport,
            signal: params.signal,
            timeoutSignal: signals.timeout,
            fetchImpl: options.fetchImpl,
            onChunk: params.onChunk,
            drain: drainGeminiSse,
          }),
          signals,
        );
      });
    },
  };
}

export function createLlmapiClient(options: LlmapiClientOptions): AiClient {
  const url = options.url?.trim() || LLMAPI_URL;
  async function resolveModel(): Promise<string> {
    const fromGetter = (await options.getModel?.())?.trim();
    return fromGetter || options.model?.trim() || DEFAULT_LLMAPI_MODEL;
  }

  return {
    id: "llmapi",
    async getInfo() {
      const key = (await options.getApiKey())?.trim();
      const model = await resolveModel();
      return {
        label: providerLabel("llmapi"),
        description: key
          ? `Using model ${model}.`
          : "Set LLM_API_KEY. Keep the key on the server or in device secure storage.",
        configured: Boolean(key),
      };
    },
    async streamChat(params) {
      return runProviderChat(params, options.timeoutMs, async (signals) => {
        const apiKey = (await options.getApiKey())?.trim();
        if (!apiKey) throw new AiBufferError("missing_key", LLMAPI_MISSING_KEY);
        const model = await resolveModel();
        const messages = messagesFor(params, options.defaultSystemPrompt);
        return raceAbort(
          streamChatCompletions({
            url,
            apiKey,
            model,
            messages,
            providerName: providerLabel("llmapi"),
            missingKeyMessage: LLMAPI_MISSING_KEY,
            siteUrl: options.siteUrl,
            appName: options.appName,
            transport: options.transport,
            signal: params.signal,
            timeoutSignal: signals.timeout,
            onChunk: params.onChunk,
            fetchImpl: options.fetchImpl,
            extra: options.extra,
          }),
          signals,
        );
      });
    },
  };
}

export function createNvidiaClient(options: NvidiaClientOptions): AiClient {
  async function resolveModel(): Promise<string> {
    const fromGetter = (await options.getModel?.())?.trim();
    return fromGetter || options.model?.trim() || DEFAULT_NVIDIA_MODEL;
  }

  return {
    id: "nvidia",
    async getInfo() {
      const key = (await options.getApiKey())?.trim();
      const model = await resolveModel();
      return {
        label: providerLabel("nvidia"),
        description: key
          ? `Using model ${model}.`
          : "Set NVIDIA_API_KEY. Keep the key on the server or in device secure storage.",
        configured: Boolean(key),
      };
    },
    async streamChat(params) {
      return runProviderChat(params, options.timeoutMs, async (signals) => {
        const apiKey = (await options.getApiKey())?.trim();
        if (!apiKey) throw new AiBufferError("missing_key", NVIDIA_MISSING_KEY);
        const model = await resolveModel();
        const messages = messagesFor(params, options.defaultSystemPrompt);
        return raceAbort(
          streamChatCompletions({
            url: NVIDIA_URL,
            apiKey,
            model,
            messages,
            providerName: providerLabel("nvidia"),
            missingKeyMessage: NVIDIA_MISSING_KEY,
            siteUrl: options.siteUrl,
            appName: options.appName,
            transport: options.transport,
            signal: params.signal,
            timeoutSignal: signals.timeout,
            onChunk: params.onChunk,
            fetchImpl: options.fetchImpl,
            extra: options.extra,
          }),
          signals,
        );
      });
    },
  };
}

async function runProviderChat(
  params: StreamChatParams,
  clientTimeout: number | undefined,
  run: (signals: { user?: AbortSignal; timeout?: AbortSignal }) => Promise<string>,
): Promise<string> {
  const timeoutMs = resolveTimeout(params.timeoutMs, clientTimeout);
  const timeout = timeoutMs > 0 ? startTimeout(timeoutMs) : undefined;
  const signals = { user: params.signal, timeout: timeout?.signal };
  try {
    const stopped = haltError(signals);
    if (stopped) throw stopped;
    return await run(signals);
  } catch (error) {
    throw asAiError(haltError(signals) ?? error);
  } finally {
    timeout?.cancel();
  }
}

export function createAiClient(options: AiClientOptions): AiClient {
  switch (options.provider) {
    case "puter":
      return createPuterClient(options);
    case "space-bunny":
      return createSpaceBunnyClient(options);
    case "openrouter":
      return createOpenRouterClient(options);
    case "vercel-gateway":
      return createVercelGatewayClient(options);
    case "gemini":
      return createGeminiClient(options);
    case "llmapi":
      return createLlmapiClient(options);
    case "nvidia":
      return createNvidiaClient(options);
    default: {
      const never: never = options;
      return never;
    }
  }
}
