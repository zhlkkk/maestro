# M3 Completion Audit

Date: 2026-06-02

## Completion Scope

M3 turns Maestro from a CLI with only built-in paradigms into a local paradigm ecosystem. The completed scope is the M3 plan plus the M3.x follow-ups that were required to close the local ecosystem loop.

Completed requirements:

- Generic CLI driver for command-array based local tools.
- Local paradigm pack metadata.
- `maestro init paradigm <name>` scaffold.
- Local path and Git URL `maestro install <source>`.
- Local registry index at `.maestro/paradigms/index.json`.
- `maestro list paradigms` for installed pack discovery.
- `maestro run <installed-name>` for installed pack execution.
- `driver_plugins` for local plugin driver loading.
- Report Artifact Index and Decision Summary.
- Backward compatibility for existing built-in paradigms.

Explicitly out of scope for M3 completion:

- Remote registry hosting/search service.
- Signed package trust policy.
- Web UI.
- Automatic migration of old paradigms to package format.

## Evidence

| Requirement | Evidence |
| --- | --- |
| Generic CLI driver | `src/driver/generic-cli.ts`, `tests/driver/generic-cli.test.ts` |
| Metadata parsing and validation | `src/engine/parser.ts`, `src/engine/validator.ts`, `tests/engine/parser.test.ts`, `tests/engine/validator.test.ts` |
| Scaffold command | `src/cli/init.ts`, `tests/cli/init.test.ts` |
| Install local/Git packs | `src/cli/install.ts`, `tests/cli/install.test.ts` |
| Local registry index | `src/cli/paradigm-registry.ts`, `tests/cli/install.test.ts` |
| List installed packs | `src/cli/list.ts`, `tests/cli/list.test.ts` |
| Run installed pack by name | `src/cli/run.ts`, `tests/cli/install.test.ts` |
| Driver plugins | `src/driver/registry.ts`, `tests/driver/registry.test.ts`, `tests/cli/install.test.ts` |
| Report artifacts and decisions | `src/engine/report.ts`, `src/engine/runner.ts`, `tests/engine/report.test.ts` |
| Backward compatibility | `bun run dry-run:all` covers built-in paradigms |
| Documentation | `README.md`, `docs/paradigm-packs.md`, `docs/architecture.md`, `docs/roadmap.md` |

## Required Gates

- `bun install --frozen-lockfile`
- `bun run typecheck`
- `bun test`
- `bun run dry-run:all`
- `bun run build`
- `git diff --check`
- `bun run src/index.ts init paradigm demo --dry-run`
- CLI chain: `init paradigm` -> `install` -> `list paradigms` -> `run <installed-name> --dry-run`
- Plugin live chain: install plugin pack -> run installed plugin pack -> report contains Artifact Index and Decision Summary

## Decision

M3 is complete when all required gates pass on this branch and the completion commits are pushed. Remaining remote registry, trust policy, and Web UI work is post-M3 backlog, not unfinished M3 scope.
