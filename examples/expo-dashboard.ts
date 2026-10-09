/**
 * Reference for an Expo screen. This file is not built here.
 * The screen prints the dashboard rows. It does not add other words.
 * The key stays in expo-secure-store. This store saves the provider and the model only.
 */
import * as SecureStore from "expo-secure-store";
import {
  createClientFromSelection,
  createProviderSelectionStore,
  loadDashboard,
  type ProviderProbe,
} from "ai-buffer";

const selection = createProviderSelectionStore({
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  delete: (key) => SecureStore.deleteItemAsync(key),
});

export async function dashboardRows(probe: ProviderProbe) {
  return loadDashboard(selection, probe);
}

export async function clientForSavedProvider(probe: ProviderProbe) {
  const chosen = await selection.getSelection();
  if (!chosen) return null;
  return createClientFromSelection(chosen, {
    openrouter: { getApiKey: () => SecureStore.getItemAsync("ai-buffer.openrouter_key"), transport: "xhr" },
    spaceBunny: { getApiKey: () => SecureStore.getItemAsync("ai-buffer.openrouter_key"), transport: "xhr" },
    vercelGateway: { getApiKey: () => SecureStore.getItemAsync("ai-buffer.gateway_key"), transport: "xhr" },
    gemini: { getApiKey: () => SecureStore.getItemAsync("ai-buffer.gemini_key"), transport: "xhr" },
    nvidia: { getApiKey: () => SecureStore.getItemAsync("ai-buffer.nvidia_key"), transport: "xhr" },
    llmapi: { getApiKey: () => SecureStore.getItemAsync("ai-buffer.llmapi_key"), transport: "xhr" },
  });
}

export async function chooseProvider(id: Parameters<typeof selection.setProvider>[0], probe: ProviderProbe) {
  await selection.setProvider(id);
  return dashboardRows(probe);
}
