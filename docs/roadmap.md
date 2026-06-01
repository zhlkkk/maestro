# Maestro 路线图与当前进度

本文记录 Maestro 当前状态、已经完成的里程碑、已知风险和下一阶段路线图。

## 当前状态

当前代码库已经从 M1 的单 driver 串行编排，推进到 M2 的大部分基础能力：

- CLI 入口：已完成 `maestro run`、`maestro replay`。
- 范式解析：已支持 agents、phases、handoff_routing、`model`、`type: fork`。
- 校验器：已覆盖 agent 引用、phase 输出、终态、路由目标、handoff 限制、死循环、fork child 限制。
- 状态机：已支持线性、条件路由、重试、fork/join。
- Driver：已完成 `claude-code`、`codex`、`gemini`、`generic-cli` 内置 driver 和 registry。
- 范式生态：已开始 M3，本地 paradigm pack metadata 与 `maestro init paradigm` scaffold 已落地。
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

状态：大部分已实现，当前进入发布候选稳定化阶段。M2 的公开 beta 可以在 fork/join 明确标注 experimental 的前提下发布；生产级并行取消与冲突合并语义继续留在 M2.x/M3 打磨。

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

- 默认 CLI 接入 Ink dashboard，或保留 console 输出并把 dashboard 定位为可复用组件。
- fork/join 的真实运行器语义继续加强：父级上下文到多个 child 的一致 handoff、child 失败后的 sibling abort、join 前 handoff 冲突保护已开始收敛；复杂并行恢复仍需继续打磨。
- Codex 原始 JSONL usage 提取。
- Gemini CLI 参数和输出协议做真实版本校准。
- 录制 demo 和发布说明。

## 已知技术债

- Commander 版本号应始终来自 `package.json`，避免发布版本漂移。
- `PHASE_RETRY` 事件应在真实重试执行时进入事件日志和报告。
- logger 使用同步 append，足够简单可靠，但并行大 payload 下还没有写队列。
- fork/join 状态机测试已经覆盖；runner 已支持 fork child 共享 pre-fork handoff、join target 聚合 child handoff、sibling abort 和 join 前冲突保护，但复杂并行恢复仍未生产化。
- dashboard 组件未成为默认运行 UI。
- M1/M2 plan 文档保留原始计划格式，其中 checkbox 不代表当前真实完成状态。

## 下一阶段建议

### M2 稳定化

目标：把已有能力变成可公开试用的稳定 CLI。

- 保持 `bun test`、`bun run typecheck`、`bun run dry-run:all` 绿色。
- 为 fork/join runner 继续增加边界集成测试，覆盖更多 timeout、abort 和 conflict 组合。
- 为 Codex / Gemini driver 校准真实 CLI 参数和 usage 提取。
- 接入 Ink dashboard 或从文档里明确标注为组件能力。

### M2 发布化

目标：让外部用户能安装、运行、复现 demo。

- 配置 npm publish。
- 录制一个 TDD 或 bug-investigation 的完整 demo。
- 增加 sample run report。

### M2 完成口径

M2 建议按“公开 beta”完成，而不是等待所有并行语义达到生产级：

- 必须通过：`bun test`、`bun run typecheck`、`bun run dry-run:all`、`bun run build`。
- 必须具备：MIT `LICENSE`、CI 基线、README 命令可复制、版本号来自 `package.json`、本地构建产物不进入 git。
- 必须说明：fork/join 是 experimental；已支持 parser、validator、machine 和基础 runner handoff，但 sibling abort、冲突合并和复杂并行恢复仍是后续工作。
- 必须验证：至少一个真实 driver live run 可以产出 events JSONL 和 Markdown report。

### M3：范式生态

目标：让 Maestro 从单项目 CLI 变成可扩展的研发范式平台。

状态：M3.1 已开始，第一片聚焦本地 pack authoring。

已完成或进行中：

- `generic-cli` driver：通过 command array 运行本地命令，注入 `MAESTRO_PROMPT_FILE`、`MAESTRO_WORKDIR`、`MAESTRO_OUTPUT_FILE`、`MAESTRO_MODEL`。
- 顶层 metadata：`version`、`author`、`tags`、`license`、`homepage`。
- `maestro init paradigm <name>`：生成本地 pack 骨架，支持 `--dir`、`--dry-run`、`--force`。
- 本地 pack 文档：`docs/paradigm-packs.md`。

后续：

- 范式 registry。
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
