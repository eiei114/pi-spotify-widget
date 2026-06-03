import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

async function withConfigEnv(fn) {
  const tmpHome = await mkdtemp(join(tmpdir(), "pi-spotify-widget-config-"));
  const previous = {
    PI_SPOTIFY_AGENT_DIR: process.env.PI_SPOTIFY_AGENT_DIR,
    PI_SPOTIFY_CLIENT_ID: process.env.PI_SPOTIFY_CLIENT_ID,
  };

  process.env.PI_SPOTIFY_AGENT_DIR = tmpHome;
  delete process.env.PI_SPOTIFY_CLIENT_ID;

  try {
    const spotifyConfig = await import(`../lib/spotify-config.ts?dir=${encodeURIComponent(tmpHome)}&t=${Date.now()}`);
    await fn(spotifyConfig, tmpHome);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(tmpHome, { recursive: true, force: true });
  }
}

test("stored client id round-trip and resolve precedence", async () => {
  await withConfigEnv(async ({
    saveStoredClientId,
    loadStoredClientId,
    clearStoredClientId,
    resolveClientId,
    resolveClientIdSource,
    getConfigFilePath,
  }) => {
    assert.equal(loadStoredClientId(), undefined);
    assert.equal(resolveClientId(), "");
    assert.equal(resolveClientIdSource(), "missing");

    saveStoredClientId("stored-client-id");
    assert.equal(loadStoredClientId(), "stored-client-id");
    assert.equal(resolveClientId(), "stored-client-id");
    assert.equal(resolveClientIdSource(), "stored");

    const fileContents = await readFile(getConfigFilePath(), "utf8");
    assert.equal(fileContents.includes("stored-client-id"), true);

    process.env.PI_SPOTIFY_CLIENT_ID = "env-client-id";
    assert.equal(resolveClientId(), "env-client-id");
    assert.equal(resolveClientIdSource(), "environment");

    clearStoredClientId();
    assert.equal(loadStoredClientId(), undefined);
  });
});

test("requireClientId points users to /spotify:login", async () => {
  await withConfigEnv(async ({ requireClientId }) => {
    assert.throws(
      () => requireClientId(),
      /Run \/spotify:login/,
    );
  });
});
