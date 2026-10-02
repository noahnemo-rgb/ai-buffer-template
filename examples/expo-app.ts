/**
 * Reference for an Expo app. The same import serves the website build and the phone build.
 * Install ai-buffer and expo-secure-store in the app. This file is not built here.
 *
 * Website build: Puter, using puterModel. The OpenRouter key is ignored.
 * Phone build: OpenRouter, using openrouterModel or the model saved on the device.
 * The key stays in the phone's secure store.
 */
import * as SecureStore from "expo-secure-store";
import { AiBufferError, createChatSession, createOpenRouterKeyStore, formatCodeContext } from "ai-buffer";
import { createExpoClient, expoPlatform } from "ai-buffer/expo";

const secrets = createOpenRouterKeyStore({
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  delete: (key) => SecureStore.deleteItemAsync(key),
});

export const ai = createExpoClient({
  puterModel: "openai/gpt-4o-mini",
  openrouterModel: "openai/gpt-4o-mini",
  getApiKey: () => secrets.getKey(),
  getOpenRouterModel: () => secrets.getModel(),
  appName: "Syntax Mobile IDE",
  siteUrl: "https://syntax.ide",
});

const chat = createChatSession(ai, {
  systemPrompt:
    "You are Syntax, an expert mobile coding assistant. Help the user write, understand, and debug code. " +
    "When you generate code, enclose it in a markdown fence and name the language.",
});

export async function askAboutFile(message: string, code: string, language: string): Promise<string> {
  try {
    return await chat.send(message, {
      context: formatCodeContext({ code, language }),
      onChunk: (text) => {
        console.log(text);
      },
    });
  } catch (error) {
    if (error instanceof AiBufferError && error.code === "signed_out") {
      await ai.signIn?.();
    }
    throw error;
  }
}

export function stopReply(): void {
  chat.stop();
}

export function settingsHint(): string {
  return expoPlatform === "web"
    ? "Sign in to Puter in the browser."
    : "Paste an OpenRouter key. It stays on this phone.";
}
