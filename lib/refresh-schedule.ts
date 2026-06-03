import type { PlaybackSnapshot } from "./playback-snapshot.ts";
import { effectiveProgressMs } from "./widget-render.ts";

export const POLL_IDLE_MS = 10_000;
export const POLL_PAUSED_MS = 15_000;
export const POLL_PLAYING_MS = 5_000;
export const POLL_NEAR_END_MS = 1_500;
export const NEAR_END_THRESHOLD_MS = 5_000;
export const TRACK_END_GRACE_MS = 500;

export function remainingMs(snapshot: PlaybackSnapshot, now = Date.now()): number | null {
  if (!snapshot.isPlaying) return null;
  const progress = effectiveProgressMs(snapshot, now);
  if (progress === undefined) return null;
  if (typeof snapshot.durationMs !== "number" || snapshot.durationMs <= 0) return null;
  return snapshot.durationMs - progress;
}

export function computeRefreshDelayMs(snapshot: PlaybackSnapshot | null, now = Date.now()): number {
  if (!snapshot?.track) return POLL_IDLE_MS;
  if (!snapshot.isPlaying) return POLL_PAUSED_MS;

  const remaining = remainingMs(snapshot, now);
  if (remaining === null) return POLL_PLAYING_MS;
  if (remaining <= NEAR_END_THRESHOLD_MS) return POLL_NEAR_END_MS;
  return POLL_PLAYING_MS;
}

export function shouldRefreshAtTrackEnd(snapshot: PlaybackSnapshot, now = Date.now()): boolean {
  if (!snapshot.isPlaying || !snapshot.track) return false;
  const remaining = remainingMs(snapshot, now);
  if (remaining === null) return false;
  return remaining <= TRACK_END_GRACE_MS;
}

export function trackIdentity(snapshot: PlaybackSnapshot | null): string {
  if (!snapshot?.track) return "";
  return `${snapshot.track}::${snapshot.artist}`;
}

export const __testing = {
  remainingMs,
  computeRefreshDelayMs,
  shouldRefreshAtTrackEnd,
  trackIdentity,
};
