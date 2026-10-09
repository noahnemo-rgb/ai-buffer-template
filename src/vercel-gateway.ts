/** OpenAI-compatible chat completions on Vercel AI Gateway. */
export const VERCEL_GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";

/**
 * `openai/gpt-4o-mini` was in `GET https://ai-gateway.vercel.sh/v1/models` on 2026-10-09.
 * Pass `model` or `AI_GATEWAY_MODEL` for a different id from that list. Ids look like `provider/model`.
 */
export const DEFAULT_VERCEL_GATEWAY_MODEL = "openai/gpt-4o-mini";

export const VERCEL_GATEWAY_MISSING_KEY =
  "Vercel Gateway API key is not set. Set AI_GATEWAY_API_KEY, or VERCEL_OIDC_TOKEN on Vercel.";

/**
 * AI Gateway uses an API key when `AI_GATEWAY_API_KEY` is non-empty.
 * Otherwise it uses `VERCEL_OIDC_TOKEN`. A non-empty API key wins even when the OIDC token is also set.
 */
export function readGatewayApiKey(env: {
  AI_GATEWAY_API_KEY?: string;
  VERCEL_OIDC_TOKEN?: string;
}): string | undefined {
  const apiKey = env.AI_GATEWAY_API_KEY?.trim();
  if (apiKey) return apiKey;
  const oidc = env.VERCEL_OIDC_TOKEN?.trim();
  return oidc || undefined;
}
