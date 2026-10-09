import {
  createGeminiClient,
  createLlmapiClient,
  createNvidiaClient,
  createOpenRouterClient,
  createPuterClient,
  createSpaceBunnyClient,
  createVercelGatewayClient,
} from "./client.js";
import type {
  GeminiClientOptions,
  LlmapiClientOptions,
  NvidiaClientOptions,
  OpenRouterClientOptions,
  PuterClientOptions,
  SpaceBunnyClientOptions,
  VercelGatewayClientOptions,
} from "./client.js";
import { AiBufferError, asAiError } from "./errors.js";
import type { AiProviderId } from "./providers.js";
import type { AiClient, AiProviderInfo, StreamChatParams } from "./types.js";

export type CallRoute = AiProviderId;

const FAILOVER_CODES = new Set(["missing_key", "signed_out", "rate_limited", "payment_required", "provider_error"]);

/**
 * Used when a call does not name a route.
 * Space Bunny Alpha, then OpenRouter, then Puter, then the other configured routes.
 * A route that was not passed in is skipped.
 */
export const DEFAULT_CALL_ORDER: CallRoute[] = [
  "space-bunny",
  "openrouter",
  "puter",
  "vercel-gateway",
  "gemini",
  "nvidia",
  "llmapi",
];

export interface CallRouterOptions {
  puter?: PuterClientOptions;
  openrouter?: OpenRouterClientOptions;
  spaceBunny?: SpaceBunnyClientOptions;
  vercelGateway?: VercelGatewayClientOptions;
  gemini?: GeminiClientOptions;
  nvidia?: NvidiaClientOptions;
  llmapi?: LlmapiClientOptions;
  /** Used when a call does not name a route. Defaults to `DEFAULT_CALL_ORDER`. */
  order?: CallRoute[];
}

export interface RoutedChatParams extends StreamChatParams {
  /** Send this call to one route. */
  route?: CallRoute;
  /** Try these routes in order. A named `route` wins. */
  order?: CallRoute[];
}

export interface CallRouter {
  route(id: CallRoute): AiClient;
  getInfo(): Promise<Partial<Record<CallRoute, AiProviderInfo>>>;
  streamChat(params: RoutedChatParams): Promise<string>;
}

function canFailover(error: unknown): boolean {
  return error instanceof AiBufferError && FAILOVER_CODES.has(error.code);
}

export function createCallRouter(options: CallRouterOptions = {}): CallRouter {
  const clients: Partial<Record<CallRoute, AiClient>> = {};
  if (options.puter) clients.puter = createPuterClient(options.puter);
  if (options.openrouter) clients.openrouter = createOpenRouterClient(options.openrouter);
  if (options.spaceBunny) clients["space-bunny"] = createSpaceBunnyClient(options.spaceBunny);
  if (options.vercelGateway) clients["vercel-gateway"] = createVercelGatewayClient(options.vercelGateway);
  if (options.gemini) clients.gemini = createGeminiClient(options.gemini);
  if (options.nvidia) clients.nvidia = createNvidiaClient(options.nvidia);
  if (options.llmapi) clients.llmapi = createLlmapiClient(options.llmapi);

  const defaultOrder = (options.order ?? DEFAULT_CALL_ORDER).filter((id) => clients[id]);

  return {
    route(id) {
      const client = clients[id];
      if (!client) {
        throw new AiBufferError("provider_error", `The ${id} route is not configured on this router.`);
      }
      return client;
    },
    async getInfo() {
      const info: Partial<Record<CallRoute, AiProviderInfo>> = {};
      for (const id of Object.keys(clients) as CallRoute[]) {
        info[id] = await clients[id]!.getInfo();
      }
      return info;
    },
    async streamChat(params) {
      const { route, order, ...chat } = params;
      const plan = route ? [route] : order ?? defaultOrder;
      if (plan.length === 0) {
        throw new AiBufferError("provider_error", "No call route is configured.");
      }
      let last: unknown;
      for (let index = 0; index < plan.length; index += 1) {
        const id = plan[index];
        const client = clients[id];
        if (!client) {
          if (route) {
            throw new AiBufferError("provider_error", `The ${id} route is not configured on this router.`);
          }
          continue;
        }
        try {
          return await client.streamChat(chat);
        } catch (error) {
          const wrapped = asAiError(error);
          const more = index < plan.length - 1 && plan.slice(index + 1).some((next) => clients[next]);
          if (!canFailover(wrapped) || !more) throw wrapped;
          last = wrapped;
        }
      }
      throw asAiError(last ?? new AiBufferError("provider_error", "No call route is configured."));
    },
  };
}
