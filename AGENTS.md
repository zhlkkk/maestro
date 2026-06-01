# AGENTS.md

## 语言规则

- 与用户沟通时使用简体中文。
- 方案说明、错误说明、进度汇报和最终总结使用简体中文。
- 代码注释、变量命名、函数命名、类型命名和 commit message 使用英文。
- commit message 使用 Conventional Commits，例如 `feat:`、`fix:`、`docs:`、`refactor:`、`test:`、`chore:`。

## 项目概览

Maestro 是一个 Bun + TypeScript CLI，用 Paradigm-as-Code 的方式编排多智能体研发流程。项目通过 YAML 范式定义 agents、phases 和状态机路由，再由 driver 在 git worktree 中执行每个 phase。

核心目录：

- `src/cli/`：`run` 和 `replay` 命令。
- `src/engine/`：parser、validator、xstate machine、runner、logger、report。
- `src/driver/`：driver 接口、registry、Claude Code、Codex、Gemini 实现。
- `src/sandbox/`：git worktree、handoff、prompt 组装。
- `src/dashboard/`：Ink 终端 UI 组件。
- `paradigms/`：内置范式。
- `prompts/`：内置 prompt 模板。
- `docs/`：架构、路线图、PRD、计划和对比文档。
- `tests/`：bun:test 测试。

## 常用命令

```bash
bun install
bun test
bun run typecheck
bun run dry-run:all
bun run build
```

运行范式：

```bash
bun run dev run paradigms/tdd-strict.yaml --task "your task"
bun run dev run paradigms/tdd-strict.yaml --task "your task" --dry-run
```

回放事件：

```bash
bun run dev replay .maestro/events-<run-id>.jsonl --speed max
```

## 代码约定

- 使用 TypeScript strict mode。
- 使用 Bun 作为 runtime、bundler 和 test runner。
- 使用 ESM。
- 公共接口显式标注类型。
- driver 使用 `AgentDriverFn`，并通过 async generator 产出 `AgentEvent`。
- 优先复用现有模块模式，避免引入不必要抽象。
- 修改行为时补充或更新测试。

## 文档约定

- README 应保持为项目入口，反映当前真实能力。
- `docs/architecture.md` 记录架构、配置、实现原理、数据流和已知限制。
- `docs/roadmap.md` 记录当前进度、技术债和路线图。
- `docs/prd/maestro_v1.md` 记录产品定位、范围和非目标。
- `docs/plans/` 下的计划文档可以保留历史语境；若状态已变化，应在文档顶部补充当前状态说明。

## Git 与提交

- 不要把本地构建产物或大型二进制误提交，例如根目录 `maestro` 可执行文件。
- 优先按文件显式 staging，避免 `git add .` 混入无关文件。
- 当前仓库默认分支为 `main`；做改动时优先创建 `codex/` 前缀分支。
- 提交前至少运行与改动相关的验证；文档改动优先运行 `bun run dry-run:all` 和 `bun test`。

## 已知状态

- `bun test` 是主要运行时测试基线。
- 当前 `bun run typecheck` 可能因为 `tests/engine/parallel-spike.test.ts` 中 xstate spike 的类型推断问题失败；处理无关任务时不要把它误判为当前改动导致。
- fork/join 状态机已有实现和测试，但复杂并行 handoff 仍需稳定化。
- Ink dashboard 组件存在，但默认 `run` 命令仍主要使用 console 输出。
