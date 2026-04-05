# Maestro

**Paradigm-as-Code: Encode R&D methodologies as executable state machines.**

Maestro orchestrates multiple AI agents through structured workflows defined in YAML.
Unlike general-purpose AI assistants, Maestro provides deterministic, auditable,
reproducible development workflows with git-native isolation.

```
maestro run paradigms/tdd-strict.yaml --task "Add rate limiting to the API"
```

```
 WriteTests  ████████████████  done  (42s)
 Implement   ████████████░░░░  running...
 Review      ░░░░░░░░░░░░░░░░  pending
```

## Features

- **Multi-Driver** -- Claude Code, Codex, Gemini CLI: use the best model for each phase
- **Parallel Execution** -- Fork-join phases run agents concurrently
- **Git-Native** -- Worktree isolation per phase, diff-based handoff between agents
- **Smart Routing** -- Per-phase model configuration for cost optimization
- **Auditable** -- Full event log (JSONL) + markdown run reports with cost tracking
- **Deterministic** -- YAML state machines with explicit transitions, not AI guesswork

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime
- [Git](https://git-scm.com/) with worktree support
- At least one supported AI CLI tool installed (see [Drivers](#drivers))

### Install

```bash
git clone https://github.com/user/maestro.git
cd maestro
bun install
```

### Run a paradigm

```bash
# TDD workflow: write tests -> implement -> review
bun run dev run paradigms/tdd-strict.yaml --task "Add input validation to signup form"

# Dry-run mode: validate YAML and simulate state machine without launching agents
bun run dev run paradigms/tdd-strict.yaml --task "..." --dry-run
```

### What happens

1. Maestro parses the YAML paradigm into an xstate state machine
2. For each phase, it creates a git worktree for isolation
3. The assigned agent runs with a templated prompt in that worktree
4. On completion, file changes are handed off to the next phase via `git diff`
5. Conditional routing (e.g., review approved/rejected) drives the state machine
6. A full event log (`events.jsonl`) and markdown report are generated

## Paradigm Format

Paradigms are YAML files that define agents, phases, and transitions:

```yaml
name: "TDD Strict"
description: "Write failing tests first, then implement, then review."

agents:
  TestWriter:
    description: "Writes failing tests for the given task"
    driver: claude-code
  Implementer:
    description: "Implements code to make tests pass"
    driver: claude-code
  Reviewer:
    description: "Reviews the implementation for quality and correctness"
    driver: claude-code

phases:
  WriteTests:
    agent: TestWriter
    prompt_file: prompts/write-tests.md
    output_file: TESTS_WRITTEN.md
    next: Implement
  Implement:
    agent: Implementer
    prompt_file: prompts/implement.md
    output_file: IMPLEMENTATION_DONE.md
    next: Review
  Review:
    agent: Reviewer
    prompt_file: prompts/review.md
    output_file: REVIEW_RESULT.md
    next_if:
      approved: Done
      rejected: Implement
    max_retries: 3
  Done:
    type: final
```

### Key concepts

| Concept | Description |
|---------|-------------|
| `agents` | Named agent definitions with a `driver` and optional `system_prompt` |
| `phases` | Steps in the workflow, each assigned to an agent |
| `next` | Unconditional transition to the next phase |
| `next_if` | Conditional routing based on the `status` field in the output file's YAML frontmatter |
| `max_retries` | Limit retry loops (e.g., review rejection cycles) |
| `timeout_s` | Per-phase timeout (default: 300s) |
| `prompt_file` | Prompt template supporting `{{task}}` and `{{previous_output}}` interpolation |
| `output_file` | File the agent writes; its frontmatter `status` drives conditional routing |

## Built-in Templates

| Template | Phases | Use Case |
|----------|--------|----------|
| `tdd-strict` | 3 | Test-driven development: write tests, implement, review |
| `combined-workflow` | 6 | Full R&D cycle: brainstorm, lock knowledge, plan, execute, review, compound learnings |
| `bug-investigation` | 4 | Systematic bug fixing: reproduce, diagnose, fix, verify |

## Paradigm-as-Code vs General AI Agents

Maestro is not a general-purpose AI assistant. It is a workflow orchestration engine for R&D teams that want deterministic, reproducible processes.

| | Maestro | General AI Agents |
|---|---------|-------------------|
| **Approach** | Explicit YAML state machines | Agent-driven autonomous decisions |
| **Reproducibility** | Same paradigm = same workflow every time | Non-deterministic by design |
| **Auditability** | Full event log, run reports, cost tracking | Varies |
| **Isolation** | Git worktree per phase | Typically shared workspace |
| **Multi-agent** | Structured handoff with diff-based context | Varies |
| **Best for** | Team SQA workflows, auditable R&D, methodology enforcement | Personal productivity, exploratory tasks |

**When to use Maestro:** You have a development methodology you want to enforce consistently -- TDD, code review gates, knowledge compounding -- and you want it automated with full traceability.

**When to use a general AI agent:** You want an interactive assistant for ad-hoc tasks, personal productivity, or multi-platform communications.

For a detailed comparison with Hermes Agent, see [docs/comparison-hermes.md](docs/comparison-hermes.md).

## Drivers

Maestro supports multiple AI CLI backends. Each agent in a paradigm specifies which driver to use.

| Driver | CLI Tool | Status |
|--------|----------|--------|
| `claude-code` | [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | Implemented |
| `codex` | [Codex CLI](https://github.com/openai/codex) | Implemented |
| `gemini` | [Gemini CLI](https://github.com/google-gemini/gemini-cli) | Implemented |

You can mix drivers within a single paradigm -- for example, use a cost-effective model for brainstorming and a more capable one for implementation:

```yaml
agents:
  Planner:
    driver: gemini
  Engineer:
    driver: claude-code
```

## Project Structure

```
maestro/
  src/
    cli/          # Commander-based CLI
    driver/       # Agent driver implementations + registry
    engine/       # xstate state machine, pipeline orchestration
    sandbox/      # Git worktree isolation + handoff
    dashboard/    # Ink-based terminal UI
    types.ts      # Shared type definitions
  paradigms/      # Built-in paradigm templates
  prompts/        # Prompt templates for built-in paradigms
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to write paradigms, add drivers, and submit PRs.

## License

MIT
