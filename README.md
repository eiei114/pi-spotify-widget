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

- **Now Playing widget** — track, artist, playback state
- **OAuth login** — `/spotify:login` opens browser, stores tokens locally
- **Secret-safe status** — `/spotify:status` without exposing token values
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

## Quick start

Try this package locally:

```bash
pi -e .
```

Then run:

```txt
/spotify:login
/spotify:status
```

## Package contents

| Path | Purpose |
|---|---|
| `extensions/` | Pi TypeScript extension entrypoints |
| `lib/` | Spotify auth, API client, auth store |
| `skills/` | Agent Skills |
| `prompts/` | Prompt templates |
| `themes/` | Pi themes |
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

## Template checklist

After creating a repository from this template, follow [`docs/template-checklist.md`](docs/template-checklist.md).

More docs:

- [`docs/typescript.md`](docs/typescript.md)
- [`docs/examples.md`](docs/examples.md)
- [`docs/github-template.md`](docs/github-template.md)
- [`docs/repository-settings.md`](docs/repository-settings.md)

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
