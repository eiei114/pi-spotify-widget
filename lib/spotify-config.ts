import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "./auth-store.ts";

export const BUNDLED_CLIENT_ID = "";
export const SPOTIFY_DASHBOARD_URL = "https://developer.spotify.com/dashboard";

export const REDIRECT_URI = "http://127.0.0.1:8888/callback";
export const CALLBACK_HOST = "127.0.0.1";
export const CALLBACK_PORT = 8888;
export const CALLBACK_PATH = "/callback";

export const SCOPES = [
  "user-read-playback-state",
  "user-read-currently-playing",
  "user-modify-playback-state",
] as const;

export const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
export const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
export const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
export const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
/** @deprecated use refresh-schedule constants */
export const POLL_INTERVAL_MS = 5 * 1000;

export const AUTH_FILE_NAME = "pi-spotify-widget-auth.json";
export const CONFIG_FILE_NAME = "pi-spotify-widget-config.json";
export const WIDGET_ID = "pi-spotify-widget";

export type ClientIdSource = "environment" | "stored" | "bundled" | "missing";

export interface SpotifyClientConfigRecord {
  clientId: string;
  updatedAt: string;
}

export function getConfigFilePath(): string {
  return join(getAgentDir(), CONFIG_FILE_NAME);
}

function ensureAgentDir(): void {
  try {
    mkdirSync(getAgentDir(), { recursive: true });
  } catch {
    // ignore
  }
}

export function loadStoredClientId(): string | undefined {
  const file = getConfigFilePath();
  try {
    if (!existsSync(file)) return undefined;
    const parsed = JSON.parse(readFileSync(file, "utf-8")) as Partial<SpotifyClientConfigRecord>;
    const trimmed = typeof parsed.clientId === "string" ? parsed.clientId.trim() : "";
    return trimmed || undefined;
  } catch {
    return undefined;
  }
}

export function saveStoredClientId(clientId: string): void {
  ensureAgentDir();
  const file = getConfigFilePath();
  const record: SpotifyClientConfigRecord = {
    clientId: clientId.trim(),
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(file, JSON.stringify(record, null, 2), "utf-8");
  try {
    chmodSync(file, 0o600);
  } catch {
    // ignore chmod errors on platforms without POSIX modes
  }
}

export function clearStoredClientId(): void {
  const file = getConfigFilePath();
  try {
    if (existsSync(file)) rmSync(file);
  } catch {
    // ignore
  }
}

export function resolveClientIdSource(env: NodeJS.ProcessEnv = process.env): ClientIdSource {
  if (env.PI_SPOTIFY_CLIENT_ID?.trim()) return "environment";
  if (loadStoredClientId()) return "stored";
  if (BUNDLED_CLIENT_ID) return "bundled";
  return "missing";
}

export function resolveClientId(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.PI_SPOTIFY_CLIENT_ID?.trim();
  if (override) return override;
  const stored = loadStoredClientId();
  if (stored) return stored;
  return BUNDLED_CLIENT_ID;
}

export function clientIdStatusText(env: NodeJS.ProcessEnv = process.env): string {
  const source = resolveClientIdSource(env);
  if (source === "environment") {
    return "Spotify Client ID: configured via PI_SPOTIFY_CLIENT_ID environment variable.";
  }
  if (source === "stored") {
    return "Spotify Client ID: configured via /spotify:login.";
  }
  if (source === "bundled") {
    return "Spotify Client ID: configured via bundled app.";
  }
  return "Spotify Client ID: not configured. Run /spotify:login.";
}

export function requireClientId(env: NodeJS.ProcessEnv = process.env): string {
  const clientId = resolveClientId(env);
  if (!clientId) {
    throw new Error(
      "Spotify Client ID is not configured. Run /spotify:login to open the Spotify Developer Dashboard and enter your Client ID.",
    );
  }
  return clientId;
}

export function scopeString(): string {
  return SCOPES.join(" ");
}
