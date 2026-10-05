# ai-buffer

A small shared adapter for **Puter**, **OpenRouter**, and **Space Bunny Alpha**. Each app keeps its own instructions. This package only sends the chat and streams the reply back.

Your phone app, your website, and your Python API can all call the same kind of function. The provider changes. The call does not.

| Where the app runs | Who pays | What you use |
| --- | --- | --- |
| Browser | The person signed in to Puter | `provider: "puter"` |
| iPhone or Android | The person who saved an OpenRouter key on the device | `provider: "openrouter"` and `transport: "xhr"` |
| A server you run | You, with `OPENROUTER_API_KEY` | `provider: "openrouter"` |
| Any of those, when you ask for it | The same OpenRouter key | `provider: "space-bunny"` |

Puter sign-in happens in the browser. A phone and a Python server use OpenRouter instead. The adapter hides that split.

## Install

From another JavaScript project, after this repo is on GitHub:

```bash
npm install github:noahnemo-rgb/ai-buffer-template
```

Puter in a bundled website also needs the browser library:

```bash
npm install @heyputer/puter.js
```

A single HTML page can load Puter from `https://js.puter.com/v2/` instead. The adapter uses `window.puter` when that script is already on the page.

Python apps do not use npm. Add this repo's `python/` directory to `PYTHONPATH`, then `import ai_buffer`.

## Expo website and phone

Use one import. The website build talks to Puter. The iPhone and Android build talks to OpenRouter and shows tokens as they arrive.

`puterModel` and `openrouterModel` are separate. A model that works on the website can be a different id from the model on the phone.

```ts
import * as SecureStore from "expo-secure-store";
import { createChatSession, createOpenRouterKeyStore } from "ai-buffer";
import { createExpoClient, expoPlatform } from "ai-buffer/expo";

const secrets = createOpenRouterKeyStore({
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  delete: (key) => SecureStore.deleteItemAsync(key),
});

const ai = createExpoClient({
  puterModel: "openai/gpt-4o-mini",
  openrouterModel: "openai/gpt-4o-mini",
  getApiKey: () => secrets.getKey(),
  getOpenRouterModel: () => secrets.getModel(),
  appName: "Syntax Mobile IDE",
  siteUrl: "https://syntax.ide",
});

const chat = createChatSession(ai, {
  systemPrompt: "You are Syntax, an expert mobile coding assistant.",
});

const reply = await chat.send("Why does this return null?", {
  onChunk: (text) => appendToScreen(text),
});
```

`expoPlatform` is `"web"` on the website and `"native"` on the phone, so the settings screen can ask for Puter sign-in or for a key. Save a phone key with `secrets.setKey(pastedKey)`. The website build ignores that key.

`chat` remembers the conversation. A second `send` while a reply is still streaming throws `code: "busy"`. Call `chat.stop()` when the user taps Stop or leaves the page. A failed or stopped send leaves the saved history as it was.

A full screen sketch is in `examples/expo-app.ts`.

## Where the key lives

Put an OpenRouter key in the phone's secure store, or in the server environment as `OPENROUTER_API_KEY`. A website should use Puter, or it should call your server. A key placed in the website's JavaScript can be copied by anyone who opens the page.

## Errors the screen can branch on

Failures throw `AiBufferError`. Read `error.code`:

| Code | What the screen does |
| --- | --- |
| `signed_out` | Show “Sign in to Puter”, then call `ai.signIn()` |
| `missing_key` | Show the key field |
| `rate_limited` | Show “Wait a few seconds” |
| `payment_required` | Show “Add credits” |
| `cancelled` | Stop the spinner. This is also the code when the two-minute limit fires |
| `busy` | Ignore the extra tap |
| `empty_message` | Ask for some text |
| `provider_error` | Show `error.message` |

```ts
try {
  await chat.send(message, { onChunk });
} catch (error) {
  if (error instanceof AiBufferError && error.code === "signed_out") {
    await ai.signIn?.();
  }
}
```

Requests stop on their own after two minutes. Pass `timeoutMs: 0` on the client to wait without a limit, or pass `timeoutMs` on a single `send`.

## Browser outside Expo

```ts
import { createAiClient, createChatSession } from "ai-buffer";

const ai = createAiClient({ provider: "puter", model: "openai/gpt-4o-mini" });
const chat = createChatSession(ai, {
  systemPrompt: "You plan simple meals from what is already in the kitchen.",
});

await ai.signIn?.();
await chat.send("Give me three dinner ideas.", {
  onChunk: (text) => appendToScreen(text),
});
```

`systemPrompt` belongs to that app. A joke app, a coding app, and a meal app each pass their own text.

## Node server

```js
import { createAiClient } from "ai-buffer";

const ai = createAiClient({
  provider: "openrouter",
  getApiKey: () => process.env.OPENROUTER_API_KEY,
  model: process.env.OPENROUTER_MODEL,
  appName: "My Server App",
  siteUrl: "https://example.com",
});
```

Copy `.env.example` to `.env` on the server. Do not commit `.env`.

## Space Bunny Alpha

Space Bunny Alpha is a free stealth model on OpenRouter. The model id is `stealth/space-bunny-alpha`. It uses the same OpenRouter key as the other server route. Puter sign-in does not reach it.

```ts
import { createAiClient, createCallRouter } from "ai-buffer";

const bunny = createAiClient({
  provider: "space-bunny",
  getApiKey: () => process.env.OPENROUTER_API_KEY,
  reasoningEffort: "medium",
  appName: "My Server App",
});

const router = createCallRouter({
  spaceBunny: { getApiKey: () => process.env.OPENROUTER_API_KEY, reasoningEffort: "medium" },
  openrouter: { getApiKey: () => process.env.OPENROUTER_API_KEY, model: "openai/gpt-4o-mini" },
  puter: { model: "openai/gpt-4o-mini" },
});

await router.streamChat({ route: "space-bunny", message: "Sketch a small API." });
```

With no `route`, the router tries Space Bunny Alpha, then OpenRouter, then Puter, and skips a route that was not configured. It moves to the next route when the key is missing, Puter is signed out, the provider is rate limited, payment is required, or the provider returns another error. An empty message, a cancelled call, or a busy session stays on the route that received it.

Reasoning effort is `low`, `medium`, `high`, `xhigh`, or `max`. The default is `medium`.

Python uses the same key and model:

```python
from ai_buffer import stream_space_bunny

for chunk in stream_space_bunny(api_key=os.environ["OPENROUTER_API_KEY"], messages=messages):
    print(chunk, end="", flush=True)
```

## Python / FastAPI

```python
import os
from ai_buffer import build_messages, stream_openrouter

messages = build_messages(
    system_prompt="You write short project summaries.",
    history=[],
    user_text="Summarize this project.",
)

for chunk in stream_openrouter(
    api_key=os.environ["OPENROUTER_API_KEY"],
    model=os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini"),
    messages=messages,
    app_name="My API",
    site_url="https://example.com",
):
    print(chunk, end="", flush=True)
```

`examples/fastapi_route.py` shows the same helper behind a streaming route.

## What each app still owns

This package does not add a chat window by itself. The app still has to:

1. Collect the message.
2. Pass a `systemPrompt` written for that app. `createChatSession` will keep the history after that.
3. Show `onChunk` on the screen.
4. Branch on `error.code` for sign-in, a missing key, or a wait message.

`getInfo()` tells the screen whether Puter is signed in or an OpenRouter key is saved.

## Model names

The default model is `openai/gpt-4o-mini`, the same id Syntax IDE already uses. Puter and OpenRouter do not share one catalog. On Expo, set `puterModel` and `openrouterModel` separately. On a plain client, pass `model` to `createPuterClient` or `createOpenRouterClient`.

## Open-weight precision

OpenRouter's default routing prefers the cheaper host. For an open-weight model that host is often an 8-bit or 4-bit copy. `fullPrecisionExtra(model)` asks for `bf16`, `fp16`, or `fp32`. If no host offers those, the call fails. Pass it as `extra` on the OpenRouter route. Leave it off Puter, Space Bunny Alpha, OpenAI, Anthropic, and any `:free` or `:floor` model id.

```ts
import { createAiClient, fullPrecisionExtra } from "ai-buffer";

const model = "meta-llama/llama-3.1-70b-instruct";
const ai = createAiClient({
  provider: "openrouter",
  getApiKey: () => process.env.OPENROUTER_API_KEY,
  model,
  extra: fullPrecisionExtra(model),
});
```

Python uses the same object as `extra`:

```python
from ai_buffer import full_precision_extra, stream_openrouter

model = "meta-llama/llama-3.1-70b-instruct"
for chunk in stream_openrouter(
    api_key=os.environ["OPENROUTER_API_KEY"],
    model=model,
    messages=messages,
    extra=full_precision_extra(model),
):
    print(chunk, end="", flush=True)
```

## Develop this repo

```bash
npm install
npm test
```

`npm test` runs the TypeScript tests and the Python tests. No network calls.

Reference snippets live in `examples/`. They are not executed by the test run.
