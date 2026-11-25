import assert from "node:assert/strict";
import test from "node:test";

const {
  computeRefreshDelayMs,
  computeBackoffDelayMs,
  shouldRefreshAtTrackEnd,
  hasTrackChanged,
  needsDisplayProgressUpdate,
  remainingMs,
  POLL_IDLE_MS,
  POLL_PAUSED_MS,
  POLL_PLAYING_MS,
  POLL_NEAR_END_MS,
} = await import("../lib/refresh-schedule.ts");

const baseSnapshot = {
  track: "Song",
  artist: "Artist",
  isPlaying: true,
  progressMs: 30_000,
  durationMs: 60_000,
  fetchedAt: Date.now(),
};

test("hasTrackChanged prefers Spotify IDs when both snapshots have them", () => {
  const original = { ...baseSnapshot, trackId: "original" };
  assert.equal(hasTrackChanged(original, { ...original, trackId: "alternate" }), true);
  assert.equal(hasTrackChanged(original, { ...original, track: "New title", artist: "New artist" }), false);
});

test("hasTrackChanged falls back to labels if either ID is missing", () => {
  const renamed = { ...baseSnapshot, track: "Other Song" };
  const otherArtist = { ...baseSnapshot, artist: "Other Artist" };
  const identified = { ...baseSnapshot, trackId: "original" };

  assert.equal(hasTrackChanged(baseSnapshot, { ...baseSnapshot }), false);
  assert.equal(hasTrackChanged(baseSnapshot, renamed), true);
  assert.equal(hasTrackChanged(baseSnapshot, otherArtist), true);
  assert.equal(hasTrackChanged(identified, baseSnapshot), false);
  assert.equal(hasTrackChanged(baseSnapshot, identified), false);
  assert.equal(hasTrackChanged(identified, renamed), true);
  assert.equal(hasTrackChanged(renamed, identified), true);
});

test("hasTrackChanged ignores entering or leaving idle", () => {
  const idle = { ...baseSnapshot, track: "", artist: "", isPlaying: false };
  assert.equal(hasTrackChanged(null, baseSnapshot), false);
  assert.equal(hasTrackChanged(idle, baseSnapshot), false);
  assert.equal(hasTrackChanged(baseSnapshot, idle), false);
});

test("computeRefreshDelayMs uses playing interval by default", () => {
  assert.equal(computeRefreshDelayMs(baseSnapshot), POLL_PLAYING_MS);
});

test("computeRefreshDelayMs speeds up near track end", () => {
  const nearEnd = {
    ...baseSnapshot,
    progressMs: 56_500,
    fetchedAt: Date.now(),
  };
  assert.equal(computeRefreshDelayMs(nearEnd), POLL_NEAR_END_MS);
});

test("computeRefreshDelayMs slows down when paused", () => {
  assert.equal(
    computeRefreshDelayMs({ ...baseSnapshot, isPlaying: false }),
    POLL_PAUSED_MS,
  );
});

test("computeRefreshDelayMs uses idle interval without track", () => {
  assert.equal(computeRefreshDelayMs(null), POLL_IDLE_MS);
});

test("computeBackoffDelayMs returns only the remaining time before retry", () => {
  assert.equal(computeBackoffDelayMs(10_000, 8_000), 2_000);
  assert.equal(computeBackoffDelayMs(10_000, 10_000), 0);
  assert.equal(computeBackoffDelayMs(10_000, 12_000), 0);
  assert.equal(computeBackoffDelayMs(Number.NaN, 8_000), 0);
});

test("shouldRefreshAtTrackEnd triggers at extrapolated end", () => {
  const ending = {
    ...baseSnapshot,
    progressMs: 59_600,
    fetchedAt: Date.now() - 500,
  };
  assert.equal(shouldRefreshAtTrackEnd(ending), true);
  assert.equal(remainingMs(ending) <= 500, true);
});

test("needsDisplayProgressUpdate skips snapshots without changing progress", () => {
  assert.equal(needsDisplayProgressUpdate(null), false);
  assert.equal(needsDisplayProgressUpdate({ ...baseSnapshot, track: "" }), false);
  assert.equal(needsDisplayProgressUpdate({ ...baseSnapshot, isPlaying: false }), false);
  assert.equal(needsDisplayProgressUpdate({ ...baseSnapshot, progressMs: undefined }), false);
  assert.equal(needsDisplayProgressUpdate({ ...baseSnapshot, progressMs: Number.NaN }), false);
  assert.equal(needsDisplayProgressUpdate(baseSnapshot), true);
});
