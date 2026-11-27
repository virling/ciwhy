# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- A job whose log GitHub has deleted (after about 90 days) is shown as `log unavailable` instead of stopping the whole report.

## [0.1.0] - 2026-11-27

### Added

- `ciwhy` finds the failed jobs of a GitHub Actions run, across every attempt, and prints the failing step and the relevant log lines from the raw job log.
- Flaky verdict per job: passed on a later attempt, passed on another run of the same commit, or new since the last default-branch run.
- Pick a run by id, URL, `--pr` or `--branch`; `--rerun` re-runs failed jobs and reports the result; `--json` output.

[Unreleased]: https://github.com/virling/ciwhy/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/virling/ciwhy/releases/tag/v0.1.0
