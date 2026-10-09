import { streamChatCompletions, streamSsePost } from "./chat-completions.js";
import { asAiError, type AiErrorCode } from "./errors.js";
import { drainGeminiSse, geminiRequestBody, geminiStreamUrl } from "./gemini.js";
import { LLMAPI_URL } from "./llmapi.js";
import { buildMessages, buildUserText } from "./messages.js";
import { NVIDIA_URL } from "./nvidia.js";
import { OPENROUTER_URL } from "./openrouter.js";
import { isAiProviderId, type AiProviderId } from "./providers.js";
import { looksLikeSecret, redactSecrets } from "./redact.js";
import { SPACE_BUNNY_MODEL, spaceBunnyExtra } from "./space-bunny.js";
import type { ChatMessage, ChatTurn } from "./types.js";
import { VERCEL_GATEWAY_URL } from "./vercel-gateway.js";
import type { KeyVault, VaultStatus } from "./vault.js";

/** Providers that can run behind the server proxy. Puter stays in the browser. */
export const SERVER_PROXY_PROVIDERS = [
  "openrouter",
  "space-bunny",
  "vercel-gateway",
  "gemini",
  "nvidia",
  "llmapi",
] as const;

export type ServerProxyProvider = (typeof SERVER_PROXY_PROVIDERS)[number];

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,200}$/;

export interface ProxyCaller {
  ip: string | null;
  userId: string | null;
  provider: string;
}

export interface AiProxyOptions {
  /** Exact `Origin` values. A browser request from any other origin is rejected. */
  allowedOrigins: readonly string[];
  /** Allow a request that sends no Origin header. Leave this false for a browser-facing proxy. */
  allowMissingOrigin?: boolean;
  /** Defaults to every server provider. `puter` is never accepted. */
  providers?: readonly ServerProxyProvider[];
  /** When set for a provider, the model must be in the list. */
  models?: Partial<Record<ServerProxyProvider, readonly string[]>>;
  rateLimit?: (caller: ProxyCaller) => boolean | Promise<boolean>;
  /** Defaults to `process.env`. Tests can pass a plain object. */
  env?: Record<string, string | undefined>;
  readOwnerKey?: (provider: ServerProxyProvider) => string | null | Promise<string | null>;
  /** When false, a `byok` field on the request is ignored. Default is true. */
  allowByok?: boolean;
  vault?: KeyVault;
  /** App session. The proxy does not trust a user id sent in the JSON body. */
  resolveUser?: (request: Request) => string | null | Promise<string | null>;
  appName?: string;
  siteUrl?: string;
  fetchImpl?: typeof fetch;
  clientIp?: (request: Request) => string | null;
}

export function createMemoryRateLimit(options?: { limit?: number; windowMs?: number }) {
  const limit = options?.limit ?? 30;
  const windowMs = options?.windowMs ?? 60_000;
  const hits = new Map<string, number[]>();
  return function allow(caller: ProxyCaller): boolean {
    const id = `${caller.userId ?? caller.ip ?? "unknown"}:${caller.provider}`;
    const now = Date.now();
    const recent = (hits.get(id) ?? []).filter((time) => now - time < windowMs);
    if (recent.length >= limit) {
      hits.set(id, recent);
      return false;
    }
    recent.push(now);
    hits.set(id, recent);
    return true;
  };
}

export function readOwnerApiKey(
  provider: ServerProxyProvider,
  env: Record<string, string | undefined>,
): string | null {
  const pick = (name: string) => {
    const value = env[name]?.trim();
    return value ? value : null;
  };
  switch (provider) {
    case "openrouter":
    case "space-bunny":
      return pick("OPENROUTER_API_KEY");
    case "vercel-gateway":
      return pick("AI_GATEWAY_API_KEY") ?? pick("VERCEL_OIDC_TOKEN");
    case "gemini":
      return pick("GEMINI_API_KEY");
    case "nvidia":
      return pick("NVIDIA_API_KEY");
    case "llmapi":
      return pick("LLM_API_KEY");
    default: {
      const never: never = provider;
      return never;
    }
  }
}

export function createAiProxy(options: AiProxyOptions): (request: Request) => Promise<Response> {
  const allowed = new Set<string>(options.providers ?? SERVER_PROXY_PROVIDERS);
  return async function handle(request: Request): Promise<Response> {
    if (request.method !== "POST") return jsonError(405, "provider_error", "Method is not allowed.");
    const originError = checkOrigin(request, options.allowedOrigins, options.allowMissingOrigin);
    if (originError) return originError;

    let payload: Record<string, unknown>;
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonError(400, "provider_error", "Request body is not valid JSON.");
    }

    const provider = readProvider(payload.provider, allowed);
    if (!provider) return jsonError(400, "provider_error", "Provider is not allowed.");

    const model = readModel(provider, payload.model, options.models);
    if (!model) return jsonError(400, "provider_error", "Model is not allowed.");

    const userId = options.resolveUser ? (await options.resolveUser(request))?.trim() || null : null;
    const ip = options.clientIp?.(request) ?? requestIp(request);
    if (options.rateLimit) {
      const permitted = await options.rateLimit({ ip, userId, provider });
      if (!permitted) {
        return jsonError(429, "rate_limited", "Too many AI requests. Wait a few seconds and try again.");
      }
    }

    const byok = options.allowByok === false || typeof payload.byok !== "string" ? "" : payload.byok.trim();
    let apiKey = byok;
    if (!apiKey && options.vault && userId) {
      apiKey = (await options.vault.read(userId, provider))?.trim() ?? "";
    }
    if (!apiKey) {
      const env = options.env ?? process.env;
      const owner = options.readOwnerKey ? await options.readOwnerKey(provider) : readOwnerApiKey(provider, env);
      apiKey = owner?.trim() ?? "";
    }
    if (!apiKey) return jsonError(400, "missing_key", "API key is not configured on the server.");

    let messages: ChatMessage[];
    try {
      messages = readMessages(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request messages are not valid.";
      return jsonError(400, "provider_error", message);
    }

    return streamResponse({
      provider,
      model,
      messages,
      apiKey,
      appName: options.appName,
      siteUrl: options.siteUrl,
      fetchImpl: options.fetchImpl,
    });
  };
}

export interface VaultHandlerOptions {
  vault: KeyVault;
  allowedOrigins: readonly string[];
  allowMissingOrigin?: boolean;
  resolveUser: (request: Request) => string | null | Promise<string | null>;
  rateLimit?: (caller: ProxyCaller) => boolean | Promise<boolean>;
  clientIp?: (request: Request) => string | null;
}

/** Accepts a user key once and returns `{ configured, hint }`. The full key is not in the response. */
export function createVaultHandler(options: VaultHandlerOptions): (request: Request) => Promise<Response> {
  return async function handle(request: Request): Promise<Response> {
    const originError = checkOrigin(request, options.allowedOrigins, options.allowMissingOrigin);
    if (originError) return originError;
    const userId = (await options.resolveUser(request))?.trim() || "";
    if (!userId) return jsonError(401, "signed_out", "Sign in required.");

    const ip = options.clientIp?.(request) ?? requestIp(request);
    if (request.method === "GET" || request.method === "DELETE") {
      const provider = new URL(request.url).searchParams.get("provider")?.trim() ?? "";
      if (!isServerProvider(provider)) return jsonError(400, "provider_error", "Provider is not allowed.");
      if (options.rateLimit) {
        const permitted = await options.rateLimit({ ip, userId, provider });
        if (!permitted) return jsonError(429, "rate_limited", "Too many AI requests. Wait a few seconds and try again.");
      }
      if (request.method === "DELETE") {
        await options.vault.delete(userId, provider);
        return jsonStatus({ configured: false, hint: "" });
      }
      return jsonStatus(await options.vault.status(userId, provider));
    }

    if (request.method !== "POST") return jsonError(405, "provider_error", "Method is not allowed.");
    let payload: Record<string, unknown>;
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonError(400, "provider_error", "Request body is not valid JSON.");
    }
    const provider = typeof payload.provider === "string" ? payload.provider.trim() : "";
    if (!isServerProvider(provider)) return jsonError(400, "provider_error", "Provider is not allowed.");
    if (options.rateLimit) {
      const permitted = await options.rateLimit({ ip, userId, provider });
      if (!permitted) return jsonError(429, "rate_limited", "Too many AI requests. Wait a few seconds and try again.");
    }
    const apiKey = typeof payload.apiKey === "string" ? payload.apiKey.trim() : "";
    if (!apiKey) return jsonError(400, "missing_key", "API key is not configured on the server.");
    try {
      return jsonStatus(await options.vault.put(userId, provider, apiKey));
    } catch {
      return jsonError(400, "provider_error", "The key could not be stored.");
    }
  };
}

/** Enough of a Node request to read the body. Structural so this file does not import `node:http`. */
export interface NodeRequestLike {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined> & { host?: string };
  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array | string>;
}

/** Enough of a Node response to write a status, headers, and a body. */
export interface NodeResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): void;
  write(chunk: Uint8Array): void;
  end(): void;
}

/** Node `http` listener. Mount it on the route that browsers call. */
export function createNodeAiProxy(options: AiProxyOptions) {
  const handle = createAiProxy(options);
  return async function nodeHandler(req: NodeRequestLike, res: NodeResponseLike): Promise<void> {
    await writeNodeResponse(req, res, handle);
  };
}

export function createNodeVaultHandler(options: VaultHandlerOptions) {
  const handle = createVaultHandler(options);
  return async function nodeHandler(req: NodeRequestLike, res: NodeResponseLike): Promise<void> {
    await writeNodeResponse(req, res, handle);
  };
}

function isServerProvider(value: string): value is ServerProxyProvider {
  return (SERVER_PROXY_PROVIDERS as readonly string[]).includes(value);
}

function readProvider(value: unknown, allowed: Set<string>): ServerProxyProvider | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!isAiProviderId(id) || id === "puter" || !allowed.has(id)) return null;
  return id;
}

function readModel(
  provider: ServerProxyProvider,
  value: unknown,
  allowlist: AiProxyOptions["models"],
): string | null {
  const model = provider === "space-bunny" ? SPACE_BUNNY_MODEL : typeof value === "string" ? value.trim() : "";
  if (!model || !MODEL_ID.test(model) || looksLikeSecret(model)) return null;
  const list = allowlist?.[provider];
  if (list && !list.includes(model)) return null;
  return model;
}

function readMessages(payload: Record<string, unknown>): ChatMessage[] {
  if (Array.isArray(payload.messages)) {
    const messages: ChatMessage[] = [];
    for (const item of payload.messages) {
      if (!item || typeof item !== "object") throw new Error("Request messages are not valid.");
      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;
      if ((role !== "system" && role !== "user" && role !== "assistant") || typeof content !== "string") {
        throw new Error("Request messages are not valid.");
      }
      messages.push({ role, content });
    }
    if (!messages.length) throw new Error("Request messages are not valid.");
    return messages;
  }
  if (typeof payload.message === "string" && payload.message.trim()) {
    const history = Array.isArray(payload.history) ? (payload.history as ChatTurn[]) : [];
    return buildMessages({
      systemPrompt: typeof payload.systemPrompt === "string" ? payload.systemPrompt : undefined,
      history,
      userText: buildUserText(payload.message, typeof payload.context === "string" ? payload.context : undefined),
    });
  }
  throw new Error("Request messages are not valid.");
}

async function streamResponse(input: {
  provider: ServerProxyProvider;
  model: string;
  messages: ChatMessage[];
  apiKey: string;
  appName?: string;
  siteUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<Response> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (value: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
      };
      try {
        if (input.provider === "gemini") {
          await streamSsePost({
            url: geminiStreamUrl(input.model),
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
              "x-goog-api-key": input.apiKey,
            },
            body: geminiRequestBody(input.messages),
            providerName: "Gemini API",
            fetchImpl: input.fetchImpl,
            onChunk: (text) => send({ text }),
            drain: drainGeminiSse,
          });
        } else {
          await streamChatCompletions({
            url: urlFor(input.provider),
            apiKey: input.apiKey,
            model: input.model,
            messages: input.messages,
            providerName: input.provider,
            missingKeyMessage: "API key is not configured on the server.",
            siteUrl: input.siteUrl,
            appName: input.appName,
            fetchImpl: input.fetchImpl,
            onChunk: (text) => send({ text }),
            extra: input.provider === "space-bunny" ? spaceBunnyExtra() : undefined,
          });
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        const ai = asAiError(error);
        send({ error: { code: ai.code, message: ai.message } });
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}

function urlFor(provider: Exclude<ServerProxyProvider, "gemini">): string {
  switch (provider) {
    case "openrouter":
    case "space-bunny":
      return OPENROUTER_URL;
    case "vercel-gateway":
      return VERCEL_GATEWAY_URL;
    case "nvidia":
      return NVIDIA_URL;
    case "llmapi":
      return LLMAPI_URL;
    default: {
      const never: never = provider;
      return never;
    }
  }
}

function checkOrigin(
  request: Request,
  allowedOrigins: readonly string[],
  allowMissingOrigin: boolean | undefined,
): Response | null {
  const origin = request.headers.get("origin");
  if (origin) {
    return allowedOrigins.includes(origin) ? null : jsonError(403, "provider_error", "Origin is not allowed.");
  }
  return allowMissingOrigin ? null : jsonError(403, "provider_error", "Origin is not allowed.");
}

function requestIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  return forwarded.split(",")[0]?.trim() || null;
}

function jsonError(status: number, code: AiErrorCode, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message: redactSecrets(message) } }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function jsonStatus(status: VaultStatus): Response {
  return new Response(JSON.stringify({ configured: status.configured, hint: status.hint }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function writeNodeResponse(
  req: NodeRequestLike,
  res: NodeResponseLike,
  handle: (request: Request) => Promise<Response>,
): Promise<void> {
  const host = req.headers.host ?? "localhost";
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  const request = new Request(`http://${host}${req.url ?? "/"}`, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
  });
  const response = await handle(request);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key === "transfer-encoding") return;
    res.setHeader(key, value);
  });
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  while (true) {
    const step = await reader.read();
    if (step.done) break;
    res.write(Buffer.from(step.value));
  }
  res.end();
}

export type { AiProviderId };
