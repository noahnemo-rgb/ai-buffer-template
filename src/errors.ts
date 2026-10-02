export function openRouterHttpError(status: number, body: string): Error {
  const error = new Error(`OpenRouter HTTP ${status}: ${body.slice(0, 300)}`) as Error & { status: number };
  error.status = status;
  return error;
}

export function formatAiError(error: unknown): string {
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

export function asAiError(error: unknown): Error {
  const message = formatAiError(error);
  const wrapped = new Error(message);
  if (error instanceof Error && error.name === "AbortError") {
    wrapped.name = "AbortError";
  }
  return wrapped;
}
