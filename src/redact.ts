const MASK = "••••";

const REPLACEMENTS: { pattern: RegExp; replacement: string }[] = [
  {
    pattern: /((?:authorization|x-goog-api-key|api[-_ ]?key|access[-_ ]?token)\s*[:=]\s*["']?(?:bearer\s+)?)([A-Za-z0-9._~+/=-]{8,})/gi,
    replacement: "$1[redacted]",
  },
  { pattern: /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, replacement: "Bearer [redacted]" },
  { pattern: /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}/g, replacement: "[redacted]" },
  { pattern: /\bnvapi-[A-Za-z0-9_-]{8,}/gi, replacement: "[redacted]" },
  { pattern: /\bAIza[0-9A-Za-z_-]{10,}/g, replacement: "[redacted]" },
  { pattern: /([?&](?:key|api_key|apiKey|access_token|token)=)[^&\s"'#]+/gi, replacement: "$1[redacted]" },
  {
    pattern: /(["'](?:api_key|apiKey|access_token|authorization|x-goog-api-key)["']\s*:\s*["'])[^"']+(["'])/gi,
    replacement: "$1[redacted]$2",
  },
];

/** Replace key material with `[redacted]`. Safe to call more than once. */
export function redactSecrets(value: string): string {
  let text = value;
  for (const { pattern, replacement } of REPLACEMENTS) {
    pattern.lastIndex = 0;
    text = text.replace(pattern, replacement);
  }
  return text;
}

/**
 * True when a string looks like key material rather than a model id.
 * Model ids contain `/` or `.` (for example `openai/gpt-4o-mini`).
 */
export function looksLikeSecret(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/^(?:sk|rk|pk)-/i.test(text)) return true;
  if (/^nvapi-/i.test(text)) return true;
  if (/^AIza/.test(text)) return true;
  if (/^Bearer\s+\S+/i.test(text)) return true;
  if (text.length >= 32 && /^[A-Za-z0-9+/=_-]+$/.test(text)) return true;
  return false;
}

/** Last 4 characters, prefixed with `••••`. A shorter value produces an empty string. */
export function maskKeyHint(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const stripped = trimmed.startsWith(MASK) ? trimmed.slice(MASK.length) : trimmed;
  const tail = stripped.slice(-4);
  if (tail.length < 4) return "";
  return `${MASK}${tail}`;
}
