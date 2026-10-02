/**
 * Reference for an Expo phone screen.
 * Install ai-buffer and expo-secure-store in the app. This file is not built here.
 */
import * as SecureStore from "expo-secure-store";
import { createAiClient, createOpenRouterKeyStore, formatCodeContext } from "ai-buffer";

const secrets = createOpenRouterKeyStore({
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  delete: (key) => SecureStore.deleteItemAsync(key),
});

export const ai = createAiClient({
  provider: "openrouter",
  transport: "xhr",
  getApiKey: () => secrets.getKey(),
  getModel: () => secrets.getModel(),
  appName: "Syntax Mobile IDE",
  siteUrl: "https://syntax.ide",
});

export async function askAboutFile(message: string, code: string, language: string): Promise<string> {
  return ai.streamChat({
    message,
    systemPrompt:
      "You are Syntax, an expert mobile coding assistant. Help the user write, understand, and debug code. " +
      "When you generate code, enclose it in a markdown fence and name the language.",
    context: formatCodeContext({ code, language }),
    onChunk: (text) => {
      console.log(text);
    },
  });
}
