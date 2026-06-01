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

远程 install、签名 registry metadata 和外部 driver 插件加载，会在本地 pack authoring 稳定后继续推进。
