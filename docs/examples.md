# Examples

Pi Spotify Widget shows Now Playing in the prompt editor widget and exposes playback commands.

## Extension

`extensions/index.ts` registers:

- `/spotify:login`, `/spotify:status`, `/spotify:logout`
- `/spotify:refresh`, `/spotify:prev`, `/spotify:next`, `/spotify:pause`, `/spotify:play`
- `/spotify:help`, `/spotify:share`, `/spotify:play-uri`
- a prompt-editor widget with track, artist, and playback state

Try it locally:

```bash
pi -e .
```

Then run:

```txt
/spotify:login
/spotify:status
/spotify:refresh
/spotify:next
/spotify:share
```

## Agent Skill

`skills/spotify-playback/SKILL.md` maps natural-language playback and share intents to the commands above.

Replace or extend it when you add new playback workflows.

## OAuth setup

Each user supplies a Spotify Developer app Client ID (PKCE; no Client Secret required).

Redirect URI: `http://127.0.0.1:8888/callback`

Optional environment variable before starting Pi:

```bash
export PI_SPOTIFY_CLIENT_ID="your_client_id_here"
```

Tokens are stored locally under `~/.pi/agent/` and are not exposed in `/spotify:status` output.
