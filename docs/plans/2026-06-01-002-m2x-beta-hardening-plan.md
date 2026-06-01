---
id: 2026-06-01-002
title: M2.x Beta Hardening
status: active
created: 2026-06-01
origin: docs/roadmap.md, docs/driver-smoke.md
---

# M2.x Beta Hardening

## Problem Frame

M2 now has a clean release baseline and stronger fork/join runner behavior. The next phase should reduce beta release risk by proving real driver compatibility, tightening subprocess usage extraction, and making smoke evidence repeatable.

This phase should not expand the public YAML schema or switch the default runtime UI. The goal is release confidence, not new product surface area.

## Scope

In scope:

- Calibrate Codex and Gemini CLI invocation against installed versions.
- Capture usage metadata when a subprocess driver exposes it.
- Make driver smoke runs easy to reproduce and record.
- Add regression tests around subprocess JSON usage parsing and smoke documentation expectations.
- Keep console output as the default `run` UI for M2.x.

Out of scope:

- Default Ink dashboard integration.
- Paradigm registry or install commands.
- Automatic conflict resolution for fork child file conflicts.
- A hosted UI or persistent run database.

## Decisions

1. M2.x keeps console output as the default CLI UI.

   Rationale: the current console path is tested and simple. Dashboard defaulting can wait until M3, when artifact and report navigation are richer.

2. Usage extraction must be optional and defensive.

   Rationale: subprocess drivers depend on external CLI wire formats. Missing or unrecognized usage data should produce `N/A`, not fail the run.

3. Driver smoke evidence is a release artifact.

   Rationale: at least one real driver must prove live execution, event logging, and report generation before each beta release.

4. Codex gets structured usage support first.

   Rationale: the Codex driver already uses `codex exec --json`; Gemini currently uses plain text mode and should be calibrated before adding structured assumptions.

## Implementation Units

### U1: Codex JSONL Usage Extraction

Files:

- Modify: `src/driver/subprocess.ts`
- Modify: `src/driver/codex.ts`
- Test: `tests/driver/subprocess.test.ts`
- Test: `tests/driver/codex.test.ts`

Approach:

- Extend the subprocess driver so `extractUsage` can inspect structured raw JSON lines as well as emitted `AgentEvent`s.
- In the Codex driver, collect `turn.completed` or equivalent JSONL usage fields when present.
- Map usage defensively into `tokensIn`, `tokensOut`, `costUsd`, and `modelUsed` only when fields are numeric/string and clearly present.
- Preserve current behavior for JSON lines that only produce output events.

Verification:

- Unit tests cover Codex output events and usage extraction from representative JSONL lines.
- `bun test tests/driver/codex.test.ts tests/driver/subprocess.test.ts`
- `bun run typecheck`

### U2: Gemini CLI Calibration

Files:

- Modify: `src/driver/gemini.ts`
- Test: `tests/driver/gemini.test.ts`
- Modify: `docs/driver-smoke.md`

Approach:

- Add a documented compatibility note for the exact Gemini CLI command shape Maestro expects.
- Verify whether the installed Gemini CLI supports the current `--non-interactive --cwd --model` arguments.
- If the installed CLI differs, update `buildArgs` and tests to match the real non-interactive contract.
- Keep usage extraction disabled unless a stable structured output is confirmed.

Verification:

- `gemini --version` and a documented dry smoke command are recorded in `docs/driver-smoke.md`.
- Gemini driver tests assert the expected args for model and workdir routing.

### U3: Release Smoke Evidence Workflow

Files:

- Modify: `docs/driver-smoke.md`
- Modify: `docs/release-checklist.md`
- Create: `docs/examples/driver-smoke-template.md`

Approach:

- Add a template for recording driver name, version, command, result, events path, report path, and notes.
- Clarify that a release can proceed with one passing live driver while other missing CLIs are marked not tested.
- Add a short troubleshooting section for missing output files, interactive prompts, and unsupported CLI flags.

Verification:

- The checklist points to the template.
- The smoke doc has a concrete pass/fail evidence format.

### U4: M2.x Runner Edge Regression Tests

Files:

- Modify: `tests/engine/runner.test.ts`
- Modify: `src/engine/runner.ts` only if tests expose a bug.

Approach:

- Add a timeout-driven sibling abort test.
- Add a conflict test where both children inherit the same pre-fork file unchanged; it must not be reported as a conflict.
- Add a conflict test for delete-vs-modify on the same path; it must fail before join driver execution.

Verification:

- `bun test tests/engine/runner.test.ts`
- Full `bun test`

## Acceptance Gates

- `bun install --frozen-lockfile`
- `bun run typecheck`
- `bun test`
- `bun run dry-run:all`
- `bun run build`
- `bun run src/index.ts --version`
- At least one live driver smoke run records events and report paths using `docs/examples/driver-smoke-template.md`.

## Follow-Up After M2.x

- M3 should start with generic CLI driver and paradigm scaffold work.
- Dashboard defaulting should be revisited after reports include artifact indexes and driver smoke evidence is routine.
- Fork conflict auto-resolution remains deferred until real beta workflows show a safe merge policy.
