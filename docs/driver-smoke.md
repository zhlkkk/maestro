# Driver Smoke Tests

Use these checks before an M2.x release to prove at least one real driver can run end to end and produce audit artifacts.

## Preconditions

- Run from the repository root.
- Confirm the working tree has no important uncommitted changes.
- Confirm dependencies are installed with `bun install --frozen-lockfile`.
- Confirm the local gates pass:
  - `bun run typecheck`
  - `bun test`
  - `bun run dry-run:all`

## Driver Availability

Check whichever driver is installed locally:

```bash
claude --version
codex --version
gemini --version
```

At least one command must be available for the release smoke run. If a driver is missing, record it as not tested rather than blocking the whole release.

Known local compatibility checks:

- Codex CLI `0.130.0`: Maestro expects `codex exec --json --ephemeral -C <workdir> [-m <model>] <prompt>`.
- Gemini CLI `0.42.0`: Maestro expects `gemini --prompt <prompt> [--model <model>]` and runs the process with `cwd` set to the phase worktree.
- Gemini usage extraction is intentionally disabled until a stable structured output contract is confirmed.

## Minimal Live Run

Run a small paradigm with an intentionally low-risk task:

```bash
bun run dev run paradigms/bug-investigation.yaml --task "Inspect the repository and write a no-op verification report"
```

The selected driver must create the required phase output files with YAML frontmatter status values. If the driver asks for interactive approval or cannot run non-interactively, stop and record the driver/version as incompatible with the current smoke path.

Use `docs/examples/driver-smoke-template.md` to record the result.

## Audit Artifact Checks

After a successful live run:

- `.maestro/events-*.jsonl` exists.
- `.maestro/reports/run-*.md` exists.
- The report includes every phase that started.
- The report status matches the pipeline result.
- Usage fields may be `N/A`; missing usage data is acceptable for subprocess drivers.

## Release Evidence

Before tagging, attach or link:

- The driver name and version.
- The command that was run.
- The generated report path or copied sample report.
- Any driver-specific notes, especially prompts, permissions, or non-interactive flags.

## Troubleshooting

- Missing output file: inspect the phase worktree before cleanup or rerun with a tiny task that explicitly asks the driver to write the required `output_file`.
- Interactive prompt: record the driver as incompatible with the current smoke path until a non-interactive flag is available.
- Unsupported flag: update the driver `buildArgs` and this document together, then rerun the unit tests for that driver.
