# pi-spotify-widget

[![CI](https://github.com/eiei114/pi-spotify-widget/actions/workflows/ci.yml/badge.svg)](https://github.com/eiei114/pi-spotify-widget/actions/workflows/ci.yml)
[![Publish](https://github.com/eiei114/pi-spotify-widget/actions/workflows/publish.yml/badge.svg)](https://github.com/eiei114/pi-spotify-widget/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/pi-spotify-widget.svg)](https://www.npmjs.com/package/pi-spotify-widget)
[![npm downloads](https://img.shields.io/npm/dm/pi-spotify-widget.svg)](https://www.npmjs.com/package/pi-spotify-widget)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Pi package](https://img.shields.io/badge/pi-package-purple.svg)](https://pi.dev/packages)
[![Trusted Publishing](https://img.shields.io/badge/npm-Trusted%20Publishing-blue.svg)](docs/release.md)
<a href="https://buymeacoffee.com/ekawano114m"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width="217" height="60"></a>

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

Install the published npm package with Pi:

```bash
pi install npm:pi-spotify-widget
```

Pin a specific version when you want reproducible installs:

```bash
pi install npm:pi-spotify-widget@0.1.3
```

Install into the current project instead of your user Pi settings:

```bash
pi install npm:pi-spotify-widget -l
```

Or install from GitHub:

```bash
pi install git:github.com/eiei114/pi-spotify-widget
```

Try it without permanently installing:

```bash
pi -e npm:pi-spotify-widget
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
| `extensions/` | Pi TypeScript extension entrypoints (`index.ts`) |
| `lib/` | Spotify auth, API client, widget render |
| `skills/` | `spotify-playback` Agent Skill |
| `docs/` | Release and examples |

## Development

```bash
npm install
npm run ci
npm run pack:check   # equivalent to: npm pack --dry-run
```

`npm run ci` runs typecheck, tests, and the pack check. Run `npm pack --dry-run` directly when you only want to verify tarball contents.

## Release

Before tagging, confirm `npm run ci` and `npm pack --dry-run` pass locally.

This package is set up for npm Trusted Publishing, so no `NPM_TOKEN` is required.

```bash
npm version patch
git push
```

On `main`, `.github/workflows/auto-release.yml` checks `package.json` version. If `v<version>` does not exist yet, it creates the tag, creates the GitHub Release, then explicitly dispatches `.github/workflows/publish.yml` for that tag.

See [`docs/release.md`](docs/release.md) for setup details.

## Docs

- [`docs/examples.md`](docs/examples.md)
- [`docs/release.md`](docs/release.md)

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
