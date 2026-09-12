/**
 * Measures display-tick widget re-render count for a 60s window.
 * Run: node scripts/benchmark-display-tick.mjs
 */
import { performance } from "node:perf_hooks";

const TICKS = 60;
const { needsDisplayProgressUpdate } = await import("../lib/refresh-schedule.ts");
const { renderSnapshot, renderIdle } = await import("../lib/widget-render.ts");

const theme = { fg: (_color, text) => text };
const pausedSnapshot = {
  track: "Song",
  artist: "Artist",
  isPlaying: false,
  progressMs: 30_000,
  durationMs: 60_000,
  fetchedAt: Date.now(),
};
const playingSnapshot = { ...pausedSnapshot, isPlaying: true };
const idleSnapshot = { track: "", artist: "", isPlaying: false, fetchedAt: Date.now() };

function countLegacyRenders(snapshot) {
  let renders = 0;
  const start = performance.now();
  for (let i = 0; i < TICKS; i += 1) {
    if (!snapshot) continue;
    if (snapshot.track) renderSnapshot(snapshot, theme);
    else renderIdle(snapshot, theme);
    renders += 1;
  }
  return { renders, ms: performance.now() - start };
}

function countOptimizedRenders(snapshot) {
  let renders = 0;
  const start = performance.now();
  for (let i = 0; i < TICKS; i += 1) {
    if (!snapshot) continue;
    if (needsDisplayProgressUpdate(snapshot)) {
      renderSnapshot(snapshot, theme);
      renders += 1;
    }
  }
  return { renders, ms: performance.now() - start };
}

function report(label, snapshot) {
  const legacy = countLegacyRenders(snapshot);
  const optimized = countOptimizedRenders(snapshot);
  const saved = legacy.renders - optimized.renders;
  const pct = legacy.renders === 0 ? 0 : Math.round((saved / legacy.renders) * 100);
  console.log(`${label}:`);
  console.log(`  legacy:    ${legacy.renders}/${TICKS} renders in ${legacy.ms.toFixed(2)}ms`);
  console.log(`  optimized: ${optimized.renders}/${TICKS} renders in ${optimized.ms.toFixed(2)}ms`);
  console.log(`  saved:     ${saved} renders (${pct}%)`);
}

console.log(`Display tick benchmark (${TICKS}s window, 1 tick/s)\n`);
report("paused", pausedSnapshot);
console.log("");
report("idle", idleSnapshot);
console.log("");
report("playing", playingSnapshot);
