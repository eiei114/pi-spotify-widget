import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

function runNpm(args, options = {}) {
  const result = spawnSync("npm", args, {
    cwd: packageRoot,
    encoding: "utf8",
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || "npm command failed");
  return result.stdout;
}

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

test("CHANGELOG documents the current package version as released", async () => {
  const changelog = await readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8");
  const version = packageJson.version;
  assert.match(changelog, new RegExp(`^## \\[${version.replace(/\./g, "\\.")}\\]`, "m"));
  const unreleased = changelog.split("## Unreleased")[1]?.split(/^## \[/m)[0] ?? "";
  assert.doesNotMatch(unreleased, new RegExp(`\\b${version.replace(/\./g, "\\.")}\\b`));
});

test("README security policy link is shipped in the npm package", async () => {
  const packDir = await mkdtemp(join(tmpdir(), "pi-spotify-widget-pack-"));
  const installDir = await mkdtemp(join(tmpdir(), "pi-spotify-widget-install-"));
  try {
    runNpm(["pack", "--pack-destination", packDir, "--silent"]);
    const tarballName = (await readdir(packDir)).find((name) => name.endsWith(".tgz"));
    assert.ok(tarballName, "npm pack should produce a tarball");
    const tarballPath = join(packDir, tarballName);

    runNpm(["install", tarballPath, "--prefix", installDir, "--no-save", "--silent"]);
    const installedRoot = join(installDir, "node_modules", packageJson.name);
    const packagedReadme = await readFile(join(installedRoot, "README.md"), "utf8");
    const securitySection = packagedReadme.split("## Security")[1]?.split("## ")[0] ?? "";
    assert.match(securitySection, /\[`SECURITY\.md`\]\(SECURITY\.md\)/);

    const packagedSecurity = await readFile(join(installedRoot, "SECURITY.md"), "utf8");
    assert.match(packagedSecurity, /security|vulnerability/i);
  } finally {
    await rm(packDir, { recursive: true, force: true });
    await rm(installDir, { recursive: true, force: true });
  }
});