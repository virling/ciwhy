#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { analyze, currentRepo, findRun, gh, parseTarget, render, renderRerun, rerun } from "../src/ciwhy.js";

const HELP = `ciwhy: why did CI fail, and is it flaky?

  ciwhy                      latest failed run on the current branch
  ciwhy <run-id|run-url>     a specific run (every attempt is checked)
  ciwhy --pr <number>        latest failed run on the pull request's head commit
  ciwhy --branch <name>      latest failed run on a branch

  --repo owner/name          repository (default: the repo in the current folder)
  --rerun                    re-run the failed jobs, wait, and report if they pass
  --timeout <minutes>        how long --rerun waits (default 30)
  --json                     machine-readable output
  --help

Requires the GitHub CLI (gh), authenticated.`;

const BOOLEAN_FLAGS = ["rerun", "json", "help"];
const VALUE_FLAGS = ["pr", "branch", "repo", "timeout"];

function usage(message) {
  console.error(`ciwhy: ${message}\n\n${HELP}`);
  process.exit(2);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].slice(2);
    if (!argv[i].startsWith("--")) positional.push(argv[i]);
    else if (BOOLEAN_FLAGS.includes(name)) flags[name] = true;
    else if (VALUE_FLAGS.includes(name) && i + 1 < argv.length) flags[name] = argv[++i];
    else usage(`unknown or incomplete option ${argv[i]}`);
  }
  return { positional, flags };
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help) return console.log(HELP);
  if (positional.length > 1) usage("expected at most one run id or URL");
  const target = positional[0] ? parseTarget(positional[0]) : {};
  if (!target) usage(`not a run id or run URL: ${positional[0]}`);
  if (flags.pr && !/^\d+$/.test(flags.pr)) usage(`not a pull request number: ${flags.pr}`);
  if (flags.timeout && !(Number(flags.timeout) > 0)) usage(`not a number of minutes: ${flags.timeout}`);
  const repo = flags.repo || target.repo || currentRepo(gh);
  const branch = flags.branch || (!target.id && !flags.pr && execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim());
  const run = findRun(gh, repo, { id: target.id, pr: flags.pr, branch });
  if (!run) {
    const where = flags.pr ? `pull request #${flags.pr}` : `branch ${branch}`;
    return console.log(flags.json ? JSON.stringify({ repo, run: null, jobs: [] }, null, 2) : `No failed runs for ${where} in ${repo}.`);
  }
  const report = analyze(gh, repo, run);
  if (!flags.json) console.log(render(report));
  if (flags.rerun && report.jobs.length) {
    if (!flags.json) console.log(`\nRe-running failed jobs of run ${run.id} and waiting...`);
    report.rerun = await rerun(gh, repo, run, report.jobs.map((j) => j.name), { timeoutMs: (Number(flags.timeout) || 30) * 60000 });
    if (!flags.json) console.log(renderRerun(report.rerun));
  }
  if (flags.json) console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(`ciwhy: ${e.stderr?.trim() || e.message}`);
  process.exit(1);
});
