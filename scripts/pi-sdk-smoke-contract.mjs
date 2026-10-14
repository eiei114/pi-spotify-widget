export const VERIFICATION_CONTRACT = "pi-sdk-behavior-v2";
export const SDK_VERSIONS = {
  "@earendil-works/pi-agent-core": "1.1.0",
  "@earendil-works/pi-ai": "1.1.0",
  "@earendil-works/pi-coding-agent": "1.1.0",
  "@earendil-works/pi-tui": "1.1.0",
};

export const UNHANDLED_ERROR_PATTERN = /UnhandledPromiseRejection|unhandled (?:exception|error)|uncaught (?:exception|error)|uncaughtException|shutdown error/i;
export const EXTENSION_LOAD_ERROR_PATTERN = /Failed to load extension|Error loading extension|Extension load failed|Failed to import extension/i;

export function parseJsonLines(output) {
  return output.split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

function assertion(id, expected, observed, passed) {
  return { id, expected, observed, passed: passed === true };
}

function startupWidget(rows) {
  return rows.find((row) => row?.type === "extension_ui_request"
    && row.method === "setWidget"
    && row.widgetKey === "pi-spotify-widget"
    && Array.isArray(row.widgetLines));
}

function handledHelp(rows) {
  const response = rows.find((row) => row?.type === "response" && row.command === "prompt");
  const featureMessage = rows.find((row) => row?.type === "message_end"
    && row.message?.role === "custom"
    && row.message?.customType === "spotify-widget"
    && row.message?.details?.kind === "help");
  const expectedHelp = featureMessage?.message?.content?.includes("### Spotify playback controls")
    && featureMessage.message.content.includes("/spotify:next")
    && featureMessage.message.display === true;
  return {
    response,
    featureMessage,
    passed: response?.success === true
      && response.data?.disposition === "handled"
      && expectedHelp === true,
  };
}

function noRuntimeErrors(run) {
  return !UNHANDLED_ERROR_PATTERN.test(`${run.stdout}\n${run.stderr}`)
    && !EXTENSION_LOAD_ERROR_PATTERN.test(`${run.stdout}\n${run.stderr}`);
}

export function behaviorAssertions(name, { runs, host, expectedVersion }) {
  const current = runs.at(-1);
  const rows = parseJsonLines(`${current?.stdout ?? ""}\n${current?.stderr ?? ""}`);
  const widget = startupWidget(rows);
  const help = handledHelp(rows);
  const cleanRun = (run) => run?.exit_code === 0 && run.error === null && noRuntimeErrors(run);

  if (name === "extension_load") {
    return [assertion(
      "extension_registered",
      "The real Pi host runs session_start for pi-spotify-widget, registers /spotify:help, and returns its handled feature response.",
      { widget: widget ?? null, response: help.response ?? null, featureMessage: help.featureMessage ?? null },
      cleanRun(current) && !!widget && help.passed,
    )];
  }

  if (name === "happy_path") {
    return [assertion(
      "feature_response",
      "The real /spotify:help command is handled and emits the visible widget help with playback commands.",
      { response: help.response ?? null, featureMessage: help.featureMessage ?? null },
      cleanRun(current) && help.passed,
    )];
  }

  if (name === "error_path") {
    const response = rows.find((row) => row?.type === "response" && row.command === "prompt");
    const handledError = rows.find((row) => row?.type === "extension_ui_request"
      && row.method === "notify"
      && row.notifyType === "warning"
      && row.message === "Could not parse Spotify track URL or URI.");
    return [assertion(
      "handled_error",
      "A malformed Spotify track link is caught by the extension and reported as a warning without a Spotify network request.",
      { response: response ?? null, handledError: handledError ?? null },
      cleanRun(current)
        && response?.success === true
        && response.data?.disposition === "handled"
        && !!handledError,
    )];
  }

  if (name === "reload_cleanup") {
    const first = runs[0];
    const firstRows = parseJsonLines(`${first?.stdout ?? ""}\n${first?.stderr ?? ""}`);
    const firstHelp = handledHelp(firstRows);
    return [
      assertion(
        "reloaded_extension_registered",
        "A second isolated Pi process reloads the extension, runs session_start, and handles /spotify:help.",
        { widget: widget ?? null, response: help.response ?? null },
        cleanRun(current) && !!widget && help.passed,
      ),
      assertion(
        "reloaded_feature_response",
        "The second process returns the actual widget help message containing playback commands.",
        { response: help.response ?? null, featureMessage: help.featureMessage ?? null },
        cleanRun(current) && help.passed,
      ),
      assertion(
        "clean_shutdown",
        "Both real Pi processes exit zero and produce no unhandled, extension-load, or shutdown errors.",
        { exits: runs.map((run) => run?.exit_code ?? null), firstFeatureResponse: firstHelp.passed },
        runs.length === 2 && runs.every(cleanRun) && firstHelp.passed,
      ),
    ];
  }

  if (name === "host_shell") {
    return [assertion(
      "native_shell_boundary",
      "The native host shell starts the local Pi CLI and prints exactly the frozen SDK version.",
      { exit_code: host?.exit_code ?? null, output: host?.stdout?.trim() ?? "", expectedVersion },
      host?.exit_code === 0 && host.error === null && host.stdout.trim() === expectedVersion,
    )];
  }

  throw new Error(`Unknown smoke case: ${name}`);
}
