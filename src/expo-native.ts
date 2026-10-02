import { createOpenRouterClient } from "./client.js";
import type { ExpoClientOptions } from "./expo-options.js";
import type { AiClient } from "./types.js";

export type { ExpoClientOptions } from "./expo-options.js";

/** Phone builds use OpenRouter. Website builds report `"web"` from the same import. */
export const expoPlatform: "web" | "native" = "native";

export function createExpoClient(options: ExpoClientOptions = {}): AiClient {
  return createOpenRouterClient({
    getApiKey: options.getApiKey ?? (async () => null),
    getModel: options.getOpenRouterModel,
    model: options.openrouterModel,
    defaultSystemPrompt: options.defaultSystemPrompt,
    siteUrl: options.siteUrl,
    appName: options.appName,
    transport: "xhr",
    timeoutMs: options.timeoutMs,
  });
}
