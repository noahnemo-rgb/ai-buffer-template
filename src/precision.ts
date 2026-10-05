import { AiBufferError } from "./errors.js";
import { SPACE_BUNNY_MODEL } from "./space-bunny.js";

/**
 * Precisions an open-weight host can serve without dropping to 8-bit or 4-bit weights.
 * OpenRouter's default routing prefers the cheaper host, which is often a quantized copy.
 */
export const FULL_PRECISION_QUANTIZATIONS = ["bf16", "fp16", "fp32"] as const;

export type FullPrecisionQuantization = (typeof FULL_PRECISION_QUANTIZATIONS)[number];

export interface FullPrecisionExtra {
  provider: { quantizations: FullPrecisionQuantization[] };
}

/**
 * JSON for the OpenRouter `extra` field. OpenRouter then skips hosts that only offer
 * a lower precision. If none of these precisions are available, the call fails.
 * Pass an open-weight model id such as a Llama or Qwen id.
 */
export function fullPrecisionExtra(model: string): FullPrecisionExtra {
  const id = model.trim();
  const reason = rejectionReason(id);
  if (reason) throw new AiBufferError("provider_error", reason);
  return { provider: { quantizations: [...FULL_PRECISION_QUANTIZATIONS] } };
}

function rejectionReason(id: string): string | undefined {
  if (!id) {
    return "Pass an open-weight model id to fullPrecisionExtra.";
  }
  const lower = id.toLowerCase();
  if (lower.endsWith(":free") || lower.endsWith(":floor")) {
    return "A :free or :floor model id stays on OpenRouter's cheap pool. fullPrecisionExtra applies to an open-weight id without that suffix.";
  }
  if (lower.startsWith("openai/") || lower.startsWith("anthropic/") || lower === SPACE_BUNNY_MODEL) {
    return "fullPrecisionExtra applies to open-weight models. OpenAI, Anthropic, and Space Bunny Alpha report precision as unknown, and this filter would reject them.";
  }
  return undefined;
}
