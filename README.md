# ai-buffer

A small shared adapter for **Puter**, **OpenRouter**, **Space Bunny Alpha**, **Vercel Gateway**, **Gemini API**, **NVIDIA NIM**, and **LLMAPI**. Each app keeps its own instructions. This package only sends the chat and streams the reply back.

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
| A server you run, or a phone | The NVIDIA account for `NVIDIA_API_KEY` | `provider: "nvidia"` |

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

`AI_GATEWAY_API_KEY`, `VERCEL_OIDC_TOKEN`, `GEMINI_API_KEY`, `NVIDIA_API_KEY`, and `LLM_API_KEY` follow the same rule. Keep them in the server environment or in device secure storage. Do not write them to `localStorage` or `sessionStorage`. The [Security](#security) section is the checklist.

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

## NVIDIA NIM

NVIDIA NIM serves Nemotron and other catalog models through one OpenAI-compatible chat completions endpoint. The URL is `https://integrate.api.nvidia.com/v1/chat/completions`. Send `Authorization: Bearer` with `NVIDIA_API_KEY`. Model ids look like `nvidia/nemotron-3-nano-30b-a3b`. That id is the default here. It was listed under NVIDIA on the LLM APIs page on 2026-10-09. Streaming is Server-Sent Events: `data:` JSON with `choices[0].delta.content`, then `data: [DONE]`.

Docs: [LLM APIs](https://docs.api.nvidia.com/nim/reference/llm-apis), [catalog auth](https://build.nvidia.com/llms.txt), [Nemotron 3 Nano](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-nano-30b-a3b-infer).

```ts
import { createAiClient, readNvidiaApiKey } from "ai-buffer";

const ai = createAiClient({
  provider: "nvidia",
  getApiKey: () => readNvidiaApiKey(process.env),
  model: process.env.NVIDIA_MODEL,
});
```

On a phone, pass `transport: "xhr"`. Python:

```python
from ai_buffer import stream_nvidia

for chunk in stream_nvidia(api_key=os.environ["NVIDIA_API_KEY"], messages=messages):
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

`stream_vercel_gateway`, `stream_gemini`, `stream_nvidia`, and `stream_llmapi` are the same kind of helper for the other hosts.

## Provider dashboard

There is no connections-connector screen in this repo. ONE-SeedFeast has an `/assist` screen and `CONNECTION_LABELS` for Puter, Space Bunny Alpha, and OpenRouter. ONE-Syntax-IDE has an AI settings modal for Puter sign-in and an OpenRouter key. Neither is a reusable provider list, so the list lives here.

`createProviderSelectionStore` saves the active provider and each provider's model in the store you pass. It does not save API keys. A value that looks like a key is rejected. `loadDashboard` returns one row per provider. A `keyHints` entry is reduced to `••••` plus the last 4 characters on `row.keyHint`. `createClientFromSelection` and `createRouterFromSelection` pass that choice to `createAiClient` and `createCallRouter`. Space Bunny Alpha keeps the model id `stealth/space-bunny-alpha`.

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
  nvidiaKey: Boolean(process.env.NVIDIA_API_KEY),
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

Open `http://127.0.0.1:8765/examples/dashboard.html`. The page reads `localStorage` for the provider and the model only. The sample probe marks Puter and Vercel Gateway as configured, and shows `••••ab12` on the Vercel Gateway row. `examples/expo-dashboard.ts` is the phone sketch: the same selection store, backed by `expo-secure-store`. On a phone, provider keys also go in `expo-secure-store`. On the web, they do not.

## What each app still owns

This package does not add a chat window by itself. The app still has to:

1. Collect the message.
2. Pass a `systemPrompt` written for that app. `createChatSession` will keep the history after that.
3. Show `onChunk` on the screen.
4. Branch on `error.code` for sign-in, a missing key, or a wait message.

`getInfo()` tells the screen whether Puter is signed in or an OpenRouter key is saved. The same call reports a Vercel Gateway key, a Gemini API key, an NVIDIA API key, or an LLMAPI key.

## Model names

The default model is `openai/gpt-4o-mini`, the same id Syntax IDE already uses. Puter and OpenRouter do not share one catalog. On Expo, set `puterModel` and `openrouterModel` separately. On a plain client, pass `model` to `createPuterClient` or `createOpenRouterClient`.

## Security

Owner keys and user keys take different paths. Neither path puts a raw key in a browser bundle, in `localStorage`, in `sessionStorage`, in a URL, or in an error string.

### Where each key lives

| Key | Where it is stored | Who can read it |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Server environment | The server proxy, when the caller asks for OpenRouter or Space Bunny Alpha |
| `AI_GATEWAY_API_KEY`, or `VERCEL_OIDC_TOKEN` when the API key is empty | Server environment | The server proxy, when the caller asks for Vercel Gateway |
| `GEMINI_API_KEY` | Server environment | The server proxy. The Gemini request sends it as the `x-goog-api-key` header. It is not a query parameter. |
| `NVIDIA_API_KEY` | Server environment | The server proxy, when the caller asks for NVIDIA NIM |
| `LLM_API_KEY` | Server environment | The server proxy, when the caller asks for LLMAPI |
| `AI_BUFFER_VAULT_KEY` | Server environment. 32 bytes, base64. | The vault, to encrypt and decrypt user keys. It is not an AI provider key. |
| A user's own provider key on a phone | `expo-secure-store`, through `createProviderKeyStore` or `createOpenRouterKeyStore` | That device |
| A user's own provider key on the web | Memory for this page load (`createMemoryKeyStore`), or the server vault | The page until reload, or the server after encryption |

Puter does not use one of these keys. The person signs in in the browser.

`createLocalStorageStore` is for the dashboard selection (provider id and model id). Passing it to `createOpenRouterKeyStore` or `createProviderKeyStore` throws. `createOpenRouterKeyStore` also refuses to save a key-shaped string as the model.

### Server proxy

Browsers and Expo web call your server. The server holds the owner keys and calls the provider.

Node:

```ts
import { createServer } from "node:http";
import { createMemoryRateLimit, createNodeAiProxy } from "ai-buffer";

createServer(
  createNodeAiProxy({
    allowedOrigins: ["https://app.example"],
    allowMissingOrigin: false,
    providers: ["openrouter", "gemini"],
    models: {
      openrouter: ["openai/gpt-4o-mini"],
      gemini: ["gemini-3.8-flash"],
    },
    rateLimit: createMemoryRateLimit({ limit: 30, windowMs: 60_000 }),
  }),
).listen(8787);
```

Python (`examples/proxy_route.py`):

```python
from ai_buffer import handle_ai_proxy

status, headers, body = handle_ai_proxy(
    method="POST",
    headers=request_headers,
    body=raw_body,
    allowed_origins=["https://app.example"],
    models={"gemini": ["gemini-3.8-flash"]},
    env=os.environ,
    client_ip=client_ip,
)
```

The JSON body is `{ "provider", "model", "messages" }` or `{ "provider", "model", "message" }`. Optional `byok` is a user key for that request only. The proxy does not store it and does not copy it into the response. Set `allowByok: false` when every call must use the owner key.

`allowedOrigins` is an exact list of `Origin` header values. A missing `Origin` is rejected unless `allowMissingOrigin` is true. `providers` and `models` are allowlists. `puter` is rejected. Space Bunny Alpha always uses `stealth/space-bunny-alpha`.

`rateLimit` receives `{ ip, userId, provider }` in Node and `(ip, user_id, provider)` in Python. Return false to reject the call. `createMemoryRateLimit` / `create_memory_rate_limit` is an in-process counter keyed by user id when you pass one, otherwise by IP. Pass `resolveUser` from your session. The proxy does not trust a user id in the JSON body.

`examples/node-proxy.mjs` is the same Node listener.

### Web BYOK vault

On the web, either keep the key in `createMemoryKeyStore` (it disappears on reload) or send it once to `createVaultHandler` / `create_key_vault`.

The vault encrypts with AES-256-GCM. The server key is `AI_BUFFER_VAULT_KEY` (32 bytes, base64). The stored record is the ciphertext, the nonce, and the last 4 characters. `put` and `status` return `{ configured, hint }`. `hint` looks like `••••abcd`. `read` returns the raw key for the server proxy only. There is no HTTP response that returns the raw key.

Node: `vaultKeyFromString(process.env.AI_BUFFER_VAULT_KEY)` and `createKeyVault({ encryptionKey, storage })`. Python: `pip install cryptography`, then `ai_buffer.vault.create_key_vault`. Bind `resolveUser` to the signed-in user before mounting `createVaultHandler`.

Pass the same `vault` and `resolveUser` to `createAiProxy` if the browser should chat with the stored user key instead of the owner key.

### Errors and logs

`redactSecrets` / `redact_secrets` replaces bearer tokens, `sk-` / `nvapi-` / `AIza` keys, `key=` query values, and JSON key fields with `[redacted]`. HTTP error bodies, SSE error events, and `formatAiError` go through it. Do not log request headers or the `byok` field yourself.

The dashboard shows `configured`, `not configured`, and the masked hint. It does not show the key.

### Rotation

1. Revoke the key at the provider.
2. Replace the server environment variable, or `vault.delete` the user record, and redeploy.
3. On a phone, `clearKey` and `setKey` on the secure-store helper replace the device copy.
4. A memory key is gone when the page closes. Ask for it again.

### Reporting a leak

Revoke the provider key first. Then open a private security advisory on this repository (GitHub Security tab, Report a vulnerability). Include the provider name, the time you revoked the key, and where it was exposed. Do not paste the key into the advisory.

### Checklist for an app

1. Owner keys exist only in the server environment. The website and Expo web call `createAiProxy` or `handle_ai_proxy`.
2. Set `allowedOrigins`. Pass a rate-limit hook. Allowlist the providers and models you actually call.
3. On a phone, save user keys with `expo-secure-store` through `createProviderKeyStore` or `createOpenRouterKeyStore`.
4. On the web, use `createMemoryKeyStore` or the vault. Do not pass `createLocalStorageStore` a key. Do not put a key in `sessionStorage`.
5. Show `configured`, `not configured`, and `maskKeyHint`. Do not render `getKey()`.
6. The selection store may use `localStorage` for the provider id and the model id only.
7. Gemini calls use the `x-goog-api-key` header. Do not build a URL that contains the key.
8. After a leak, rotate as above and report it. Do not send the key in the report.

## Develop this repo

```bash
npm install
npm test
```

`npm test` runs the TypeScript tests and the Python tests. No network calls.

Reference snippets live in `examples/`. They are not executed by the test run.
