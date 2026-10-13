import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const releaseWorkflow = await readFile(new URL("../.github/workflows/auto-release.yml", import.meta.url), "utf8");
const publishWorkflow = await readFile(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");
const releaseGate = fileURLToPath(new URL("../scripts/release-version-gate.mjs", import.meta.url));

function assertNoMergeTriggeredRelease(release, publish) {
  const releaseTriggers = release.split("permissions:")[0];
  const publishTriggers = publish.split("permissions:")[0];
  assert.match(releaseTriggers, /on:\r?\n\s+workflow_dispatch:/, "release must be manually triggered only");
  assert.doesNotMatch(releaseTriggers, /^\s+push:/m, "a merge must not start release");
  assert.match(release, /if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
  assert.match(publishTriggers, /push:\r?\n\s+tags:/, "publishing must remain version-tag gated");
  assert.doesNotMatch(publishTriggers, /branches:|paths:/, "main branch/package edits must not publish");
  assert.match(publishTriggers, /workflow_dispatch:/, "explicit manual publishing remains available");
  assert.match(publish, /npm publish/);
}

test("merging code cannot directly or indirectly trigger npm publish or release", () => {
  assert.doesNotThrow(() => assertNoMergeTriggeredRelease(releaseWorkflow, publishWorkflow));
  assert.throws(() => assertNoMergeTriggeredRelease(
    releaseWorkflow.replace("  workflow_dispatch:", "  push:\n    branches: [main]\n  workflow_dispatch:"), publishWorkflow));
  assert.throws(() => assertNoMergeTriggeredRelease(
    releaseWorkflow, publishWorkflow.replace("    tags:", "    branches: [main]\n    tags:")));
});

test("manual release delegates eligibility to the tag-based gate", () => {
  assert.match(releaseWorkflow, /node scripts\/release-version-gate\.mjs >> "\$GITHUB_OUTPUT"/);
  assert.doesNotMatch(releaseWorkflow, /HEAD\^|PREVIOUS_VERSION/);
});

test("manual release accepts an untagged version after a docs-only follow-up commit", async () => {
  const repo = await mkdtemp(join(tmpdir(), "pi-spotify-release-gate-"));
  const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
  const runGate = () => spawnSync(process.execPath, [releaseGate], { cwd: repo, encoding: "utf8" });

  try {
    git("init", "--quiet");
    git("config", "user.name", "Release gate test");
    git("config", "user.email", "release-gate@example.test");
    await writeFile(join(repo, "package.json"), JSON.stringify({ version: "0.1.17" }));
    git("add", "package.json");
    git("commit", "--quiet", "-m", "bump version");
    await writeFile(join(repo, "docs.md"), "Documentation-only follow-up.\n");
    git("add", "docs.md");
    git("commit", "--quiet", "-m", "docs only");

    const current = execFileSync("git", ["show", "HEAD:package.json"], { cwd: repo, encoding: "utf8" });
    const previous = execFileSync("git", ["show", "HEAD^:package.json"], { cwd: repo, encoding: "utf8" });
    assert.equal(JSON.parse(current).version, JSON.parse(previous).version);

    const untagged = runGate();
    assert.equal(untagged.status, 0, untagged.stderr);
    assert.equal(untagged.stdout, "released=true\ntag=v0.1.17\n");

    git("tag", "v0.1.17");
    const released = runGate();
    assert.equal(released.status, 0, released.stderr);
    assert.equal(released.stdout, "released=false\n");

    await writeFile(join(repo, "package.json"), JSON.stringify({ version: "01.2.3" }));
    const invalid = runGate();
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /Invalid stable package version/);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});
