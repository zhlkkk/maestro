好的，这是一个极其重要且激动人心的转身！

我们将目光从“为你的个人项目打补丁”彻底拔高，重新审视并沉淀 **Maestro** —— 它不应该仅仅是一堆特定工具（Cursor/Claude）的缝合脚本，而应该被定义为一个**通用、开源、跨工具的多智能体研发编排引擎 (Multi-Agent R&D Orchestration Engine)**。

以下是为 Maestro 开源项目准备的**架构蓝图与核心设计白皮书**，这将是未来项目 `README.md` 和架构文档的绝佳基础。

---

# 🎼 Maestro: 下一代智能体研发编排引擎 (Multi-Agent R&D Orchestrator)

## 🌟 愿景 (Vision)
在 AI 编程时代，开发者面临的不再是“AI 写不出代码”的问题，而是**“AI 写的代码如何管理、审计、与协同”**的问题。
Maestro 致力于成为 AI 研发时代的 **“CI/CD 管道”与“项目经理”**。它将不同的 AI 工具（如 GUI 编辑器、CLI Agent、云端模型）解耦并编排，把软件工程的最佳实践（如 TDD、敏捷、螺旋迭代）固化为机器可读的**研发范式 (Paradigm)**，实现真正可靠、可复利的全自动软件交付。

---

## 🏗️ 核心架构思想 (Core Philosophy)

Maestro 的设计彻底抛弃了“大语言模型套壳”的传统 Agent 框架思路，转向了**“状态机驱动的工具链编排”**。

### 1. 范式即代码 (Paradigm-as-Code, PaC)
软件工程没有银弹。MVP 阶段需要“敏捷梭哈”，核心系统重构需要“TDD + 强力 Code Review”。
Maestro 提出将研发流程抽象为 `.yaml` 格式的范式文件。一个范式包含：
*   **状态机节点 (Phases)**：例如 `PLANNING` -> `CODING` -> `REVIEWING`。
*   **流转规则 (Transitions)**：基于条件（如文件生成、人工审批、测试结果）进行状态流转或打回重做。
*   **角色分配 (Roles)**：定义在特定阶段，由哪个角色负责执行。

### 2. 身份与工具链解耦 (Decoupled Personas & Tools)
Maestro 不绑定任何特定的 AI 工具或模型。它抽象出：
*   **角色 (Persona)**：带有特定 System Prompt（如“严苛的架构师”或“无情的打字机”）。
*   **驱动器 (Driver)**：执行任务的物理实体。可以是 `cursor-cli` (唤醒 GUI 让 Gemini/o3-mini 处理复杂上下文)、`claude-code-cli` (在终端高权限执行代码)、`aider`、甚至是未来的 `devin`。

### 3. 文件系统即消息总线 (File-System as Message Bus)
拒绝复杂的 RPC 或内存共享。Agent 之间的上下文交接（Handoff）、任务汇报，全部通过物理文件（如 Markdown 格式的 `WAITING_FOR_REVIEW.md`）进行。
这不仅极大地降低了系统复杂度，而且**天然留存了项目演进的完整思维快照（Audit Trail）**，为知识复利（Compound Engineering）提供了完美的数据源。

---

## ⚙️ 系统核心模块 (System Architecture)

如果要将 Maestro 实现为一个开源的 Node.js/Python CLI 工具（例如通过 `npm install -g maestro-cli` 运行），其内部需包含四大核心引擎：

### 1. 范式解析器 (Paradigm Parser)
负责加载和校验用户的 YAML 剧本。
```yaml
# 概念示例：Maestro 范式
name: "TDD-Strict-Workflow"
personas:
  Architect:
    driver: "gui-editor" # 泛指 Cursor/Windsurf 等
    model: "Gemini 3.1 Pro"
    prompt: "你是架构师，负责拆解任务和 Review..."
  Worker:
    driver: "cli-agent"  # 泛指 Claude Code/Aider 等
    prompt: "你是码农，必须先跑通测试..."
phases:
  Plan:
    role: Architect
    next: Code
  Code:
    role: Worker
    trigger: "file:REPORT.md"
    next: Review
```

### 2. 状态机控制器 (State Machine Controller)
这是 Maestro 的“心脏”。
*   维护 `.maestro/state.json` 指针。
*   监听外部触发器（如文件系统的变化、Webhook、或开发者的手动 `Cmd+S` 确认）。
*   一旦满足 `trigger` 条件，自动推进状态，或根据规则执行分支跳跃（如 `on_reject: return_to_code`）。

### 3. 驱动适配层 (Driver Adapters)
这是 Maestro 与物理世界交互的“手脚”。采用插件化设计：
*   **GUI Adapter**：通过命令行拉起特定的编辑器，并自动聚焦到任务 Markdown 文件（Human-in-the-loop 的关键点）。
*   **CLI Adapter**：使用 `spawn` 在受控的 CWD（工作目录）下，带参数（如提权参数）拉起后台 Agent 进程，并通过流接管 (Pipe) 或直接继承 (Inherit) 暴露内部运行日志。
*   **API Adapter**：直接调用大模型 API 执行轻量级验证。

### 4. 隔离沙箱与防呆机制 (Sandbox & Guardrails)
*   强制的工作目录锚定（防 Monorepo 迷路）。
*   超长 Prompt 的文件挂载传输（防 Shell 转义注入）。
*   死循环熔断器（Max Retries 断路器）。

---

## 🚀 为什么世界需要 Maestro？(The Value Proposition)

目前的开源生态中，**LangChain / AutoGen / CrewAI** 等框架是为“构建应用程序（App）”设计的，它们活在内存里。
而 **Maestro** 是为“软件研发流程（R&D Pipeline）”设计的，它活在文件系统和终端里。

1. **跨工具协同的终极解药**：开发者终于可以组合世界上最好的脑（如 Cursor 中的 Gemini 3.1 Pro）和最好的手（如全自动运行的 CLI Agent），让它们无缝接力。
2. **知识资产复利**：每一次跑通 Maestro 的范式，沉淀下来的不仅是代码，还有 Agent 留下的决策文档（PRD、坑点记录）。这让“代码库越用越聪明”成为可落地的现实。
3. **团队级研发 SQA 标准化**：高级工程师可以将自己的研发经验写成 `.yaml` 范式。初级工程师只需运行 `maestro start`，其写出的代码就必然经过了预设的规划和自动化审查流程，极大降低了代码雪崩的风险。

---

## 🎯 下一步开源落地计划 (Roadmap)

如果我们要启动这个开源项目，建议按照以下阶段演进：

*   **Phase 1 (MVP: 最小可行性编排器)**：
    *   使用 TypeScript 构建核心 CLI（`maestro-core`）。
    *   实现 YAML 解析、基于文件的 State Machine 流转。
    *   实现两个基础 Driver：`generic-gui` (唤醒系统默认编辑器) 和 `generic-cli` (执行任意命令行 Agent)。
*   **Phase 2 (Hooks & Ecosystem)**：
    *   引入生命周期钩子（如 `pre_phase`, `post_phase`），允许在节点切换时自动运行脚本（如 `git diff`, `npm run lint`）。
    *   提供官方的最佳实践范式模板库（如 `compound-engineering.yaml`, `gstack-agile.yaml`）。
*   **Phase 3 (Observability)**：
    *   提供本地的 Web UI 仪表盘，可视化展示当前 Agent 处于状态机的哪个节点、耗时多少、打回了多少次。

**结语**：Maestro 绝不是另一个重新发明轮子的 Agent 框架。它是站在各种强大 AI 工具肩膀上的“指挥家”，致力于将零散的 AI 能力，编织成工业级的现代软件生产流水线。
