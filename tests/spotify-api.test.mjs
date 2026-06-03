import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

async function withApiEnv(fn) {
  const tmpHome = await mkdtemp(join(tmpdir(), "pi-spotify-widget-api-"));
  const previous = {
    PI_SPOTIFY_AGENT_DIR: process.env.PI_SPOTIFY_AGENT_DIR,
    PI_SPOTIFY_CLIENT_ID: process.env.PI_SPOTIFY_CLIENT_ID,
  };

  process.env.PI_SPOTIFY_AGENT_DIR = tmpHome;
  process.env.PI_SPOTIFY_CLIENT_ID = "test-client-id";

  try {
    const authStore = await import(`../lib/auth-store.ts?dir=${encodeURIComponent(tmpHome)}&t=${Date.now()}`);
    const spotifyApi = await import(`../lib/spotify-api.ts?dir=${encodeURIComponent(tmpHome)}&t=${Date.now()}`);
    await fn({ authStore, spotifyApi });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(tmpHome, { recursive: true, force: true });
  }
}

test("fetchCurrentlyPlaying returns null when unauthenticated", async () => {
  await withApiEnv(async ({ spotifyApi }) => {
    const result = await spotifyApi.fetchCurrentlyPlaying({
      fetchFn: async () => {
        throw new Error("fetch should not be called without auth");
      },
    });
    assert.equal(result, null);
  });
});

test("fetchCurrentlyPlaying maps playing response", async () => {
  await withApiEnv(async ({ authStore, spotifyApi }) => {
    authStore.saveAuth({
      accessToken: "valid_access",
      refreshToken: "valid_refresh",
      expiresAt: Date.now() + 3_600_000,
      scope: "user-read-playback-state user-read-currently-playing",
      updatedAt: new Date().toISOString(),
    });

    const fetchFn = async (url, init) => {
      assert.match(String(url), /\/me\/player\/currently-playing$/);
      assert.equal(init?.headers?.Authorization, "Bearer valid_access");
      return new Response(JSON.stringify({
        is_playing: true,
        item: { name: "Live Track", artists: [{ name: "Live Artist" }] },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const raw = await spotifyApi.fetchCurrentlyPlaying({ fetchFn });
    assert.equal(raw?.item?.name, "Live Track");
  });
});

test("fetchCurrentlyPlaying retries once after 401 refresh", async () => {
  await withApiEnv(async ({ authStore, spotifyApi }) => {
    authStore.saveAuth({
      accessToken: "expired_access",
      refreshToken: "valid_refresh",
      expiresAt: Date.now() + 3_600_000,
      scope: "scope",
      updatedAt: new Date().toISOString(),
    });

    let playerCalls = 0;
    let tokenCalls = 0;

    const fetchFn = async (url, init) => {
      if (String(url).includes("/api/token")) {
        tokenCalls += 1;
        return new Response(JSON.stringify({
          access_token: "fresh_access",
          expires_in: 3600,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      playerCalls += 1;
      const auth = init?.headers?.Authorization;
      if (auth === "Bearer expired_access") {
        return new Response("unauthorized", { status: 401 });
      }
      if (auth === "Bearer fresh_access") {
        return new Response(JSON.stringify({
          is_playing: false,
          item: { name: "After Refresh", artists: [{ name: "Artist" }] },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("unexpected auth", { status: 500 });
    };

    const raw = await spotifyApi.fetchCurrentlyPlaying({ fetchFn });
    assert.equal(tokenCalls, 1);
    assert.equal(playerCalls, 2);
    assert.equal(raw?.item?.name, "After Refresh");
    assert.equal(authStore.loadAuth()?.accessToken, "fresh_access");
  });
});

test("fetchCurrentlyPlaying treats 204 as idle", async () => {
  await withApiEnv(async ({ authStore, spotifyApi }) => {
    authStore.saveAuth({
      accessToken: "valid_access",
      refreshToken: "valid_refresh",
      expiresAt: Date.now() + 3_600_000,
      scope: "scope",
      updatedAt: new Date().toISOString(),
    });

    const fetchFn = async () => new Response(null, { status: 204 });
    const raw = await spotifyApi.fetchCurrentlyPlaying({ fetchFn });
    assert.equal(raw, null);
  });
});

test("skipToNext calls player next endpoint", async () => {
  await withApiEnv(async ({ authStore, spotifyApi }) => {
    authStore.saveAuth({
      accessToken: "valid_access",
      refreshToken: "valid_refresh",
      expiresAt: Date.now() + 3_600_000,
      scope: "user-modify-playback-state",
      updatedAt: new Date().toISOString(),
    });

    let called = false;
    const fetchFn = async (url, init) => {
      if (String(url).includes("/me/player/next")) {
        called = true;
        assert.equal(init?.method, "POST");
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected url ${url}`);
    };

    await spotifyApi.skipToNext({ fetchFn });
    assert.equal(called, true);
  });
});

test("pausePlayback surfaces no active device on 403", async () => {
  await withApiEnv(async ({ authStore, spotifyApi }) => {
    authStore.saveAuth({
      accessToken: "valid_access",
      refreshToken: "valid_refresh",
      expiresAt: Date.now() + 3_600_000,
      scope: "user-modify-playback-state",
      updatedAt: new Date().toISOString(),
    });

    const fetchFn = async () => new Response("forbidden", { status: 403 });
    await assert.rejects(
      () => spotifyApi.pausePlayback({ fetchFn }),
      /no active device/,
    );
  });
});

test("spotifyUrlToTrackUri parses open.spotify.com URL", async () => {
  const { spotifyUrlToTrackUri } = await import("../lib/spotify-api.ts");
  assert.equal(
    spotifyUrlToTrackUri("https://open.spotify.com/track/abc123"),
    "spotify:track:abc123",
  );
});
