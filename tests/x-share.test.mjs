import assert from "node:assert/strict";
import test from "node:test";

const {
  buildSpotifySharePostText,
  buildShareIntentUrl,
  PI_INSTALL_URL,
  SPOTIFY_PACKAGE_INSTALL,
  resolveXCredentials,
} = await import("../lib/x-share.ts");

test("buildSpotifySharePostText matches soccer-widget promo template", () => {
  const text = buildSpotifySharePostText({
    track: "Song",
    artist: "Artist",
    isPlaying: true,
    spotifyUrl: "https://open.spotify.com/track/abc",
    fetchedAt: Date.now(),
  });
  assert.match(text, /Now playing on Pi/);
  assert.match(text, /Song — Artist/);
  assert.match(text, /open\.spotify\.com\/track\/abc/);
  assert.match(text, new RegExp(PI_INSTALL_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(text, /pi install npm:pi-spotify-widget/);
  assert.match(text, /\/spotify:login/);
  assert.match(text, /\/spotify:share/);
  assert.match(text, /#NowPlaying #Spotify/);
  assert.doesNotMatch(text, /#PiCodingAgent|#pi-package/);
  assert.equal(SPOTIFY_PACKAGE_INSTALL, "pi install npm:pi-spotify-widget");
});

test("buildShareIntentUrl encodes text", () => {
  const url = buildShareIntentUrl("hello #music");
  assert.match(url, /twitter\.com\/intent\/tweet\?text=/);
  assert.match(url, /hello/);
});

test("resolveXCredentials reads PI_X_* env", () => {
  const prev = {
    PI_X_API_KEY: process.env.PI_X_API_KEY,
    PI_X_API_SECRET: process.env.PI_X_API_SECRET,
    PI_X_ACCESS_TOKEN: process.env.PI_X_ACCESS_TOKEN,
    PI_X_ACCESS_TOKEN_SECRET: process.env.PI_X_ACCESS_TOKEN_SECRET,
  };
  process.env.PI_X_API_KEY = "k";
  process.env.PI_X_API_SECRET = "s";
  process.env.PI_X_ACCESS_TOKEN = "t";
  process.env.PI_X_ACCESS_TOKEN_SECRET = "ts";
  assert.ok(resolveXCredentials());
  for (const [key, value] of Object.entries(prev)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
