import type { PuterLike } from "./types.js";

/**
 * One options object for the website build and the phone build.
 * `puterModel` is sent only on the website. `openrouterModel` is sent only on the phone.
 */
export interface ExpoClientOptions {
  puterModel?: string;
  openrouterModel?: string;
  /** Phone build. The website build uses Puter sign-in and ignores this. */
  getApiKey?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Phone build. Overrides `openrouterModel` when it returns a value. */
  getOpenRouterModel?: () => string | null | undefined | Promise<string | null | undefined>;
  appName?: string;
  siteUrl?: string;
  defaultSystemPrompt?: string;
  loadPuter?: () => Promise<PuterLike>;
  /** `0` waits without a limit. The default is two minutes. */
  timeoutMs?: number;
}
