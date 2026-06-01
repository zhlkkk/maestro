# Maestro 架构与实现原理

本文记录 Maestro 当前代码库的真实架构、配置模型、执行原理和数据流。当前项目版本以 `package.json` 的 `0.2.0` 为准。

## 架构总览

Maestro 是一个 Bun + TypeScript CLI。它把 YAML 范式解析成 xstate v5 状态机，并在每个状态节点中启动一个 AI agent driver。每个 phase 使用独立 git worktree，阶段产物通过文件系统和 git diff 交接，运行过程写入 JSONL 事件日志，结束后生成 Markdown 报告。

```text
src/index.ts
  -> src/cli/run.ts
    -> parser / validator / dry-run
    -> runner
      -> xstate machine
      -> worktree manager
      -> prompt assembler
      -> driver registry
      -> output parser
      -> event logger
      -> report generator
```

## 模块边界

| 模块 | 文件 | 职责 |
| --- | --- | --- |
| CLI 入口 | `src/index.ts` | 注册 `init`、`install`、`run` 和 `replay` 命令 |
| init 命令 | `src/cli/init.ts` | 生成本地 paradigm pack scaffold |
| install 命令 | `src/cli/install.ts` | 安装本地路径或 Git source 的 paradigm pack |
| pack registry | `src/cli/paradigm-registry.ts` | 维护 `.maestro/paradigms/index.json` 并按名称解析已安装范式 |
| run 命令 | `src/cli/run.ts` | 输入校验、解析范式、dry-run、创建 logger、启动 pipeline、生成 report |
| replay 命令 | `src/cli/replay.ts` | 读取 JSONL 事件并按速度回放 |
| Parser | `src/engine/parser.ts` | 解析 YAML，解析 agents / phases / handoff_routing，解析相对 prompt 路径 |
| Validator | `src/engine/validator.ts` | 校验 agent 引用、phase 路由、fork 子节点、循环、终态和超时配置 |
| Machine | `src/engine/machine.ts` | 将范式翻译成 xstate v5 machine，处理条件路由、重试、fork/join |
| Runner | `src/engine/runner.ts` | 运行状态机，创建 phase actor，调 driver，处理 handoff 和 output |
| Output parser | `src/engine/output-parser.ts` | 从 output markdown frontmatter 中提取并标准化 `status` |
| Logger | `src/engine/logger.ts` | 写入 `.maestro/events-<run-id>.jsonl` |
| Report | `src/engine/report.ts` | 从事件生成 `.maestro/reports/run-<run-id>.md` |
| Driver registry | `src/driver/registry.ts` | 注册和查找内置 driver |
| Driver types | `src/driver/types.ts` | 定义 `AgentEvent`、`RunAgentOptions`、`AgentDriverFn` |
| Claude driver | `src/driver/claude.ts` | 通过 `@anthropic-ai/claude-agent-sdk` 执行 Claude Code |
| Codex driver | `src/driver/codex.ts` | 通过 `codex exec --json` 执行 Codex CLI |
| Gemini driver | `src/driver/gemini.ts` | 通过 `gemini --non-interactive` 执行 Gemini CLI |
| Generic CLI driver | `src/driver/generic-cli.ts` | 通过 command array 执行任意本地命令，并注入 Maestro 环境变量 |
| Subprocess base | `src/driver/subprocess.ts` | 统一处理 subprocess stdout、stderr、exit code、abort |
| Worktree | `src/sandbox/worktree.ts` | 创建、复用、清理 `.maestro/worktrees/<run-id>/<phase>` |
| Handoff | `src/sandbox/handoff.ts` | 用 git status / diff 检测变化并复制到下个 worktree |
| Prompt | `src/sandbox/prompt.ts` | 插值 `{{task}}` / `{{previous_output}}`，大 prompt 写入临时文件 |
| Dashboard | `src/dashboard/*` | Ink UI 组件；目前默认 `run` 仍使用 console 输出 |

## 配置模型

范式配置的顶层结构是 `ParadigmConfig`：

```yaml
name: "Workflow Name"
description: "Workflow description"
maestro_version: "1"
version: "0.1.0"
author: "Team Name"
tags: ["local", "review"]
license: "MIT"
homepage: "https://example.com"

agents:
  AgentName:
    driver: claude-code
    description: "Role description"
    system_prompt: |
      You are...
    tools: [Read, Edit, Bash]
    model: claude-sonnet-4-5

  LocalTool:
    driver: generic-cli
    command: ["/bin/sh", "-c", "my-agent --prompt-file \"$MAESTRO_PROMPT_FILE\""]

phases:
  PhaseName:
    agent: AgentName
    prompt_file: prompts/example.md
    output_file: RESULT.md
    timeout_s: 300
    model: claude-sonnet-4-5
    next: NextPhase

  Review:
    agent: Reviewer
    prompt_file: prompts/review.md
    output_file: REVIEW_RESULT.md
    next_if:
      approved: Done
      rejected: PhaseName
    max_retries: 3

  Done:
    type: final
```

### 模型与 driver 解析规则

- `driver` 未声明时默认为 `claude-code`。
- phase 级 `model` 优先于 agent 级 `model`。
- driver 在 pipeline 启动前统一校验，未知 driver 会 fail fast。
- `system_prompt` 和 `tools` 会传给 driver；具体是否支持取决于 driver 实现。
- `generic-cli` agent 必须声明非空 `command` 数组。

### 范式包 metadata

- `maestro_version` 表示 Maestro 范式 schema 兼容版本，当前支持 `"1"`。
- `version` 表示范式包自身版本，不参与状态机执行。
- `author`、`tags`、`license`、`homepage` 是本地 pack 和未来 registry 使用的描述性字段。
- metadata 在 M3.1 中是非行为字段；parser 会保留，validator 只做基础形状检查。

### prompt 规则

`prompt_file` 会相对范式文件所在目录解析。模板支持：

- `{{task}}`：CLI 的 `--task` 参数。
- `{{previous_output}}`：上一阶段的 `output_file` 内容；重试时会使用反馈和 diff summary 的增量上下文。

当 prompt 超过 100KB 时，Maestro 会写到临时文件，并把提示变成“从该文件读取 prompt”。

### output 规则

每个非 final、非 fork phase 都必须配置 `output_file`。agent 必须在自己的 worktree 中创建该文件，并在文件开头写入 YAML frontmatter：

```markdown
---
status: approved
---
```

`status` 会经过 lowercase + trim 后参与 `next_if` 匹配。缺失文件、空文件、无 frontmatter、frontmatter 不是 YAML object、缺失 status、status 非字符串都会让 phase 失败。

## 执行流程

```text
1. CLI 校验 paradigm 路径或已安装范式名称，以及 --task
2. parseParadigmFile 读取 YAML
3. validateParadigm 校验结构和路由
4. dry-run 模式：输出 phase 拓扑后退出
5. live 模式：创建 runId 和 EventLogger
6. runPipeline 清理旧 worktree
7. translateToMachine 创建 xstate machine
8. 为每个可执行 phase 注入 actor
9. actor 启动时：
   - 创建或复用 phase worktree
   - 复制上一 phase 的变更
   - 组装 prompt
   - 选择 driver 并启动 agent
   - 流式写入 AGENT_OUTPUT
   - 读取 output_file
   - 解析 status
   - 写入 PHASE_COMPLETE 或 PHASE_FAILED
10. xstate 根据 next / next_if / retry 继续流转
11. pipeline 完成或失败
12. 生成 report 并清理本次 worktree
```

## 数据流

```text
User task
  -> prompt template
  -> agent prompt
  -> AI driver process / SDK
  -> worktree file changes
  -> output_file frontmatter status
  -> state machine transition
  -> next phase previous_output
```

事件流独立于文件流：

```text
Runner emit()
  -> in-memory events[]
  -> EventLogger JSONL
  -> console output
  -> ReportGenerator markdown report
  -> replay command
```

## Paradigm pack 安装

`maestro install <source>` 支持两类 source：

- 本地目录：目录根部必须包含 `paradigm.yaml`。
- Git URL：通过 `git clone --depth 1` 克隆到临时目录，根部必须包含 `paradigm.yaml`。

安装流程：

```text
source
  -> resolve local directory or clone Git URL
  -> parse paradigm.yaml
  -> validateParadigm
  -> validateDrivers
  -> copy pack into .maestro/paradigms/<sanitized-name>
  -> update .maestro/paradigms/index.json
```

本地 registry index 使用版本化 JSON：

```json
{
  "version": 1,
  "paradigms": [
    {
      "name": "demo",
      "version": "0.1.0",
      "source": "./demo-paradigm",
      "installedAt": "2026-06-01T00:00:00.000Z",
      "path": ".maestro/paradigms/demo",
      "paradigm": ".maestro/paradigms/demo/paradigm.yaml"
    }
  ]
}
```

`maestro run <name>` 如果找不到同名本地文件，会从 `.maestro/paradigms/index.json` 中查找已安装范式并运行对应的 `paradigm.yaml`。

## Git worktree 与 handoff

worktree 目录格式：

```text
.maestro/worktrees/<run-id>/<phase-name>/
```

每个 phase 第一次运行时会基于当前 `HEAD` 创建 detached worktree。重试同一 phase 时会复用已有 worktree，因此 agent 能在上次代码状态上继续处理反馈。

handoff 使用 `git status --porcelain -uall` 检测源 worktree 的新增、修改、删除、重命名文件，然后复制到目标 worktree。重试场景会额外生成 `git diff --stat` 和最多 50KB 的 diff 作为增量上下文。

## 状态机语义

### 线性阶段

```yaml
Plan:
  agent: Planner
  output_file: PLAN.md
  next: Implement
```

phase actor 成功后直接进入 `Implement`。

### 条件路由

```yaml
Review:
  agent: Reviewer
  output_file: REVIEW.md
  next_if:
    approved: Done
    rejected: Implement
  max_retries: 3
```

actor 完成后进入 routing 子状态，按 `status` 选择目标。后退路径会计入 retry，超过 `max_retries` 后进入 `__FAILED`。

### fork/join

```yaml
ParallelWork:
  type: fork
  phases: [Frontend, Backend]
  next: Review
```

状态机层会创建 xstate parallel compound state，并等待所有 child 到达 final 后进入 `Review`。当前限制：

- 不支持嵌套 fork。
- fork child 不支持 `next_if`。
- validator 会校验 child 存在。
- runner 的多分支 handoff 仍有共享上一阶段状态，复杂真实并行工作流建议先用 dry-run 和小任务验证。

## Driver 架构

所有 driver 实现同一个函数签名：

```typescript
type AgentDriverFn = (
  prompt: string,
  workdir: string,
  options?: RunAgentOptions
) => AsyncGenerator<AgentEvent>;
```

driver 可以产出三类事件：

- `{ type: "output", text }`
- `{ type: "complete", result, durationMs?, costUsd?, tokensIn?, tokensOut?, modelUsed? }`
- `{ type: "error", error }`

Claude driver 使用 SDK；Codex、Gemini 和 Generic CLI driver 使用共享 subprocess base。subprocess base 负责：

- `Bun.spawn()`
- stdout 按行流式输出
- JSONL 或纯文本解析
- 非零 exit code 转 error
- `AbortController` 触发 SIGTERM，5 秒后 SIGKILL

### Generic CLI driver

`generic-cli` 用于把本地脚本、内部 CLI 或其他 agent 命令接入 Maestro。命令在 phase worktree 中执行，stdout 会变成 `AGENT_OUTPUT` 事件，phase 成败仍由 `output_file` 的 frontmatter 决定。

运行时注入的环境变量：

| 变量 | 作用 |
| --- | --- |
| `MAESTRO_PROMPT_FILE` | 临时 prompt 文件的绝对路径 |
| `MAESTRO_WORKDIR` | 当前 phase worktree |
| `MAESTRO_OUTPUT_FILE` | 当前 phase 的 `output_file` |
| `MAESTRO_MODEL` | 解析后的 phase / agent model，未配置时为空 |

## 事件与报告

事件类型定义在 `src/types.ts`：

- `PIPELINE_START`
- `PHASE_START`
- `AGENT_OUTPUT`
- `PHASE_COMPLETE`
- `PHASE_FAILED`
- `PHASE_TIMEOUT`
- `PHASE_RETRY`
- `PIPELINE_COMPLETE`
- `PIPELINE_FAILED`

日志文件：

```text
.maestro/events-<run-id>.jsonl
```

报告文件：

```text
.maestro/reports/run-<run-id>.md
```

报告包含 phase summary、重试次数、agent status、错误详情，以及可选的模型、token、cost 汇总。

## 已知限制

- 默认 `run` 输出尚未接入 Ink dashboard；dashboard 组件已有测试覆盖，但当前 CLI 使用 console 输出。
- fork/join 已有 sibling abort 和 join 前冲突保护，复杂并行恢复仍未生产化。
- `generic-cli` 只提供本地命令合同，不加载外部 driver 插件，也不做 registry 信任校验。
- `maestro install` 支持本地目录和 Git URL，但还没有远程 registry 搜索、签名校验或 trust policy。
- fork/join 状态机已实现，真实并行 handoff 和失败取消语义仍需继续加强。
