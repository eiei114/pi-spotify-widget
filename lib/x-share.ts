import { createHmac, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import type { PlaybackSnapshot } from "./playback-snapshot.ts";

export interface XCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

export type ShareMode = "intent" | "api";

export interface ShareResult {
  mode: ShareMode;
  text: string;
  tweetUrl?: string;
  intentUrl?: string;
}

export const PI_INSTALL_URL = "https://pi.dev";
export const SPOTIFY_PACKAGE_INSTALL = "pi install npm:pi-spotify-widget";

const X_TWEET_ENDPOINT = "https://api.twitter.com/2/tweets";
const X_INTENT_BASE = "https://twitter.com/intent/tweet";

export function resolveXCredentials(env: NodeJS.ProcessEnv = process.env): XCredentials | null {
  const apiKey = env.PI_X_API_KEY?.trim() || env.X_API_KEY?.trim();
  const apiSecret = env.PI_X_API_SECRET?.trim() || env.X_API_SECRET?.trim();
  const accessToken = env.PI_X_ACCESS_TOKEN?.trim() || env.X_ACCESS_TOKEN?.trim();
  const accessTokenSecret = env.PI_X_ACCESS_TOKEN_SECRET?.trim() || env.X_ACCESS_TOKEN_SECRET?.trim();
  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) return null;
  return { apiKey, apiSecret, accessToken, accessTokenSecret };
}

export function buildNowPlayingShareText(
  snapshot: PlaybackSnapshot,
  customPrefix?: string,
): string {
  const icon = snapshot.isPlaying ? "▶" : "⏸";
  const core = `${icon} ${snapshot.track} — ${snapshot.artist}`;
  const withUrl = snapshot.spotifyUrl ? `${core}\n${snapshot.spotifyUrl}` : core;
  const prefix = customPrefix?.trim();
  if (!prefix) return withUrl;
  return `${prefix}\n\n${withUrl}`;
}

export function buildShareIntentUrl(text: string): string {
  return `${X_INTENT_BASE}?text=${encodeURIComponent(text)}`;
}


/** Soccer-widget style X post: headline, track, install steps, note, hashtags. */
export function buildSpotifySharePostText(
  snapshot: PlaybackSnapshot,
  customPrefix?: string,
): string {
  const icon = snapshot.isPlaying ? "▶" : "⏸";
  const headline = customPrefix?.trim() || "Now playing on Pi";
  const lines: string[] = [
    `${headline} 🎧`,
    `${icon} ${snapshot.track} — ${snapshot.artist}`,
  ];
  if (snapshot.spotifyUrl) lines.push(snapshot.spotifyUrl);
  lines.push(
    "Try it:",
    `1 install ${PI_INSTALL_URL}`,
    `2 ${SPOTIFY_PACKAGE_INSTALL}`,
    "3 /spotify:login",
    "4 /spotify:share",
    "BYO Spotify Client ID. Login once in Pi.",
    "#NowPlaying #Spotify",
  );
  return lines.join("\n");
}

export function openSpotifySharePost(
  snapshot: PlaybackSnapshot,
  options: { customPrefix?: string; openUrl?: (url: string) => void } = {},
): ShareResult {
  const text = buildSpotifySharePostText(snapshot, options.customPrefix);
  return openShareIntent(text, options);
}

/** Same browser launch as pi-soccer-widget (cmd start on Windows). */
export function openBrowserUrl(url: string): void {
  if (process.env.PI_SPOTIFY_DISABLE_OPEN === "1") return;

  const platform = process.platform;
  const command = platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore", shell: false });
  child.unref?.();
}

export function openShareIntent(
  text: string,
  options: { openUrl?: (url: string) => void } = {},
): ShareResult {
  const intentUrl = buildShareIntentUrl(text);
  (options.openUrl ?? openBrowserUrl)(intentUrl);
  return { mode: "intent", text, intentUrl };
}

function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function oauth1Signature(
  method: string,
  url: string,
  oauthParams: Record<string, string>,
  credentials: XCredentials,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(oauthParams)) params.append(key, value);
  const paramString = Array.from(params.entries())
    .sort(([aKey, aVal], [bKey, bVal]) => (aKey === bKey ? aVal.localeCompare(bVal) : aKey.localeCompare(bKey)))
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join("&");

  const base = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString),
  ].join("&");

  const signingKey = `${percentEncode(credentials.apiSecret)}&${percentEncode(credentials.accessTokenSecret)}`;
  return createHmac("sha1", signingKey).update(base).digest("base64");
}

function oauth1Header(method: string, url: string, credentials: XCredentials): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
  };
  oauthParams.oauth_signature = oauth1Signature(method, url, oauthParams, credentials);

  const header = Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
    .join(", ");

  return `OAuth ${header}`;
}

export async function postToXApi(
  text: string,
  options: { credentials?: XCredentials | null; fetchFn?: typeof fetch } = {},
): Promise<ShareResult> {
  const credentials = options.credentials ?? resolveXCredentials();
  const fetchFn = options.fetchFn ?? fetch;
  if (!credentials) {
    throw new Error("X API credentials are not configured. Set PI_X_API_KEY and related env vars, or use /spotify:share without 'api'.");
  }

  const res = await fetchFn(X_TWEET_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: oauth1Header("POST", X_TWEET_ENDPOINT, credentials),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`X post failed (HTTP ${res.status})${body ? `: ${body.slice(0, 160)}` : ""}`);
  }

  const payload = await res.json() as { data?: { id?: string } };
  const id = payload.data?.id;
  return {
    mode: "api",
    text,
    tweetUrl: id ? `https://x.com/i/web/status/${id}` : undefined,
  };
}

export async function shareToX(
  text: string,
  options: { mode?: ShareMode; credentials?: XCredentials | null; fetchFn?: typeof fetch; openUrl?: (url: string) => void } = {},
): Promise<ShareResult> {
  const mode = options.mode ?? "intent";
  if (mode === "intent") return openShareIntent(text, options);
  return postToXApi(text, options);
}

/** @deprecated use shareToX */
export async function postToX(
  text: string,
  options: { credentials?: XCredentials | null; fetchFn?: typeof fetch; openUrl?: (url: string) => void } = {},
): Promise<ShareResult> {
  return shareToX(text, { ...options, mode: "intent" });
}

export const __testing = {
  buildNowPlayingShareText,
  buildShareIntentUrl,
  oauth1Signature,
  buildSpotifySharePostText,
  openBrowserUrl,
  openShareIntent,
  openSpotifySharePost,
  resolveXCredentials,
  shareToX,
};
