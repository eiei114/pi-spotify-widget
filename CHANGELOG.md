# Changelog

## Unreleased

## [0.1.5] - 2026-07-04

### Fixed

- Harden npm publish workflow: support release-trigger fallback, skip already-published versions, publish with explicit public access, and print a direct Trusted Publishing hint on npm 404 failures.
- Clarify release docs and contributor release steps around `npm version patch --no-git-tag-version` and Trusted Publishing troubleshooting.

## [0.1.4] - 2026-07-04

### Changed

- Add Buy Me a Coffee sponsor button to README and native GitHub funding link via `.github/FUNDING.yml`.

All notable changes to this project will be documented in this file.

This project follows semantic versioning.

## [0.1.3] - 2026-06-27

### Changed

- README aligned with the current Pi OSS template baseline: expanded install paths (project-local, version pin, `pi -e npm:`), accurate package contents (`skills/`), and explicit `npm run ci` / `npm pack --dry-run` guidance in Development and Release.

## [0.1.2] - 2026-06-06

### Fixed

- Auto-release workflow was added in 0.1.1 but version never changed in that commit, preventing npm publish. This release bumps the version so auto-release triggers and publishes to npm.

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
