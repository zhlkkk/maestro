# Maestro v1 产品说明

## 产品定位

Maestro 是一个 Paradigm-as-Code 的多智能体研发编排引擎。它把软件研发方法论写成 YAML 状态机，并通过 CLI agent driver 在隔离 worktree 中执行每个阶段。

Maestro 的目标用户是希望把研发流程标准化、审计化、自动化的个人开发者和工程团队。它不追求让 AI 自己决定一切，而是让人类定义流程，让 AI 在明确边界内执行。

## 核心问题

AI 编程工具越来越强，但团队使用时常遇到几个问题：

- 同一类任务每次都靠临场 prompt，流程不稳定。
- AI 改动难以审计，阶段产物和决策链路容易丢失。
- TDD、review、bug investigation 等工程纪律依赖人工提醒。
- 多个 AI CLI 各有优势，但缺少统一编排方式。
- 失败重试时上下文容易膨胀，反馈与 diff 不够结构化。

Maestro 通过“显式状态机 + 文件产物 + git worktree + driver registry”解决这些问题。

## 用户价值

- 流程可复制：同一个 YAML 范式每次产生同样的阶段结构。
- 交接可追踪：每个 phase 都必须写出文件产物。
- 运行可审计：JSONL event log 和 Markdown report 记录执行过程。
- 改动可隔离：每个 phase 在独立 worktree 中运行。
- 工具可替换：Claude Code、Codex、Gemini 可按阶段混用。
- 成本可观察：driver 可上报 token、cost、model 并进入报告。

## v1 功能范围

### CLI

- `maestro run <paradigm> --task <task>`
- `maestro run <paradigm> --task <task> --dry-run`
- `maestro replay <events-file> --speed <1x|2x|10x|max>`

### 范式配置

- 顶层 `name`、`description`、`maestro_version`。
- `agents` 声明角色、driver、system prompt、tools、model。
- `phases` 声明执行节点、prompt、output、路由和超时。
- `handoff_routing` 限制 agent 之间的交接关系。
- `next` 线性流转。
- `next_if` 基于 output frontmatter status 条件流转。
- `max_retries` 限制后退重试。
- `type: final` 终态。
- `type: fork` 实验性并行阶段。

### 执行引擎

- YAML parse 和结构校验。
- xstate v5 状态机翻译。
- driver fail-fast 校验。
- phase worktree 创建、复用和清理。
- prompt 模板插值。
- retry 场景的增量 diff summary。
- output_file frontmatter 解析。
- phase timeout 和 abort。

### Driver

- `claude-code`：使用 `@anthropic-ai/claude-agent-sdk`。
- `codex`：使用 `codex exec --json` subprocess。
- `gemini`：使用 `gemini --non-interactive` subprocess。
- 统一 `AgentDriverFn` 和 `AgentEvent`。

### 审计与报告

- `.maestro/events-<run-id>.jsonl`
- `.maestro/reports/run-<run-id>.md`
- phase summary。
- 失败详情。
- 可选 usage / cost summary。
- replay 历史运行。

## 非目标

- 不做通用个人助手。
- 不做多平台聊天、邮件、社交媒体自动化。
- 不内置长期记忆系统。
- 不让 agent 自由决定整体工作流。
- 不在 v1 内提供 Web UI。
- 不承诺 fork/join 已适合复杂生产并行流。

## 关键设计原则

### 范式即代码

研发方法论应该像 CI 配置一样进入仓库。YAML 范式是团队流程的声明式源码，可以 review、复用和演进。

### 文件系统即消息总线

phase 之间不通过隐式内存交换上下文，而是通过 prompt、output_file、git diff 和事件日志交接。这样每一次运行都留下可读产物。

### Git 原生隔离

worktree 是 Maestro 的沙箱边界。phase 之间的状态不会随意污染，handoff 只复制可检测的文件变化。

### Driver 可替换

Maestro 不绑定单一模型或单一 CLI。driver 只要实现 `AgentDriverFn`，就可以被范式引用。

### 状态机优先

流程推进由 `next`、`next_if`、`max_retries` 和 final state 决定，而不是由 agent 临场判断。agent 负责完成 phase，不负责改写流程。

## 数据流

```text
用户输入 task
  -> YAML paradigm
  -> parser / validator
  -> xstate machine
  -> phase actor
  -> worktree
  -> prompt template
  -> driver
  -> agent writes output_file
  -> frontmatter status
  -> transition
  -> event log
  -> report
```

## 当前进度

已完成：

- M1 核心引擎。
- M2 多 driver 基础能力。
- dry-run、replay、report。
- 三个内置 paradigm。
- 单元测试覆盖主要模块。

进行中或待稳定：

- fork/join 真实执行语义。
- Ink dashboard 接入默认 run。
- npm 发布和 CI。
- Codex / Gemini usage 与参数协议校准。
- generic CLI driver。

详细路线图见 `docs/roadmap.md`。
