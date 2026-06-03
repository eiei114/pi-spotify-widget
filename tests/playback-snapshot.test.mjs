import assert from "node:assert/strict";
import test from "node:test";

const { toPlaybackSnapshot } = await import("../lib/playback-snapshot.ts");

test("toPlaybackSnapshot maps playing payload", () => {
  const snapshot = toPlaybackSnapshot({
    is_playing: true,
    progress_ms: 42_000,
    item: {
      name: "Song Title",
      duration_ms: 201_000,
      artists: [{ name: "Artist One" }, { name: "Artist Two" }],
    },
  }, 1_700_000_000_000);

  assert.deepEqual(snapshot, {
    track: "Song Title",
    artist: "Artist One, Artist Two",
    isPlaying: true,
    progressMs: 42_000,
    durationMs: 201_000,
    fetchedAt: 1_700_000_000_000,
  });
});

test("toPlaybackSnapshot maps paused payload", () => {
  const snapshot = toPlaybackSnapshot({
    is_playing: false,
    item: {
      name: "Paused Song",
      artists: [{ name: "Paused Artist" }],
    },
  }, 1_700_000_000_001);

  assert.equal(snapshot?.isPlaying, false);
  assert.equal(snapshot?.track, "Paused Song");
});

test("toPlaybackSnapshot returns null for empty playback", () => {
  assert.equal(toPlaybackSnapshot(null), null);
  assert.equal(toPlaybackSnapshot({ is_playing: false, item: null }), null);
  assert.equal(toPlaybackSnapshot({ is_playing: true, item: { name: "", artists: [] } }), null);
});

test("toPlaybackSnapshot handles malformed artists gracefully", () => {
  const snapshot = toPlaybackSnapshot({
    is_playing: true,
    item: {
      name: "Track",
      artists: [{}, { name: "  Real Artist  " }],
    },
  });

  assert.equal(snapshot?.artist, "Real Artist");
});


test("toPlaybackSnapshot captures track id and spotify url", async () => {
  const { toPlaybackSnapshot } = await import("../lib/playback-snapshot.ts");
  const snapshot = toPlaybackSnapshot({
    is_playing: true,
    item: {
      id: "track123",
      name: "Live Track",
      external_urls: { spotify: "https://open.spotify.com/track/track123" },
      artists: [{ id: "artist1", name: "Live Artist" }],
    },
  });
  assert.equal(snapshot?.trackId, "track123");
  assert.equal(snapshot?.spotifyUrl, "https://open.spotify.com/track/track123");
  assert.deepEqual(snapshot?.artistIds, ["artist1"]);
});
