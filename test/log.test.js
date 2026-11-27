import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { MAX_LINES, cleanLog, extractErrors } from "../src/log.js";

const fixture = (name) => fs.readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8");

test("cleanLog strips the BOM, timestamps, ANSI codes and carriage returns", () => {
  const lines = cleanLog(fixture("build.log"));
  assert.equal(lines[0], "##[group]Run python build.py");
  assert.equal(lines.find((l) => l.startsWith("KeyError")), "KeyError: 'VERSION'");
  assert.ok(lines.every((l) => !/\x1b|\r|^\d{4}-/.test(l)));
  assert.equal(cleanLog(fixture("tap.log"))[5], "npm test");
});

test("TAP failures keep the failing block and nearby process diagnostics", () => {
  const out = extractErrors(cleanLog(fixture("tap.log")));
  assert.deepEqual(out, [
    "# widget: spawnSync unzip EPIPE",
    "--",
    "not ok 4 - restores the cache after a restart",
    "  location: 'file:///Users/runner/work/widget/widget/test/cache.test.js:42:1'",
    "  failureType: 'testCodeFailure'",
    "  error: |-",
    "    Expected values to be strictly equal:",
    "    '' !== 'restored'",
    "  code: 'ERR_ASSERTION'",
    "  stack: |-",
    "    TestContext.<anonymous> (file:///Users/runner/work/widget/widget/test/cache.test.js:51:12)",
    "--",
    "##[error]Process completed with exit code 1.",
  ]);
});

test("generic error lines get context and are deduplicated", () => {
  const out = extractErrors(cleanLog(fixture("lint.log")));
  assert.ok(out.includes("✖ 2 problems (2 errors, 0 warnings)"));
  assert.ok(out.includes("  30:1  error  Unexpected console statement             no-console"));
  assert.equal(out.filter((l) => l === "npm ERR! Error: command failed").length, 1);
  assert.ok(!out.some((l) => l.startsWith("##[group]")));
  const py = extractErrors(cleanLog(fixture("build.log")));
  assert.ok(py.includes("Traceback (most recent call last):") && py.includes("KeyError: 'VERSION'"));
});

test("output is capped", () => {
  const lines = Array.from({ length: 200 }, (_, i) => `Error: failure number ${i}`);
  assert.equal(extractErrors(lines).length, MAX_LINES);
});

test("runner boilerplate around an error is dropped", () => {
  const lines = ["Prepare all required actions", "Complete job name: test", "shell: /usr/bin/bash -e {0}", "Error: boom", "##[error]Process completed with exit code 1.", "Cleaning up orphan processes"];
  assert.deepEqual(extractErrors(lines), ["Error: boom", "##[error]Process completed with exit code 1."]);
});
