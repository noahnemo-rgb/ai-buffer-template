import { AiBufferError } from "./errors.js";

/** OpenRouter model id. OpenRouter forwards this stealth model to its one provider. */
export const SPACE_BUNNY_MODEL = "stealth/space-bunny-alpha";

export const SPACE_BUNNY_REASONING_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

export type SpaceBunnyReasoningEffort = (typeof SPACE_BUNNY_REASONING_EFFORTS)[number];

export const DEFAULT_SPACE_BUNNY_EFFORT: SpaceBunnyReasoningEffort = "medium";

export function spaceBunnyExtra(effort: SpaceBunnyReasoningEffort = DEFAULT_SPACE_BUNNY_EFFORT): {
  reasoning: { effort: SpaceBunnyReasoningEffort };
} {
  if (!SPACE_BUNNY_REASONING_EFFORTS.includes(effort)) {
    throw new AiBufferError(
      "provider_error",
      `Reasoning effort must be one of ${SPACE_BUNNY_REASONING_EFFORTS.join(", ")}.`,
    );
  }
  return { reasoning: { effort } };
}
