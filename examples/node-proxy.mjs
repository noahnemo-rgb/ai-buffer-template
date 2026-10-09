/**
 * Browser-facing proxy. Owner keys stay in the server environment.
 * Run from a project that depends on ai-buffer.
 */
import { createServer } from "node:http";
import { createMemoryRateLimit, createNodeAiProxy } from "ai-buffer";

const server = createServer(
  createNodeAiProxy({
    allowedOrigins: ["https://app.example"],
    models: {
      openrouter: ["openai/gpt-4o-mini"],
      "space-bunny": ["stealth/space-bunny-alpha"],
      "vercel-gateway": ["openai/gpt-4o-mini"],
      gemini: ["gemini-3.8-flash"],
      nvidia: ["nvidia/nemotron-3-nano-30b-a3b"],
      llmapi: ["gpt-4o"],
    },
    rateLimit: createMemoryRateLimit({ limit: 30, windowMs: 60_000 }),
  }),
);

server.listen(8787);
