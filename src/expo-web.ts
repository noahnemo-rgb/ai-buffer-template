import { createPuterClient } from "./client.js";
import type { ExpoClientOptions } from "./expo-options.js";
import type { AiClient } from "./types.js";

export type { ExpoClientOptions } from "./expo-options.js";

/** Website builds use Puter. Phone builds report `"native"` from the same import. */
export const expoPlatform: "web" | "native" = "web";

export function createExpoClient(options: ExpoClientOptions = {}): AiClient {
  return createPuterClient({
    model: options.puterModel,
    defaultSystemPrompt: options.defaultSystemPrompt,
    loadPuter: options.loadPuter,
    timeoutMs: options.timeoutMs,
  });
}
