# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- The Action only updates comments posted by a bot that start with the ciwhy marker, never a comment written by a person.
- Run, job, step and branch names are put in code in the comment, so names from a fork cannot add mentions, links or images.
- Every page of a run's jobs is read, so failures in large matrices and reruns are not dropped.
- Runs that timed out count when finding the latest failure.
- The push fallback comments only on open pull requests, and the Action warns when it finds none.
- A detached HEAD is reported as a usage error instead of "No failed runs for branch HEAD".
- Text output shows "in progress" instead of "null" for a running workflow.
- Prerelease versions publish under the `next` npm tag.

## [0.2.1] - 2026-11-28

### Fixed

- Comments now reach pull requests from forks. GitHub leaves `workflow_run.pull_requests` empty for them, so the action also looks up open pull requests by head `owner:branch` and keeps the one whose head is the failed commit.

## [0.2.0] - 2026-11-27

### Added

- `--markdown` prints a compact Markdown report for pull request comments and job summaries.
- GitHub Action `virling/ciwhy@v0`: when CI fails on a pull request, it comments the report on the PR and updates that comment on later failures.

### Changed

- GitHub runner boilerplate (`Prepare all required actions`, `Cleaning up orphan processes` and similar) is left out of the extracted lines.

## [0.1.1] - 2026-11-27

### Fixed

- A job whose log GitHub has deleted (after about 90 days) is shown as `log unavailable` instead of stopping the whole report.

## [0.1.0] - 2026-11-27

### Added

- `ciwhy` finds the failed jobs of a GitHub Actions run, across every attempt, and prints the failing step and the relevant log lines from the raw job log.
- Flaky verdict per job: passed on a later attempt, passed on another run of the same commit, or new since the last default-branch run.
- Pick a run by id, URL, `--pr` or `--branch`; `--rerun` re-runs failed jobs and reports the result; `--json` output.

[Unreleased]: https://github.com/virling/ciwhy/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/virling/ciwhy/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/virling/ciwhy/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/virling/ciwhy/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/virling/ciwhy/releases/tag/v0.1.0
