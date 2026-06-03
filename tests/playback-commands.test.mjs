import assert from "node:assert/strict";
import test from "node:test";

const {
  playbackCommandById,
  formatPlaybackHelpMarkdown,
  PLAYBACK_COMMANDS,
} = await import("../lib/playback-commands.ts");

test("playbackCommandById resolves known commands", () => {
  assert.equal(playbackCommandById("next")?.command, "/spotify:next");
  assert.equal(playbackCommandById("pause")?.command, "/spotify:pause");
});

test("formatPlaybackHelpMarkdown lists all playback commands", () => {
  const md = formatPlaybackHelpMarkdown();
  for (const entry of PLAYBACK_COMMANDS) {
    assert.match(md, new RegExp(entry.command.replace("/", "\/")));
  }
});
