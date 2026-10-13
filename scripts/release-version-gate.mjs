#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const currentVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(currentVersion)) {
  throw new Error(`Invalid stable package version: ${currentVersion}.`);
}

const tag = `v${currentVersion}`;
const matchingTags = execFileSync("git", ["tag", "--list", tag], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);

if (matchingTags.includes(tag)) {
  process.stdout.write("released=false\n");
} else {
  process.stdout.write(`released=true\ntag=${tag}\n`);
}
