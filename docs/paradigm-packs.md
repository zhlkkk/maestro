# Paradigm Packs

Paradigm pack 是一个本地目录，里面包含 Maestro 范式、prompt 模板和轻量 metadata。M3 先支持本地 authoring loop；远程安装、registry 和签名策略会放到后续 M3.x。

## 创建本地 pack

```bash
bun run dev init paradigm demo --dry-run
bun run dev init paradigm demo --dir ./demo-paradigm
```

scaffold 会生成：

```text
demo-paradigm/
  paradigm.yaml
  prompts/
    implement.md
  README.md
```

不启动 agent 的校验命令：

```bash
bun run dev run ./demo-paradigm/paradigm.yaml --task "smoke test" --dry-run
```

默认 `generic-cli` 命令会带说明退出，避免误跑。live run 前需要替换成真实本地命令。

## 安装 pack

安装本地 pack：

```bash
bun run dev install ./demo-paradigm
bun run dev list paradigms
bun run dev run demo --task "smoke test" --dry-run
```

安装 Git source：

```bash
bun run dev install https://github.com/example/maestro-pack.git
```

默认安装位置是 `.maestro/paradigms/<pack-name>`。pack name 来自 `paradigm.yaml` 的 `name` 字段，会被标准化成小写 URL-safe 名称。安装同名 pack 时默认失败，可用 `--force` 替换：

```bash
bun run dev install ./demo-paradigm --force
```

`--dry-run` 会执行解析、结构校验和 driver 兼容性检查，但不写文件：

```bash
bun run dev install ./demo-paradigm --dry-run
```

安装时会维护本地 registry index：

```json
{
  "version": 1,
  "paradigms": [
    {
      "name": "demo",
      "version": "0.1.0",
      "source": "./demo-paradigm",
      "path": ".maestro/paradigms/demo",
      "paradigm": ".maestro/paradigms/demo/paradigm.yaml"
    }
  ]
}
```

查看已安装 pack：

```bash
bun run dev list paradigms
```

安装兼容性检查包括：

- source 必须是包含 `paradigm.yaml` 的目录，或根目录包含 `paradigm.yaml` 的 Git source。
- `paradigm.yaml` 必须能解析并通过 `validateParadigm`。
- `maestro_version` 必须兼容当前 schema，当前支持 `"1"`。
- 所有 agent driver 必须已在当前 Maestro driver registry 注册。
- 如果声明了 `driver_plugins`，插件必须能加载并导出合法 driver 函数。

## Metadata

pack metadata 写在 `paradigm.yaml` 顶层：

```yaml
name: "Example Pack"
description: "A local workflow"
maestro_version: "1"
version: "0.1.0"
author: "Team Name"
tags: ["local", "review"]
license: "MIT"
homepage: "https://example.com"
```

`maestro_version` 表示 Maestro 范式 schema 兼容版本。`version` 表示 pack 自身版本，M3.1 不用它参与路由或执行。

## Generic CLI Driver

当一个工具可以从 phase worktree 中以命令方式运行时，可以使用 `driver: generic-cli`。

```yaml
agents:
  Implementer:
    driver: generic-cli
    model: "local-model"
    command:
      - "/bin/sh"
      - "-c"
      - "my-agent --prompt-file \"$MAESTRO_PROMPT_FILE\""
```

Maestro 会给命令注入这些环境变量：

| 变量 | 作用 |
| --- | --- |
| `MAESTRO_PROMPT_FILE` | 临时 prompt 文件的绝对路径 |
| `MAESTRO_WORKDIR` | phase worktree 目录 |
| `MAESTRO_OUTPUT_FILE` | phase 的 `output_file` 值 |
| `MAESTRO_MODEL` | 解析后的 phase 或 agent model，未配置时为空 |

命令的 `cwd` 是 phase worktree。stdout 会进入 Maestro events 和 report；phase 成败仍由常规 `output_file` frontmatter 决定。

## Driver 插件

当 `generic-cli` 不够表达某个本地 agent 协议时，pack 可以声明 driver 插件：

```yaml
driver_plugins:
  local-reviewer: drivers/local-reviewer.js

agents:
  Reviewer:
    driver: local-reviewer
```

插件路径相对 `paradigm.yaml` 所在目录解析。模块需要导出 `default`、`runAgent` 或 `runDriver` 函数：

```javascript
export async function* runAgent(prompt, workdir, options = {}) {
  yield { type: "output", text: "running local reviewer" };
  yield { type: "complete", result: "done" };
}
```

driver 函数签名与内置 `AgentDriverFn` 相同。插件运行在本地进程内，不提供远程信任或沙箱；安装第三方 pack 前应先审查源码。

## 最小 live 命令

本地测试时，可以把 scaffold 命令替换为：

```yaml
command:
  - "/bin/sh"
  - "-c"
  - "printf -- '---\nstatus: approved\n---\n\nSmoke passed.\n' > \"$MAESTRO_OUTPUT_FILE\""
```

然后运行：

```bash
bun run dev run ./demo-paradigm/paradigm.yaml --task "smoke test"
```

## 后续 M3.x

签名 registry metadata、远程 registry 索引和更严格的插件 trust policy，会在本地/Git pack 安装稳定后继续推进。
