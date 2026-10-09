/**
 * OpenAI-compatible chat completions documented at https://docs.llmapi.ai/
 * as `POST https://api.llmapi.ai/v1/chat/completions` with `Authorization: Bearer $LLM_API_KEY`.
 *
 * https://llmapi.pro/docs documents a different host (`https://llmapi.pro/v1/chat/completions`).
 * Pass `url` on the client if that is the service to call.
 */
export const LLMAPI_URL = "https://api.llmapi.ai/v1/chat/completions";

/** Model id from the llmapi.ai getting-started request. */
export const DEFAULT_LLMAPI_MODEL = "gpt-4o";

export const LLMAPI_MISSING_KEY = "LLMAPI API key is not set. Set LLM_API_KEY.";

export function readLlmapiApiKey(env: { LLM_API_KEY?: string }): string | undefined {
  const key = env.LLM_API_KEY?.trim();
  return key || undefined;
}
