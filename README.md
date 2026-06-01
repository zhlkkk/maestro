# Maestro

Maestro 是一个 Paradigm-as-Code 的多智能体研发编排 CLI。它把 TDD、缺陷排查、评审门禁、知识沉淀等研发方法写成 YAML 状态机，再用 Claude Code、Codex、Gemini 等命令行智能体按阶段执行。

它的核心目标不是替代交互式编程助手，而是让团队把稳定的研发流程变成可运行、可审计、可复用的流水线。

```bash
bun run dev run paradigms/tdd-strict.yaml --task "Add rate limiting to the API"
```

## 当前能力

- 多驱动执行：内置 `claude-code`、`codex`、`gemini`，并支持 `generic-cli` 适配本地命令。
- 本地范式包：`maestro init paradigm` 可生成自定义 paradigm pack 骨架。
- YAML 状态机：支持线性阶段、条件路由、重试上限、超时控制和终态。
- Git 隔离：每个 phase 使用独立 git worktree，阶段之间通过 diff / 文件复制交接。
- 输出约定：phase 必须产出带 YAML frontmatter 的 `output_file`，其中 `status` 驱动条件路由。
- dry-run：在不启动智能体的情况下校验范式和状态机拓扑。
- replay：从 `.maestro/events-*.jsonl` 回放历史运行。
- 审计产物：运行时写入 JSONL 事件日志，并生成 `.maestro/reports/run-*.md` 报告。
- 用量字段：driver 可在完成事件中提供 token、cost、model 信息，报告会自动汇总。
- fork/join：解析器和状态机支持 `type: fork` 并行阶段；运行器层仍处于实验状态，复杂并行交接需要继续打磨。

## 安装与运行

### 环境要求

- Bun
- Git，且支持 `git worktree`
- 至少安装一个可用的 AI CLI：
  - Claude Code，对应 driver: `claude-code`
  - Codex CLI，对应 driver: `codex`
  - Gemini CLI，对应 driver: `gemini`
  - 任意可从命令行读取 prompt 文件并写 output 文件的工具，对应 driver: `generic-cli`

### 本地开发

```bash
git clone https://github.com/zhlkkk/maestro.git
cd maestro
bun install
```

### 运行内置范式

```bash
# TDD：写测试 -> 实现 -> 评审
bun run dev run paradigms/tdd-strict.yaml --task "Add input validation to signup form"

# 缺陷排查：复现 -> 诊断 -> 修复 -> 验证
bun run dev run paradigms/bug-investigation.yaml --task "Fix checkout total mismatch"

# 完整研发流：头脑风暴 -> 知识锁定 -> 深度计划 -> 执行 -> 评审 -> 知识沉淀
bun run dev run paradigms/combined-workflow.yaml --task "Build import preview for CSV uploads"
```

### 校验范式

```bash
bun run dev run paradigms/tdd-strict.yaml --task "smoke test" --dry-run
```

### 创建本地范式包

```bash
bun run dev init paradigm demo --dry-run
bun run dev init paradigm demo --dir ./demo-paradigm
bun run dev run ./demo-paradigm/paradigm.yaml --task "smoke test" --dry-run
```

本地 pack 格式、metadata 和 `generic-cli` 环境变量见 [docs/paradigm-packs.md](docs/paradigm-packs.md)。

### 回放历史运行

```bash
bun run dev replay .maestro/events-<run-id>.jsonl --speed max
bun run dev replay .maestro/events-<run-id>.jsonl --speed 2x
```

## 范式格式

范式文件由 `agents` 和 `phases` 组成。agent 负责声明执行角色和 driver，phase 负责声明状态机节点、提示词、产物文件和流转规则。

```yaml
name: "TDD Strict"
description: "Write failing tests first, then implement, then review."

agents:
  TestWriter:
    description: "Writes failing tests for the given task"
    driver: claude-code
  Implementer:
    description: "Implements code to make tests pass"
    driver: codex
    model: gpt-5
  Reviewer:
    description: "Reviews implementation quality"
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
    timeout_s: 1800
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

### 常用字段

| 字段 | 位置 | 作用 |
| --- | --- | --- |
| `maestro_version` | 顶层 | Maestro 范式 schema 兼容版本，当前为 `"1"` |
| `version`、`author`、`tags`、`license`、`homepage` | 顶层 | 本地 pack metadata，不影响执行 |
| `driver` | `agents.*` | 选择执行后端：`claude-code`、`codex`、`gemini`、`generic-cli` |
| `command` | `agents.*` | `generic-cli` 使用的命令数组 |
| `system_prompt` | `agents.*` | 给该 agent 的系统提示词 |
| `tools` | `agents.*` | 传给 driver 的工具 allowlist |
| `model` | `agents.*` 或 `phases.*` | 模型覆盖；phase 级优先于 agent 级 |
| `prompt_file` | `phases.*` | prompt 模板路径，支持 `{{task}}` 和 `{{previous_output}}` |
| `output_file` | `phases.*` | agent 必须写出的阶段产物 |
| `next` | `phases.*` | 无条件跳转 |
| `next_if` | `phases.*` | 根据 `output_file` frontmatter 的 `status` 条件跳转 |
| `max_retries` | `phases.*` | 后退重试路径的最大次数 |
| `timeout_s` | `phases.*` | phase 超时时间，默认 300 秒 |
| `type: final` | `phases.*` | 终态 |
| `type: fork` | `phases.*` | 实验性并行阶段 |

条件路由依赖输出文件的 YAML frontmatter：

```markdown
---
status: approved
---

## Review Summary

All checks passed.
```

`status` 会被转成小写并去除首尾空白后匹配 `next_if`。

## 执行数据流

```text
CLI command
  -> parse YAML
  -> validate agents, phases, routing, cycles
  -> dry-run simulation or live run
  -> create xstate machine
  -> create/reuse phase worktree
  -> copy previous phase diff into current worktree
  -> assemble prompt from template
  -> run selected driver
  -> stream AgentEvent into logger and console
  -> read output_file
  -> parse frontmatter status
  -> route to next phase, retry, final, or failed
  -> write report and cleanup worktrees
```

更完整的架构、配置、数据流和实现说明见 [docs/architecture.md](docs/architecture.md)。

## 项目结构

```text
maestro/
  src/
    cli/          # init / run / replay 命令
    dashboard/    # Ink 终端 UI 组件，目前未接入默认 run 输出
    driver/       # driver 接口、registry、Claude/Codex/Gemini 实现
    engine/       # parser、validator、xstate machine、runner、logger、report
    sandbox/      # git worktree、handoff、prompt 组装
    index.ts      # CLI 入口
    types.ts      # 跨模块事件类型
  paradigms/      # 内置范式
  prompts/        # 内置 prompt 模板
  docs/           # 架构、路线图、PRD、计划和对比文档
  tests/          # bun:test 单元测试与 spike 测试
```

## 开发命令

```bash
bun test
bun run typecheck
bun run dry-run:all
bun run build
```

`bun run build` 会编译出本地 `./maestro` 二进制。

## 文档入口

- [架构与实现原理](docs/architecture.md)
- [本地范式包](docs/paradigm-packs.md)
- [路线图与当前进度](docs/roadmap.md)
- [产品说明](docs/prd/maestro_v1.md)
- [贡献指南](CONTRIBUTING.md)
- [Maestro vs Hermes Agent](docs/comparison-hermes.md)

## 适用场景

Maestro 适合需要稳定流程和审计链路的研发任务：强制 TDD、自动化 code review、缺陷排查、架构计划、知识沉淀、团队级 SQA 门禁。

如果你需要一个随时聊天、主动决策、多平台通信、长期记忆的个人助手，通用 agent 框架会更合适。Maestro 的定位是明确流程、明确阶段、明确交接。

## License

MIT
