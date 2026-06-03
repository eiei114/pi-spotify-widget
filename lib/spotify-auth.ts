import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { URL } from "node:url";
import {
  clearAuth,
  authFileExists,
  getAuthFilePath,
  isConfigured,
  loadAuth,
  saveAuth,
  type SpotifyAuthRecord,
} from "./auth-store.ts";
import {
  CALLBACK_HOST,
  CALLBACK_PATH,
  CALLBACK_PORT,
  LOGIN_TIMEOUT_MS,
  REDIRECT_URI,
  clientIdStatusText,
  requireClientId,
  resolveClientId,
  scopeString,
  SPOTIFY_AUTH_URL,
  SPOTIFY_TOKEN_URL,
  TOKEN_REFRESH_BUFFER_MS,
} from "./spotify-config.ts";

export interface SecretSafeStatus {
  configured: boolean;
  expired: boolean;
  expiresInText: string;
  authFilePath: string;
  source: "spotify-web-api";
  lastFetchText: string;
}

let lastFetchAt: number | null = null;

export function setLastFetchAt(timestamp: number | null): void {
  lastFetchAt = timestamp;
}

export function getLastFetchAt(): number | null {
  return lastFetchAt;
}

export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function isExpired(auth: SpotifyAuthRecord, now = Date.now()): boolean {
  return auth.expiresAt <= now;
}

export function needsRefresh(auth: SpotifyAuthRecord, now = Date.now()): boolean {
  return auth.expiresAt - now <= TOKEN_REFRESH_BUFFER_MS;
}

function nowIso(): string {
  return new Date().toISOString();
}

function ageText(timestamp: number | null): string {
  if (!timestamp) return "never";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function expiresInText(auth: SpotifyAuthRecord | null, now = Date.now()): string {
  if (!auth) return "n/a";
  const diffMs = auth.expiresAt - now;
  if (diffMs <= 0) return "expired";
  const minutes = Math.ceil(diffMs / 60_000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `in ${hours}h ${remMinutes}m` : `in ${hours}h`;
}

export function formatSecretSafeStatus(now = Date.now()): string {
  const auth = loadAuth();
  const status: SecretSafeStatus = {
    configured: isConfigured(),
    expired: auth ? isExpired(auth, now) : false,
    expiresInText: expiresInText(auth, now),
    authFilePath: getAuthFilePath(),
    source: "spotify-web-api",
    lastFetchText: ageText(lastFetchAt),
  };

  const authFileState = authFileExists()
    ? (status.configured ? "present" : "present but invalid or incomplete")
    : "missing";
  const lines = [
    clientIdStatusText(),
    `oauth: ${status.configured ? "connected" : "not connected"}`,
    `configured: ${status.configured ? "yes" : "no"}`,
    `expires: ${status.expiresInText}`,
    `lastFetch: ${status.lastFetchText}`,
    `source: ${status.source}`,
    `auth file: ${status.authFilePath} (${authFileState})`,
  ];
  if (!status.configured && resolveClientId()) {
    lines.push("next: run /spotify:login and approve access in the browser");
  }
  return lines.join("\n");
}

export function openExternalUrl(url: string): void {
  if (process.env.PI_SPOTIFY_DISABLE_OPEN === "1") return;

  // Windows `cmd start` truncates URLs at `&`, which breaks Spotify OAuth query strings.
  if (process.platform === "win32") {
    const child = spawn(
      "powershell",
      ["-NoProfile", "-Command", `Start-Process ${JSON.stringify(url)}`],
      { detached: true, stdio: "ignore", shell: false },
    );
    child.unref?.();
    return;
  }

  const command = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(command, [url], { detached: true, stdio: "ignore", shell: false });
  child.unref?.();
}

function buildAuthorizeUrl(clientId: string, codeChallenge: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: scopeString(),
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    state,
  });
  return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

async function exchangeToken(
  body: URLSearchParams,
  fetchFn: typeof fetch = fetch,
): Promise<TokenResponse> {
  const res = await fetchFn(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Spotify token exchange failed (HTTP ${res.status})${text ? `: ${text.slice(0, 120)}` : ""}`);
  }
  return res.json() as Promise<TokenResponse>;
}

function authFromTokenResponse(
  token: TokenResponse,
  previous?: SpotifyAuthRecord | null,
): SpotifyAuthRecord {
  const refreshToken = token.refresh_token ?? previous?.refreshToken;
  if (!refreshToken) {
    throw new Error("Spotify token response did not include a refresh token.");
  }
  return {
    accessToken: token.access_token,
    refreshToken,
    expiresAt: Date.now() + token.expires_in * 1000,
    scope: token.scope ?? previous?.scope ?? scopeString(),
    updatedAt: nowIso(),
  };
}

function parseCallbackRequest(req: IncomingMessage): { code?: string; error?: string; state?: string } {
  const host = req.headers.host ?? `${CALLBACK_HOST}:${CALLBACK_PORT}`;
  const url = new URL(req.url ?? "/", `http://${host}`);
  return {
    code: url.searchParams.get("code") ?? undefined,
    error: url.searchParams.get("error") ?? undefined,
    state: url.searchParams.get("state") ?? undefined,
  };
}

function sendCallbackPage(res: ServerResponse, title: string, message: string): void {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><p>${message}</p><p>You can close this tab and return to Pi.</p></body></html>`;
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

export interface LoginOptions {
  clientId?: string;
  fetchFn?: typeof fetch;
  openUrl?: (url: string) => void;
  onAuthorizeUrl?: (url: string) => void;
}

export async function login(options: LoginOptions = {}): Promise<void> {
  const clientId = options.clientId?.trim() || requireClientId();
  const fetchFn = options.fetchFn ?? fetch;
  const openUrl = options.openUrl ?? openExternalUrl;
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = randomBytes(16).toString("hex");

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      if ((req.url ?? "").split("?")[0] !== CALLBACK_PATH) {
        res.writeHead(404);
        res.end();
        return;
      }

      const parsed = parseCallbackRequest(req);
      if (parsed.state && parsed.state !== state) {
        sendCallbackPage(res, "Spotify login failed", "State mismatch. Return to Pi and run /spotify:login again.");
        server.close();
        reject(new Error("OAuth state mismatch. Run /spotify:login again."));
        return;
      }
      if (parsed.error) {
        sendCallbackPage(res, "Spotify login failed", "Authorization was denied or failed.");
        server.close();
        reject(new Error(`Spotify authorization failed: ${parsed.error}`));
        return;
      }
      if (!parsed.code) {
        sendCallbackPage(res, "Spotify login failed", "Missing authorization code.");
        server.close();
        reject(new Error("Spotify callback did not include an authorization code."));
        return;
      }

      sendCallbackPage(res, "Spotify login successful", "Authorization complete.");
      server.close();
      resolve(parsed.code);
    });

    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        reject(new Error(
          `Port ${CALLBACK_PORT} is already in use. Close the other app using it and run /spotify:login again.`,
        ));
        return;
      }
      reject(error);
    });

    server.listen(CALLBACK_PORT, CALLBACK_HOST, () => {
      const authorizeUrl = buildAuthorizeUrl(clientId, challenge, state);
      options.onAuthorizeUrl?.(authorizeUrl);
      openUrl(authorizeUrl);
    });

    setTimeout(() => {
      server.close();
      reject(new Error("Spotify login timed out after 5 minutes. Run /spotify:login to try again."));
    }, LOGIN_TIMEOUT_MS).unref?.();
  });

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    code_verifier: verifier,
  });
  const token = await exchangeToken(body, fetchFn);
  saveAuth(authFromTokenResponse(token));
}

export interface RefreshOptions {
  fetchFn?: typeof fetch;
}

export async function refreshAccessToken(
  auth: SpotifyAuthRecord,
  options: RefreshOptions = {},
): Promise<SpotifyAuthRecord> {
  const fetchFn = options.fetchFn ?? fetch;
  const clientId = requireClientId();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: auth.refreshToken,
    client_id: clientId,
  });
  const token = await exchangeToken(body, fetchFn);
  const next = authFromTokenResponse(token, auth);
  saveAuth(next);
  return next;
}

export async function refreshIfNeeded(options: RefreshOptions = {}): Promise<SpotifyAuthRecord | null> {
  const auth = loadAuth();
  if (!auth) return null;
  if (!needsRefresh(auth)) return auth;
  try {
    return await refreshAccessToken(auth, options);
  } catch {
    clearAuth();
    return null;
  }
}

export async function getValidAccessToken(options: RefreshOptions = {}): Promise<string | null> {
  const auth = await refreshIfNeeded(options);
  if (!auth) return null;
  if (isExpired(auth)) {
    try {
      const refreshed = await refreshAccessToken(auth, options);
      return refreshed.accessToken;
    } catch {
      clearAuth();
      return null;
    }
  }
  return auth.accessToken;
}

export function logout(): void {
  clearAuth();
  lastFetchAt = null;
}

export const __testing = {
  ageText,
  authFromTokenResponse,
  buildAuthorizeUrl,
  exchangeToken,
  expiresInText,
  generateCodeChallenge,
  generateCodeVerifier,
  isExpired,
  needsRefresh,
  parseCallbackRequest,
  resolveClientId,
};
