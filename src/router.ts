import { createOpenRouterClient, createPuterClient, createSpaceBunnyClient } from "./client.js";
import type { OpenRouterClientOptions, PuterClientOptions, SpaceBunnyClientOptions } from "./client.js";
import { AiBufferError, asAiError } from "./errors.js";
import type { AiClient, AiProviderInfo, StreamChatParams } from "./types.js";

export type CallRoute = "puter" | "openrouter" | "space-bunny";

const FAILOVER_CODES = new Set(["missing_key", "signed_out", "rate_limited", "payment_required", "provider_error"]);

export interface CallRouterOptions {
  puter?: PuterClientOptions;
  openrouter?: OpenRouterClientOptions;
  spaceBunny?: SpaceBunnyClientOptions;
  /**
   * Used when a call does not name a route.
   * The default is Space Bunny Alpha, then OpenRouter, then Puter, skipping any route that was not configured.
   */
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

  const defaultOrder = (options.order ?? ["space-bunny", "openrouter", "puter"]).filter((id) => clients[id]);

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
