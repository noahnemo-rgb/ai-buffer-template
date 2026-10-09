import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;

const KEY_SHAPES = [
  /\bsk-[A-Za-z0-9]{16,}/,
  /\bnvapi-[A-Za-z0-9]{16,}/i,
  /\bAIza[0-9A-Za-z_-]{20,}/,
  /\b(?:OPENROUTER_API_KEY|AI_GATEWAY_API_KEY|VERCEL_OIDC_TOKEN|GEMINI_API_KEY|NVIDIA_API_KEY|LLM_API_KEY|AI_BUFFER_VAULT_KEY)\s*=\s*\S+/,
];

function filesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (name === "node_modules" || name === ".venv") continue;
      found.push(...filesUnder(path));
    } else {
      found.push(path);
    }
  }
  return found;
}

describe("secret scanning", () => {
  it("ignores env files and key material in gitignore", () => {
    const gitignore = readFileSync(join(ROOT, ".gitignore"), "utf8");
    assert.match(gitignore, /^\.env$/m);
    assert.match(gitignore, /^\.env\.\*$/m);
    assert.match(gitignore, /^!\.env\.example$/m);
  });

  it("keeps example env values empty", () => {
    const example = readFileSync(join(ROOT, ".env.example"), "utf8");
    for (const line of example.split("\n")) {
      if (!line.includes("_KEY=") && !line.includes("_TOKEN=")) continue;
      assert.match(line, /=\s*$/);
    }
  });

  it("fails when a key-shaped string is in examples or the build output", () => {
    const roots = [join(ROOT, "examples"), join(ROOT, "dist")];
    const hits: string[] = [];
    for (const root of roots) {
      for (const path of filesUnder(root)) {
        if (path.endsWith(".map")) continue;
        const text = readFileSync(path, "utf8");
        for (const pattern of KEY_SHAPES) {
          pattern.lastIndex = 0;
          if (pattern.test(text)) hits.push(relative(ROOT, path));
        }
      }
    }
    assert.deepEqual(hits, []);
  });
});
