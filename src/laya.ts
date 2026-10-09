/**
 * Laya is listed and not called.
 *
 * Two hosted APIs use this name. Both are decision endpoints (`POST /v1/systemone`),
 * not chat completions, and they do not stream a reply:
 * - Laya Studio: https://api.laya.studio — https://laya.studio/docs/api
 * - Laya AI: https://api.laya-ai.com — https://laya-ai.com/laya-api
 *
 * `createLayaClient` is the extension point. It does not send HTTP.
 */
export const LAYA_CANDIDATES = [
  {
    name: "Laya Studio",
    baseUrl: "https://api.laya.studio",
    docs: "https://laya.studio/docs/api",
  },
  {
    name: "Laya AI",
    baseUrl: "https://api.laya-ai.com",
    docs: "https://laya-ai.com/laya-api",
  },
] as const;

export const LAYA_NOT_CALLED = "Laya is not called. Confirm which Laya service to use.";
