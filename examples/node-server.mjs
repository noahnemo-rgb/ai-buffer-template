/**
 * Reference for a Node server.
 * Run from a project that depends on ai-buffer, with OPENROUTER_API_KEY set.
 */
import { createAiClient } from "ai-buffer";

const ai = createAiClient({
  provider: "openrouter",
  getApiKey: () => process.env.OPENROUTER_API_KEY,
  model: process.env.OPENROUTER_MODEL,
  appName: "My Server App",
  siteUrl: "https://example.com",
});

const reply = await ai.streamChat({
  message: "Summarize this project in two sentences.",
  systemPrompt: "You write short project summaries.",
  onChunk: (text) => process.stdout.write(text),
});

console.log("\n\nFull reply length:", reply.length);
