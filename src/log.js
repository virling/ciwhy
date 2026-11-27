const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const STAMP = /^\uFEFF?\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z ?/;
const ERROR = /##\[error\]|\bError:|ERR!|\bFAIL\b|^\s*not ok\b|✖|Traceback|panic:|fatal:|[Ee]xit code|exited with code/;
const SUMMARY = /^\s*# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b/;
const DIAGNOSTIC = /^\s*# (?!Subtest:)/;
const NOISE = /node:internal\/|\(node:[a-z_]+:\d+|duration_ms|^\s*(---|\.\.\.)$|^##\[(end)?group\]|^Post job cleanup|^\[command\]|^(Prepare all required actions|Complete job name:|Cleaning up orphan processes|shell: \S+)/;
const CONTEXT = 2;
const DIAGNOSTIC_WINDOW = 60;
export const MAX_LINES = 40;

export function cleanLog(text) {
  return text.replace(/\r/g, "").split("\n").map((l) => l.replace(ANSI, "").replace(STAMP, "").trimEnd());
}

function tapBlock(lines, i) {
  const indent = lines[i].match(/^\s*/)[0] + "  ";
  let end = i;
  while (end + 1 < lines.length && (lines[end + 1].startsWith(indent) || !lines[end + 1].trim())) {
    end++;
    if (lines[end] === `${indent}...`) break;
  }
  return end;
}

export function extractErrors(lines) {
  const keep = new Set();
  lines.forEach((line, i) => {
    if (!ERROR.test(line)) return;
    if (/^\s*not ok\b/.test(line)) {
      for (let j = Math.max(0, i - DIAGNOSTIC_WINDOW); j < i; j++) if (DIAGNOSTIC.test(lines[j]) && !SUMMARY.test(lines[j])) keep.add(j);
      for (let j = i; j <= tapBlock(lines, i); j++) keep.add(j);
      return;
    }
    for (let j = Math.max(0, i - CONTEXT); j <= Math.min(lines.length - 1, i + CONTEXT); j++) keep.add(j);
  });
  const out = [];
  const seen = new Set();
  let prev = -1;
  let gap = false;
  for (const i of [...keep].sort((a, b) => a - b)) {
    const line = lines[i];
    gap ||= prev >= 0 && i > prev + 1;
    prev = i;
    if (!line.trim() || NOISE.test(line) || SUMMARY.test(line) || seen.has(line.trim())) continue;
    if (seen.size === MAX_LINES) break;
    if (gap && out.length) out.push("--");
    gap = false;
    seen.add(line.trim());
    out.push(line);
  }
  return out;
}
