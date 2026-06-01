# Maestro 路线图与当前进度

本文记录 Maestro 当前状态、已经完成的里程碑、已知风险和下一阶段路线图。

## 当前状态

当前代码库已经从 M1 的单 driver 串行编排，推进到 M2 的大部分基础能力：

- CLI 入口：已完成 `maestro run`、`maestro replay`。
- 范式解析：已支持 agents、phases、handoff_routing、`model`、`type: fork`。
- 校验器：已覆盖 agent 引用、phase 输出、终态、路由目标、handoff 限制、死循环、fork child 限制。
- 状态机：已支持线性、条件路由、重试、fork/join。
- Driver：已完成 `claude-code`、`codex`、`gemini` 内置 driver 和 registry。
- 沙箱：已完成 async git helper、worktree 创建/复用/清理、handoff 文件复制、retry diff summary。
- 审计：已完成 JSONL event log、Markdown run report、replay。
- 内置范式：已有 `tdd-strict`、`combined-workflow`、`bug-investigation`。
- 测试：覆盖 engine、driver、sandbox、dashboard、CLI replay，以及 xstate parallel spike。

## 里程碑

### M1：核心编排引擎

状态：已实现，计划文档仍保留在 `docs/plans/2026-04-03-001-feat-maestro-m1-engine-plan.md` 作为历史设计记录。

完成内容：

- TypeScript + Bun 项目骨架。
- YAML parser / validator。
- xstate v5 状态机翻译。
- Claude Code driver。
- git worktree 隔离。
- prompt 模板插值。
- output frontmatter 状态解析。
- dry-run。
- JSONL 事件日志。
- Markdown 报告。
- 三类内置 prompt / paradigm 的基础版本。

### M2：多 driver、审计和竞争力增强

状态：大部分已实现，仍有发布与稳定化工作。

已完成：

- `AgentDriverFn` 统一接口。
- driver registry。
- subprocess driver base。
- Codex driver。
- Gemini driver。
- phase / agent 级 model routing。
- async worktree 操作。
- fork/join parser、validator、machine 支持。
- retry incremental handoff。
- usage 字段进入 phase complete event 和报告。
- bug investigation paradigm。
- replay 命令。
- README、贡献指南和对比文档的基础版本。

仍需完成或加强：

- 默认 CLI 接入 Ink dashboard。
- fork/join 的真实运行器语义加强，包括父级上下文到多个 child 的一致 handoff、child 失败后的 sibling abort。
- Codex 原始 JSONL usage 提取。
- Gemini CLI 参数和输出协议做真实版本校准。
- generic CLI driver。
- npm 发布配置、二进制发布、CI/CD。
- 录制 demo 和发布说明。

## 已知技术债

- Commander 版本号与 `package.json` 版本号不一致。
- `PHASE_RETRY` 事件类型已定义但当前 runner 未显式发送。
- logger 使用同步 append，足够简单可靠，但并行大 payload 下还没有写队列。
- fork/join 状态机测试已经覆盖，但 runner 仍使用部分全局 last phase 状态。
- dashboard 组件未成为默认运行 UI。
- M1/M2 plan 文档保留原始计划格式，其中 checkbox 不代表当前真实完成状态。

## 下一阶段建议

### M2 稳定化

目标：把已有能力变成可公开试用的稳定 CLI。

- 修正 CLI 版本号来源。
- 完成 `bun test` 与 `bun run typecheck` 的绿色基线。
- 为 fork/join runner 增加集成测试。
- 明确 fork child 的 handoff 输入：从 fork 前 phase 同步到每个 child。
- 实现 child 失败时的 sibling abort。
- 为 Codex / Gemini driver 增加真实 CLI smoke test 文档。
- 接入 Ink dashboard 或从文档里明确标注为组件能力。

### M2 发布化

目标：让外部用户能安装、运行、复现 demo。

- 补齐 `LICENSE` 或调整 `package.json` files。
- 配置 npm publish。
- 增加 GitHub Actions：test、typecheck、build。
- 增加 release checklist。
- 录制一个 TDD 或 bug-investigation 的完整 demo。
- 增加 sample run report。

### M3：范式生态

目标：让 Maestro 从单项目 CLI 变成可扩展的研发范式平台。

- 范式 registry。
- `maestro init paradigm` scaffold。
- `maestro install <paradigm>`。
- driver 插件机制。
- 更强的 report，可包含 diff 摘要、产物索引和关键决策。
- Web UI 或更完整 TUI。

### M4：团队工作流

目标：服务团队级 SQA 和可审计交付。

- branch-per-run 或 PR-per-run 模式。
- 人工审批 checkpoint。
- 策略化权限控制。
- 组织级 cost / token 汇总。
- 可查询的历史运行索引。
- 与 CI 的双向集成。

## 发布判断标准

公开发布前建议至少满足：

- `bun test` 通过。
- `bun run typecheck` 通过。
- 三个内置 paradigm 的 dry-run 全通过。
- 至少一个真实 driver 的 live run 产出 report。
- README 中所有命令可复制运行。
- fork/join 若仍未稳定，应明确标注 experimental。
