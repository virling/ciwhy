# ciwhy

Why did CI fail, and is it flaky? One command for GitHub Actions. Zero dependencies, uses the `gh` CLI you already have.

- **Finds the real error.** Downloads the raw job log, strips ANSI codes and timestamps, and keeps only the error region: `##[error]`, `Error:`, `FAIL`, `not ok`, tracebacks, panics, exit codes.
- **Reads Node test runner output.** Shows the failing TAP subtest and the `# ...` diagnostic lines the process printed near it, which `gh run view --log-failed` often hides.
- **Checks every attempt.** A job that failed and then passed on re-run is still found.
- **Flaky verdict.** `flaky` if the job passed on a later attempt or on another run of the same commit, `new failure` if it passed on the previous default branch run, otherwise `unknown`.
- **Re-run and wait.** `--rerun` re-runs the failed jobs and tells you if they pass this time.

## Install

```bash
npx @virling/ciwhy
```

Or `npm install -g @virling/ciwhy` to get `ciwhy` on your PATH.

## Example

```
$ ciwhy 45871759993 --repo virling/agentmem
virling/agentmem  test run 45871759993  main 93de02f  2 attempts, success
https://github.com/virling/agentmem/actions/runs/45871759993

FAILED test (macos-latest, 18)  attempt 1  step: Run npm test
  flaky: passed on attempt 2 of this run
  https://github.com/virling/agentmem/actions/runs/45871759993/job/140088664991

    # warning: --depth is ignored in local clones; use file:// instead.
    # agentmem: spawnSync tar ENOTCONN
    --
    not ok 11 - guard-check cannot be bypassed by removing the guard, renaming, or unusual names
      location: 'file:///Users/runner/work/agentmem/agentmem/test/features.test.js:108:1'
      failureType: 'testCodeFailure'
      error: |-
        The input did not match the regular expression /error: src\/gen\/client\.ts/. Input:
        ''
      code: 'ERR_ASSERTION'
      ...
    --
    ##[error]Process completed with exit code 1.
```

## Options

```
ciwhy                      latest failed run on the current branch
ciwhy <run-id|run-url>     a specific run (every attempt is checked)
ciwhy --pr <number>        latest failed run on the pull request's head commit
ciwhy --branch <name>      latest failed run on a branch

--repo owner/name          repository (default: the repo in the current folder)
--rerun                    re-run the failed jobs, wait, and report if they pass
--timeout <minutes>        how long --rerun waits (default 30)
--json                     machine-readable output
--help
```

Exit code is 0 after a report, even when jobs failed. It is non-zero only for usage errors (2) or `gh` errors (1).

## Requirements

- Node.js 20 or newer
- [GitHub CLI](https://cli.github.com/) (`gh`), authenticated with `gh auth login`

## More tools from Virling

- [agentmem](https://github.com/virling/agentmem): project memory for AI coding agents, shared across Claude Code, Cursor, Codex and other MCP clients.
- [ccdoctor](https://github.com/virling/ccdoctor): checks your Claude Code setup: hooks, MCP servers and plugins that are registered but not working.
- [npmship](https://github.com/virling/npmship): releases an npm package and verifies it landed on npm, in CI and on GitHub.
- [subagents](https://github.com/virling/subagents): reviews what Claude Code subagents did in a session and flags repeated or wasted work.

## License

[PolyForm Noncommercial 1.0.0](LICENSE)
