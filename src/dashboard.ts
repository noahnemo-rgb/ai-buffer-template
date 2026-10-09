import { createAiClient, type AiClientOptions } from "./client.js";
import { AiBufferError } from "./errors.js";
import { createCallRouter, DEFAULT_CALL_ORDER, type CallRouter, type CallRouterOptions } from "./router.js";
import { defaultModelFor, isAiProviderId, PROVIDER_CATALOG, type AiProviderId } from "./providers.js";
import type { AiClient, SecretStore } from "./types.js";

/** Visible dashboard words besides the provider names in `PROVIDER_CATALOG`. */
export const DASHBOARD_LABELS = {
  model: "model",
  active: "active",
  configured: "configured",
  notConfigured: "not configured",
} as const;

export interface ProviderProbe {
  /** Puter `auth.isSignedIn()`. */
  puterSignedIn?: boolean;
  /** An OpenRouter key is saved. Space Bunny Alpha uses the same key. */
  openrouterKey?: boolean;
  /** `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` is available. */
  gatewayKey?: boolean;
  /** `GEMINI_API_KEY` is available. */
  geminiKey?: boolean;
  /** `LLM_API_KEY` is available. */
  llmapiKey?: boolean;
}

export interface DashboardRow {
  id: AiProviderId;
  label: string;
  configured: boolean;
  status: typeof DASHBOARD_LABELS.configured | typeof DASHBOARD_LABELS.notConfigured;
  /** `"active"` on the selected row, otherwise `""`. */
  activeLabel: "" | typeof DASHBOARD_LABELS.active;
  modelLabel: typeof DASHBOARD_LABELS.model;
  model: string;
}

export interface ProviderSelection {
  provider: AiProviderId;
  model: string;
}

export interface ProviderSelectionStore {
  getProvider: () => Promise<AiProviderId | null>;
  setProvider: (id: AiProviderId) => Promise<void>;
  getModel: (id: AiProviderId) => Promise<string>;
  setModel: (id: AiProviderId, value: string) => Promise<void>;
  getSelection: () => Promise<ProviderSelection | null>;
}

const PROVIDER_KEY = "ai-buffer.active_provider";

function modelKey(id: AiProviderId): string {
  return `ai-buffer.model.${id}`;
}

/**
 * Saves the active provider and each provider's model in the app's store.
 * Phones can pass expo-secure-store. Tests can pass `createMemoryStore`.
 * This store does not save API keys.
 */
export function createProviderSelectionStore(store: SecretStore): ProviderSelectionStore {
  return {
    getProvider: async () => {
      const value = (await store.get(PROVIDER_KEY))?.trim() ?? "";
      return isAiProviderId(value) ? value : null;
    },
    setProvider: (id) => Promise.resolve(store.set(PROVIDER_KEY, id)),
    getModel: async (id) => {
      const value = (await store.get(modelKey(id)))?.trim();
      return value || defaultModelFor(id);
    },
    setModel: async (id, value) => {
      const trimmed = value.trim();
      if (!trimmed) {
        await store.delete(modelKey(id));
        return;
      }
      await store.set(modelKey(id), trimmed);
    },
    getSelection: async () => {
      const provider = (await store.get(PROVIDER_KEY))?.trim() ?? "";
      if (!isAiProviderId(provider)) return null;
      const model = (await store.get(modelKey(provider)))?.trim() || defaultModelFor(provider);
      return { provider, model };
    },
  };
}

/** Laya stays unconfigured until a service is wired in `src/laya.ts`. */
export function isProviderConfigured(id: AiProviderId, probe: ProviderProbe): boolean {
  switch (id) {
    case "puter":
      return Boolean(probe.puterSignedIn);
    case "openrouter":
    case "space-bunny":
      return Boolean(probe.openrouterKey);
    case "vercel-gateway":
      return Boolean(probe.gatewayKey);
    case "gemini":
      return Boolean(probe.geminiKey);
    case "llmapi":
      return Boolean(probe.llmapiKey);
    case "laya":
      return false;
    default: {
      const never: never = id;
      return never;
    }
  }
}

export async function loadDashboard(store: ProviderSelectionStore, probe: ProviderProbe = {}): Promise<DashboardRow[]> {
  const active = await store.getProvider();
  const rows: DashboardRow[] = [];
  for (const item of PROVIDER_CATALOG) {
    const configured = isProviderConfigured(item.id, probe);
    rows.push({
      id: item.id,
      label: item.label,
      configured,
      status: configured ? DASHBOARD_LABELS.configured : DASHBOARD_LABELS.notConfigured,
      activeLabel: active === item.id ? DASHBOARD_LABELS.active : "",
      modelLabel: DASHBOARD_LABELS.model,
      model: await store.getModel(item.id),
    });
  }
  return rows;
}

export function createClientFromSelection(selection: ProviderSelection, options: CallRouterOptions): AiClient {
  const model = selection.model.trim();
  const clientOptions = optionsForSelection(selection.provider, model, options);
  return createAiClient(clientOptions);
}

export function createRouterFromSelection(selection: ProviderSelection, options: CallRouterOptions = {}): CallRouter {
  const model = selection.model.trim();
  const routed = applyModel(selection.provider, model, options);
  const rest = (routed.order ?? DEFAULT_CALL_ORDER).filter((id) => id !== selection.provider);
  return createCallRouter({ ...routed, order: [selection.provider, ...rest] });
}

function optionsForSelection(provider: AiProviderId, model: string, options: CallRouterOptions): AiClientOptions {
  switch (provider) {
    case "puter":
      return { provider: "puter", ...options.puter, ...(model ? { model } : {}) };
    case "openrouter":
      if (!options.openrouter) missingRoute(provider);
      return { provider: "openrouter", ...options.openrouter, ...(model ? { model } : {}) };
    case "space-bunny":
      if (!options.spaceBunny) missingRoute(provider);
      return { provider: "space-bunny", ...options.spaceBunny };
    case "vercel-gateway":
      if (!options.vercelGateway) missingRoute(provider);
      return { provider: "vercel-gateway", ...options.vercelGateway, ...(model ? { model } : {}) };
    case "gemini":
      if (!options.gemini) missingRoute(provider);
      return { provider: "gemini", ...options.gemini, ...(model ? { model } : {}) };
    case "llmapi":
      if (!options.llmapi) missingRoute(provider);
      return { provider: "llmapi", ...options.llmapi, ...(model ? { model } : {}) };
    case "laya":
      return { provider: "laya", ...options.laya };
    default: {
      const never: never = provider;
      return never;
    }
  }
}

function applyModel(provider: AiProviderId, model: string, options: CallRouterOptions): CallRouterOptions {
  if (!model || provider === "space-bunny" || provider === "laya") return options;
  switch (provider) {
    case "puter":
      return { ...options, puter: { ...options.puter, model } };
    case "openrouter":
      return options.openrouter ? { ...options, openrouter: { ...options.openrouter, model } } : options;
    case "vercel-gateway":
      return options.vercelGateway ? { ...options, vercelGateway: { ...options.vercelGateway, model } } : options;
    case "gemini":
      return options.gemini ? { ...options, gemini: { ...options.gemini, model } } : options;
    case "llmapi":
      return options.llmapi ? { ...options, llmapi: { ...options.llmapi, model } } : options;
    default:
      return options;
  }
}

function missingRoute(id: AiProviderId): never {
  throw new AiBufferError("provider_error", `The ${id} route is not configured on this router.`);
}
