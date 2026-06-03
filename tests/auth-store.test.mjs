import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

async function withAgentDir(fn) {
  const tmpHome = await mkdtemp(join(tmpdir(), "pi-spotify-widget-auth-"));
  const previous = process.env.PI_SPOTIFY_AGENT_DIR;
  process.env.PI_SPOTIFY_AGENT_DIR = tmpHome;

  try {
    const authStore = await import(`../lib/auth-store.ts?dir=${encodeURIComponent(tmpHome)}&t=${Date.now()}`);
    await fn(authStore, tmpHome);
  } finally {
    if (previous === undefined) delete process.env.PI_SPOTIFY_AGENT_DIR;
    else process.env.PI_SPOTIFY_AGENT_DIR = previous;
    await rm(tmpHome, { recursive: true, force: true });
  }
}

test("auth-store save/load/clear round-trip", async () => {
  await withAgentDir(async ({ saveAuth, loadAuth, clearAuth, isConfigured, getAuthFilePath }) => {
    assert.equal(isConfigured(), false);
    assert.equal(loadAuth(), null);

    const record = {
      accessToken: "access_test_token",
      refreshToken: "refresh_test_token",
      expiresAt: Date.now() + 3_600_000,
      scope: "user-read-playback-state user-read-currently-playing",
      updatedAt: new Date().toISOString(),
    };

    saveAuth(record);
    assert.equal(isConfigured(), true);

    const loaded = loadAuth();
    assert.deepEqual(loaded, record);

    const fileContents = await readFile(getAuthFilePath(), "utf8");
    assert.equal(fileContents.includes("access_test_token"), true);
    assert.equal(fileContents.includes("refresh_test_token"), true);

    clearAuth();
    assert.equal(loadAuth(), null);
    assert.equal(isConfigured(), false);
  });
});
