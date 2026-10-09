export type AiErrorCode =
  | "signed_out"
  | "missing_key"
  | "rate_limited"
  | "payment_required"
  | "cancelled"
  | "empty_message"
  | "busy"
  | "provider_error";

export class AiBufferError extends Error {
  readonly code: AiErrorCode;

  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.name = "AiBufferError";
    this.code = code;
  }
}

export function openRouterHttpError(status: number, body: string): Error {
  return providerHttpError("OpenRouter", status, body);
}

export function providerHttpError(provider: string, status: number, body: string): Error {
  const error = new Error(`${provider} HTTP ${status}: ${body.slice(0, 300)}`) as Error & { status: number };
  error.status = status;
  return error;
}

export function formatAiError(error: unknown): string {
  if (error instanceof AiBufferError) return error.message;
  if (error instanceof Error && error.name === "TimeoutError") {
    return "The AI request timed out.";
  }
  if (error instanceof Error && error.name === "AbortError") {
    return "The AI request was cancelled.";
  }
  const err = error as { code?: string; status?: number; message?: string };
  if (err?.code === "too_many_requests" || err?.status === 429) {
    return "Too many AI requests. Wait a few seconds and try again.";
  }
  if (err?.code === "insufficient_funds" || err?.status === 402) {
    return "Your AI allowance is exhausted. Add credits or upgrade your provider account, then try again.";
  }
  if (err?.code === "subscription_required") {
    return "This AI feature requires a paid provider plan.";
  }
  if (typeof err?.message === "string" && err.message.trim()) {
    return err.message;
  }
  return String(error);
}

export function codeFor(error: unknown): AiErrorCode {
  if (error instanceof AiBufferError) return error.code;
  const err = error as { code?: string; status?: number; name?: string };
  if (err?.name === "AbortError" || err?.name === "TimeoutError") return "cancelled";
  if (err?.code === "too_many_requests" || err?.status === 429) return "rate_limited";
  if (
    err?.code === "insufficient_funds" ||
    err?.code === "subscription_required" ||
    err?.status === 402
  ) {
    return "payment_required";
  }
  if (err?.code === "signed_out") return "signed_out";
  if (err?.code === "missing_key") return "missing_key";
  if (err?.code === "empty_message") return "empty_message";
  if (err?.code === "busy") return "busy";
  return "provider_error";
}

export function asAiError(error: unknown): AiBufferError {
  if (error instanceof AiBufferError) return error;
  return new AiBufferError(codeFor(error), formatAiError(error));
}
