import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  behaviorAssertions,
  EXTENSION_LOAD_ERROR_PATTERN,
  SDK_VERSIONS,
  UNHANDLED_ERROR_PATTERN,
  VERIFICATION_CONTRACT,
} from "./pi-sdk-smoke-contract.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = resolve(root, "docs/verification/pi-sdk-smoke.json");
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const sdk = manifest.devDependencies;
const cases = ["extension_load", "happy_path", "error_path", "reload_cleanup", "host_shell"];
const requestedCase = process.argv.indexOf("--case");
const selectedCases = requestedCase === -1 ? cases : [process.argv[requestedCase + 1]];

assert.ok(selectedCases.every((name) => cases.includes(name)), `Expected --case to be one of: ${cases.join(", ")}`);
for (const [name, version] of Object.entries(SDK_VERSIONS)) {
  const installed = JSON.parse(readFileSync(resolve(root, "node_modules", name, "package.json"), "utf8")).version;
  assert.equal(sdk[name], version, `${name} must be pinned exactly in package.json`);
  assert.equal(installed, version, `${name} must be installed at the frozen SDK version`);
}

const codingAgentManifest = JSON.parse(readFileSync(resolve(root, "node_modules/@earendil-works/pi-coding-agent/package.json"), "utf8"));
const piCli = resolve(root, "node_modules/@earendil-works/pi-coding-agent", codingAgentManifest.bin.pi);
assert.ok(existsSync(piCli), `Installed Pi CLI not found: ${piCli}`);
const rpcArgs = [
  piCli,
  "--offline",
  "--no-session",
  "--no-tools",
  "--no-extensions",
  "--no-skills",
  "--no-context-files",
  "--no-prompt-templates",
  "--no-mcp",
  "--approve",
  "-e",
  ".",
  "--mode",
  "rpc",
];

function captureProcess(command, args, { input, env = process.env } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    input,
    encoding: "utf8",
    timeout: 15_000,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  });
  return {
    exit_code: result.status,
    signal: result.signal,
    error: result.error?.message ?? null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function runPi(prompt) {
  const agentDir = mkdtempSync(resolve(tmpdir(), "pi-spotify-widget-sdk-smoke-"));
  try {
    return captureProcess(process.execPath, rpcArgs, {
      input: `${JSON.stringify({ type: "prompt", message: prompt })}\n`,
      env: {
        ...process.env,
        PI_CODING_AGENT_DIR: agentDir,
        PI_OFFLINE: "1",
        PI_NO_UPDATE_CHECK: "1",
        PI_SPOTIFY_CLIENT_ID: "",
      },
    });
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
}

function quotePowerShell(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function runNativeShell() {
  if (process.platform === "win32") {
    const cliShim = resolve(root, "node_modules/.bin/pi.cmd");
    const shell = resolve(process.env.SystemRoot ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
    const command = `& ${quotePowerShell(cliShim)} --version; exit $LASTEXITCODE`;
    return captureProcess(shell, ["-NoProfile", "-NonInteractive", "-Command", command]);
  }

  return captureProcess("/bin/sh", ["-c", '"$1" "$2" --version', "pi-sdk-smoke", process.execPath, piCli]);
}

function runCase(name) {
  if (name === "extension_load" || name === "happy_path") {
    return { name, runs: [runPi("/spotify:help")] };
  }
  if (name === "error_path") {
    return { name, runs: [runPi("/spotify:play-uri https://example.invalid/not-a-track")] };
  }
  if (name === "reload_cleanup") {
    return { name, runs: [runPi("/spotify:help"), runPi("/spotify:help")] };
  }
  return { name, runs: [], host: runNativeShell() };
}

function countMatches(pattern, text) {
  return [...text.matchAll(new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`))].length;
}

const results = selectedCases.map((name) => {
  const result = runCase(name);
  const command = `npm run smoke:pi -- --case ${name}`;
  const assertions = behaviorAssertions(name, {
    runs: result.runs,
    host: result.host,
    expectedVersion: SDK_VERSIONS["@earendil-works/pi-coding-agent"],
  });
  const captured = [...result.runs, ...(result.host ? [result.host] : [])];
  const output = captured.map((run) => `${run.stdout}\n${run.stderr}`).join("\n");
  const unhandledErrors = countMatches(UNHANDLED_ERROR_PATTERN, output);
  const extensionLoadErrors = countMatches(EXTENSION_LOAD_ERROR_PATTERN, output);
  return {
    name,
    command,
    exit_code: captured.every((run) => run.exit_code === 0 && run.error === null) ? 0 : 1,
    passed: assertions.every((item) => item.passed) && unhandledErrors === 0 && extensionLoadErrors === 0,
    evidence: {
      note: "Captured actual Pi host/native-shell stdout and stderr. The Pi SDK, loader, extension lifecycle, command handler, RPC protocol, and widget implementation are not mocked; no model inference or Spotify OAuth/API request is used.",
      runs: captured,
    },
    assertions,
    unhandledErrors,
    extensionLoadErrors,
  };
});

const report = {
  schema_version: 1,
  verification_contract: VERIFICATION_CONTRACT,
  sdk_versions: SDK_VERSIONS,
  platform: process.platform,
  model_inference: "none; actual Pi host handles explicit extension commands offline",
  unhandled_errors: results.reduce((total, result) => total + result.unhandledErrors, 0),
  extension_load_errors: results.reduce((total, result) => total + result.extensionLoadErrors, 0),
  cases: results.map(({ unhandledErrors, extensionLoadErrors, ...result }) => result),
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  verification_contract: report.verification_contract,
  cases: report.cases.map(({ name, passed, exit_code, assertions }) => ({
    name,
    passed,
    exit_code,
    assertions: assertions.map(({ id, passed: assertionPassed }) => ({ id, passed: assertionPassed })),
  })),
}));

if (report.unhandled_errors !== 0 || report.extension_load_errors !== 0 || report.cases.some((item) => !item.passed)) {
  process.exitCode = 1;
}
