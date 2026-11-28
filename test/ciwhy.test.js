import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { analyze, findRun, parseTarget, render, renderMarkdown, rerun } from "../src/ciwhy.js";

const fixture = (name) => fs.readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8");
const API = JSON.parse(fixture("api.json"));
const LOGS = { 1001: "tap.log", 2001: "lint.log", 2002: "build.log", 2003: "tap.log" };
const REPO = "acme/widget";

function fakeGh(extra = {}) {
  const calls = [];
  const gh = (args) => {
    calls.push(args.join(" "));
    const log = args[1] === "--allow-escape-sequences" && args[2].match(/jobs\/(\d+)\/logs$/);
    if (log) return fixture(LOGS[log[1]]);
    if (args[0] === "run") return "";
    const path = args[args.length - 1];
    const body = extra[path] ?? API[path];
    if (args[0] !== "api" || body === undefined) throw new Error(`unexpected gh call: ${args.join(" ")}`);
    return JSON.stringify(typeof body === "function" ? body() : body);
  };
  return { gh, calls };
}

test("parseTarget accepts run ids and run or job URLs", () => {
  assert.deepEqual(parseTarget("123"), { id: "123" });
  assert.deepEqual(parseTarget("https://github.com/acme/widget/actions/runs/123/job/9"), { repo: REPO, id: "123" });
  assert.equal(parseTarget("main"), null);
});

test("findRun resolves ids, branches and pull requests", () => {
  const { gh } = fakeGh();
  assert.equal(findRun(gh, REPO, { id: "100" }).id, 100);
  assert.equal(findRun(gh, REPO, { branch: "feature/x" }).id, 200);
  assert.equal(findRun(gh, REPO, { pr: "7" }).id, 200);
  assert.equal(findRun(gh, REPO, { branch: "quiet" }), null);
});

test("a job that passed on a later attempt of the run is flaky", () => {
  const { gh, calls } = fakeGh();
  const report = analyze(gh, REPO, API["repos/acme/widget/actions/runs/100"]);
  assert.equal(report.jobs.length, 1);
  const [job] = report.jobs;
  assert.deepEqual([job.name, job.attempt, job.step, job.verdict], ["test (macos-latest, 20)", 1, "Run npm test", "flaky"]);
  assert.equal(job.evidence, "passed on attempt 2 of this run");
  assert.ok(job.lines.includes("# widget: spawnSync unzip EPIPE"));
  assert.ok(calls.includes("api --allow-escape-sequences repos/acme/widget/actions/jobs/1001/logs"));
  assert.match(render(report), /FAILED test \(macos-latest, 20\)  attempt 1  step: Run npm test\n  flaky: passed on attempt 2 of this run/);
});

test("verdicts use the same commit and the previous default branch run", () => {
  const { gh } = fakeGh();
  const report = analyze(gh, REPO, API["repos/acme/widget/actions/runs/200"]);
  const byName = Object.fromEntries(report.jobs.map((j) => [j.name, j]));
  assert.deepEqual(Object.keys(byName), ["lint", "build", "test (macos-latest, 20)"]);
  assert.deepEqual([byName.lint.verdict, byName.lint.evidence, byName.lint.step], ["new failure", "passed on the previous main run 150", "Lint"]);
  assert.deepEqual([byName.build.verdict, byName.build.evidence], ["unknown", "no pass on this commit; failure on the previous main run 150"]);
  assert.deepEqual([byName["test (macos-latest, 20)"].verdict, byName["test (macos-latest, 20)"].evidence], ["flaky", "passed in run 201 on the same commit"]);
  assert.ok(byName.build.lines.includes("KeyError: 'VERSION'"));
});

test("a missing job log is reported for that job and the rest still run", () => {
  const { gh: base } = fakeGh();
  const gh = (args) => {
    if (args[2]?.endsWith("jobs/2002/logs")) throw Object.assign(new Error("Command failed"), { stderr: "gh: Not Found (HTTP 410)\n" });
    return base(args);
  };
  const report = analyze(gh, REPO, API["repos/acme/widget/actions/runs/200"]);
  const build = report.jobs.find((j) => j.name === "build");
  assert.deepEqual([build.lines, build.logError], [[], "gh: Not Found (HTTP 410)"]);
  assert.ok(report.jobs.find((j) => j.name === "lint").lines.length);
  assert.match(render(report), /\(log unavailable: gh: Not Found \(HTTP 410\)\)/);
});

test("rerun waits for the new attempt and reports per job", async () => {
  let polls = 0;
  const { gh, calls } = fakeGh({
    "repos/acme/widget/actions/runs/200": () => (++polls < 3 ? { run_attempt: 1, status: "completed" } : { run_attempt: 2, status: polls < 4 ? "in_progress" : "completed", conclusion: "failure" }),
    "repos/acme/widget/actions/runs/200/attempts/2/jobs?per_page=100": { jobs: [{ name: "lint", conclusion: "failure" }, { name: "test (macos-latest, 20)", conclusion: "success" }] },
  });
  const sleeps = [];
  const target = API["repos/acme/widget/actions/runs/200"];
  const result = await rerun(gh, REPO, target, ["lint", "test (macos-latest, 20)"], { sleep: async (ms) => sleeps.push(ms), intervalMs: 10, timeoutMs: 1000 });
  assert.equal(calls[0], "run rerun 200 --failed --repo acme/widget");
  assert.equal(sleeps.length, 4);
  assert.deepEqual(result, {
    attempt: 2,
    conclusion: "failure",
    jobs: [
      { name: "lint", conclusion: "failure", verdict: "failed again" },
      { name: "test (macos-latest, 20)", conclusion: "success", verdict: "flaky" },
    ],
  });
  const timedOut = await rerun(fakeGh({ "repos/acme/widget/actions/runs/200": { run_attempt: 1, status: "completed" } }).gh, REPO, target, ["lint"], { sleep: async () => {}, intervalMs: 10, timeoutMs: 30 });
  assert.equal(timedOut.conclusion, "timed out");
});

test("cli prints help and rejects bad usage", () => {
  const bin = new URL("../bin/ciwhy.js", import.meta.url).pathname;
  assert.match(execFileSync("node", [bin, "--help"], { encoding: "utf8" }), /--rerun/);
  const bad = spawnSync("node", [bin, "--nope"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /unknown or incomplete option --nope/);
  assert.equal(spawnSync("node", [bin, "not-a-run"], { encoding: "utf8" }).status, 2);
});

test("renderMarkdown shows one job inline with the marker, verdict and log lines", () => {
  const report = analyze(fakeGh().gh, REPO, API["repos/acme/widget/actions/runs/100"]);
  const md = renderMarkdown(report);
  assert.ok(md.startsWith("<!-- ciwhy -->\n### ciwhy: 1 failed job in [ci run 100]("));
  assert.match(md, /\*\*test \(macos-latest, 20\), attempt 1, step: Run npm test\*\*\n\n\*\*flaky\*\*: passed on attempt 2 of this run\. \[Job log\]\(/);
  assert.match(md, /```text\n[^]*# widget: spawnSync unzip EPIPE[^]*\n```$/);
  assert.doesNotMatch(md, /<details>/);
});

test("renderMarkdown folds several jobs and stays under the limit", () => {
  const report = analyze(fakeGh().gh, REPO, API["repos/acme/widget/actions/runs/200"]);
  const md = renderMarkdown(report);
  assert.equal(md.match(/<details><summary>/g).length, 3);
  assert.match(md, /<summary><b>lint, attempt 1, step: Lint<\/b> \(new failure\)<\/summary>/);
  const big = { ...report, jobs: report.jobs.map((j) => ({ ...j, lines: Array.from({ length: 5000 }, (_, i) => `line ${i} ${"x".repeat(40)}`) })) };
  const cut = renderMarkdown(big);
  assert.ok(cut.length < 65536, `length ${cut.length}`);
  assert.match(cut, /\.\.\. \d+ more lines cut to fit the comment\n```/);
});

test("renderMarkdown uses a longer fence when log lines contain backticks", () => {
  const report = analyze(fakeGh().gh, REPO, API["repos/acme/widget/actions/runs/100"]);
  report.jobs[0].lines = ["see ```js block```"];
  assert.match(renderMarkdown(report), /````text\nsee ```js block```\n````/);
});

function runComment(env, replies) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ciwhy-"));
  const log = path.join(dir, "gh.log");
  fs.writeFileSync(path.join(dir, "report.md"), "<!-- ciwhy -->\nreport");
  for (const [name, body] of Object.entries(replies)) fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(body));
  fs.writeFileSync(
    path.join(dir, "gh"),
    `#!/usr/bin/env bash\necho "$*" >> "${log}"\ncase "$*" in\n  *commits/*/pulls*) f=commits ;;\n  *pulls\\?state=open*) f=open ;;\n  *--paginate*) f=comments ;;\n  *) exit 0 ;;\nesac\nwhile [ "$1" != --jq ]; do shift; done\njq -r "$2" "${dir}/$f.json"\n`,
    { mode: 0o755 },
  );
  const script = new URL("../action/comment.sh", import.meta.url).pathname;
  execFileSync("bash", [script], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, REPO, SHA: "abc", REPORT: path.join(dir, "report.md"), ...env } });
  return fs.readFileSync(log, "utf8").trim().split("\n");
}

const bot = (id, body = "<!-- ciwhy -->\nold") => ({ id, body, user: { type: "Bot" } });

test("comment.sh updates the existing ciwhy comment or creates one", () => {
  const patched = runComment({ PRS: "7" }, { comments: [bot(3), { id: 4, body: "hi", user: { type: "Bot" } }, bot(5)] });
  assert.equal(patched[0], 'api repos/acme/widget/issues/7/comments --paginate --jq .[] | select(.user.type == "Bot" and (.body | startswith("<!-- ciwhy -->"))) | .id');
  assert.ok(patched[1].startsWith("api -X PATCH repos/acme/widget/issues/comments/5 -F body=@"));
  const posted = runComment({ PRS: "" }, { commits: [{ number: 41, state: "closed" }, { number: 42, state: "open" }], comments: [] });
  assert.equal(posted[0], 'api repos/acme/widget/commits/abc/pulls --jq .[] | select(.state == "open") | .number');
  assert.ok(posted[2].startsWith("api -X POST repos/acme/widget/issues/42/comments -F body=@"));
  assert.equal(posted.length, 3);
});

test("comment.sh leaves a marker comment from a person alone", () => {
  const calls = runComment({ PRS: "7" }, { comments: [{ id: 9, body: "<!-- ciwhy -->\nquoted", user: { type: "User" } }, bot(8, "see <!-- ciwhy -->")] });
  assert.ok(calls[1].startsWith("api -X POST repos/acme/widget/issues/7/comments -F body=@"));
});
