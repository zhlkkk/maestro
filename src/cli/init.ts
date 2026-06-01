import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

export interface InitParadigmOptions {
  dir?: string;
  dryRun?: boolean;
  force?: boolean;
}

interface ScaffoldFile {
  path: string;
  content: string;
}

export async function initParadigmCommand(
  name: string,
  options: InitParadigmOptions = {}
): Promise<number> {
  const targetDir = resolve(options.dir ?? name);
  const packName = sanitizePackName(name);
  const files = buildParadigmPackFiles(packName);

  if (options.dryRun) {
    console.log(`Would create paradigm pack at ${targetDir}`);
    for (const file of files) {
      console.log(`  ${join(targetDir, file.path)}`);
    }
    return 0;
  }

  if (existsSync(targetDir) && readdirSync(targetDir).length > 0 && !options.force) {
    console.error(`Target directory is not empty: ${targetDir}`);
    console.error("Use --force to overwrite scaffold files.");
    return 2;
  }

  mkdirSync(targetDir, { recursive: true });

  for (const file of files) {
    const absolutePath = join(targetDir, file.path);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, file.content, "utf-8");
  }

  console.log(`Created paradigm pack at ${targetDir}`);
  return 0;
}

function sanitizePackName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : basename(process.cwd());
}

function buildParadigmPackFiles(name: string): ScaffoldFile[] {
  return [
    {
      path: "paradigm.yaml",
      content: `name: "${name}"
description: "A local Maestro paradigm pack"
maestro_version: "1"
version: "0.1.0"
author: "local"
tags: ["local"]
license: "UNLICENSED"

agents:
  Implementer:
    driver: generic-cli
    command:
      - "/bin/sh"
      - "-c"
      - "echo 'Replace this generic-cli command with your agent command.' >&2; echo 'Prompt file: '$MAESTRO_PROMPT_FILE >&2; exit 1"

phases:
  Implement:
    agent: Implementer
    prompt_file: prompts/implement.md
    output_file: RESULT.md
    next: Done
  Done:
    type: final
`,
    },
    {
      path: "prompts/implement.md",
      content: `# Task

{{task}}

## Previous Phase Output

{{previous_output}}

Write your result to RESULT.md using Maestro's output format:

\`\`\`markdown
---
status: approved
---

Summary of the work.
\`\`\`
`,
    },
    {
      path: "README.md",
      content: `# ${name}

本地 Maestro paradigm pack。

## Files

- \`paradigm.yaml\`: pipeline, agents, phases 和 metadata。
- \`prompts/implement.md\`: Implement phase 使用的 prompt 模板。

## Try It

\`\`\`bash
maestro run paradigm.yaml --task "Describe the work" --dry-run
\`\`\`

不带 \`--dry-run\` 运行前，请先替换 \`generic-cli\` 命令。
`,
    },
  ];
}
