export type PlaybackCommandId = "prev" | "next" | "pause" | "play";

export interface PlaybackCommandSpec {
  id: PlaybackCommandId;
  command: string;
  spotifyAction: string;
  description: string;
  userPhrases: string[];
}

export const PLAYBACK_COMMANDS: PlaybackCommandSpec[] = [
  {
    id: "prev",
    command: "/spotify:prev",
    spotifyAction: "skip to previous track",
    description: "前の曲に戻る",
    userPhrases: ["前の曲", "前へ", "戻して", "previous track", "go back", "last song"],
  },
  {
    id: "next",
    command: "/spotify:next",
    spotifyAction: "skip to next track",
    description: "次の曲に進む",
    userPhrases: ["次の曲", "次へ", "スキップ", "skip", "next track", "next song"],
  },
  {
    id: "pause",
    command: "/spotify:pause",
    spotifyAction: "pause playback",
    description: "再生を一時停止する（停止）",
    userPhrases: ["止めて", "停止", "ストップ", "一時停止", "pause", "stop", "stop music"],
  },
  {
    id: "play",
    command: "/spotify:play",
    spotifyAction: "resume playback",
    description: "再生を再開する",
    userPhrases: ["再生", "再開", "play", "resume", "continue", "再生して"],
  },
];


export const DISCOVERY_COMMANDS = [
  {
    command: "/spotify:share",
    description: "Now Playing を X に投稿（API 設定時）または共有画面を開く",
    userPhrases: ["シェア", "Xに投稿", "post to X", "tweet", "share this song"],
  },
  {
    command: "/spotify:play-uri",
    description: "Spotify 曲 URL / URI を指定して再生",
    userPhrases: ["この曲再生", "play this link", "play uri"],
  },
] as const;

export function playbackCommandById(id: string): PlaybackCommandSpec | undefined {
  const normalized = id.trim().toLowerCase();
  return PLAYBACK_COMMANDS.find((entry) => entry.id === normalized);
}

export function formatPlaybackHelpMarkdown(): string {
  const rows = PLAYBACK_COMMANDS.map((entry) => {
    const phrases = entry.userPhrases.slice(0, 4).join(" · ");
    return `| ${entry.command} | ${entry.description} | ${phrases} |`;
  });

  return [
    "### Spotify playback controls",
    "",
    "ユーザーが曲操作や再生/停止を依頼したら、下表から意図に最も近い **Pi コマンド** を1つ選んで実行してください。",
    "推測が曖昧なときは `/spotify:help` の一覧を参照するか、ユーザーに確認してください。",
    "",
    "| Command | Action | Example user phrases |",
    "|---|---|---|",
    ...rows,
    "",
    "Discovery / share:",
    ...DISCOVERY_COMMANDS.map((entry) => `| ${entry.command} | ${entry.description} | ${entry.userPhrases.slice(0, 4).join(" · ")} |`),
    "",
    "Other useful commands:",
    "- `/spotify:refresh` — Now Playing を即時更新",
    "- `/spotify:status` — 認証状態（token 値は出さない）",
    "",
    "Note: playback control requires `user-modify-playback-state` scope. If controls fail after an upgrade, run `/spotify:login` again.",
  ].join("\n");
}

export function formatPlaybackHelpText(): string {
  return PLAYBACK_COMMANDS.map((entry) => {
    const phrases = entry.userPhrases.join(", ");
    return `${entry.command} — ${entry.description} (${phrases})`;
  }).join("\n");
}
