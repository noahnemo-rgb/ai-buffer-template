import { AiBufferError } from "./errors.js";

/** Requests stop on their own after two minutes. Pass `timeoutMs: 0` to wait without a limit. */
export const DEFAULT_TIMEOUT_MS = 120_000;

export function startTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  if (ms <= 0) {
    return { signal: new AbortController().signal, cancel: () => undefined };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => {
    const error = new Error("The AI request timed out.");
    error.name = "TimeoutError";
    controller.abort(error);
  }, ms);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}

export function anySignal(signals: AbortSignal[]): AbortSignal {
  const list = signals.filter(Boolean);
  if (list.length === 0) return new AbortController().signal;
  if (list.length === 1) return list[0]!;
  if (typeof AbortSignal.any === "function") return AbortSignal.any(list);
  const controller = new AbortController();
  for (const signal of list) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

export function haltError(input: { user?: AbortSignal; timeout?: AbortSignal }): AiBufferError | undefined {
  if (input.user?.aborted) return new AiBufferError("cancelled", "The AI request was cancelled.");
  if (input.timeout?.aborted) return new AiBufferError("cancelled", "The AI request timed out.");
  return undefined;
}

/**
 * Resolves with the work, or rejects when the user cancels or the time limit fires.
 * The work itself may keep running. Callers stop reading it.
 */
export function raceAbort<T>(
  work: Promise<T>,
  input: { user?: AbortSignal; timeout?: AbortSignal },
): Promise<T> {
  const immediate = haltError(input);
  if (immediate) return Promise.reject(immediate);

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      input.user?.removeEventListener("abort", onAbort);
      input.timeout?.removeEventListener("abort", onAbort);
    };
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };
    const onAbort = () => {
      const error = haltError(input);
      if (error) finish(() => reject(error));
    };
    input.user?.addEventListener("abort", onAbort, { once: true });
    input.timeout?.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => finish(() => resolve(value)),
      (error) =>
        finish(() => {
          reject(haltError(input) ?? error);
        }),
    );
  });
}
