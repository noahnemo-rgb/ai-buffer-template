/**
 * NVIDIA NIM chat completions for Nemotron and the other models on the same host.
 * POST https://integrate.api.nvidia.com/v1/chat/completions
 * Authorization: Bearer $NVIDIA_API_KEY
 * Docs: https://docs.api.nvidia.com/nim/reference/llm-apis
 * Auth and base URL: https://build.nvidia.com/llms.txt
 */
export const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

/**
 * Nemotron chat model listed at https://docs.api.nvidia.com/nim/reference/llm-apis
 * (checked 2026-10-09). Pass `model` or `NVIDIA_MODEL` for another id from that list.
 */
export const DEFAULT_NVIDIA_MODEL = "nvidia/nemotron-3-nano-30b-a3b";

export const NVIDIA_MISSING_KEY = "NVIDIA API key is not set. Set NVIDIA_API_KEY.";

export function readNvidiaApiKey(env: { NVIDIA_API_KEY?: string }): string | undefined {
  const key = env.NVIDIA_API_KEY?.trim();
  return key || undefined;
}
