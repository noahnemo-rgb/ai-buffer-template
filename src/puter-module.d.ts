declare module "@heyputer/puter.js" {
  export const puter: {
    auth?: {
      isSignedIn?: () => boolean;
      signIn?: () => Promise<void>;
    };
    ai?: {
      chat?: (
        prompt: string | Array<{ role: string; content: string }>,
        options?: Record<string, unknown>,
      ) => Promise<unknown> | AsyncIterable<unknown>;
    };
  };
}
