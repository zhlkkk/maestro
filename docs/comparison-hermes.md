# Maestro vs Hermes Agent

本文对比 Maestro 和 Hermes Agent 的定位差异。当前 Maestro 代码库已经具备多 driver、事件日志、报告、replay 和实验性 fork/join 支持；generic driver、npm 发布和复杂并行 handoff 的生产级稳定性仍在路线图中。

## 不同类别

Maestro 是研发编排引擎。它把 TDD、code review、bug investigation、知识沉淀等研发方法写成 YAML 状态机，并用 AI agent 按固定流程执行。

Hermes Agent 是通用 AI agent 框架。它更偏向个人助手、自学习、多平台通信、记忆系统和自主决策。

二者都涉及 AI agent，但产品目标不同：Maestro 强调流程确定性和可审计交付，Hermes Agent 强调通用自主能力。

## 什么时候使用 Maestro

- 你要强制执行某种研发流程，例如 TDD、评审门禁、缺陷排查。
- 你需要可复现的阶段结构和完整审计记录。
- 你希望每个 phase 在 git worktree 中隔离运行。
- 你希望通过 `next_if`、`max_retries`、`timeout_s` 明确控制流程。
- 你希望按阶段混用 Claude Code、Codex、Gemini。
- 你的团队需要 AI 辅助研发的 traceability。

## 什么时候使用 Hermes Agent

- 你需要一个长期运行的个人 AI 助手。
- 你需要 Telegram、Discord、Twitter、Email 等多平台通信。
- 你希望 agent 自己决定下一步做什么。
- 你需要广泛模型提供商集成。
- 你更看重自主学习和个人记忆，而不是固定研发流水线。

## 功能对比

| 维度 | Maestro | Hermes Agent |
| --- | --- | --- |
| 核心方法 | YAML 状态机 | 自主 agent |
| 工作流定义 | 人类声明式定义 | agent 动态决策 |
| 确定性 | 同一范式产生同一流程结构 | 非确定性更强 |
| 多智能体 | phase + agent + driver 的结构化编排 | 更偏单 agent 通用能力 |
| Git 集成 | worktree 隔离、diff handoff | 非核心能力 |
| 支持后端 | Claude Code、Codex、Gemini | 广泛模型集成 |
| 并行执行 | 实验性 fork/join | 非核心场景 |
| 日志与报告 | JSONL event log、Markdown report、replay | 记忆系统 |
| 成本追踪 | phase 级可选 usage / cost 字段 | 取决于集成 |
| 条件路由 | `next_if` + output frontmatter | agent 自主判断 |
| 重试控制 | `max_retries`、`timeout_s` | agent 或外层系统控制 |
| 隔离方式 | 每个 phase 独立 worktree | 通常共享环境 |
| 主要用户 | 研发团队、SQA 流程、可审计交付 | 个人开发者、AI 助手使用者 |

## 互补关系

这两个方向可以共存：

- 用 Hermes Agent 做日常个人助手、沟通、调研和探索任务。
- 用 Maestro 执行需要流程约束、质量门禁和审计记录的研发任务。

核心问题是：你想让 AI 决定流程，还是你先定义流程再让 AI 执行？

如果你要自主助手，Hermes Agent 更合适。  
如果你要可复现研发流水线，Maestro 更合适。
