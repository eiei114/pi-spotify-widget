import assert from "node:assert/strict";
import test from "node:test";

const {
  computeRefreshDelayMs,
  shouldRefreshAtTrackEnd,
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

test("shouldRefreshAtTrackEnd triggers at extrapolated end", () => {
  const ending = {
    ...baseSnapshot,
    progressMs: 59_600,
    fetchedAt: Date.now() - 500,
  };
  assert.equal(shouldRefreshAtTrackEnd(ending), true);
  assert.equal(remainingMs(ending) <= 500, true);
});
