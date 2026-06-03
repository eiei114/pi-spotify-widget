---
name: spotify-playback
description: Control Spotify playback and share now playing to X from Pi.
---

# Spotify Playback & Share

When the user asks about music control or sharing, run the matching Pi command.

## Playback

| User intent | Run |
|---|---|
| 前の曲 / previous | `/spotify:prev` |
| 次の曲 / skip / next | `/spotify:next` |
| 止めて / stop / pause | `/spotify:pause` |
| 再生 / resume / play | `/spotify:play` |

If the user wants to play a specific track by URL, run `/spotify:play-uri <spotify-url>`.

## Share to X (soccer-widget style)

| User intent | Run |
|---|---|
| Xに投稿 / シェア / tweet this song | `/spotify:share` |
| コメント付きでシェア | `/spotify:share <your message>` |

Opens X compose with prefilled text (track, install steps, hashtags). Screenshot upload is manual.
