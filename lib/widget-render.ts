import type { PlaybackSnapshot } from "./playback-snapshot.ts";

type ThemeColor = "accent" | "dim" | "muted" | "success" | "error";
type Theme = {
  fg: (color: ThemeColor, text: string) => string;
};

const defaultTheme: Theme = {
  fg: (_color, text) => text,
};

const SEEK_BAR_WIDTH = 18;
const MAX_META_LEN = 48;

function ageText(fetchedAt: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - fetchedAt) / 1000));
  return `updated ${seconds}s ago`;
}

function staleHint(stale: boolean, theme: Theme): string {
  return stale ? theme.fg("dim", " (stale)") : "";
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1))}…`;
}

export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const sec = seconds.toString().padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${sec}`;
  }
  return `${minutes}:${sec}`;
}

export function effectiveProgressMs(snapshot: PlaybackSnapshot, now = Date.now()): number | undefined {
  if (typeof snapshot.progressMs !== "number" || !Number.isFinite(snapshot.progressMs)) {
    return undefined;
  }
  if (!snapshot.isPlaying) return Math.max(0, snapshot.progressMs);
  const elapsed = Math.max(0, now - snapshot.fetchedAt);
  const live = snapshot.progressMs + elapsed;
  if (typeof snapshot.durationMs === "number" && snapshot.durationMs > 0) {
    return Math.min(snapshot.durationMs, live);
  }
  return live;
}

export function renderSeekBar(
  progressMs: number,
  durationMs: number,
  options?: { width?: number; isPlaying?: boolean },
): string {
  const width = options?.width ?? SEEK_BAR_WIDTH;
  const headChar = options?.isPlaying === false ? "◆" : "●";

  if (durationMs <= 0) return "─".repeat(width);

  const ratio = Math.min(1, Math.max(0, progressMs / durationMs));
  const head = Math.min(width - 1, Math.round(ratio * (width - 1)));
  const chars: string[] = [];
  for (let i = 0; i < width; i += 1) {
    if (i < head) chars.push("━");
    else if (i === head) chars.push(headChar);
    else chars.push("─");
  }
  return chars.join("");
}

export function renderProgressLine(snapshot: PlaybackSnapshot, now = Date.now()): string | null {
  const progressMs = effectiveProgressMs(snapshot, now);
  if (progressMs === undefined) return null;

  const current = formatClock(progressMs);
  if (typeof snapshot.durationMs !== "number" || snapshot.durationMs <= 0) {
    return `${current} elapsed`;
  }

  const bar = renderSeekBar(progressMs, snapshot.durationMs, { isPlaying: snapshot.isPlaying });
  return `${current} ${bar} ${formatClock(snapshot.durationMs)}`;
}

export function renderNoAuth(theme: Theme = defaultTheme): string[] {
  return [theme.fg("dim", "♫ Run /spotify:login")];
}

export function renderIdle(snapshot: PlaybackSnapshot | null, theme: Theme = defaultTheme, options?: { stale?: boolean; now?: number }): string[] {
  const stale = options?.stale ?? false;
  return [theme.fg("dim", `♫ Nothing playing${stale ? " (stale)" : ""}`)];
}

export function renderSnapshot(snapshot: PlaybackSnapshot, theme: Theme = defaultTheme, options?: { stale?: boolean; now?: number }): string[] {
  const now = options?.now ?? Date.now();
  const stale = options?.stale ?? false;
  const icon = snapshot.isPlaying ? "▶" : "⏸";
  const meta = truncate(`${snapshot.track} — ${snapshot.artist}`, MAX_META_LEN);
  const progressLine = renderProgressLine(snapshot, now);

  const lines = [theme.fg("accent", `♫ ${icon} ${meta}${staleHint(stale, theme)}`)];
  if (progressLine) {
    lines.push(theme.fg("muted", progressLine));
  }
  return lines;
}

export function renderError(message: string, theme: Theme = defaultTheme): string[] {
  return [theme.fg("error", `♫ Spotify: ${message}`)];
}

export const __testing = {
  ageText,
  effectiveProgressMs,
  formatClock,
  renderProgressLine,
  renderSeekBar,
};
