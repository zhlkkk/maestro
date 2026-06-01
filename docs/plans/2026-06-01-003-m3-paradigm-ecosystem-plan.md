---
id: 2026-06-01-003
title: M3 Paradigm Ecosystem
status: active
created: 2026-06-01
origin: docs/roadmap.md
---

# M3 Paradigm Ecosystem

## Problem Frame

M2 is now release-ready enough for beta: quality gates pass, a live Codex driver smoke run produced events/report, and fork/join remains honestly scoped as experimental. M3 should turn Maestro from a CLI with built-in paradigms into a small ecosystem where users can create, validate, share, and run their own paradigms without editing core source.

The first M3 slice should avoid a large registry platform. It should create a local authoring loop first, then add installation and registry metadata once the local contract is stable.

## Scope

In scope:

- Add a generic CLI driver contract for tools that can run from a command template.
- Add `maestro init paradigm <name>` to scaffold a local paradigm pack.
- Define paradigm metadata fields used by local packs and future registry entries.
- Add documentation and tests for creating, validating, and dry-running a custom paradigm.
- Preserve backward compatibility for existing YAML paradigms.

Out of scope for the first M3 slice:

- Remote package registry hosting.
- Signed packages or trust policy.
- Web UI.
- Automatic migration of existing paradigms to a package format.

## Decisions

1. Start with local paradigm packs.

   Rationale: local scaffolding gives users immediate value and clarifies the file shape before a remote install mechanism exists.

2. Generic CLI driver uses environment variables and a command array, not shell interpolation.

   Rationale: command arrays avoid quoting bugs and reduce accidental shell injection. The driver can expose `MAESTRO_PROMPT_FILE`, `MAESTRO_WORKDIR`, `MAESTRO_OUTPUT_FILE`, and `MAESTRO_MODEL`.

3. Existing paradigm YAML remains valid.

   Rationale: M3 should expand the ecosystem surface without making M2 users migrate.

4. `maestro install` is planned after scaffold and metadata.

   Rationale: installing remote content is higher risk than generating a local template. It should depend on a validated pack shape.

## Implementation Units

### U1: Generic CLI Driver Contract

Files:

- Create: `src/driver/generic-cli.ts`
- Modify: `src/driver/registry.ts`
- Modify: `src/engine/types.ts`
- Modify: `src/engine/parser.ts`
- Modify: `src/engine/validator.ts`
- Test: `tests/driver/generic-cli.test.ts`
- Test: `tests/engine/parser.test.ts`
- Test: `tests/engine/validator.test.ts`

Approach:

- Add agent-level `command?: string[]` for `driver: generic-cli`.
- Require `command` for `generic-cli` agents and reject it for final phases only by normal agent validation.
- Run the command in the phase worktree using the shared subprocess base.
- Pass prompt via a temporary prompt file path in `MAESTRO_PROMPT_FILE`.
- Pass model and output file hints through env vars.
- Treat stdout as agent output; output file parsing remains the existing Maestro contract.

Verification:

- Generic driver can run a local script that writes the expected output file.
- Missing command on `generic-cli` fails validation.
- Existing built-in paradigms parse and dry-run unchanged.

### U2: Paradigm Pack Metadata

Files:

- Modify: `src/engine/types.ts`
- Modify: `src/engine/parser.ts`
- Modify: `src/engine/validator.ts`
- Modify: `docs/architecture.md`
- Test: `tests/engine/parser.test.ts`
- Test: `tests/engine/validator.test.ts`

Approach:

- Add optional top-level metadata fields: `version`, `author`, `tags`, `license`, `homepage`.
- Keep metadata non-behavioral in M3.1; parser preserves it, validator checks simple scalar/list shapes.
- Document that `maestro_version` is engine schema compatibility, while `version` is pack version.

Verification:

- Metadata parses when present.
- Invalid metadata shape reports clear validation errors.
- Metadata absence remains valid.

### U3: `maestro init paradigm`

Files:

- Create: `src/cli/init.ts`
- Modify: `src/index.ts`
- Create: `docs/templates/paradigm-pack/`
- Test: `tests/cli/init.test.ts`

Approach:

- Add command: `maestro init paradigm <name> [--dir <dir>]`.
- Generate a directory containing `paradigm.yaml`, `prompts/implement.md`, and `README.md`.
- Default generated paradigm uses `generic-cli` with a placeholder command that exits with instructions, so users must make the command explicit before live use.
- Support `--dry-run` to print planned files without writing.

Verification:

- Dry-run prints generated paths.
- Init creates the expected file tree.
- Re-running init into a non-empty directory fails unless `--force` is provided.

### U4: Local Pack Documentation

Files:

- Create: `docs/paradigm-packs.md`
- Modify: `README.md`
- Modify: `docs/roadmap.md`

Approach:

- Document the local pack layout, metadata fields, generic CLI driver contract, and scaffold command.
- Add a small example showing `maestro init paradigm example`, editing the command, then `maestro run`.
- Keep remote install and registry clearly marked as future M3.x work.

Verification:

- README links to the pack guide.
- The guide includes one copy-pasteable dry-run path.

## Acceptance Gates

- `bun run typecheck`
- `bun test`
- `bun run dry-run:all`
- `bun run build`
- `bun run src/index.ts init paradigm demo --dry-run`
- Generated demo pack can be dry-run after replacing the placeholder command with a local script.

## Follow-Up M3.x

- Add `maestro install <source>` for local path and Git URL sources.
- Add registry index format and compatibility checks.
- Add driver plugin loading once generic CLI driver usage patterns stabilize.
- Improve reports with artifact indexes and key decision summaries.
