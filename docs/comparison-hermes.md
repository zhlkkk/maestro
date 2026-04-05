# Maestro vs Hermes Agent

Maestro and Hermes Agent are both multi-agent frameworks, but they solve different problems. This guide helps you choose the right tool for your use case.

## Different Categories

**Maestro** is an R&D orchestration engine. It encodes development methodologies (TDD, code review, bug investigation) as YAML state machines and executes them deterministically with AI agents.

**Hermes Agent** is a general-purpose AI agent framework. It provides a self-learning agent with multi-platform communications (Telegram, Discord, email), memory systems, and autonomous decision-making.

They overlap in that both coordinate AI agents, but their design goals are fundamentally different.

## When to Use Maestro

- You want to **enforce a specific development workflow** (TDD, review gates, knowledge compounding) across a team
- You need **auditable, reproducible runs** with full event logs and cost tracking
- You want **git-native isolation** -- each phase runs in its own worktree, changes are handed off via diffs
- You need **deterministic behavior** -- the same paradigm produces the same workflow structure every time
- You want to **mix AI models** per phase for cost optimization (e.g., cheap model for brainstorming, powerful model for implementation)
- Your organization requires **traceability** for AI-assisted development

## When to Use Hermes Agent

- You want a **personal AI assistant** that learns and adapts over time
- You need **multi-platform communication** (Telegram, Discord, Twitter, email)
- You prefer **autonomous agent behavior** where the AI decides what to do next
- You want a **single agent with broad capabilities** rather than structured multi-agent workflows
- You need integration with **200+ language models** across many providers

## Feature Comparison

| Feature | Maestro | Hermes Agent |
|---------|---------|--------------|
| **Core approach** | YAML state machines | Autonomous agent |
| **Workflow definition** | Declarative YAML paradigms | Agent-driven decisions |
| **Determinism** | Same paradigm = same workflow | Non-deterministic |
| **Multi-agent** | Structured phases with explicit handoff | Single agent (multi-agent planned) |
| **Git integration** | Native: worktree isolation, diff handoff | None |
| **Supported models** | Claude Code, Codex, Gemini CLI | 200+ via litellm |
| **Parallel execution** | Fork-join phases | N/A |
| **Event logging** | JSONL event log + markdown reports | Memory system |
| **Cost tracking** | Per-phase token/cost tracking | N/A |
| **Learning** | Paradigm templates evolved by humans | Self-learning memory |
| **Communication** | CLI only | Telegram, Discord, Twitter, email |
| **Conditional routing** | YAML `next_if` with frontmatter status | Agent decides |
| **Retry control** | `max_retries` + `timeout_s` per phase | Agent-managed |
| **Isolation** | Git worktree per phase | Shared environment |
| **Primary audience** | R&D teams, SQA workflows | Individual developers, AI enthusiasts |
| **License** | MIT | MIT |

## Complementary, Not Competing

These tools can coexist in a development workflow:

- Use **Hermes Agent** as your daily interactive AI assistant for communication, research, and ad-hoc tasks
- Use **Maestro** when you need a structured, repeatable development process with quality gates and auditability

The key question is: **Do you want the AI to decide the workflow, or do you want to define it?**

- If you trust AI judgment for workflow decisions: Hermes Agent
- If you want explicit control over every phase and transition: Maestro
