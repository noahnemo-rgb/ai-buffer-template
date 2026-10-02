# ai-buffer

A small shared adapter for **Puter** and **OpenRouter**. Each app keeps its own instructions. This package only sends the chat and streams the reply back.

Your phone app, your website, and your Python API can all call the same kind of function. The provider changes. The call does not.

| Where the app runs | Who pays | What you use |
| --- | --- | --- |
| Browser | The person signed in to Puter | `provider: "puter"` |
| iPhone or Android | The person who saved an OpenRouter key on the device | `provider: "openrouter"` and `transport: "xhr"` |
| A server you run | You, with `OPENROUTER_API_KEY` | `provider: "openrouter"` |

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

## Browser (Puter)

```ts
import { createAiClient } from "ai-buffer";

const ai = createAiClient({ provider: "puter" });

await ai.signIn?.();

const reply = await ai.streamChat({
  message: "Give me three dinner ideas.",
  systemPrompt: "You plan simple meals from what is already in the kitchen.",
  onChunk: (text) => appendToScreen(text),
});
```

`systemPrompt` belongs to that app. A joke app, a coding app, and a meal app each pass their own text.

## Phone (OpenRouter key on the device)

The key stays in the phone's secure store. It is sent only to OpenRouter.

```ts
import * as SecureStore from "expo-secure-store";
import { createAiClient, createOpenRouterKeyStore, formatCodeContext } from "ai-buffer";

const secrets = createOpenRouterKeyStore({
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  delete: (key) => SecureStore.deleteItemAsync(key),
});

const ai = createAiClient({
  provider: "openrouter",
  transport: "xhr",
  getApiKey: () => secrets.getKey(),
  getModel: () => secrets.getModel(),
  appName: "Syntax Mobile IDE",
  siteUrl: "https://syntax.ide",
});

await ai.streamChat({
  message: "Why does this return null?",
  systemPrompt: "You are Syntax, an expert mobile coding assistant.",
  context: formatCodeContext({ code: currentFile, language: "typescript" }),
  onChunk: (text) => appendToScreen(text),
});
```

`transport: "xhr"` matters on React Native. It shows tokens as they arrive. Browsers and Node use the default `fetch` transport.

Save a key from your settings screen with `secrets.setKey(pastedKey)`.

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
2. Keep the history.
3. Pass a `systemPrompt` written for that app.
4. Show `onChunk` on the screen.

`getInfo()` tells the screen whether Puter is signed in or an OpenRouter key is saved.

## Model names

The default model is `openai/gpt-4o-mini`, the same id Syntax IDE already uses. Pass `model` to use another id that your provider lists. Puter and OpenRouter do not always share the same catalog, so a phone and a website can use different ids.

## Develop this repo

```bash
npm install
npm test
```

`npm test` runs the TypeScript tests and the Python tests. No network calls.

Reference snippets live in `examples/`. They are not executed by the test run.
