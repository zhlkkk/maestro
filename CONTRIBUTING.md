# Contributing to Maestro

Thank you for your interest in contributing to Maestro. This guide covers the main ways to contribute: writing paradigms, adding drivers, and submitting code changes.

## Table of Contents

- [Development Setup](#development-setup)
- [Writing a Paradigm](#writing-a-paradigm)
- [Adding a Driver](#adding-a-driver)
- [Code Conventions](#code-conventions)
- [Pull Request Process](#pull-request-process)

## Development Setup

```bash
# Clone and install
git clone https://github.com/user/maestro.git
cd maestro
bun install

# Run tests
bun test

# Type check
bun run typecheck

# Run a paradigm locally
bun run dev run paradigms/tdd-strict.yaml --task "your task" --dry-run
```

## Writing a Paradigm

Paradigms are YAML files that encode a development methodology as a state machine. This is the most impactful way to contribute.

### YAML Schema Reference

```yaml
# Required top-level fields
name: "My Paradigm"                    # Human-readable name
description: "What this paradigm does"  # One-line description

# Agent definitions
agents:
  AgentName:
    description: "What this agent does"
    driver: claude-code          # One of: claude-code, codex, gemini
    system_prompt: |             # Optional: override system behavior
      You are a specialist in...

# Phase definitions (the state machine)
phases:
  PhaseName:
    agent: AgentName             # Must reference a defined agent
    prompt_file: prompts/x.md    # Path to prompt template (relative to project root)
    output_file: OUTPUT.md       # File the agent writes as its deliverable
    next: NextPhase              # Unconditional transition
    # OR
    next_if:                     # Conditional transition
      approved: SuccessPhase     # Based on `status` in output file's YAML frontmatter
      rejected: RetryPhase
    max_retries: 3               # Optional: limit retry loops (default: unlimited)
    timeout_s: 1800              # Optional: phase timeout in seconds (default: 300)

  FinalPhase:
    type: final                  # Terminal state

# Optional: explicit routing constraints
handoff_routing:
  AgentA: [AgentB, AgentC]       # AgentA can only hand off to B or C
```

### Prompt Templates

Prompt templates support two interpolation variables:

| Variable | Description |
|----------|-------------|
| `{{task}}` | The `--task` argument passed via CLI |
| `{{previous_output}}` | Content of the previous phase's `output_file` (empty for first phase) |

### Output File Convention

Phase output files should include YAML frontmatter with a `status` field when conditional routing (`next_if`) is used:

```markdown
---
status: approved
---

## Review Summary

The implementation looks good. All tests pass.
```

### Checklist for New Paradigms

- [ ] All agents reference a valid driver (`claude-code`, `codex`, `gemini`)
- [ ] All phases reference a defined agent
- [ ] Phase transitions form a valid graph (no unreachable phases, at least one `final` phase)
- [ ] Conditional routes (`next_if`) cover the expected status values
- [ ] Prompt templates exist in the `prompts/` directory
- [ ] Long-running phases set an appropriate `timeout_s`
- [ ] Test with `--dry-run` to validate the state machine
- [ ] Include a description explaining when and why to use this paradigm

## Adding a Driver

Drivers are the bridge between Maestro and AI CLI tools. Each driver implements the `AgentDriverFn` interface.

### Step 1: Implement the Driver

Create a new file in `src/driver/`:

```typescript
// src/driver/mydriver.ts
import type { AgentEvent, RunAgentOptions } from "./types.js";

export async function* runMyDriverAgent(
  prompt: string,
  workdir: string,
  options?: RunAgentOptions
): AsyncGenerator<AgentEvent> {
  // 1. Spawn the CLI tool as a subprocess
  // 2. Yield { type: "output", text: "..." } for streaming output
  // 3. Yield { type: "complete", result: "...", durationMs, costUsd, ... } on success
  // 4. Yield { type: "error", error: new Error("...") } on failure
}
```

The `AgentDriverFn` signature:

```typescript
type AgentDriverFn = (
  prompt: string,
  workdir: string,
  options?: RunAgentOptions
) => AsyncGenerator<AgentEvent>;
```

`RunAgentOptions` includes:

| Field | Type | Description |
|-------|------|-------------|
| `systemPrompt` | `string?` | Override system prompt |
| `allowedTools` | `string[]?` | Tool allowlist |
| `maxTurns` | `number?` | Max conversation turns |
| `maxBudgetUsd` | `number?` | Cost budget |
| `model` | `string?` | Model override |
| `abortController` | `AbortController?` | Cancellation signal |

### Step 2: Register the Driver

Add your driver to the registry in `src/driver/registry.ts`:

```typescript
import { runMyDriverAgent } from "./mydriver.js";

// At the bottom with other registrations:
registerDriver("mydriver", () => runMyDriverAgent);
```

### Step 3: Test

- Write unit tests in a `__tests__/` directory alongside your driver
- Test with a real paradigm using `--dry-run` and then a live run
- Verify streaming output, error handling, and abort/timeout behavior

### Driver Implementation Guidelines

- Use `subprocess.ts` utilities for spawning CLI processes
- Always respect `options.abortController` for graceful cancellation
- Populate cost/token fields in the `complete` event when the CLI provides them
- Handle non-zero exit codes by yielding an `error` event
- Set `cwd` to the provided `workdir` when spawning

## Code Conventions

### Language and Runtime

- **TypeScript** with strict mode
- **Bun** as runtime, bundler, and test runner (`bun:test`)
- **ES modules** (`"type": "module"` in package.json)

### Style

- Functional factories over classes where practical
- Explicit types for public interfaces; inferred types for internal logic
- Use `async function*` generators for streaming patterns
- Prefer small, focused modules over large files

### Testing

- Tests use `bun:test` (`describe`, `it`, `expect`)
- Co-locate test files near source or in `__tests__/` directories
- Unit test drivers with mocked subprocesses
- Integration test paradigms with `--dry-run`

### Naming

- Files: `kebab-case.ts`
- Types/Interfaces: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE` for true constants, `camelCase` for config objects

## Pull Request Process

1. **Fork and branch:** Create a feature branch from `main`
2. **Keep PRs focused:** One paradigm, one driver, or one feature per PR
3. **Test:** Run `bun test` and `bun run typecheck` before submitting
4. **Describe:** Include what the change does, why it's needed, and how to test it
5. **Paradigm PRs:** Include a sample `--dry-run` output showing the state machine flow
6. **Driver PRs:** Document which CLI tool version was tested and any auth/setup required

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add codex driver support
fix: handle timeout in review retry loop
docs: add bug-investigation paradigm guide
chore: update xstate to v5.20
```
