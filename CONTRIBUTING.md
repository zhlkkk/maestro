# Maestro 贡献指南

本文说明如何为 Maestro 贡献范式、driver 和代码改动。

## 开发环境

```bash
git clone https://github.com/user/maestro.git
cd maestro
bun install

bun test
bun run typecheck
bun run dev run paradigms/tdd-strict.yaml --task "your task" --dry-run
```

## 编写范式

范式是 Maestro 最核心的扩展点。一个范式用 YAML 把研发方法描述成状态机。

### YAML 结构

```yaml
name: "My Paradigm"
description: "What this paradigm does"
maestro_version: "1"

agents:
  AgentName:
    description: "What this agent does"
    driver: claude-code
    model: claude-sonnet-4-5
    system_prompt: |
      You are a specialist in...
    tools: [Read, Edit, Bash]

phases:
  PhaseName:
    agent: AgentName
    prompt_file: prompts/x.md
    output_file: OUTPUT.md
    next: NextPhase

  Review:
    agent: AgentName
    prompt_file: prompts/review.md
    output_file: REVIEW.md
    timeout_s: 1800
    model: gpt-5
    next_if:
      approved: Done
      rejected: PhaseName
    max_retries: 3

  Done:
    type: final

handoff_routing:
  AgentA: [AgentB, AgentC]
```

### 字段说明

| 字段 | 位置 | 说明 |
| --- | --- | --- |
| `name` | 顶层 | 范式名称 |
| `description` | 顶层 | 范式用途说明 |
| `maestro_version` | 顶层 | 当前支持 `"1"` |
| `driver` | `agents.*` | `claude-code`、`codex` 或 `gemini` |
| `model` | `agents.*` / `phases.*` | 模型覆盖；phase 级优先 |
| `system_prompt` | `agents.*` | agent 的系统提示词 |
| `tools` | `agents.*` | 传给支持工具 allowlist 的 driver |
| `agent` | `phases.*` | 当前 phase 使用哪个 agent |
| `prompt_file` | `phases.*` | prompt 模板路径 |
| `output_file` | `phases.*` | agent 必须写出的产物文件 |
| `next` | `phases.*` | 无条件跳转 |
| `next_if` | `phases.*` | 根据 `status` 条件跳转 |
| `max_retries` | `phases.*` | 后退重试次数上限 |
| `timeout_s` | `phases.*` | phase 超时时间，默认 300 秒 |
| `type: final` | `phases.*` | 终态 |
| `handoff_routing` | 顶层 | 限制 agent 之间的交接关系 |

### fork / join 阶段

Maestro 已有实验性的 fork/join 支持：

```yaml
phases:
  Plan:
    agent: Planner
    prompt_file: prompts/deep-plan.md
    output_file: PLAN.md
    next: ParallelWork

  ParallelWork:
    type: fork
    phases: [Frontend, Backend]
    next: Review

  Frontend:
    agent: Engineer
    prompt_file: prompts/implement.md
    output_file: FRONTEND_DONE.md

  Backend:
    agent: Engineer
    prompt_file: prompts/implement.md
    output_file: BACKEND_DONE.md

  Review:
    agent: Reviewer
    prompt_file: prompts/review.md
    output_file: REVIEW.md
    next_if:
      approved: Done
      rejected: Plan
    max_retries: 1

  Done:
    type: final
```

当前限制：

- fork child 必须是已存在的 phase。
- 不支持嵌套 fork。
- fork child 不能使用 `next_if`。
- 复杂真实并行 handoff 仍在稳定中，建议先用 `--dry-run` 和小任务验证。

### prompt 模板

prompt 模板支持两个插值变量：

| 变量 | 说明 |
| --- | --- |
| `{{task}}` | CLI 的 `--task` 参数 |
| `{{previous_output}}` | 上一阶段的 `output_file` 内容；第一阶段为空 |

### output 文件约定

使用 `next_if` 的 phase 必须让 agent 写出带 `status` 的 YAML frontmatter：

```markdown
---
status: approved
---

## Review Summary

The implementation looks good. All tests pass.
```

`status` 会被转成小写并去除首尾空白后参与匹配。

### 新范式检查清单

- [ ] 所有 agent 都使用有效 driver：`claude-code`、`codex`、`gemini`。
- [ ] 所有 phase 都引用已定义的 agent。
- [ ] phase transitions 能到达至少一个 `type: final`。
- [ ] `next_if` 覆盖预期状态值。
- [ ] prompt 模板文件存在。
- [ ] 长任务配置合理的 `timeout_s`。
- [ ] 使用 `--dry-run` 校验状态机。
- [ ] fork child 不依赖彼此未交接的输出。
- [ ] `description` 清楚说明该范式适合什么场景。

## 添加 Driver

driver 是 Maestro 连接 AI CLI 的适配层。所有 driver 都实现 `AgentDriverFn`。

### 1. 实现 driver

在 `src/driver/` 下新建文件：

```typescript
import type { AgentEvent, RunAgentOptions } from "./types.js";

export async function* runMyDriverAgent(
  prompt: string,
  workdir: string,
  options?: RunAgentOptions
): AsyncGenerator<AgentEvent> {
  // Spawn the CLI tool as a subprocess.
  // Yield output events while the process runs.
  // Yield complete on success, or error on failure.
}
```

接口签名：

```typescript
type AgentDriverFn = (
  prompt: string,
  workdir: string,
  options?: RunAgentOptions
) => AsyncGenerator<AgentEvent>;
```

`RunAgentOptions`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `systemPrompt` | `string?` | 系统提示词 |
| `allowedTools` | `string[]?` | 工具 allowlist |
| `maxTurns` | `number?` | 最大回合数 |
| `maxBudgetUsd` | `number?` | 预算上限 |
| `model` | `string?` | 模型覆盖 |
| `abortController` | `AbortController?` | 取消信号 |

### 2. 注册 driver

在 `src/driver/registry.ts` 注册：

```typescript
import { runMyDriverAgent } from "./mydriver.js";

registerDriver("mydriver", () => runMyDriverAgent);
```

### 3. 测试 driver

- 在 `tests/driver/` 添加单元测试。
- 测试 stdout 流式输出、非零 exit code、abort、timeout。
- 用真实范式做一次 `--dry-run` 和一次小型 live run。
- 如果 CLI 能提供 token / cost / model 信息，在 `complete` event 中填充；不能提供时保持字段为空。

## 代码约定

- TypeScript strict mode。
- Bun 作为 runtime、bundler、test runner。
- ESM 模块。
- 公共接口显式标注类型。
- driver 使用 `async function*` 或兼容的 async generator。
- 文件名使用 `kebab-case.ts`。
- 类型和接口使用 `PascalCase`。
- 函数和变量使用 `camelCase`。
- commit message 使用 Conventional Commits，例如 `feat:`、`fix:`、`docs:`、`refactor:`。

## PR 检查

提交前建议运行：

```bash
bun test
bun run typecheck
bun run dry-run:all
```

PR 描述应包含：

- 改动内容。
- 为什么需要该改动。
- 如何验证。
- 新范式的 dry-run 输出。
- 新 driver 测试过的 CLI 版本和认证要求。
