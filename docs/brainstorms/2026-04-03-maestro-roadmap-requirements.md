---
date: 2026-04-03
topic: maestro-evolution-roadmap
---

# Maestro 演进路线图

## Problem Frame

开发者手工执行 AI 辅助研发工作流（如 Superpowers + Compound Engineering 6 步法）时，需要在多个步骤之间复制粘贴指令、等待完成、手动传递上下文。每次新功能开发重复此过程，效率低且易出错。

Maestro 将研发方法论编码为可执行的状态机（Paradigm-as-Code），自动编排 AI agent 完成从需求到代码的全流程。

## Milestone Overview

```
M1: 引擎核心             M2: 开源发布              M3: 生态平台
"替代手工 6 步"          "让工程 lead 前倾"        "从工具到平台"
───────────────────── → ───────────────────── → ─────────────────────
• YAML 解析 + xstate    • Multi-driver (5种)     • maestro init
• Claude Code driver    • Full Ink Dashboard     • 通知插件
• Worktree + Handoff    • 并行执行 (fork-join)   • 可组合范式 (include)
• Simple Ink UI         • replay 命令            • 范式注册表
• dry-run + 事件日志    • npm 发布 + 二进制      • Web Dashboard
                        • Demo 录制              • Stats 分析
```

## Requirements

### M1: 引擎核心 — 内部可用

**范式解析**
- R1. 解析 agents-first-class 格式的 YAML 范式文件（agents 定义 + phases 定义 + handoff_routing）
- R2. 校验必填字段、agent 引用合法性、routing 约束合法性、循环引用检测
- R3. 支持 `maestro_version: "1"` schema 版本字段
- R4. `--dry-run` 模式：解析并模拟状态机流转，不启动任何 agent

**状态机**
- R5. 基于 xstate v5 实现状态机控制器，支持线性流转（next）、条件路由（next_if）、重试循环
- R6. 从 YAML 范式翻译为 xstate `createMachine()` 配置对象，包括 guards（next_if -> xstate guards）
- R7. 读取 output_file 的 YAML frontmatter 中的 `status` 字段驱动条件路由
- R8. 未匹配的 status 值进入 FAILED 状态并给出明确错误信息

**Driver**
- R9. 定义 AgentDriver 接口：`spawn(prompt, workdir) -> AsyncIterableIterator<AgentEvent>`
- R10. 实现 Claude Code driver：spawn `claude -p "..." --output-dir ./` 子进程，流式输出，退出码检测
- R11. M1 只需 Claude Code 单一 driver，但接口设计必须支持未来扩展

**隔离与交接**
- R12. Git worktree 管理：每个 phase 创建持久 worktree，跨迭代复用，完成后清理
- R13. 文件拷贝交接：通过 `git diff --name-status` 检测变更，拷贝到下一 phase 的 worktree
- R14. Prompt 模板插值：支持 `{{task}}`（CLI --task 参数）和 `{{previous_output}}`（上一 phase 的 output_file 内容；第一个 phase 时替换为空字符串）
- R15. 知识库写入（LockKnowledge / CompoundLearnings 步骤）由 agent 自行处理，引擎不感知

**防护机制**
- R16. Phase 超时：默认 5 分钟，支持 `timeout_s` 配置，超时进入 FAILED 状态
- R17. 最大重试：`max_retries` 配置，超限后 abort 并输出摘要
- R18. 目录锚定：agent 子进程 cwd 固定为其 worktree
- R19. Prompt 大小保护：超过 100KB 时写入临时文件传递

**终端界面 (Ink)**
- R20. 阶段进度条：显示所有 phase 及其状态（pending / running / completed / failed / skipped）
- R21. Agent stdout 实时流式显示
- R22. 每个 phase 耗时计时器

**可观测性**
- R23. 运行期间持续写入 `events.jsonl`（MaestroEvent 格式：timestamp, type, phase, data）
- R24. 运行完成后自动生成 `.maestro/reports/run-{timestamp}.md`

**CLI**
- R25. 入口命令：`maestro run <paradigm.yaml> --task "..." [--dry-run]`
- R26. Ctrl-C 优雅退出：终止所有 agent 子进程 + 清理 worktree

**范式模板**
- R27. 提供 tdd-strict.yaml 演示范式（3 phase：WriteTests -> Implement -> Review）
- R28. 提供 combined-workflow.yaml 实战范式（6 phase：Brainstorm -> LockKnowledge -> DeepPlan -> Execute -> Review -> CompoundLearnings）。模板中 DeepPlan 和 Execute phase 必须配置合理的 `timeout_s`（建议 1800s），覆盖 5 分钟默认值
- R29. 提供配套的 prompts/ 目录下所有 prompt 模板文件

### M2: 开源发布

**Multi-Driver**
- R30. 实现 codex、gemini、aider、generic 四个额外 driver
- R31. Generic driver 支持用户自定义命令模板（任何接受 prompt 的 CLI 工具）
- R32. 启动时 Driver auth/binary pre-check（fail fast）

**终端界面升级**
- R33. Full Ink Dashboard：phase status panel + agent output streams panel + event timeline panel

**高级编排**
- R34. YAML 并行执行语法（fork-join），支持多个 phase 同时运行
- R35. `maestro replay` 命令：回放历史运行的 events.jsonl

**发布**
- R36. npm 包发布（包名待定：maestro-cli / maestro-dev / @maestro/cli）
- R37. bun compile 独立二进制 + GitHub Releases
- R38. GitHub Actions CI/CD：测试 + npm publish on tag
- R39. README + Demo 录制（asciinema / terminal GIF）

### M3: 生态平台

- R40. `maestro init` 项目类型检测 + 范式推荐
- R41. 通知插件接口 + 桌面通知内置 + Slack/Telegram/webhook 社区插件
- R42. 可组合范式：`include` 语法复用子工作流
- R43. 范式注册表：`maestro install <paradigm>` 社区模板
- R44. 本地 Web UI Dashboard
- R45. `maestro stats` 团队使用分析
- R46. 范式 metadata：version, author, tags, description, license

## M1 Build Sequence

构建顺序基于依赖关系排列：

```
                    ┌─────────────┐
                    │  1. Parser   │ YAML → 内部数据结构
                    │  + Validator │ 校验 agent/phase/routing
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ 2. xstate   │ 内部数据结构 → createMachine()
                    │   Machine   │ guards, transitions, actions
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ 3. Claude   │ AgentDriver 接口
                    │ Code Driver │ spawn + stream + exit code
                    └──────┬──────┘
                           │
              ┌────────────▼────────────┐
              │ 4. Worktree + Handoff   │ create/reuse/cleanup
              │    + Guardrails         │ file-copy + prompt interpolation
              └────────────┬────────────┘
                           │
         ┌─────────────────▼─────────────────┐
         │ 5. Ink UI + dry-run + Event Log   │ 可并行开发
         └─────────────────┬─────────────────┘
                           │
              ┌────────────▼────────────┐
              │ 6. CLI + Templates +    │ 端到端集成
              │    End-to-End Wiring    │
              └─────────────────────────┘
```

步骤 1-4 严格串行（每步依赖前一步输出）。步骤 5 的三个子模块可并行开发。步骤 6 是集成阶段。

## Success Criteria

- 运行 `maestro run combined-workflow.yaml --task "Add user authentication"` 能完整跑通 6 个 phase，替代手工复制粘贴流程
- Review rejection 正确触发重试循环（回到 Execute phase 并附带反馈）
- max_retries 超限后正确 abort 并输出摘要
- `--dry-run` 能检测出 YAML 中的 agent 引用错误、routing 违规、循环引用
- Ink UI 实时显示当前 phase 进度、agent 输出流、各 phase 耗时
- events.jsonl 完整记录所有状态转换事件
- Ctrl-C 能干净退出并清理所有 worktree

## Scope Boundaries

- M1 不支持多 driver — 只有 Claude Code
- M1 不支持并行执行 — 所有 phase 串行
- M1 不发布 npm — 本地 bun 直接运行
- 引擎不感知知识库写入 — agent 自行处理
- 不实现 natural language paradigm — 只有 YAML
- 不实现 GUI adapter（Cursor 等）— 只支持 CLI agent

## Key Decisions

- **M1 目标是内部可用**：优先引擎正确性和自用体验，非 Demo 展示
- **M1 只有 Claude Code driver**：真实工作流全用 claude-code，多 driver 推迟到 M2
- **Agents-first-class 范式格式**：统一为一种格式，不支持两种（消除解析税）
- **知识库写入由 agent 处理**：引擎保持简单，不引入 side_effects 机制
- **Event logging 放在 M1**：它是 M2 replay/dashboard/stats 的数据基础

## Dependencies / Assumptions

- Claude Code CLI (`claude -p`) 的 subprocess 接口稳定可用
- 用户机器已安装 git 且支持 worktree
- bun 作为开发工具链（运行时 + 构建 + 测试）
- xstate v5 的 `createMachine()` API 支持从 YAML 动态生成配置

## Outstanding Questions

### Resolve Before Planning
- [Affects R5-R8][Needs spike] xstate v5 的 guard 函数如何动态注入？YAML `next_if` 到 xstate guards 的翻译策略需要 spike（2h）。如不可行，评估替代方案（自建轻量状态机、robot3）
- [Affects R10][Needs spike] `claude -p` 的 stdout 编码、进度信息格式、退出码语义、`--output-dir` 参数是否存在——需要实测确认（1h）

### Deferred to Planning
- [Affects R12][Technical] worktree 在 agent 异常退出（SIGKILL）时的清理策略
- [Affects R36][User decision] npm 包名选择：maestro-cli vs maestro-dev vs @maestro/cli（需查 npm registry 冲突）

## Next Steps

→ `/ce:plan` for structured implementation planning
