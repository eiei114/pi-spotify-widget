import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import spotifyWidgetExtension, { __testing } from "../extensions/index.ts";
import { saveAuth } from "../lib/auth-store.ts";
import { POLL_PLAYING_MS } from "../lib/refresh-schedule.ts";

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

test("manual refresh of an unchanged track fetches once and resumes delayed polling", async (t) => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-spotify-widget-manual-refresh-"));
  const previousAgentDir = process.env.PI_SPOTIFY_AGENT_DIR;
  const previousClientId = process.env.PI_SPOTIFY_CLIENT_ID;
  const now = 1_000_000;
  const pendingPolls = new Set();
  const handlers = new Map();
  const commands = new Map();
  const requests = [];

  try {
    process.env.PI_SPOTIFY_AGENT_DIR = agentDir;
    process.env.PI_SPOTIFY_CLIENT_ID = "test-client-id";
    t.mock.method(Date, "now", () => now);
    t.mock.method(globalThis, "setTimeout", (callback, delay) => {
      const handle = { callback, delay, unref() {} };
      pendingPolls.add(handle);
      return handle;
    });
    t.mock.method(globalThis, "clearTimeout", (handle) => pendingPolls.delete(handle));
    t.mock.method(globalThis, "setInterval", () => ({ unref() {} }));
    t.mock.method(globalThis, "clearInterval", () => {});
    t.mock.method(globalThis, "fetch", async (url) => {
      requests.push(new URL(url).pathname);
      return Response.json({
        is_playing: true,
        progress_ms: 2_500,
        item: { name: "Same Track", duration_ms: 60_000, artists: [{ name: "Artist" }] },
      });
    });
    saveAuth({
      accessToken: "fake_access_manual_refresh_test_only",
      refreshToken: "fake_refresh_manual_refresh_test_only",
      expiresAt: now + 3_600_000,
      scope: "user-read-currently-playing",
      updatedAt: new Date(now).toISOString(),
    });

    spotifyWidgetExtension({
      on: (event, handler) => handlers.set(event, handler),
      registerCommand: (name, command) => commands.set(name, command),
    });
    const ctx = {
      hasUI: true,
      ui: {
        notify: () => {},
        setWidget: () => {},
        setStatus: () => {},
        theme: { fg: (_color, text) => text },
      },
    };

    await handlers.get("session_start")({}, ctx);
    assert.deepEqual(requests, ["/v1/me/player/currently-playing"]);
    const [startupPoll] = pendingPolls;
    assert.equal(startupPoll?.delay, POLL_PLAYING_MS);

    await commands.get("spotify:refresh").handler("", ctx);

    assert.deepEqual(requests.slice(1), ["/v1/me/player/currently-playing"],
      "manual refresh should make exactly one immediate playback request");
    assert.ok(!pendingPolls.has(startupPoll), "manual refresh replaces the startup poll");
    assert.deepEqual([...pendingPolls].map(({ delay }) => delay), [POLL_PLAYING_MS]);
  } finally {
    __testing.clearAllTimers();
    __testing.resetLastSnapshot();
    if (previousAgentDir === undefined) delete process.env.PI_SPOTIFY_AGENT_DIR;
    else process.env.PI_SPOTIFY_AGENT_DIR = previousAgentDir;
    if (previousClientId === undefined) delete process.env.PI_SPOTIFY_CLIENT_ID;
    else process.env.PI_SPOTIFY_CLIENT_ID = previousClientId;
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("HTTP 429 keeps the stale snapshot and defers scheduled and track-end refreshes", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-spotify-widget-rate-limit-"));
  const previous = {
    PI_SPOTIFY_AGENT_DIR: process.env.PI_SPOTIFY_AGENT_DIR,
    PI_SPOTIFY_CLIENT_ID: process.env.PI_SPOTIFY_CLIENT_ID,
    fetch: globalThis.fetch,
    now: Date.now,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  };
  const timers = { timeouts: [], intervals: [] };
  const handlers = new Map();
  const widgets = [];
  const now = 1_000_000;
  let fetchCalls = 0;

  process.env.PI_SPOTIFY_AGENT_DIR = agentDir;
  process.env.PI_SPOTIFY_CLIENT_ID = "test-client-id";
  Date.now = () => now;
  globalThis.setTimeout = (callback, delay) => {
    const handle = { callback, delay, unref() {} };
    timers.timeouts.push(handle);
    return handle;
  };
  globalThis.clearTimeout = () => {};
  globalThis.setInterval = (callback, delay) => {
    const handle = { callback, delay, unref() {} };
    timers.intervals.push(handle);
    return handle;
  };
  globalThis.clearInterval = () => {};
  globalThis.fetch = async () => {
    fetchCalls += 1;
    if (fetchCalls === 1) {
      return new Response(JSON.stringify({
        is_playing: true,
        progress_ms: 9_500,
        item: { name: "Near End", duration_ms: 10_000, artists: [{ name: "Artist" }] },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (fetchCalls === 2) {
      return new Response("do not expose retry header", {
        status: 429,
        headers: { "Retry-After": "7" },
      });
    }
    if (fetchCalls === 3) {
      return new Response(JSON.stringify({
        is_playing: true,
        progress_ms: 2_500,
        item: { name: "Recovered", duration_ms: 10_000, artists: [{ name: "Artist" }] },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error("unexpected additional polling request");
  };

  try {
    __testing.clearAllTimers();
    __testing.resetLastSnapshot();
    const authStore = await import("../lib/auth-store.ts");
    authStore.saveAuth({
      accessToken: "fake_access_lifecycle_test_only",
      refreshToken: "fake_refresh_lifecycle_test_only",
      expiresAt: now + 3_600_000,
      scope: "user-read-currently-playing",
      updatedAt: new Date(now).toISOString(),
    });

    const setWidget = (_id, lines) => widgets.push(lines);
    const theme = { fg: (_color, text) => text };
    await __testing.refreshWidget(setWidget, theme);
    assert.equal(fetchCalls, 1);

    spotifyWidgetExtension({
      on: (event, handler) => handlers.set(event, handler),
      registerCommand: () => {},
    });
    const ctx = {
      hasUI: true,
      ui: {
        notify: () => {},
        setWidget,
        setStatus: () => {},
        theme,
      },
    };
    await handlers.get("session_start")({}, ctx);

    assert.equal(fetchCalls, 2);
    assert.ok(widgets.some((lines) => lines?.join("\n").includes("(stale)")));
    assert.equal(timers.timeouts.at(-1).delay, 7_000);

    timers.intervals.at(-1).callback();
    assert.equal(fetchCalls, 2, "track-end display ticks must not bypass the retry delay");
    assert.ok(widgets.at(-1)?.join("\n").includes("(stale)"), "display updates must preserve the stale marker");

    await __testing.refreshWidget(setWidget, theme);
    assert.ok(widgets.at(-1)?.join("\n").includes("Recovered"));
    assert.ok(!widgets.at(-1)?.join("\n").includes("(stale)"), "a successful refresh clears the stale marker");

    handlers.get("session_shutdown")();
  } finally {
    __testing.clearAllTimers();
    __testing.resetLastSnapshot();
    globalThis.fetch = previous.fetch;
    Date.now = previous.now;
    globalThis.setTimeout = previous.setTimeout;
    globalThis.clearTimeout = previous.clearTimeout;
    globalThis.setInterval = previous.setInterval;
    globalThis.clearInterval = previous.clearInterval;
    if (previous.PI_SPOTIFY_AGENT_DIR === undefined) delete process.env.PI_SPOTIFY_AGENT_DIR;
    else process.env.PI_SPOTIFY_AGENT_DIR = previous.PI_SPOTIFY_AGENT_DIR;
    if (previous.PI_SPOTIFY_CLIENT_ID === undefined) delete process.env.PI_SPOTIFY_CLIENT_ID;
    else process.env.PI_SPOTIFY_CLIENT_ID = previous.PI_SPOTIFY_CLIENT_ID;
    rmSync(agentDir, { recursive: true, force: true });
  }
});
