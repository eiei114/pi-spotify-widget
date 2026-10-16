import assert from "node:assert/strict";
import test from "node:test";
import {
  behaviorAssertions,
  parseJsonLines,
  SDK_VERSIONS,
  VERIFICATION_CONTRACT,
} from "../scripts/pi-sdk-smoke-contract.mjs";

const widget = {
  type: "extension_ui_request",
  method: "setWidget",
  widgetKey: "pi-spotify-widget",
  widgetLines: ["♫ Run /spotify:login"],
};
const handledPrompt = {
  type: "response",
  command: "prompt",
  success: true,
  data: { disposition: "handled" },
};
const helpMessage = {
  type: "message_end",
  message: {
    role: "custom",
    customType: "spotify-widget",
    display: true,
    details: { kind: "help" },
    content: "### Spotify playback controls\n/spotify:next",
  },
};
const goodRun = (rows = [widget, handledPrompt, helpMessage], overrides = {}) => ({
  exit_code: 0,
  signal: null,
  error: null,
  stdout: rows.map((row) => JSON.stringify(row)).join("\n"),
  stderr: "",
  ...overrides,
});
const evaluate = (name, runs, host) => behaviorAssertions(name, {
  runs,
  host,
  expectedVersion: "1.2.0",
});

test("contract pins the frozen SDK and parses LF/CRLF JSON RPC output", () => {
  assert.equal(VERIFICATION_CONTRACT, "pi-sdk-behavior-v2");
  assert.deepEqual(Object.values(SDK_VERSIONS), ["1.2.0", "1.2.0", "1.2.0", "1.2.0"]);
  assert.deepEqual(parseJsonLines(`not-json\r\n${JSON.stringify(handledPrompt)}\n\n`), [handledPrompt]);
});

test("extension load requires the package widget and a registered handled feature command", () => {
  assert.equal(evaluate("extension_load", [goodRun()])[0].id, "extension_registered");
  assert.equal(evaluate("extension_load", [goodRun()])[0].passed, true);
  for (const rows of [[], [widget], [handledPrompt], [widget, { ...handledPrompt, success: false }, helpMessage]]) {
    assert.equal(evaluate("extension_load", [goodRun(rows)])[0].passed, false);
  }
});

test("happy path requires a handled response and actual widget help content", () => {
  assert.equal(evaluate("happy_path", [goodRun()])[0].passed, true);
  for (const rows of [
    [],
    [handledPrompt],
    [handledPrompt, { ...helpMessage, message: { ...helpMessage.message, customType: "other" } }],
    [handledPrompt, { ...helpMessage, message: { ...helpMessage.message, content: "no playback command" } }],
    [{ ...handledPrompt, data: { disposition: "queued" } }, helpMessage],
  ]) {
    assert.equal(evaluate("happy_path", [goodRun(rows)])[0].passed, false);
  }
});

test("error path requires the caught malformed-link warning and handled RPC response", () => {
  const warning = {
    type: "extension_ui_request",
    method: "notify",
    notifyType: "warning",
    message: "Could not parse Spotify track URL or URI.",
  };
  assert.equal(evaluate("error_path", [goodRun([handledPrompt, warning])])[0].passed, true);
  for (const rows of [[], [warning], [{ ...handledPrompt, success: false }, warning], [handledPrompt]]) {
    assert.equal(evaluate("error_path", [goodRun(rows)])[0].passed, false);
  }
});

test("reload requires the second process feature response, registration, and clean exits", () => {
  const valid = evaluate("reload_cleanup", [goodRun(), goodRun()]);
  assert.deepEqual(valid.map((item) => item.id), [
    "reloaded_extension_registered",
    "reloaded_feature_response",
    "clean_shutdown",
  ]);
  assert.ok(valid.every((item) => item.passed));
  for (const secondRun of [
    goodRun([]),
    goodRun([widget]),
    goodRun([handledPrompt]),
    goodRun([widget, { ...handledPrompt, success: false }, helpMessage]),
    goodRun([widget, handledPrompt, helpMessage], { exit_code: 1 }),
    goodRun([widget, handledPrompt, helpMessage], { stderr: "shutdown error" }),
    goodRun([widget, handledPrompt, helpMessage], { stderr: "Unhandled exception" }),
  ]) {
    assert.ok(evaluate("reload_cleanup", [goodRun(), secondRun]).some((item) => !item.passed));
  }
});

test("native host-shell case requires exact SDK version and clean exit", () => {
  const goodHost = { exit_code: 0, error: null, stdout: "1.2.0\r\n" };
  assert.equal(evaluate("host_shell", [], goodHost)[0].id, "native_shell_boundary");
  assert.equal(evaluate("host_shell", [], goodHost)[0].passed, true);
  for (const host of [
    { ...goodHost, stdout: "11.1.0" },
    { ...goodHost, stdout: "1.2.0 but error" },
    { ...goodHost, stdout: "1.2.0", exit_code: 1 },
    { ...goodHost, stdout: "1.2.0", error: "ETIMEDOUT" },
  ]) {
    assert.equal(evaluate("host_shell", [], host)[0].passed, false);
  }
});
