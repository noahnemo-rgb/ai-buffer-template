import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryStore } from "../src/store.ts";
import {
  createClientFromSelection,
  createProviderSelectionStore,
  createRouterFromSelection,
  DASHBOARD_LABELS,
  loadDashboard,
} from "../src/dashboard.ts";
import { AiBufferError } from "../src/errors.ts";
import { PROVIDER_CATALOG } from "../src/providers.ts";
import { SPACE_BUNNY_MODEL } from "../src/space-bunny.ts";
import { VERCEL_GATEWAY_URL } from "../src/vercel-gateway.ts";

describe("provider dashboard", () => {
  it("lists every provider with the allowed status words and persists the choice", async () => {
    const selection = createProviderSelectionStore(createMemoryStore());
    const probe = {
      puterSignedIn: true,
      openrouterKey: false,
      gatewayKey: true,
      geminiKey: false,
      nvidiaKey: true,
      llmapiKey: true,
    };
    let rows = await loadDashboard(selection, probe);
    assert.deepEqual(
      rows.map((row) => row.label),
      ["Puter", "OpenRouter", "Space Bunny Alpha", "Vercel Gateway", "Gemini API", "NVIDIA NIM", "LLMAPI"],
    );
    assert.deepEqual(
      rows.map((row) => row.status),
      [
        DASHBOARD_LABELS.configured,
        DASHBOARD_LABELS.notConfigured,
        DASHBOARD_LABELS.notConfigured,
        DASHBOARD_LABELS.configured,
        DASHBOARD_LABELS.notConfigured,
        DASHBOARD_LABELS.configured,
        DASHBOARD_LABELS.configured,
      ],
    );
    assert.deepEqual(
      rows.map((row) => row.activeLabel),
      ["", "", "", "", "", "", ""],
    );
    assert.ok(rows.every((row) => row.modelLabel === "model"));
    const allowed = new Set<string>([
      ...PROVIDER_CATALOG.map((item) => item.label),
      DASHBOARD_LABELS.model,
      DASHBOARD_LABELS.active,
      DASHBOARD_LABELS.configured,
      DASHBOARD_LABELS.notConfigured,
    ]);
    for (const row of rows) {
      for (const word of [row.label, row.status, row.modelLabel, row.activeLabel]) {
        if (word) assert.ok(allowed.has(word), word);
      }
    }

    await selection.setProvider("gemini");
    await selection.setModel("gemini", " gemini-3.8-flash ");
    rows = await loadDashboard(selection, probe);
    const gemini = rows.find((row) => row.id === "gemini");
    assert.equal(gemini?.activeLabel, "active");
    assert.equal(gemini?.model, "gemini-3.8-flash");
    assert.equal(gemini?.configured, false);
    assert.deepEqual(await selection.getSelection(), { provider: "gemini", model: "gemini-3.8-flash" });
  });

  it("ignores a stored provider id that is not in the catalog", async () => {
    const memory = createMemoryStore({ "ai-buffer.active_provider": "not-a-provider" });
    const selection = createProviderSelectionStore(memory);
    assert.equal(await selection.getProvider(), null);
    assert.equal(await selection.getSelection(), null);
  });

  it("feeds the saved provider and model into the client and the router", async () => {
    const selection = createProviderSelectionStore(createMemoryStore());
    await selection.setProvider("vercel-gateway");
    await selection.setModel("vercel-gateway", "openai/gpt-4o-mini");
    const chosen = await selection.getSelection();
    assert.ok(chosen);
    let payload: { model?: string } = {};
    const client = createClientFromSelection(chosen, {
      vercelGateway: {
        getApiKey: () => "gw",
        fetchImpl: async (input, init) => {
          assert.equal(String(input), VERCEL_GATEWAY_URL);
          payload = JSON.parse(String(init?.body));
          return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n`, { status: 200 });
        },
      },
    });
    assert.equal(client.id, "vercel-gateway");
    assert.equal(await client.streamChat({ message: "Hi" }), "ok");
    assert.equal(payload.model, "openai/gpt-4o-mini");

    let bunnyModel = "";
    const router = createRouterFromSelection(
      { provider: "space-bunny", model: "other/model" },
      {
        spaceBunny: {
          getApiKey: () => "sk",
          fetchImpl: async (_input, init) => {
            bunnyModel = JSON.parse(String(init?.body)).model;
            return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: "bunny" } }] })}\n`, {
              status: 200,
            });
          },
        },
        openrouter: {
          getApiKey: () => "sk",
          fetchImpl: async () => {
            throw new Error("openrouter should not run");
          },
        },
      },
    );
    assert.equal(await router.streamChat({ message: "Hi" }), "bunny");
    assert.equal(bunnyModel, SPACE_BUNNY_MODEL);
  });

  it("refuses a selected route that was not given credentials", () => {
    assert.throws(
      () => createClientFromSelection({ provider: "llmapi", model: "gpt-4o" }, {}),
      (error: unknown) => error instanceof AiBufferError && error.code === "provider_error",
    );
  });
});
