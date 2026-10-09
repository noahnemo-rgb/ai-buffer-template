# ai-buffer

A small shared adapter for **Puter**, **OpenRouter**, **Space Bunny Alpha**, **Vercel Gateway**, **Gemini API**, and **LLMAPI**. **Laya** is listed and not called until the service is confirmed. Each app keeps its own instructions. This package only sends the chat and streams the reply back.

Your phone app, your website, and your Python API can all call the same kind of function. The provider changes. The call does not.

| Where the app runs | Who pays | What you use |
| --- | --- | --- |
| Browser | The person signed in to Puter | `provider: "puter"` |
| iPhone or Android | The person who saved an OpenRouter key on the device | `provider: "openrouter"` and `transport: "xhr"` |
| A server you run | You, with `OPENROUTER_API_KEY` | `provider: "openrouter"` |
| Any of those, when you ask for it | The same OpenRouter key | `provider: "space-bunny"` |
| A server you run, or a phone | The AI Gateway account for `AI_GATEWAY_API_KEY`, or the Vercel project for `VERCEL_OIDC_TOKEN` | `provider: "vercel-gateway"` |
| A server you run, or a phone | The Google project for `GEMINI_API_KEY` | `provider: "gemini"` |
| A server you run, or a phone | The LLMAPI account for `LLM_API_KEY` | `provider: "llmapi"` |
| Listed in the dashboard | Not called | `provider: "laya"` |

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

`AI_GATEWAY_API_KEY`, `VERCEL_OIDC_TOKEN`, `GEMINI_API_KEY`, and `LLM_API_KEY` follow the same rule. Keep them in the server environment or in device secure storage.

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

## Vercel Gateway

Vercel AI Gateway exposes an OpenAI-compatible chat completions endpoint. The URL is `https://ai-gateway.vercel.sh/v1/chat/completions`. Send `Authorization: Bearer` with `AI_GATEWAY_API_KEY`. If that variable is empty, the adapter sends `VERCEL_OIDC_TOKEN` instead. A non-empty API key is used even when the OIDC token is also set. Model ids look like `provider/model` and come from `GET https://ai-gateway.vercel.sh/v1/models`. The default in this package is `openai/gpt-4o-mini`, which was in that list on 2026-10-09. Streaming is Server-Sent Events: `data:` JSON with `choices[0].delta.content`, then `data: [DONE]`.

Docs: [OpenAI Chat Completions](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions), [streaming](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/streaming), [authentication](https://vercel.com/docs/ai-gateway/authentication-and-byok).

```ts
import { createAiClient, readGatewayApiKey } from "ai-buffer";

const ai = createAiClient({
  provider: "vercel-gateway",
  getApiKey: () => readGatewayApiKey(process.env),
  model: process.env.AI_GATEWAY_MODEL,
  appName: "My Server App",
});
```

On a phone, pass `transport: "xhr"` so tokens show up as they arrive. Python:

```python
from ai_buffer import stream_vercel_gateway

for chunk in stream_vercel_gateway(api_key=os.environ["AI_GATEWAY_API_KEY"], messages=messages):
    print(chunk, end="", flush=True)
```

## Gemini API

The Gemini API streams from `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse`. The key is the `x-goog-api-key` header, from `GEMINI_API_KEY`. It is not placed in the URL. The model id is the model name, such as `gemini-3.8-flash` (the id in the text-generation docs checked on 2026-10-09). A system message is sent as `systemInstruction`. Assistant turns are sent as role `model`. Each SSE `data:` payload is a `GenerateContentResponse`. Text is read from `candidates[0].content.parts[].text`. Parts marked `thought` are skipped. HTTP 429 is `rate_limited`. HTTP 402 is `payment_required`.

Docs: [text generation](https://ai.google.dev/gemini-api/docs/generate-content/text-generation), [streamGenerateContent](https://ai.google.dev/api/generate-content), [API keys](https://ai.google.dev/gemini-api/docs/api-key), [errors](https://ai.google.dev/gemini-api/docs/generate-content/api-errors). Google’s current docs also describe an Interactions API as the interface for new projects. This adapter calls `streamGenerateContent` because that method streams a chat with history.

```ts
import { createAiClient, readGeminiApiKey } from "ai-buffer";

const ai = createAiClient({
  provider: "gemini",
  getApiKey: () => readGeminiApiKey(process.env),
  model: process.env.GEMINI_MODEL,
});
```

On a phone, pass `transport: "xhr"`. Python:

```python
from ai_buffer import stream_gemini

for chunk in stream_gemini(api_key=os.environ["GEMINI_API_KEY"], messages=messages):
    print(chunk, end="", flush=True)
```

## LLMAPI

LLMAPI at [docs.llmapi.ai](https://docs.llmapi.ai/) documents `POST https://api.llmapi.ai/v1/chat/completions` with `Authorization: Bearer $LLM_API_KEY`. The body is OpenAI chat completions, including `stream: true`. The sample model id on that page is `gpt-4o`. A different site, [llmapi.pro](https://llmapi.pro/docs), documents `https://llmapi.pro/v1/chat/completions`. This package calls `api.llmapi.ai` unless you pass `url`.

```ts
import { createAiClient, readLlmapiApiKey } from "ai-buffer";

const ai = createAiClient({
  provider: "llmapi",
  getApiKey: () => readLlmapiApiKey(process.env),
  model: process.env.LLMAPI_MODEL,
});
```

On a phone, pass `transport: "xhr"`. Python:

```python
from ai_buffer import stream_llmapi

for chunk in stream_llmapi(api_key=os.environ["LLM_API_KEY"], messages=messages):
    print(chunk, end="", flush=True)
```

## Laya

Laya is not called. Two hosted APIs use the name, and both are decision endpoints (`POST /v1/systemone`) rather than chat completions:

| Service | Base URL | Docs |
| --- | --- | --- |
| Laya Studio | `https://api.laya.studio` | [API reference](https://laya.studio/docs/api) |
| Laya AI | `https://api.laya-ai.com` | [HTTP guide](https://laya-ai.com/laya-api) |

Those endpoints return typed answers and probabilities. They do not stream a chat reply. `createLayaClient` and `stream_laya` are the extension point. They do not send HTTP. The dashboard still lists Laya, and it stays `not configured`.

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

`stream_vercel_gateway`, `stream_gemini`, and `stream_llmapi` are the same kind of helper for the other hosts. `stream_laya` raises `Laya is not called. Confirm which Laya service to use.`

## Provider dashboard

There is no connections-connector screen in this repo. ONE-SeedFeast has an `/assist` screen and `CONNECTION_LABELS` for Puter, Space Bunny Alpha, and OpenRouter. ONE-Syntax-IDE has an AI settings modal for Puter sign-in and an OpenRouter key. Neither is a reusable provider list, so the list lives here.

`createProviderSelectionStore` saves the active provider and each provider's model in the store you pass. It does not save API keys. `loadDashboard` returns one row per provider. `createClientFromSelection` and `createRouterFromSelection` pass that choice to `createAiClient` and `createCallRouter`. Space Bunny Alpha keeps the model id `stealth/space-bunny-alpha`.

```ts
import {
  createMemoryStore,
  createProviderSelectionStore,
  createClientFromSelection,
  loadDashboard,
  readGatewayApiKey,
} from "ai-buffer";

const selection = createProviderSelectionStore(createMemoryStore());
const rows = await loadDashboard(selection, {
  puterSignedIn: false,
  openrouterKey: Boolean(process.env.OPENROUTER_API_KEY),
  gatewayKey: Boolean(readGatewayApiKey(process.env)),
  geminiKey: Boolean(process.env.GEMINI_API_KEY),
  llmapiKey: Boolean(process.env.LLM_API_KEY),
});
const chosen = await selection.getSelection();
if (chosen) {
  const ai = createClientFromSelection(chosen, {
    vercelGateway: { getApiKey: () => readGatewayApiKey(process.env) },
  });
}
```

The rows use the provider names and the words `model`, `active`, `configured`, and `not configured`.

Build the package, then serve the repo and open the example:

```bash
npm run build
python3 -m http.server 8765
```

Open `http://127.0.0.1:8765/examples/dashboard.html`. The page reads `localStorage`. The sample probe marks Puter and Vercel Gateway as configured. `examples/expo-dashboard.ts` is the phone sketch: the same store, backed by `expo-secure-store`.

## What each app still owns

This package does not add a chat window by itself. The app still has to:

1. Collect the message.
2. Pass a `systemPrompt` written for that app. `createChatSession` will keep the history after that.
3. Show `onChunk` on the screen.
4. Branch on `error.code` for sign-in, a missing key, or a wait message.

`getInfo()` tells the screen whether Puter is signed in or an OpenRouter key is saved. The same call reports a Vercel Gateway key, a Gemini API key, or an LLMAPI key. Laya reports that it is not configured.

## Model names

The default model is `openai/gpt-4o-mini`, the same id Syntax IDE already uses. Puter and OpenRouter do not share one catalog. On Expo, set `puterModel` and `openrouterModel` separately. On a plain client, pass `model` to `createPuterClient` or `createOpenRouterClient`.

## Develop this repo

```bash
npm install
npm test
```

`npm test` runs the TypeScript tests and the Python tests. No network calls.

Reference snippets live in `examples/`. They are not executed by the test run.
