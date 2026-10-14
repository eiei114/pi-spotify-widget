import assert from "node:assert/strict";
import test from "node:test";
import { planReleaseStages } from "../scripts/release-state.mjs";

test("an existing tag resumes missing release and publish stages", () => {
  assert.deepEqual(
    planReleaseStages({ tagExists: true, releaseExists: false, publishRuns: [] }),
    { createTag: false, createRelease: true, dispatchPublish: true },
  );
});

test("an existing release still dispatches a publish workflow that never ran", () => {
  assert.deepEqual(
    planReleaseStages({ tagExists: true, releaseExists: true, publishRuns: [] }),
    { createTag: false, createRelease: false, dispatchPublish: true },
  );
});

test("successful or active publish runs are not dispatched twice", () => {
  for (const run of [
    { status: "completed", conclusion: "success" },
    { status: "in_progress", conclusion: null },
  ]) {
    assert.deepEqual(
      planReleaseStages({ tagExists: true, releaseExists: true, publishRuns: [run] }),
      { createTag: false, createRelease: false, dispatchPublish: false },
    );
  }
});

test("a failed publish run is retried without recreating the tag or release", () => {
  assert.deepEqual(
    planReleaseStages({
      tagExists: true,
      releaseExists: true,
      publishRuns: [{ status: "completed", conclusion: "failure" }],
    }),
    { createTag: false, createRelease: false, dispatchPublish: true },
  );
});
