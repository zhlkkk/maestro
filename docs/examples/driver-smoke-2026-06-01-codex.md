# Driver Smoke Evidence

## Environment

- Date: 2026-06-01
- Git commit: `bb73b54`
- Driver: Codex
- Driver version: `codex-cli 0.130.0`
- Maestro version: `0.2.0`
- Platform: `Darwin arm64`

## Command

```bash
bun run dev run /tmp/maestro-codex-smoke.yaml --task 'Create SMOKE_RESULT.md in the current worktree. The file must start with YAML frontmatter exactly like --- newline status: approved newline --- and then include a short note saying Codex live driver smoke completed. Do not edit any other files.'
```

## Result

- Status: pass
- Events file: `.maestro/events-0c89ad35.jsonl`
- Report file: `.maestro/reports/run-0c89ad35.md`
- Exit code: `0`

## Checks

- [x] Driver command was available.
- [x] Live run completed successfully.
- [x] `.maestro/events-*.jsonl` was created.
- [x] `.maestro/reports/run-*.md` was created.
- [x] Report status matched the pipeline result.

## Report Summary

- Paradigm: `Codex Smoke`
- Phase: `Smoke`
- Agent status: `approved`
- Duration: `145.4s`
- Tokens in: `107621`
- Tokens out: `599`
- Cost: `N/A`

## Notes

- The smoke paradigm was created outside the repository at `/tmp/maestro-codex-smoke.yaml`.
- The Codex driver wrote only `SMOKE_RESULT.md` in the phase worktree.
- Usage token extraction worked for the live Codex JSONL stream; model and cost were not reported by this run.
