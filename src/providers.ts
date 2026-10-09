import { DEFAULT_MODEL } from "./messages.js";
import { DEFAULT_GEMINI_MODEL } from "./gemini.js";
import { DEFAULT_LLMAPI_MODEL } from "./llmapi.js";
import { DEFAULT_NVIDIA_MODEL } from "./nvidia.js";
import { SPACE_BUNNY_MODEL } from "./space-bunny.js";

/** Provider ids used by `createAiClient` and the options dashboard. */
export const PROVIDER_CATALOG = [
  { id: "puter", label: "Puter" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "space-bunny", label: "Space Bunny Alpha" },
  { id: "vercel-gateway", label: "Vercel Gateway" },
  { id: "gemini", label: "Gemini API" },
  { id: "nvidia", label: "NVIDIA NIM" },
  { id: "llmapi", label: "LLMAPI" },
] as const;

export type AiProviderId = (typeof PROVIDER_CATALOG)[number]["id"];

export function isAiProviderId(value: string): value is AiProviderId {
  return PROVIDER_CATALOG.some((item) => item.id === value);
}

export function providerLabel(id: AiProviderId): string {
  const item = PROVIDER_CATALOG.find((entry) => entry.id === id);
  if (!item) return id;
  return item.label;
}

/** Model id stored when the dashboard has no saved model for that provider. */
export function defaultModelFor(id: AiProviderId): string {
  switch (id) {
    case "puter":
    case "openrouter":
    case "vercel-gateway":
      return DEFAULT_MODEL;
    case "space-bunny":
      return SPACE_BUNNY_MODEL;
    case "gemini":
      return DEFAULT_GEMINI_MODEL;
    case "llmapi":
      return DEFAULT_LLMAPI_MODEL;
    case "nvidia":
      return DEFAULT_NVIDIA_MODEL;
    default: {
      const never: never = id;
      return never;
    }
  }
}
