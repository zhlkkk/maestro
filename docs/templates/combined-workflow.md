# Superpowers + Compound Engineering 标准组合工作流

**版本**：v1.0  
**目的**：兼顾**工程纪律**（Superpowers）与**系统自我进化**（Compound Engineering），让每次开发既高效又能让代码库越用越聪明。

---

## 1. 标准 6 步组合流程（推荐每次新功能严格执行）

| 步骤 | 命令 | 核心作用 | 主导工具 |
|------|------|----------|----------|
| 1. 产品级发散 | `/superpowers:brainstorm <需求>` | 澄清需求、用户故事、风险 | Superpowers |
| 2. 永久锁死知识 | `/ce:compound "功能名称"` | 把 PRD、技术决策永久写入知识库 | Compound |
| 3. 深度技术规划 | `/ce:plan`（ultrathink 模式） | 40+ agents 极深研究，输出详细计划 | Compound |
| 4. 结构化执行 | `/superpowers:execute-plan` 或 `/lfg` | 强制 TDD、分模块实现 | Superpowers |
| 5. 自动 Review | `/ce:review` | 多 agent 并行审查 + 自动修复 | Compound |
| 6. 知识复合 | `/ce:compound` | 提炼模式、坑点、最佳实践，永久沉淀 | Compound |

---

## 2. 场景决策指南

| 场景 | 优先 Superpowers（又快又规范） | 优先 Compound（类似事情会更容易） | 推荐组合 |
|------|--------------------------------|------------------------------------|----------|
| MVP 快速验证 / Deadline 紧 | ✅ 强烈推荐 | - | Superpowers 主导 |
| 长期维护的项目 | - | ✅ 强烈推荐 | Compound 主导 |
| 代码库已较大，想避免越写越乱 | - | ✅ 强烈推荐 | Compound 主导 |
| 新领域，需要大量研究 | - | ✅ 优先 | Compound 先规划 |
| 想严格防止 AI 犯低级错误 | ✅ 优先 | - | Superpowers 先 TDD |
| 同一类功能会重复多次 | - | ✅ 强烈推荐 | Compound 复合 |
| 个人/小团队长期项目 | - | ✅ 最佳选择 | Compound 为主 + Superpowers 纪律 |

**口诀**：  
**想快、想规范、不返工** → Superpowers  
**想让系统越用越聪明** → Compound

---

## 3. 简洁一键启动模板（日常最常用）

**以后每次新功能，直接复制下面这段发给 Claude 即可**（最推荐）：

```markdown
/superpowers:brainstorming + /ce:plan
需求：【在这里写你的需求】

请严格按组合工作流执行：
1. /superpowers:brainstorming 澄清需求
2. /ce:compound 锁死决策
3. /ce:plan (ultrathink) 生成详细计划
4. /superpowers:execute-plan 执行
5. /ce:review + /ce:compound