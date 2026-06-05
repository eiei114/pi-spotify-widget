# Changelog

All notable changes to this project will be documented in this file.

This project follows semantic versioning.

## [0.1.1] - 2026-06-05

### Changed

- Removed template-maintenance docs (`github-template.md`, `repository-settings.md`, `typescript.md`) from the published package.
- Updated README doc links to match remaining docs.

## [0.1.0] - 2026-06-03

### Added

- Now Playing widget in Pi prompt editor (track, artist, playing/paused, progress seek bar).
- OAuth 2.0 + PKCE login via `/spotify:login` with localhost callback on port 8888.
- Interactive Client ID setup (Dashboard opens in browser; optional `PI_SPOTIFY_CLIENT_ID` env override).
- Secret-safe `/spotify:status`, `/spotify:logout`, and `/spotify:refresh`.
- Playback controls (`/spotify:prev`, `/spotify:next`, `/spotify:pause`, `/spotify:play`) and `/spotify:play-uri`.
- `/spotify:share` for X compose (intent URL; optional API credentials via env).
- `spotify-playback` Agent Skill for playback and share workflows.
- Token refresh lifecycle and adaptive polling with stale snapshot fallback.
- CI workflow and npm Trusted Publishing setup.
