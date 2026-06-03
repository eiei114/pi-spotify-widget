import assert from "node:assert/strict";
import test from "node:test";

const {
  renderError,
  renderIdle,
  renderNoAuth,
  renderSnapshot,
  __testing,
} = await import("../lib/widget-render.ts");

const theme = {
  fg: (_color, text) => text,
};

test("renderNoAuth prompts login", () => {
  assert.deepEqual(renderNoAuth(theme), ["♫ Run /spotify:login"]);
});

const snapshot = {
  track: "Track Name",
  artist: "Artist Name",
  isPlaying: true,
  progressMs: 90_000,
  durationMs: 240_000,
  fetchedAt: 1_700_000_000_000,
};

test("renderIdle shows nothing playing on one line", () => {
  const lines = renderIdle({ ...snapshot, track: "", artist: "", isPlaying: false, fetchedAt: 1_700_000_000_000 }, theme, { now: 1_700_000_018_000 });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Nothing playing/);
});

test("renderSnapshot uses two compact lines", () => {
  const lines = renderSnapshot(snapshot, theme, { now: 1_700_000_010_000 });
  assert.equal(lines.length, 2);
  assert.match(lines[0], /▶ Track Name — Artist Name/);
  assert.match(lines[1], /1:40 .* 4:00/);
  assert.match(lines[1], /●/);
});

test("renderSnapshot extrapolates progress while playing", () => {
  const early = __testing.renderProgressLine(snapshot, 1_700_000_000_000);
  const later = __testing.renderProgressLine(snapshot, 1_700_000_015_000);
  assert.notEqual(early, later);
  assert.match(later, /^1:4\d /);
});

test("renderSnapshot shows paused icon and frozen progress", () => {
  const lines = renderSnapshot({ ...snapshot, isPlaying: false }, theme, { now: 1_700_000_030_000 });
  assert.equal(lines.length, 2);
  assert.match(lines[0], /⏸ Track Name/);
  assert.match(lines[1], /◆/);
});

test("renderSnapshot marks stale snapshots", () => {
  const lines = renderSnapshot(snapshot, theme, { stale: true, now: 1_700_000_030_000 });
  assert.match(lines[0], /\(stale\)/);
});

test("renderSeekBar renders playhead inside the bar", () => {
  const bar = __testing.renderSeekBar(60_000, 120_000);
  assert.equal(bar.length, 18);
  assert.match(bar, /●/);
  assert.match(bar, /━/);
});

test("formatClock formats mm:ss and h:mm:ss", () => {
  assert.equal(__testing.formatClock(65_000), "1:05");
  assert.equal(__testing.formatClock(3_661_000), "1:01:01");
});

test("renderError includes message", () => {
  const lines = renderError("network down", theme);
  assert.match(lines[0], /Spotify: network down/);
});

test("ageText formats seconds", () => {
  assert.equal(__testing.ageText(1_700_000_000_000, 1_700_000_045_000), "updated 45s ago");
});
