import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import spotifyWidgetExtension, { __testing } from "../extensions/index.ts";

test("session_shutdown clears both widget timers and prevents refresh rescheduling", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-spotify-widget-lifecycle-"));
  const originalAgentDir = process.env.PI_SPOTIFY_AGENT_DIR;
  const originalTimers = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  };
  const timers = {
    timeouts: [],
    clearedTimeouts: [],
    intervals: [],
    clearedIntervals: [],
  };
  const handlers = new Map();

  process.env.PI_SPOTIFY_AGENT_DIR = agentDir;
  globalThis.setTimeout = (callback, delay) => {
    const handle = { callback, delay, unref() {} };
    timers.timeouts.push(handle);
    return handle;
  };
  globalThis.clearTimeout = (handle) => timers.clearedTimeouts.push(handle);
  globalThis.setInterval = (callback, delay) => {
    const handle = { callback, delay, unref() {} };
    timers.intervals.push(handle);
    return handle;
  };
  globalThis.clearInterval = (handle) => timers.clearedIntervals.push(handle);

  try {
    spotifyWidgetExtension({
      on: (event, handler) => handlers.set(event, handler),
      registerCommand: () => {},
    });

    const sessionStart = handlers.get("session_start");
    const sessionShutdown = handlers.get("session_shutdown");
    assert.equal(typeof sessionStart, "function");
    assert.equal(typeof sessionShutdown, "function");

    await sessionStart({}, {
      hasUI: true,
      ui: {
        notify: () => {},
        setWidget: () => {},
        setStatus: () => {},
        theme: { fg: (_color, text) => text },
      },
    });

    assert.equal(timers.timeouts.length, 1, "session start schedules playback refresh");
    assert.equal(timers.intervals.length, 1, "session start schedules widget display updates");

    sessionShutdown();

    assert.deepEqual(timers.clearedTimeouts, timers.timeouts);
    assert.deepEqual(timers.clearedIntervals, timers.intervals);

    __testing.scheduleNextRefresh();
    assert.equal(timers.timeouts.length, 1, "shutdown detaches the widget context from refresh scheduling");
  } finally {
    const sessionShutdown = handlers.get("session_shutdown");
    if (typeof sessionShutdown === "function") sessionShutdown();
    __testing.clearAllTimers();

    globalThis.setTimeout = originalTimers.setTimeout;
    globalThis.clearTimeout = originalTimers.clearTimeout;
    globalThis.setInterval = originalTimers.setInterval;
    globalThis.clearInterval = originalTimers.clearInterval;
    if (originalAgentDir === undefined) delete process.env.PI_SPOTIFY_AGENT_DIR;
    else process.env.PI_SPOTIFY_AGENT_DIR = originalAgentDir;
    rmSync(agentDir, { recursive: true, force: true });
  }
});
