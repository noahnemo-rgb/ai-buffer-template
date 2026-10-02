import { openRouterHttpError } from "./errors.js";
import { readOpenRouterSse } from "./sse.js";
import { streamOpenRouterXhr } from "./openrouter-xhr.js";
import { OPENROUTER_URL, type OpenRouterStreamOptions } from "./openrouter-shared.js";

export { OPENROUTER_URL };
export type { OpenRouterStreamOptions };

export async function streamOpenRouter(options: OpenRouterStreamOptions): Promise<string> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new Error("OpenRouter API key is empty.");
  }
  if (options.transport === "xhr") {
    return streamOpenRouterXhr(options);
  }
  return streamOpenRouterFetch(options);
}

async function streamOpenRouterFetch(options: OpenRouterStreamOptions): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.apiKey.trim()}`,
    "Content-Type": "application/json",
  };
  if (options.siteUrl) headers["HTTP-Referer"] = options.siteUrl;
  if (options.appName) headers["X-Title"] = options.appName;

  const response = await fetchImpl(OPENROUTER_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      stream: true,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const body = await response.text();
    throw openRouterHttpError(response.status, body);
  }
  if (!response.body) {
    throw new Error("OpenRouter returned an empty response.");
  }
  return readOpenRouterSse(response.body, (text) => options.onChunk?.(text));
}
