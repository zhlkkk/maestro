# Maestro Release Checklist

Use this checklist for M2 beta and later releases.

## Before Tagging

- Confirm `package.json` has the intended version.
- Confirm `src/index.ts` reports the same version with `bun run src/index.ts --version`.
- Run `bun install --frozen-lockfile`.
- Run `bun run typecheck`.
- Run `bun test`.
- Run `bun run dry-run:all`.
- Run `bun run build`, then remove the local `maestro` binary if it was generated.
- Confirm `git status --short` does not include local runtime artifacts under `.maestro/` or a root `maestro` binary.
- Confirm README commands still match the current package name, repository URL, and built-in paradigms.
- Run at least one live driver smoke test from `docs/driver-smoke.md`, record it with `docs/examples/driver-smoke-template.md`, and confirm it writes `.maestro/events-*.jsonl` and `.maestro/reports/run-*.md`.

## Tag and Release

- Create an annotated tag, for example `git tag -a v0.2.0 -m "v0.2.0"`.
- Push the tag with `git push origin v0.2.0`.
- Watch the `Release` workflow finish all binary build jobs.
- Confirm the GitHub release contains linux and darwin binaries.
- Confirm npm publish completed when `NPM_TOKEN` is configured.

## After Release

- Install from npm or download a release binary in a clean directory.
- Run `maestro --version`.
- Run a dry-run against `paradigms/tdd-strict.yaml`.
- Attach or link one sample run report to the release notes.
- Keep fork/join labeled experimental unless sibling abort and conflict semantics have been fully validated.
