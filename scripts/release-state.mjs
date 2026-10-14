const ACTIVE_RUN_STATUSES = new Set(["pending", "queued", "requested", "waiting", "in_progress"]);

export function planReleaseStages({ tagExists, releaseExists, publishRuns }) {
  if (typeof tagExists !== "boolean" || typeof releaseExists !== "boolean" || !Array.isArray(publishRuns)) {
    throw new TypeError("Release state requires boolean tag/release flags and a publish run list.");
  }

  const publishAlreadyComplete = publishRuns.some((run) =>
    run.status === "completed" && run.conclusion === "success",
  );
  const publishInProgress = publishRuns.some((run) => ACTIVE_RUN_STATUSES.has(run.status));

  return {
    createTag: !tagExists,
    createRelease: !releaseExists,
    dispatchPublish: !publishAlreadyComplete && !publishInProgress,
  };
}
