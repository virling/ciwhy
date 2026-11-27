import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { cleanLog, extractErrors } from "./log.js";

const FAILED = ["failure", "timed_out"];

export function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

const api = (gh, path) => JSON.parse(gh(["api", path]));

export function parseTarget(arg) {
  if (/^\d+$/.test(arg)) return { id: arg };
  const m = arg.match(/github\.com\/([^/]+\/[^/]+)\/actions\/runs\/(\d+)/);
  return m && { repo: m[1], id: m[2] };
}

export function currentRepo(gh) {
  return gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]).trim();
}

export function findRun(gh, repo, { id, pr, branch }) {
  if (id) return api(gh, `repos/${repo}/actions/runs/${id}`);
  const filter = pr ? `head_sha=${api(gh, `repos/${repo}/pulls/${pr}`).head.sha}` : `branch=${encodeURIComponent(branch)}`;
  return api(gh, `repos/${repo}/actions/runs?${filter}&status=failure&per_page=1`).workflow_runs[0] || null;
}

const allJobs = (gh, repo, id) => api(gh, `repos/${repo}/actions/runs/${id}/jobs?filter=all&per_page=100`).jobs;
const passed = (jobs, name) => jobs.find((j) => j.name === name && j.conclusion === "success");

function failedJobs(jobs) {
  const latest = new Map();
  for (const j of jobs) if (FAILED.includes(j.conclusion) && !(latest.get(j.name)?.run_attempt > j.run_attempt)) latest.set(j.name, j);
  return [...latest.values()];
}

function evidence(gh, repo, target, jobs) {
  let sameSha, previous;
  const sameShaRuns = () =>
    (sameSha ??= api(gh, `repos/${repo}/actions/runs?head_sha=${target.head_sha}&per_page=100`)
      .workflow_runs.filter((r) => r.id !== target.id && r.workflow_id === target.workflow_id)
      .map((r) => ({ run: r, jobs: allJobs(gh, repo, r.id) })));
  const previousRun = () => {
    if (previous !== undefined) return previous;
    const branch = api(gh, `repos/${repo}`).default_branch;
    const prev = api(gh, `repos/${repo}/actions/workflows/${target.workflow_id}/runs?branch=${encodeURIComponent(branch)}&status=completed&per_page=20`)
      .workflow_runs.find((r) => r.id !== target.id && r.created_at < target.created_at);
    return (previous = prev ? { run: prev, branch, jobs: api(gh, `repos/${repo}/actions/runs/${prev.id}/jobs?per_page=100`).jobs } : null);
  };
  return (job) => {
    const later = jobs.find((j) => j.name === job.name && j.run_attempt > job.run_attempt && j.conclusion === "success");
    if (later) return { verdict: "flaky", evidence: `passed on attempt ${later.run_attempt} of this run` };
    const other = sameShaRuns().find((r) => passed(r.jobs, job.name));
    if (other) return { verdict: "flaky", evidence: `passed in run ${other.run.id} on the same commit` };
    const prev = previousRun();
    if (!prev) return { verdict: "unknown", evidence: "no earlier run of this workflow on the default branch, and no pass on this commit" };
    const pj = prev.jobs.find((j) => j.name === job.name);
    if (pj?.conclusion === "success") return { verdict: "new failure", evidence: `passed on the previous ${prev.branch} run ${prev.run.id}` };
    return { verdict: "unknown", evidence: `no pass on this commit; ${pj ? pj.conclusion : "not run"} on the previous ${prev.branch} run ${prev.run.id}` };
  };
}

export function analyze(gh, repo, target) {
  const jobs = allJobs(gh, repo, target.id);
  const judge = evidence(gh, repo, target, jobs);
  return {
    repo,
    run: { id: target.id, name: target.name, url: target.html_url, branch: target.head_branch, sha: target.head_sha, attempts: target.run_attempt, conclusion: target.conclusion },
    jobs: failedJobs(jobs).map((job) => ({
      id: job.id,
      name: job.name,
      attempt: job.run_attempt,
      url: job.html_url,
      step: job.steps?.find((s) => FAILED.includes(s.conclusion))?.name ?? null,
      ...judge(job),
      lines: extractErrors(cleanLog(gh(["api", "--allow-escape-sequences", `repos/${repo}/actions/jobs/${job.id}/logs`]))),
    })),
  };
}

export async function rerun(gh, repo, target, names, { sleep = delay, intervalMs = 15000, timeoutMs = 30 * 60000 } = {}) {
  gh(["run", "rerun", String(target.id), "--failed", "--repo", repo]);
  for (let waited = 0; waited < timeoutMs; waited += intervalMs) {
    await sleep(intervalMs);
    const r = api(gh, `repos/${repo}/actions/runs/${target.id}`);
    if (r.run_attempt <= target.run_attempt || r.status !== "completed") continue;
    const jobs = api(gh, `repos/${repo}/actions/runs/${target.id}/attempts/${r.run_attempt}/jobs?per_page=100`).jobs;
    return {
      attempt: r.run_attempt,
      conclusion: r.conclusion,
      jobs: names.map((name) => {
        const conclusion = jobs.find((j) => j.name === name)?.conclusion ?? "not run";
        return { name, conclusion, verdict: conclusion === "success" ? "flaky" : "failed again" };
      }),
    };
  }
  return { attempt: null, conclusion: "timed out", jobs: [] };
}

export function render(report) {
  const { run } = report;
  const out = [`${report.repo}  ${run.name} run ${run.id}  ${run.branch} ${run.sha.slice(0, 7)}  ${run.attempts} attempt${run.attempts === 1 ? "" : "s"}, ${run.conclusion}`, run.url];
  if (!report.jobs.length) out.push("", "No failed jobs in any attempt.");
  for (const job of report.jobs) {
    out.push("", `FAILED ${job.name}  attempt ${job.attempt}${job.step ? `  step: ${job.step}` : ""}`, `  ${job.verdict}: ${job.evidence}`, `  ${job.url}`, "");
    out.push(...(job.lines.length ? job.lines : ["(no error lines found in the log)"]).map((l) => `    ${l}`));
  }
  if (report.rerun) out.push("", renderRerun(report.rerun));
  return out.join("\n");
}

export function renderRerun(r) {
  const head = r.attempt ? `Re-run attempt ${r.attempt}: ${r.conclusion}` : `Re-run: ${r.conclusion}`;
  return [head, ...r.jobs.map((j) => `  ${j.name}: ${j.conclusion} (${j.verdict})`)].join("\n");
}
