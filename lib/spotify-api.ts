import { getValidAccessToken, refreshAccessToken, setLastFetchAt } from "./spotify-auth.ts";
import { loadAuth } from "./auth-store.ts";
import { SPOTIFY_API_BASE } from "./spotify-config.ts";
import type { SpotifyCurrentlyPlayingRaw } from "./playback-snapshot.ts";

export interface FetchOptions {
  fetchFn?: typeof fetch;
}

async function authorizedRequest(
  method: string,
  path: string,
  accessToken: string,
  fetchFn: typeof fetch,
  body?: unknown,
): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };
  if (body !== undefined) {
    init.headers = {
      ...init.headers,
      "Content-Type": "application/json",
    };
    init.body = JSON.stringify(body);
  }
  return fetchFn(`${SPOTIFY_API_BASE}${path}`, init);
}

async function withAuthorizedRetry(
  method: string,
  path: string,
  options: FetchOptions = {},
  body?: unknown,
): Promise<Response> {
  const fetchFn = options.fetchFn ?? fetch;
  let accessToken = await getValidAccessToken({ fetchFn });
  if (!accessToken) {
    throw new Error("Spotify is not authenticated. Run /spotify:login.");
  }

  let res = await authorizedRequest(method, path, accessToken, fetchFn, body);

  if (res.status === 401) {
    const auth = loadAuth();
    if (!auth) {
      throw new Error("Spotify is not authenticated. Run /spotify:login.");
    }
    try {
      const refreshed = await refreshAccessToken(auth, { fetchFn });
      accessToken = refreshed.accessToken;
      res = await authorizedRequest(method, path, accessToken, fetchFn, body);
    } catch {
      throw new Error("Spotify token refresh failed. Run /spotify:login again.");
    }
  }

  return res;
}

function assertPlaybackControlOk(res: Response, action: string): void {
  if (res.status === 204 || res.status === 200) return;
  if (res.status === 403) {
    throw new Error(`Spotify ${action} failed: no active device. Open Spotify on a device and try again.`);
  }
  throw new Error(`Spotify ${action} failed (HTTP ${res.status}).`);
}

export async function fetchCurrentlyPlaying(
  options: FetchOptions = {},
): Promise<SpotifyCurrentlyPlayingRaw | null> {
  const fetchFn = options.fetchFn ?? fetch;
  const accessToken = await getValidAccessToken({ fetchFn });
  if (!accessToken) return null;

  let res = await authorizedRequest("GET", "/me/player/currently-playing", accessToken, fetchFn);

  if (res.status === 401) {
    const auth = loadAuth();
    if (!auth) return null;
    try {
      const refreshed = await refreshAccessToken(auth, { fetchFn });
      res = await authorizedRequest("GET", "/me/player/currently-playing", refreshed.accessToken, fetchFn);
    } catch {
      return null;
    }
  }

  if (res.status === 204 || res.status === 404) {
    setLastFetchAt(Date.now());
    return null;
  }

  if (!res.ok) {
    throw new Error(`Spotify currently-playing request failed (HTTP ${res.status})`);
  }

  const raw = await res.json() as SpotifyCurrentlyPlayingRaw;
  setLastFetchAt(Date.now());
  return raw;
}

export async function skipToNext(options: FetchOptions = {}): Promise<void> {
  const res = await withAuthorizedRetry("POST", "/me/player/next", options);
  assertPlaybackControlOk(res, "skip to next track");
}

export async function skipToPrevious(options: FetchOptions = {}): Promise<void> {
  const res = await withAuthorizedRetry("POST", "/me/player/previous", options);
  assertPlaybackControlOk(res, "skip to previous track");
}

export async function pausePlayback(options: FetchOptions = {}): Promise<void> {
  const res = await withAuthorizedRetry("PUT", "/me/player/pause", options);
  assertPlaybackControlOk(res, "pause");
}

export async function resumePlayback(options: FetchOptions = {}): Promise<void> {
  const res = await withAuthorizedRetry("PUT", "/me/player/play", options, {});
  assertPlaybackControlOk(res, "resume");
}

export async function playTrackUri(trackUri: string, options: FetchOptions = {}): Promise<void> {
  const uri = trackUri.trim();
  if (!uri.startsWith("spotify:track:")) {
    throw new Error("Expected a Spotify track URI like spotify:track:... or pass a track URL via /spotify:play-uri.");
  }
  const res = await withAuthorizedRetry("PUT", "/me/player/play", options, { uris: [uri] });
  assertPlaybackControlOk(res, "play track");
}

export function spotifyUrlToTrackUri(urlOrUri: string): string {
  const value = urlOrUri.trim();
  if (value.startsWith("spotify:track:")) return value;
  const match = value.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
  if (match?.[1]) return `spotify:track:${match[1]}`;
  throw new Error("Could not parse Spotify track URL or URI.");
}

export const __testing = {
  authorizedRequest,
  assertPlaybackControlOk,
  withAuthorizedRetry,
};
