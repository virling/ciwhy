# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/virling/ciwhy/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/virling/ciwhy/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/virling/ciwhy/releases/tag/v0.1.0
