import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("package declares pi resources", () => {
  assert.deepEqual(packageJson.pi.extensions, ["./extensions"]);
  assert.deepEqual(packageJson.pi.skills, ["./skills/spotify-playback"]);
  assert.equal(packageJson.pi.prompts, undefined);
  assert.equal(packageJson.pi.themes, undefined);
});

test("package is discoverable as a Pi package", () => {
  assert.ok(packageJson.keywords.includes("pi-package"));
});

test("package uses public publish config", () => {
  assert.equal(packageJson.publishConfig.access, "public");
});

test("README release command defers tagging to auto-release workflow", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const releaseSection = readme.split("## Release")[1]?.split("## ")[0] ?? "";
  assert.match(releaseSection, /npm version patch --no-git-tag-version/);
  assert.doesNotMatch(releaseSection, /^npm version patch$/m);
});