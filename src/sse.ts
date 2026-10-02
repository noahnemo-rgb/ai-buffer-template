export interface SseDelta {
  text: string;
  parsedThrough: number;
}

interface OpenRouterChunk {
  error?: { message?: string } | string;
  choices?: { delta?: { content?: string | null } }[];
}

/**
 * Read complete Server-Sent Events from an accumulated response body.
 * `parsedThrough` is the index already consumed. Pass the same growing string
 * on every chunk.
 */
export function drainOpenRouterSse(fullText: string, parsedThrough: number): SseDelta {
  let text = "";
  const slice = fullText.slice(parsedThrough);
  const lines = slice.split("\n");
  // The final array entry is either an unfinished line or the empty string
  // that split leaves after a trailing newline. Leave it for the next call.
  const completeLines = lines.slice(0, -1);
  let consumed = parsedThrough;
  for (const rawLine of completeLines) {
    consumed += rawLine.length + 1;
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice("data:".length).trim();
    if (!data || data === "[DONE]") continue;
    let chunk: OpenRouterChunk;
    try {
      chunk = JSON.parse(data) as OpenRouterChunk;
    } catch (error) {
      if (error instanceof SyntaxError) continue;
      throw error;
    }
    if (chunk.error) {
      const message = typeof chunk.error === "string" ? chunk.error : chunk.error.message;
      throw new Error(message || "OpenRouter stream error");
    }
    const content = chunk.choices?.[0]?.delta?.content;
    if (content) text += content;
  }
  return { text, parsedThrough: consumed };
}

export async function readOpenRouterSse(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let parsedThrough = 0;
  let full = "";
  const take = (flush: boolean) => {
    const source = flush && buffered.length > 0 && !buffered.endsWith("\n") ? `${buffered}\n` : buffered;
    const drained = drainOpenRouterSse(source, parsedThrough);
    parsedThrough = drained.parsedThrough;
    if (flush) buffered = source;
    if (drained.text) {
      full += drained.text;
      onDelta(drained.text);
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    take(false);
  }
  buffered += decoder.decode();
  take(true);
  return full;
}
