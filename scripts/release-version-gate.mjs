#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { planReleaseStages } from "./release-state.mjs";

const currentVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(currentVersion)) {
  throw new Error(`Invalid stable package version: ${currentVersion}.`);
}

const tag = `v${currentVersion}`;
const matchingTags = execFileSync("git", ["tag", "--list", tag], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);

const repository = process.env.GITHUB_REPOSITORY;
if (!repository) {
  throw new Error("GITHUB_REPOSITORY is required to inspect release state.");
}

function getReleaseExists() {
  try {
    execFileSync("gh", ["release", "view", tag, "--repo", repository, "--json", "tagName"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch (error) {
    const output = `${error.stderr ?? ""}\n${error.stdout ?? ""}\n${error.message ?? ""}`;
    if (/release\s+.*not found|HTTP 404|404 Not Found/i.test(output)) return false;
    throw error;
  }
}

const publishRuns = JSON.parse(execFileSync("gh", [
  "run", "list",
  "--repo", repository,
  "--workflow", "publish.yml",
  "--branch", tag,
  "--json", "status,conclusion,headBranch,event",
  "--limit", "100",
], { encoding: "utf8" }));

if (!Array.isArray(publishRuns)) {
  throw new Error("GitHub CLI returned an invalid publish workflow run list.");
}

const plan = planReleaseStages({
  tagExists: matchingTags.includes(tag),
  releaseExists: getReleaseExists(),
  publishRuns: publishRuns.filter((run) => run.headBranch === tag),
});

process.stdout.write(`tag=${tag}\n`);
process.stdout.write(`create_tag=${plan.createTag}\n`);
process.stdout.write(`create_release=${plan.createRelease}\n`);
process.stdout.write(`dispatch_publish=${plan.dispatchPublish}\n`);
