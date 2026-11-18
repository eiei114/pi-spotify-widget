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
    const spotifyAuth = await import("../lib/spotify-auth.ts");
    await fn({ authStore, spotifyApi, spotifyAuth });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(tmpHome, { recursive: true, force: true });
  }
}

const fakeTokens = [
  "fake_access_expired_test_only",
  "fake_access_refreshed_test_only",
  "fake_refresh_test_only",
];

function assertNoTokenLeak(error, tokens = fakeTokens) {
  for (const token of tokens) assert.equal(error.message.includes(token), false);
}

async function assertRejectsWithoutTokenLeak(promise, expectedMessage, tokens = fakeTokens) {
  await assert.rejects(promise, (error) => {
    assert.match(error.message, expectedMessage);
    assertNoTokenLeak(error, tokens);
    return true;
  });
}

function saveFakeAuth(authStore, accessToken = fakeTokens[0]) {
  authStore.saveAuth({
    accessToken,
    refreshToken: fakeTokens[2],
    expiresAt: Date.now() + 3_600_000,
    scope: "user-modify-playback-state user-read-currently-playing",
    updatedAt: new Date().toISOString(),
  });
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
      accessToken: "fake_access_valid_test_only",
      refreshToken: "fake_refresh_valid_test_only",
      expiresAt: Date.now() + 3_600_000,
      scope: "user-read-playback-state user-read-currently-playing",
      updatedAt: new Date().toISOString(),
    });

    const fetchFn = async (url, init) => {
      assert.match(String(url), /\/me\/player\/currently-playing$/);
      assert.equal(init?.headers?.Authorization, "Bearer fake_access_valid_test_only");
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
      accessToken: "fake_access_expired_test_only",
      refreshToken: "fake_refresh_valid_test_only",
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
          access_token: "fake_access_refreshed_test_only",
          expires_in: 3600,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      playerCalls += 1;
      const auth = init?.headers?.Authorization;
      if (auth === "Bearer fake_access_expired_test_only") {
        return new Response("unauthorized", { status: 401 });
      }
      if (auth === "Bearer fake_access_refreshed_test_only") {
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
    assert.equal(authStore.loadAuth()?.accessToken, "fake_access_refreshed_test_only");
  });
});

test("fetchCurrentlyPlaying treats 204 as idle", async () => {
  await withApiEnv(async ({ authStore, spotifyApi }) => {
    authStore.saveAuth({
      accessToken: "fake_access_valid_test_only",
      refreshToken: "fake_refresh_valid_test_only",
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
      accessToken: "fake_access_valid_test_only",
      refreshToken: "fake_refresh_valid_test_only",
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
      accessToken: "fake_access_valid_test_only",
      refreshToken: "fake_refresh_valid_test_only",
      expiresAt: Date.now() + 3_600_000,
      scope: "user-modify-playback-state",
      updatedAt: new Date().toISOString(),
    });

    const fetchFn = async () => new Response("forbidden", { status: 403 });
    await assertRejectsWithoutTokenLeak(
      spotifyApi.pausePlayback({ fetchFn }),
      /Spotify pause failed: no active device\./,
      ["fake_access_valid_test_only", "fake_refresh_valid_test_only"],
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

test("fetchCurrentlyPlaying treats 404 and 204 as idle and updates last-fetch time", async () => {
  await withApiEnv(async ({ authStore, spotifyApi, spotifyAuth }) => {
    saveFakeAuth(authStore, "fake_access_idle_test_only");
    const originalDateNow = Date.now;
    let expectedTimestamp = originalDateNow() + 1_000;
    Date.now = () => expectedTimestamp;

    try {
      for (const status of [404, 204]) {
        spotifyAuth.setLastFetchAt(null);
        const raw = await spotifyApi.fetchCurrentlyPlaying({
          fetchFn: async () => new Response(null, { status }),
        });
        assert.equal(raw, null);
        assert.equal(spotifyAuth.getLastFetchAt(), expectedTimestamp);
        expectedTimestamp += 1_000;
      }
    } finally {
      Date.now = originalDateNow;
    }
  });
});

test("fetchCurrentlyPlaying swallows a failed refresh after 401", async () => {
  await withApiEnv(async ({ authStore, spotifyApi }) => {
    saveFakeAuth(authStore, "fake_access_refresh_failure_test_only");
    let playerCalls = 0;
    let tokenCalls = 0;

    const raw = await spotifyApi.fetchCurrentlyPlaying({
      fetchFn: async (url) => {
        if (String(url).includes("/api/token")) {
          tokenCalls += 1;
          return new Response("fake_access_refresh_failure_test_only", { status: 500 });
        }
        playerCalls += 1;
        return new Response("unauthorized", { status: 401 });
      },
    });

    assert.equal(raw, null);
    assert.equal(playerCalls, 1);
    assert.equal(tokenCalls, 1);
  });
});

for (const status of [429, 500]) {
  test(`fetchCurrentlyPlaying reports HTTP ${status} without leaking tokens`, async () => {
    await withApiEnv(async ({ authStore, spotifyApi }) => {
      const accessToken = `fake_access_http_${status}_test_only`;
      saveFakeAuth(authStore, accessToken);
      await assert.rejects(
        spotifyApi.fetchCurrentlyPlaying({
          fetchFn: async () => new Response("request failed", { status }),
        }),
        (error) => {
          assert.equal(error.message, `Spotify currently-playing request failed (HTTP ${status})`);
          assertNoTokenLeak(error, [accessToken, fakeTokens[2]]);
          return true;
        },
      );
    });
  });
}

test("fetchCurrentlyPlaying does not retry a second 401", async () => {
  await withApiEnv(async ({ authStore, spotifyApi }) => {
    saveFakeAuth(authStore, fakeTokens[0]);
    let playerCalls = 0;
    let tokenCalls = 0;

    await assertRejectsWithoutTokenLeak(
      spotifyApi.fetchCurrentlyPlaying({
        fetchFn: async (url) => {
          if (String(url).includes("/api/token")) {
            tokenCalls += 1;
            return new Response(JSON.stringify({
              access_token: fakeTokens[1],
              expires_in: 3600,
            }), { status: 200, headers: { "Content-Type": "application/json" } });
          }
          playerCalls += 1;
          return new Response("unauthorized", { status: 401 });
        },
      }),
      /Spotify currently-playing request failed \(HTTP 401\)/,
    );

    assert.equal(playerCalls, 2);
    assert.equal(tokenCalls, 1);
  });
});

const playbackControls = [
  {
    name: "skipToNext",
    method: "POST",
    path: "/me/player/next",
    invoke: (api, options) => api.skipToNext(options),
    body: undefined,
  },
  {
    name: "skipToPrevious",
    method: "POST",
    path: "/me/player/previous",
    invoke: (api, options) => api.skipToPrevious(options),
    body: undefined,
  },
  {
    name: "pausePlayback",
    method: "PUT",
    path: "/me/player/pause",
    invoke: (api, options) => api.pausePlayback(options),
    body: undefined,
  },
  {
    name: "resumePlayback",
    method: "PUT",
    path: "/me/player/play",
    invoke: (api, options) => api.resumePlayback(options),
    body: "{}",
  },
];

for (const control of playbackControls) {
  test(`${control.name} retries once with the refreshed token and sends the expected request`, async () => {
    await withApiEnv(async ({ authStore, spotifyApi }) => {
      saveFakeAuth(authStore, fakeTokens[0]);
      const requests = [];
      let tokenCalls = 0;

      const fetchFn = async (url, init) => {
        if (String(url).includes("/api/token")) {
          tokenCalls += 1;
          return new Response(JSON.stringify({
            access_token: fakeTokens[1],
            expires_in: 3600,
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }

        requests.push({ url: String(url), init });
        return new Response(null, { status: requests.length === 1 ? 401 : 204 });
      };

      await control.invoke(spotifyApi, { fetchFn });

      assert.equal(tokenCalls, 1);
      assert.equal(requests.length, 2);
      for (const [index, { url, init }] of requests.entries()) {
        assert.equal(url, `https://api.spotify.com/v1${control.path}`);
        assert.equal(init.method, control.method);
        assert.equal(
          init.headers.Authorization,
          `Bearer ${index === 0 ? fakeTokens[0] : fakeTokens[1]}`,
        );
        if (control.body === undefined) {
          assert.equal(init.headers["Content-Type"], undefined);
          assert.equal(init.body, undefined);
        } else {
          assert.equal(init.headers["Content-Type"], "application/json");
          assert.equal(init.body, control.body);
        }
      }
    });
  });
}

test("playback control returns login guidance when auth disappears after a 401", async () => {
  await withApiEnv(async ({ authStore, spotifyApi }) => {
    const accessToken = "fake_access_removed_after_401_test_only";
    saveFakeAuth(authStore, accessToken);
    const requests = [];
    await assertRejectsWithoutTokenLeak(
      spotifyApi.skipToNext({
        fetchFn: async (url, init) => {
          requests.push({
            url: String(url),
            method: init.method,
            authorization: init.headers.Authorization,
          });
          authStore.clearAuth();
          return new Response("unauthorized", { status: 401 });
        },
      }),
      /Spotify is not authenticated\. Run \/spotify:login\./,
      [accessToken, fakeTokens[2]],
    );
    assert.deepEqual(requests, [{
      url: "https://api.spotify.com/v1/me/player/next",
      method: "POST",
      authorization: `Bearer ${accessToken}`,
    }]);
  });
});

test("playback control masks refresh failure and does not leak tokens", async () => {
  await withApiEnv(async ({ authStore, spotifyApi }) => {
    const accessToken = "fake_access_control_refresh_failure_test_only";
    saveFakeAuth(authStore, accessToken);
    const requests = [];
    await assertRejectsWithoutTokenLeak(
      spotifyApi.skipToPrevious({
        fetchFn: async (url) => {
          requests.push(String(url).includes("/api/token") ? "token" : "player");
          if (String(url).includes("/api/token")) {
            return new Response(accessToken, { status: 503 });
          }
          return new Response("unauthorized", { status: 401 });
        },
      }),
      /Spotify token refresh failed\. Run \/spotify:login again\./,
      [accessToken, fakeTokens[2]],
    );
    assert.deepEqual(requests, ["player", "token"]);
  });
});

test("playback control does not refresh more than once after a second 401", async () => {
  await withApiEnv(async ({ authStore, spotifyApi }) => {
    saveFakeAuth(authStore, fakeTokens[0]);
    const requests = [];
    await assertRejectsWithoutTokenLeak(
      spotifyApi.skipToNext({
        fetchFn: async (url) => {
          const request = String(url);
          requests.push(request.includes("/api/token") ? "token" : "player");
          if (request.includes("/api/token")) {
            return new Response(JSON.stringify({
              access_token: fakeTokens[1],
              expires_in: 3600,
            }), { status: 200, headers: { "Content-Type": "application/json" } });
          }
          return new Response("unauthorized", { status: 401 });
        },
      }),
      /Spotify skip to next track failed \(HTTP 401\)\./,
    );
    assert.deepEqual(requests, ["player", "token", "player"]);
    assert.equal(requests.filter((request) => request === "player").length, 2);
    assert.equal(requests.filter((request) => request === "token").length, 1);
  });
});

test("playback control rejects unauthenticated starts with login guidance", async () => {
  await withApiEnv(async ({ spotifyApi }) => {
    let fetchCalls = 0;
    await assertRejectsWithoutTokenLeak(
      spotifyApi.resumePlayback({
        fetchFn: async () => {
          fetchCalls += 1;
          throw new Error("fetch must not run without auth");
        },
      }),
      /Spotify is not authenticated\. Run \/spotify:login\./,
      [],
    );
    assert.equal(fetchCalls, 0);
  });
});

test("assertPlaybackControlOk handles success, no-device, and other HTTP statuses", async () => {
  const { assertPlaybackControlOk } = (await import("../lib/spotify-api.ts")).__testing;

  for (const status of [200, 204]) {
    assert.doesNotThrow(() => assertPlaybackControlOk(new Response(null, { status }), "pause"));
  }

  assert.throws(
    () => assertPlaybackControlOk(new Response(null, { status: 403 }), "skip to previous track"),
    (error) => {
      assert.match(error.message, /Spotify skip to previous track failed: no active device\./);
      return true;
    },
  );

  for (const status of [429, 500]) {
    assert.throws(
      () => assertPlaybackControlOk(new Response(null, { status }), "resume"),
      (error) => {
        assert.equal(error.message, `Spotify resume failed (HTTP ${status}).`);
        return true;
      },
    );
  }
});
