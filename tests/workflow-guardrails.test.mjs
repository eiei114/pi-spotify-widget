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

test("version-bump merges cannot trigger release or npm publication", async () => {
  const release = await readWorkflow(".github/workflows/auto-release.yml");
  const publish = await readWorkflow(".github/workflows/publish.yml");
  assert.match(release, /^  workflow_dispatch:$/m);
  assert.doesNotMatch(release, /^  push:$/m);
  assert.match(release, /if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
  assert.match(publish, /^  push:\r?\n    tags:\r?\n      - ["']v\*\.\*\.\*["']$/m);
  assert.doesNotMatch(publish, /^    branches:/m);
  assert.match(release, /node scripts\/release-version-gate\.mjs/);
  assert.doesNotMatch(release, /HEAD\^|PREVIOUS_VERSION/);
});

test("manual release retries gate tag, release, and publish stages independently", async () => {
  const release = await readWorkflow(".github/workflows/auto-release.yml");
  const gate = await readWorkflow("scripts/release-version-gate.mjs");
  assert.match(gate, /"release", "view"/);
  assert.match(gate, /"run", "list"/);
  assert.match(release, /outputs\.create_tag == 'true'/);
  assert.match(release, /outputs\.create_release == 'true'/);
  assert.match(release, /outputs\.dispatch_publish == 'true'/);
  assert.doesNotMatch(release, /outputs\.released/);
});
