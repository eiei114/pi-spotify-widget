/**
 * pi-spotify-widget - Pi coding-agent extension
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { isConfigured } from "../lib/auth-store.ts";
import {
  formatSecretSafeStatus,
  login,
  logout,
  openExternalUrl,
} from "../lib/spotify-auth.ts";
import {
  fetchCurrentlyPlaying,
  pausePlayback,
  playTrackUri,
  resumePlayback,
  skipToNext,
  skipToPrevious,
  spotifyUrlToTrackUri,
} from "../lib/spotify-api.ts";
import {
  toPlaybackSnapshot,
  type PlaybackSnapshot,
} from "../lib/playback-snapshot.ts";
import {
  formatPlaybackHelpMarkdown,
  playbackCommandById,
} from "../lib/playback-commands.ts";
import {
  computeRefreshDelayMs,
  shouldRefreshAtTrackEnd,
  trackIdentity,
} from "../lib/refresh-schedule.ts";
import {
  REDIRECT_URI,
  resolveClientId,
  saveStoredClientId,
  SPOTIFY_DASHBOARD_URL,
  WIDGET_ID,
} from "../lib/spotify-config.ts";
import { openSpotifySharePost } from "../lib/x-share.ts";
import {
  renderError,
  renderIdle,
  renderNoAuth,
  renderSnapshot,
} from "../lib/widget-render.ts";

type SetWidget = (id: string, lines: string[] | undefined) => void;
type Theme = {
  fg: (color: "accent" | "dim" | "muted" | "success" | "error", text: string) => string;
};

type WidgetCtx = {
  hasUI: boolean;
  ui: {
    notify: (msg: string, level: "info" | "warning" | "error") => void;
    setWidget: SetWidget;
    setStatus: (key: string, text: string | undefined) => void;
    theme: Theme;
  };
};

const COMMANDS = [
  ["login", "open Spotify Developer Dashboard, enter Client ID, OAuth PKCE login"],
  ["status", "show secret-safe Spotify auth status"],
  ["logout", "remove stored Spotify tokens"],
  ["refresh", "force playback snapshot fetch"],
  ["prev", "skip to previous track"],
  ["next", "skip to next track"],
  ["pause", "pause playback"],
  ["play", "resume playback"],
  ["help", "show playback command list for AI/user"],
  ["share", "open X compose with now playing (soccer-widget style)"],
  ["play-uri", "play a Spotify track URL or URI"],
] as const;

const DISPLAY_TICK_MS = 1000;
const TRACK_END_FETCH_COOLDOWN_MS = 800;

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let displayTimer: ReturnType<typeof setInterval> | null = null;
let lastSnapshot: PlaybackSnapshot | null = null;
let lastTrackEndFetchAt = 0;
let widgetCtx: WidgetCtx | null = null;

function clearRefreshTimer(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

function clearDisplayTimer(): void {
  if (displayTimer) {
    clearInterval(displayTimer);
    displayTimer = null;
  }
}

function clearAllTimers(): void {
  clearRefreshTimer();
  clearDisplayTimer();
  widgetCtx = null;
}

function isStaleContextError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("This extension ctx is stale");
}

function showText(
  ctx: { ui: { notify: (msg: string, level: "info" | "warning" | "error") => void } },
  text: string,
  level: "info" | "warning" | "error" = "info",
): void {
  const firstLine = text.split(/\r?\n/)[0] ?? text;
  ctx.ui.notify(firstLine, level);
}

function formatStatusMarkdown(): string {
  return ["### Spotify status", "", "```text", formatSecretSafeStatus(), "```"].join("\n");
}

function statusFooterText(): string | undefined {
  if (!isConfigured()) return "Spotify: not logged in";
  const line = formatSecretSafeStatus().split(/\r?\n/).find((entry) => entry.startsWith("expires:"));
  return line ? `Spotify · ${line.replace("expires: ", "expires ")}` : "Spotify · logged in";
}

async function showCommandOutput(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  kind: string,
  content: string,
  level: "info" | "warning" | "error" = "info",
): Promise<void> {
  showText(ctx, content, level);
  pi.sendMessage({ customType: "spotify-widget", content, display: true, details: { kind } });
}

function clientIdGuideText(): string {
  return [
    "Spotify Developer setup:",
    `1. Open: ${SPOTIFY_DASHBOARD_URL}`,
    "2. Create an app in the Spotify Developer Dashboard.",
    `3. Add redirect URI: ${REDIRECT_URI}`,
    "4. Copy the Client ID (Client Secret is not needed for PKCE).",
    "5. Paste the Client ID into the Pi prompt below.",
  ].join("\n");
}

async function ensureClientIdForLogin(ctx: ExtensionCommandContext): Promise<string | undefined> {
  if (!ctx.hasUI) throw new Error("Spotify login requires interactive UI. Run /spotify:login inside Pi.");
  let clientId = resolveClientId();
  if (clientId) {
    showText(ctx, "Client ID is already saved. Opening Spotify authorization in your browser.", "info");
    return clientId;
  }
  showText(ctx, clientIdGuideText(), "info");
  openExternalUrl(SPOTIFY_DASHBOARD_URL);
  const entered = await ctx.ui.input("Spotify Client ID:", "paste Client ID from Developer Dashboard");
  clientId = String(entered ?? "").trim();
  if (!clientId) {
    showText(ctx, "Spotify Client ID was not saved.", "warning");
    return undefined;
  }
  saveStoredClientId(clientId);
  showText(ctx, "Saved Spotify Client ID for pi-spotify-widget.");
  return clientId;
}

function applySnapshotToWidget(setWidget: SetWidget, theme: Theme, snapshot: PlaybackSnapshot | null, stale = false): void {
  if (!snapshot?.track) {
    const idle: PlaybackSnapshot = snapshot ?? { track: "", artist: "", isPlaying: false, fetchedAt: Date.now() };
    setWidget(WIDGET_ID, renderIdle(idle, theme, { stale }));
    return;
  }
  setWidget(WIDGET_ID, renderSnapshot(snapshot, theme, { stale }));
}

async function refreshWidget(setWidget: SetWidget, theme: Theme): Promise<void> {
  if (!isConfigured()) {
    lastSnapshot = null;
    setWidget(WIDGET_ID, renderNoAuth(theme));
    return;
  }
  const previousIdentity = trackIdentity(lastSnapshot);
  try {
    const raw = await fetchCurrentlyPlaying();
    const snapshot = toPlaybackSnapshot(raw);
    if (snapshot) {
      lastSnapshot = snapshot;
      applySnapshotToWidget(setWidget, theme, snapshot);
    } else {
      lastSnapshot = { track: "", artist: "", isPlaying: false, fetchedAt: Date.now() };
      applySnapshotToWidget(setWidget, theme, lastSnapshot);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (lastSnapshot?.track || lastSnapshot) {
      applySnapshotToWidget(setWidget, theme, lastSnapshot, true);
      return;
    }
    setWidget(WIDGET_ID, renderError(message, theme));
    return;
  }
  const nextIdentity = trackIdentity(lastSnapshot);
  if (previousIdentity && nextIdentity && previousIdentity !== nextIdentity) scheduleNextRefresh(0);
}

function scheduleNextRefresh(delayOverrideMs?: number): void {
  clearRefreshTimer();
  if (!widgetCtx) return;
  const delay = delayOverrideMs ?? computeRefreshDelayMs(lastSnapshot);
  const run = () => {
    if (!widgetCtx) return;
    void refreshWidget((id, lines) => widgetCtx!.ui.setWidget(id, lines), widgetCtx.ui.theme)
      .catch((error) => {
        if (isStaleContextError(error)) { clearRefreshTimer(); return; }
        const message = error instanceof Error ? error.message : String(error);
        try { widgetCtx?.ui.setWidget(WIDGET_ID, renderError(message, widgetCtx.ui.theme)); } catch { /* ignore */ }
      })
      .finally(() => scheduleNextRefresh());
  };
  if (delay <= 0) { run(); return; }
  refreshTimer = setTimeout(run, delay);
  refreshTimer.unref?.();
}

function resetDisplayTimer(ctx: WidgetCtx): void {
  clearDisplayTimer();
  displayTimer = setInterval(() => {
    if (!lastSnapshot) return;
    try {
      ctx.ui.setWidget(WIDGET_ID, lastSnapshot.track ? renderSnapshot(lastSnapshot, ctx.ui.theme) : renderIdle(lastSnapshot, ctx.ui.theme));
    } catch (error) {
      if (isStaleContextError(error)) clearDisplayTimer();
    }
    if (!lastSnapshot.isPlaying || !lastSnapshot.track) return;
    if (!shouldRefreshAtTrackEnd(lastSnapshot)) return;
    const now = Date.now();
    if (now - lastTrackEndFetchAt < TRACK_END_FETCH_COOLDOWN_MS) return;
    lastTrackEndFetchAt = now;
    void refreshWidget((id, lines) => ctx.ui.setWidget(id, lines), ctx.ui.theme).finally(() => scheduleNextRefresh());
  }, DISPLAY_TICK_MS);
  displayTimer.unref?.();
}

function bindWidgetContext(ctx: WidgetCtx): void {
  widgetCtx = ctx;
  scheduleNextRefresh();
  resetDisplayTimer(ctx);
}

async function runPlaybackControl(command: "prev" | "next" | "pause" | "play"): Promise<string> {
  if (command === "prev") { await skipToPrevious(); return "Spotify: previous track."; }
  if (command === "next") { await skipToNext(); return "Spotify: next track."; }
  if (command === "pause") { await pausePlayback(); return "Spotify: paused."; }
  await resumePlayback();
  return "Spotify: resumed.";
}

function shareOutputMarkdown(result: { mode: "api" | "intent"; text: string; tweetUrl?: string; intentUrl?: string }): string {
  if (result.mode === "api") {
    const parts = ["### Shared on X", "", "```text", result.text, "```"];
    if (result.tweetUrl) parts.push("", `Posted: ${result.tweetUrl}`);
    return parts.join("\n");
  }
  const parts = [
    "### Share on X",
    "",
    "ブラウザで X の投稿画面を開きます。開かない場合は次の URL をクリックしてください:",
    "",
  ];
  if (result.intentUrl) parts.push(result.intentUrl, "");
  parts.push("```text", result.text, "```");
  return parts.join("\n");
}

async function handleSpotifyCommand(pi: ExtensionAPI, args: string, ctx: WidgetCtx): Promise<void> {
  const theme = ctx.ui.theme;
  const trimmed = String(args ?? "").trim();
  const [commandRaw] = trimmed.split(/\s+/).filter(Boolean);
  const command = (commandRaw ?? "").toLowerCase();

  if (command === "login") {
    try {
      const clientId = await ensureClientIdForLogin(ctx as ExtensionCommandContext);
      if (!clientId) return;
      await login({
        clientId,
        onAuthorizeUrl: (authorizeUrl) => {
          void showCommandOutput(pi, ctx as ExtensionCommandContext, "authorize-url", ["### Spotify authorization", "", authorizeUrl].join("\n"));
        },
      });
      showText(ctx, "Spotify login successful.");
      await refreshWidget((id, lines) => ctx.ui.setWidget(id, lines), theme);
      scheduleNextRefresh(0);
    } catch (error) {
      showText(ctx, `Spotify login failed: ${error instanceof Error ? error.message : String(error)}`, "warning");
    }
    return;
  }

  if (command === "status") {
    await showCommandOutput(pi, ctx as ExtensionCommandContext, "status", formatStatusMarkdown());
    ctx.ui.setStatus("spotify", statusFooterText());
    return;
  }

  if (command === "logout") {
    logout();
    lastSnapshot = null;
    ctx.ui.setWidget(WIDGET_ID, renderNoAuth(theme));
    showText(ctx, "Spotify logout complete.");
    scheduleNextRefresh();
    return;
  }

  if (command === "refresh") {
    await refreshWidget((id, lines) => ctx.ui.setWidget(id, lines), theme);
    scheduleNextRefresh(0);
    showText(ctx, "Spotify playback snapshot refreshed.");
    return;
  }

  if (command === "help") {
    await showCommandOutput(pi, ctx as ExtensionCommandContext, "help", formatPlaybackHelpMarkdown());
    return;
  }

  if (command === "share") {
    try {
      let snapshot = lastSnapshot;
      if (!snapshot?.track) {
        await refreshWidget((id, lines) => ctx.ui.setWidget(id, lines), theme);
        snapshot = lastSnapshot;
      }
      if (!snapshot?.track) {
        showText(ctx, "Nothing playing to share.", "warning");
        return;
      }
      const customPrefix = trimmed.slice(command.length).trim();
      const result = openSpotifySharePost(snapshot, { customPrefix: customPrefix || undefined });
      await showCommandOutput(pi, ctx as ExtensionCommandContext, "share", shareOutputMarkdown(result));
      showText(ctx, "Opening X compose. Screenshot upload is manual.");
    } catch (error) {
      showText(ctx, error instanceof Error ? error.message : String(error), "warning");
    }
    return;
  }

  if (command === "play-uri" || command === "playuri") {
    try {
      const uriArg = trimmed.slice(command.length).trim();
      if (!uriArg) {
        showText(ctx, "Usage: /spotify:play-uri <spotify-track-url-or-uri>", "warning");
        return;
      }
      await playTrackUri(spotifyUrlToTrackUri(uriArg));
      await refreshWidget((id, lines) => ctx.ui.setWidget(id, lines), theme);
      scheduleNextRefresh(0);
      showText(ctx, "Spotify: playing requested track.");
    } catch (error) {
      showText(ctx, error instanceof Error ? error.message : String(error), "warning");
    }
    return;
  }

  const playback = playbackCommandById(command);
  if (playback) {
    try {
      showText(ctx, await runPlaybackControl(playback.id));
      await refreshWidget((id, lines) => ctx.ui.setWidget(id, lines), theme);
      scheduleNextRefresh(0);
    } catch (error) {
      showText(ctx, error instanceof Error ? error.message : String(error), "warning");
    }
    return;
  }

  showText(ctx, `Unknown Spotify command: ${command || "(empty)"}. Try /spotify:help.`, "warning");
}

export const __testing = {
  clearAllTimers,
  clearDisplayTimer,
  clearRefreshTimer,
  getLastSnapshot: () => lastSnapshot,
  refreshWidget,
  resetLastSnapshot: () => { lastSnapshot = null; },
  scheduleNextRefresh,
};

export default function spotifyWidgetExtension(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    await refreshWidget((id, lines) => ctx.ui.setWidget(id, lines), ctx.ui.theme);
    bindWidgetContext(ctx);
  });
  pi.on("session_shutdown", () => clearAllTimers());
  for (const [command, description] of COMMANDS) {
    pi.registerCommand(`spotify:${command}`, {
      description: `Spotify: ${description}.`,
      handler: async (args, ctx) => {
        if (!ctx.hasUI) return;
        const suffix = String(args ?? "").trim();
        await handleSpotifyCommand(pi, suffix ? `${command} ${suffix}` : command, ctx);
      },
    });
  }
}
