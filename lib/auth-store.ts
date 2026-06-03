import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AUTH_FILE_NAME } from "./spotify-config.ts";

export interface SpotifyAuthRecord {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
  updatedAt: string;
}

export function getAgentDir(): string {
  const override = process.env.PI_SPOTIFY_AGENT_DIR?.trim();
  if (override) return override;
  return join(homedir(), ".pi", "agent");
}

export function getAuthFilePath(): string {
  return join(getAgentDir(), AUTH_FILE_NAME);
}

export function authFileExists(): boolean {
  return existsSync(getAuthFilePath());
}

function ensureAgentDir(): void {
  try {
    mkdirSync(getAgentDir(), { recursive: true });
  } catch {
    // ignore
  }
}

export function loadAuth(): SpotifyAuthRecord | null {
  const file = getAuthFilePath();
  try {
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, "utf-8")) as Partial<SpotifyAuthRecord>;
    if (
      typeof parsed.accessToken !== "string"
      || typeof parsed.refreshToken !== "string"
      || typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAt: parsed.expiresAt,
      scope: typeof parsed.scope === "string" ? parsed.scope : "",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveAuth(record: SpotifyAuthRecord): void {
  ensureAgentDir();
  const file = getAuthFilePath();
  writeFileSync(file, JSON.stringify(record, null, 2), "utf-8");
  try {
    chmodSync(file, 0o600);
  } catch {
    // ignore chmod errors on platforms without POSIX modes
  }
}

export function clearAuth(): void {
  const file = getAuthFilePath();
  try {
    if (existsSync(file)) rmSync(file);
  } catch {
    // ignore
  }
}

export function isConfigured(): boolean {
  const auth = loadAuth();
  return Boolean(auth?.accessToken && auth.refreshToken);
}
