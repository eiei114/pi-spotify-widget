import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readWorkflow(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("CI workflow does not install Bun without using it", async () => {
  const ci = await readWorkflow(".github/workflows/ci.yml");
  assert.doesNotMatch(ci, /setup-bun/);
  assert.match(ci, /npm ci/);
});

test("publish workflow keeps npm Trusted Publishing guardrails", async () => {
  const publish = await readWorkflow(".github/workflows/publish.yml");
  assert.match(publish, /node-version:\s*"24"/);
  assert.match(publish, /npm publish --provenance --access public/);
  assert.match(publish, /id-token:\s*write/);
});
