---
id: 2026-06-01-001
title: Finish M2 and Plan Next Iterations
status: active
created: 2026-06-01
origin: user request, docs/roadmap.md
---

# Finish M2 and Plan Next Iterations

## Problem Frame

Maestro has most M2 capabilities in place: multi-driver execution, model routing, replay, usage fields, fork/join parser and state machine support, and audit reports. The remaining work is to turn that implementation into a public beta that is easy to validate, honest about experimental boundaries, and ready for iteration.

The M2 completion target is a release candidate, not a claim that every complex parallel workflow is production-safe.

## Scope

In scope:

- Make local quality gates green: `bun test`, `bun run typecheck`, `bun run dry-run:all`, `bun run build`.
- Remove obvious release blockers: version drift, missing license, tracked build artifacts, missing CI baseline.
- Stabilize runner behavior where it is low-risk and already designed, especially retry events and fork/join handoff inputs.
- Update roadmap language so M2 has a clear completion definition and follow-up path.
- Define M3 and M4 as sequenced iteration tracks.

Out of scope for this M2 finish pass:

- Full production-grade fork child sibling abort.
- Conflict-aware merge strategy for fork children editing the same files.
- Hosted web UI.
- Deep driver protocol calibration against every CLI version.

## Decisions

1. M2 ships as a public beta with fork/join marked experimental.

   Rationale: parser, validator, state machine, tests, and base runner behavior exist. Blocking the whole milestone on production-grade parallel cancellation would delay the useful multi-driver and audit improvements.

2. Release readiness is defined by repeatable local and CI gates.

   Rationale: Maestro is a CLI. Users need installability, reproducible dry-runs, and confidence that built-in paradigms parse before they need advanced live-driver scenarios.

3. Dashboard remains a component capability unless explicitly wired into `run`.

   Rationale: console output is currently the actual default runtime path. Documentation should describe real behavior instead of implying the Ink UI is already the primary interface.

4. M3 focuses on ecosystem and extensibility; M4 focuses on team operations.

   Rationale: after M2 proves the engine, the next leverage point is reusable paradigms and pluggable drivers. Team workflow features become easier once the ecosystem surface is stable.

## Implementation Units

### U1: Release Baseline Cleanup

Files:

- Modify: `src/index.ts`
- Modify: `.gitignore`
- Create: `LICENSE`
- Delete: `maestro`

Approach:

- Read the CLI version from `package.json`.
- Ignore the root build binary and remove the currently tracked artifact.
- Add an MIT license file matching `package.json`.

Verification:

- `bun run src/index.ts --version` prints the `package.json` version.
- `git status --short` shows `maestro` as deleted and no regenerated binary as untracked after build.

### U2: Quality Gate Green Baseline

Files:

- Modify: `tests/engine/parallel-spike.test.ts`
- Create: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`

Approach:

- Fix xstate spike actor output inference so `bun run typecheck` passes.
- Add CI steps for install, typecheck, test, dry-run, and build.
- Make the release workflow run the same validation gates before binary packaging and npm publish.

Verification:

- `bun run typecheck`
- `bun test`
- `bun run dry-run:all`
- `bun run build`

### U3: Runner Retry and Fork Handoff Stabilization

Files:

- Modify: `src/engine/runner.ts`
- Follow-up test target: `tests/engine/runner.test.ts`

Approach:

- Emit `PHASE_RETRY` when a phase re-enters an existing worktree.
- Snapshot pre-fork worktree/output for every fork child so children do not inherit sibling output accidentally.
- Aggregate fork child handoffs and outputs into the join target.

Verification:

- Existing machine and report tests remain green.
- Add runner integration coverage in a follow-up pass to lock the exact event and handoff semantics.

### U4: Roadmap and Iteration Plan

Files:

- Modify: `docs/roadmap.md`
- Create: `docs/release-checklist.md`
- Create: `docs/plans/2026-06-01-001-finish-m2-and-next-iterations.md`

Approach:

- Reframe M2 as a public beta release candidate.
- Move unresolved production-grade parallel semantics into M2.x/M3 follow-up.
- Define the next iteration tracks and acceptance gates.

Verification:

- Documentation no longer treats historical checklist items as current truth.
- M2 completion criteria are explicit and testable.

## Next Iterations

### M2.x: Beta Hardening

Goal: reduce support risk after the first public beta.

- Add `tests/engine/runner.test.ts` integration coverage for retry events, fork child handoff, join aggregation, and failure paths.
- Implement fork sibling abort with shared abort controllers or parent-level cancellation.
- Document real Codex and Gemini CLI smoke tests, including installed version assumptions.
- Add release checklist and sample run report.
- Decide whether `run` should default to Ink dashboard or keep console output for v0.2.x.

Exit criteria:

- At least one live run with a real driver produces events and report.
- Fork/join limitations are documented with examples.
- CI is green on pull requests.

### M3: Paradigm Ecosystem

Goal: make Maestro extensible beyond built-in paradigms.

- Add paradigm registry metadata: version, author, tags, license, compatibility.
- Add `maestro init paradigm` scaffold.
- Add `maestro install <paradigm>` for local or remote paradigm packs.
- Add generic CLI driver with a documented output contract.
- Improve reports with diff summary, artifact index, and decision highlights.

Exit criteria:

- A user can create, validate, and share a custom paradigm without editing core source files.
- Driver integration has a stable public contract.

### M4: Team Workflow

Goal: turn Maestro runs into auditable team delivery units.

- Add branch-per-run or PR-per-run execution mode.
- Add manual approval checkpoints.
- Add policy controls for tools, drivers, models, and cost ceilings.
- Add organization-level cost/token summaries.
- Add searchable historical run index.
- Add CI integration hooks for bidirectional status reporting.

Exit criteria:

- A team can run a paradigm as a gated delivery workflow and review artifacts after the fact.
- Cost, status, and approvals are queryable across runs.

## Risks

- Fork/join file conflicts can still overwrite changes if sibling phases edit the same file.
- Driver CLIs may change output format; Codex and Gemini usage extraction should stay optional and defensive.
- Build binaries are intentionally ignored, so release packaging should rely on CI or npm packaging rather than local artifacts.

## Open Follow-Ups

- Should v0.2.x publish as `maestro-cli` or reserve a different npm package name?
- Should dashboard become the default UI in M2.x, or wait until M3 when reports and artifacts are richer?
- What is the minimum live-driver demo that best communicates Paradigm-as-Code: TDD, bug investigation, or combined workflow?
