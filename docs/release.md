# Release

This package uses npm Trusted Publishing with GitHub Actions OIDC.

Do not add `NPM_TOKEN` or long-lived npm tokens to GitHub Secrets.

## One-time npm setup

On npmjs.com, configure Trusted Publishing for this package:

- Publisher: GitHub Actions
- Repository: this GitHub repository
- Workflow filename: `publish.yml`

## Publish

```bash
npm version patch --no-git-tag-version
git push
```

On `main`, `.github/workflows/auto-release.yml` checks `package.json` version. If `v<version>` does not exist yet, it creates the tag, creates the GitHub Release, then explicitly dispatches `.github/workflows/publish.yml` for that tag.

`publish.yml` also listens for `release.published` and manual `v*.*.*` tag pushes, but the explicit dispatch from `auto-release.yml` remains the primary path because `GITHUB_TOKEN` tag pushes do not reliably fan out into a second workflow on their own.

## Workflow guardrail

Tags or releases created by `GITHUB_TOKEN` do not reliably fan out into another workflow through normal `push.tags` or `release.published` triggers. This repository keeps publishing reliable by having `auto-release.yml` explicitly dispatch `publish.yml` after creating the tag/release.

## GitHub Actions requirements

- `permissions: id-token: write`
- `permissions: actions: write` on auto-release so it can dispatch `publish.yml`
- `auto-release.yml` calls `gh workflow run publish.yml --ref "$TAG" -f ref="$TAG"`
- publish runner uses Node `24` so npm Trusted Publishing has a compatible Node/npm pair
- GitHub-hosted runner
- No `NPM_TOKEN`
- `npm publish --provenance --access public` from the configured workflow file

## Troubleshooting

If `publish.yml` fails at `npm publish` with `E404` / `404 Not Found`, the most likely cause is npm Trusted Publishing configuration, not the GitHub workflow logic.

Check npm package settings for:

- package: `pi-spotify-widget`
- repository: `eiei114/pi-spotify-widget`
- workflow filename: `publish.yml`

The workflow now prints that hint directly when npm returns 404.

## First release checklist

- [ ] `package.json` name is final
- [ ] `repository.url` points to the real GitHub repository
- [ ] npm Trusted Publisher is configured
- [ ] `npm run ci` passes
- [ ] `npm pack --dry-run` contains only intended files
- [ ] `CHANGELOG.md` has the release date
