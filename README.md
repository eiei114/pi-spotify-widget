# pi-spotify-widget

[![CI](https://github.com/eiei114/pi-spotify-widget/actions/workflows/ci.yml/badge.svg)](https://github.com/eiei114/pi-spotify-widget/actions/workflows/ci.yml)
[![Publish](https://github.com/eiei114/pi-spotify-widget/actions/workflows/publish.yml/badge.svg)](https://github.com/eiei114/pi-spotify-widget/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/pi-spotify-widget.svg)](https://www.npmjs.com/package/pi-spotify-widget)
[![npm downloads](https://img.shields.io/npm/dm/pi-spotify-widget.svg)](https://www.npmjs.com/package/pi-spotify-widget)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Pi package](https://img.shields.io/badge/pi-package-purple.svg)](https://pi.dev/packages)
[![Trusted Publishing](https://img.shields.io/badge/npm-Trusted%20Publishing-blue.svg)](docs/release.md)

> Show Spotify playback status in Pi's prompt editor widget.

## What this is

TypeScript-first Pi package that displays **Now Playing** (track, artist, playing/paused) in the prompt editor widget. Auth uses **OAuth 2.0 + PKCE** against Spotify Web API — not a static API key.

## Features

- **Now Playing widget** — track, artist, playback state, compact progress seek bar
- **OAuth login** — `/spotify:login` opens Dashboard + browser, stores tokens locally
- **Secret-safe status** — `/spotify:status` without exposing token values
- **Playback controls** — `/spotify:prev`, `/spotify:next`, `/spotify:pause`, `/spotify:play`
- **Share to X** — `/spotify:share` opens compose with Now Playing text (soccer-widget style)
- **Manual refresh** — `/spotify:refresh`
- **Token refresh** — access token lifecycle before API calls

## Install

```bash
pi install npm:pi-spotify-widget
```

Or install from GitHub:

```bash
pi install git:github.com/eiei114/pi-spotify-widget
```

## Spotify Developer setup (required)

Each user creates their own Spotify app (v1 **BYO Client ID** policy). Client Secret is not needed for PKCE.

### Option A — Interactive setup (recommended)

1. Install the package (see [Install](#install)) and start Pi.
2. Run `/spotify:login` — the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) opens automatically.
3. Create an app and add redirect URI: `http://127.0.0.1:8888/callback`
4. Paste your **Client ID** into the Pi prompt when asked.
5. Complete browser OAuth authorization.

The Client ID is saved locally at `~/.pi/agent/pi-spotify-widget-config.json` (not sent to the model). OAuth tokens are stored separately at `~/.pi/agent/pi-spotify-widget-auth.json`.

### Option B — Environment variable

Set `PI_SPOTIFY_CLIENT_ID` before starting Pi to skip the Client ID prompt:

```powershell
# PowerShell
$env:PI_SPOTIFY_CLIENT_ID="your_client_id_here"
```

```bash
# bash
export PI_SPOTIFY_CLIENT_ID="your_client_id_here"
```

Bundled Client ID and Extended Quota are planned for a future release. v1 does not ship a shared maintainer app.

## Quick start

```bash
pi install npm:pi-spotify-widget
```

Try locally from a git checkout:

```bash
pi -e .
```

Then run:

```txt
/spotify:login
/spotify:status
/spotify:refresh
```

## Commands

| Command | Description |
|---|---|
| `/spotify:login` | Open Dashboard, enter Client ID (if needed), OAuth PKCE login |
| `/spotify:status` | Secret-safe auth status (no token values) |
| `/spotify:logout` | Remove stored tokens |
| `/spotify:refresh` | Force Now Playing snapshot fetch |
| `/spotify:prev` | Skip to previous track |
| `/spotify:next` | Skip to next track |
| `/spotify:pause` | Pause playback |
| `/spotify:play` | Resume playback |
| `/spotify:help` | Playback command list for AI/user |
| `/spotify:share` | Open X compose with Now Playing (optional prefix text) |
| `/spotify:play-uri` | Play a Spotify track URL or URI |

## Package contents

| Path | Purpose |
|---|---|
| `extensions/` | Pi TypeScript extension entrypoints |
| `lib/` | Spotify auth, API client, widget render |
| `docs/` | Release and setup docs |

## Development

```bash
npm install
npm run ci
```

## Release

This package is set up for npm Trusted Publishing, so no `NPM_TOKEN` is required.

```bash
npm version patch
git push --follow-tags
```

See [`docs/release.md`](docs/release.md) for setup details.

## More docs

- [`docs/examples.md`](docs/examples.md)

## Security

Pi packages can execute code with your local permissions. This package:

- sends network requests to Spotify Web API
- stores OAuth tokens under `~/.pi/agent/` (local only)
- opens your system browser for login

Review extensions before installing third-party packages. For vulnerability reporting, see [`SECURITY.md`](SECURITY.md).

## Links

- npm: https://www.npmjs.com/package/pi-spotify-widget
- GitHub: https://github.com/eiei114/pi-spotify-widget
- Issues: https://github.com/eiei114/pi-spotify-widget/issues

## License

MIT
