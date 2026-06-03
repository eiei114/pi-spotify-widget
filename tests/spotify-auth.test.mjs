import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

async function withAuthEnv(fn) {
  const tmpHome = await mkdtemp(join(tmpdir(), "pi-spotify-widget-auth-"));
  const previous = {
    PI_SPOTIFY_AGENT_DIR: process.env.PI_SPOTIFY_AGENT_DIR,
    PI_SPOTIFY_CLIENT_ID: process.env.PI_SPOTIFY_CLIENT_ID,
  };

  process.env.PI_SPOTIFY_AGENT_DIR = tmpHome;
  process.env.PI_SPOTIFY_CLIENT_ID = "test-client-id";

  try {
    const authStore = await import(`../lib/auth-store.ts?dir=${encodeURIComponent(tmpHome)}&t=${Date.now()}`);
    const spotifyAuth = await import(`../lib/spotify-auth.ts?dir=${encodeURIComponent(tmpHome)}&t=${Date.now()}`);
    await fn({ authStore, spotifyAuth, tmpHome });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(tmpHome, { recursive: true, force: true });
  }
}

test("PKCE code_challenge uses S256 of verifier", async () => {
  const { __testing } = await import("../lib/spotify-auth.ts");
  const verifier = "test_verifier_value_1234567890";
  const challenge = __testing.generateCodeChallenge(verifier);
  assert.match(challenge, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(challenge, verifier);
  assert.equal(__testing.generateCodeChallenge(verifier), __testing.generateCodeChallenge(verifier));
});

test("needsRefresh respects 5 minute buffer", async () => {
  const { __testing } = await import("../lib/spotify-auth.ts");
  const now = Date.now();
  const auth = {
    accessToken: "a",
    refreshToken: "r",
    expiresAt: now + 10 * 60_000,
    scope: "scope",
    updatedAt: new Date().toISOString(),
  };

  assert.equal(__testing.needsRefresh(auth, now), false);
  assert.equal(__testing.needsRefresh({ ...auth, expiresAt: now + 4 * 60_000 }, now), true);
  assert.equal(__testing.isExpired({ ...auth, expiresAt: now - 1 }, now), true);
});

test("refreshIfNeeded refreshes near-expiry tokens", async () => {
  await withAuthEnv(async ({ authStore, spotifyAuth }) => {
    const { saveAuth, loadAuth } = authStore;
    const { refreshIfNeeded, __testing } = spotifyAuth;

    saveAuth({
      accessToken: "old_access",
      refreshToken: "refresh_token_value",
      expiresAt: Date.now() + 60_000,
      scope: "user-read-playback-state user-read-currently-playing",
      updatedAt: new Date().toISOString(),
    });

    const fetchFn = async (_url, init) => {
      assert.equal(init?.method, "POST");
      const body = String(init?.body ?? "");
      assert.match(body, /grant_type=refresh_token/);
      assert.match(body, /refresh_token=refresh_token_value/);
      return new Response(JSON.stringify({
        access_token: "new_access_token",
        expires_in: 3600,
        scope: "user-read-playback-state user-read-currently-playing",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const refreshed = await refreshIfNeeded({ fetchFn });
    assert.ok(refreshed);
    assert.equal(refreshed.accessToken, "new_access_token");
    assert.equal(loadAuth()?.accessToken, "new_access_token");
    const { formatSecretSafeStatus } = spotifyAuth;
    assert.equal(formatSecretSafeStatus().includes("new_access_token"), false);
  });
});

test("refresh failure clears auth", async () => {
  await withAuthEnv(async ({ authStore, spotifyAuth }) => {
    const { saveAuth, loadAuth } = authStore;
    const { refreshIfNeeded, getValidAccessToken } = spotifyAuth;

    saveAuth({
      accessToken: "old_access",
      refreshToken: "refresh_token_value",
      expiresAt: Date.now() + 60_000,
      scope: "scope",
      updatedAt: new Date().toISOString(),
    });

    const fetchFn = async () => new Response("invalid", { status: 400 });

    const refreshed = await refreshIfNeeded({ fetchFn });
    assert.equal(refreshed, null);
    assert.equal(loadAuth(), null);
    assert.equal(await getValidAccessToken({ fetchFn }), null);
  });
});

test("formatSecretSafeStatus never includes token values", async () => {
  await withAuthEnv(async ({ authStore, spotifyAuth }) => {
    const { saveAuth } = authStore;
    const { formatSecretSafeStatus } = spotifyAuth;

    const access = "super_secret_access_token_1234567890";
    const refresh = "super_secret_refresh_token_abcdefghij";

    saveAuth({
      accessToken: access,
      refreshToken: refresh,
      expiresAt: Date.now() + 3_600_000,
      scope: "user-read-playback-state user-read-currently-playing",
      updatedAt: new Date().toISOString(),
    });

    const status = formatSecretSafeStatus();
    assert.match(status, /configured: yes/);
    assert.match(status, /auth file:/);
    assert.equal(status.includes(access), false);
    assert.equal(status.includes(refresh), false);
  });
});

test("buildAuthorizeUrl includes PKCE parameters", async () => {
  const { __testing } = await import("../lib/spotify-auth.ts");
  const url = new URL(__testing.buildAuthorizeUrl("client123", "challenge456", "state789"));
  assert.equal(url.searchParams.get("client_id"), "client123");
  assert.equal(url.searchParams.get("code_challenge"), "challenge456");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), "state789");
  assert.equal(url.searchParams.get("redirect_uri"), "http://127.0.0.1:8888/callback");
});
