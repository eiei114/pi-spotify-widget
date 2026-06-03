export interface PlaybackSnapshot {
  track: string;
  artist: string;
  isPlaying: boolean;
  progressMs?: number;
  durationMs?: number;
  trackId?: string;
  spotifyUrl?: string;
  artistIds?: string[];
  fetchedAt: number;
}

interface SpotifyArtist {
  id?: string;
  name?: string;
}

interface SpotifyTrackItem {
  id?: string;
  name?: string;
  duration_ms?: number;
  external_urls?: { spotify?: string };
  artists?: SpotifyArtist[];
}

export interface SpotifyCurrentlyPlayingRaw {
  is_playing?: boolean;
  progress_ms?: number;
  item?: SpotifyTrackItem | null;
}

function artistNames(item: SpotifyTrackItem | null | undefined): string {
  const artists = Array.isArray(item?.artists)
    ? item!.artists!
      .map((artist) => (typeof artist?.name === "string" ? artist.name.trim() : ""))
      .filter(Boolean)
    : [];
  return artists.join(", ") || "Unknown artist";
}

function artistIds(item: SpotifyTrackItem | null | undefined): string[] {
  if (!Array.isArray(item?.artists)) return [];
  return item.artists
    .map((artist) => (typeof artist?.id === "string" ? artist.id.trim() : ""))
    .filter(Boolean);
}

export function toPlaybackSnapshot(
  raw: SpotifyCurrentlyPlayingRaw | null | undefined,
  fetchedAt = Date.now(),
): PlaybackSnapshot | null {
  if (!raw?.item) return null;

  const track = typeof raw.item.name === "string" ? raw.item.name.trim() : "";
  if (!track) return null;

  const snapshot: PlaybackSnapshot = {
    track,
    artist: artistNames(raw.item),
    isPlaying: Boolean(raw.is_playing),
    fetchedAt,
  };

  if (typeof raw.progress_ms === "number" && Number.isFinite(raw.progress_ms)) {
    snapshot.progressMs = raw.progress_ms;
  }
  if (typeof raw.item.duration_ms === "number" && Number.isFinite(raw.item.duration_ms)) {
    snapshot.durationMs = raw.item.duration_ms;
  }
  if (typeof raw.item.id === "string" && raw.item.id.trim()) {
    snapshot.trackId = raw.item.id.trim();
  }
  if (typeof raw.item.external_urls?.spotify === "string" && raw.item.external_urls.spotify.trim()) {
    snapshot.spotifyUrl = raw.item.external_urls.spotify.trim();
  } else if (snapshot.trackId) {
    snapshot.spotifyUrl = `https://open.spotify.com/track/${snapshot.trackId}`;
  }
  const ids = artistIds(raw.item);
  if (ids.length > 0) snapshot.artistIds = ids;

  return snapshot;
}

export const __testing = {
  toPlaybackSnapshot,
};
