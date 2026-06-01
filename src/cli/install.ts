import {
  cpSync,
  existsSync,
  mkdtempSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { parseParadigmFile } from "../engine/parser.js";
import { validateParadigm } from "../engine/validator.js";
import { loadDriverPlugins, validateDrivers } from "../driver/registry.js";
import {
  getParadigmRegistryRoot,
  readParadigmIndex,
  sanitizeParadigmName,
  writeParadigmIndex,
  type InstalledParadigmEntry,
} from "./paradigm-registry.js";

export interface InstallCommandOptions {
  dir?: string;
  dryRun?: boolean;
  force?: boolean;
}

interface ResolvedSource {
  sourceDir: string;
  cleanup?: () => void;
}

export async function installCommand(
  source: string,
  options: InstallCommandOptions = {}
): Promise<number> {
  let resolvedSource: ResolvedSource | undefined;

  try {
    resolvedSource = await resolveSource(source);
    const paradigmPath = join(resolvedSource.sourceDir, "paradigm.yaml");

    if (!existsSync(paradigmPath)) {
      console.error(`Error: paradigm.yaml not found in ${resolvedSource.sourceDir}`);
      return 2;
    }

    const config = parseParadigmFile(paradigmPath);
    const errors = validateParadigm(config);
    if (errors.length > 0) {
      console.error("Paradigm validation failed:");
      for (const error of errors) {
        console.error(`  ✖ ${error.path}: ${error.message}`);
      }
      return 2;
    }

    try {
      await loadDriverPlugins(config.driver_plugins);
      validateDrivers([...new Set(Object.values(config.agents).map((agent) => agent.driver))]);
    } catch (err) {
      console.error(`Driver compatibility check failed: ${err instanceof Error ? err.message : err}`);
      return 2;
    }

    const registryRoot = getParadigmRegistryRoot(process.cwd(), options.dir);
    const installName = sanitizeParadigmName(config.name);
    const targetDir = join(registryRoot, installName);

    if (existsSync(targetDir) && !options.force) {
      console.error(`Target paradigm already exists: ${targetDir}`);
      console.error("Use --force to replace it.");
      return 2;
    }

    const entry = buildIndexEntry(config, source, registryRoot, installName);

    if (options.dryRun) {
      console.log(`Would install paradigm "${config.name}" to ${targetDir}`);
      console.log(`Would update registry index at ${join(registryRoot, "index.json")}`);
      return 0;
    }

    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true });
    }

    cpSync(resolvedSource.sourceDir, targetDir, {
      recursive: true,
      filter: (path) => !path.split(sep).includes(".git"),
    });

    const index = readParadigmIndex(registryRoot);
    index.paradigms = [
      ...index.paradigms.filter((existing) => existing.name !== entry.name),
      entry,
    ].sort((a, b) => a.name.localeCompare(b.name));
    writeParadigmIndex(registryRoot, index);

    console.log(`Installed paradigm "${config.name}" at ${targetDir}`);
    console.log(`Run it with: maestro run ${installName} --task "your task"`);
    return 0;
  } catch (err) {
    console.error(`Error installing paradigm: ${err instanceof Error ? err.message : err}`);
    return 2;
  } finally {
    resolvedSource?.cleanup?.();
  }
}

async function resolveSource(source: string): Promise<ResolvedSource> {
  if (isGitSource(source)) {
    const tempDir = mkdtempSync(join(tmpdir(), "maestro-install-"));
    const cloneDir = join(tempDir, "repo");
    await cloneGitSource(source, cloneDir);
    return {
      sourceDir: cloneDir,
      cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
    };
  }

  const sourceDir = resolve(source);
  if (!existsSync(sourceDir)) {
    throw new Error(`Source path not found: ${sourceDir}`);
  }
  if (!statSync(sourceDir).isDirectory()) {
    throw new Error(`Source path must be a directory containing paradigm.yaml: ${sourceDir}`);
  }

  return { sourceDir };
}

function isGitSource(source: string): boolean {
  return /^(https?|ssh|git|file):\/\//.test(source) || /^[^@\s]+@[^:\s]+:.+/.test(source);
}

async function cloneGitSource(source: string, cloneDir: string): Promise<void> {
  const proc = Bun.spawn(["git", "clone", "--depth", "1", source, cloneDir], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stderr as ReadableStream).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(`git clone failed${stderr.trim() ? `: ${stderr.trim()}` : ""}`);
  }
}

function buildIndexEntry(
  config: ReturnType<typeof parseParadigmFile>,
  source: string,
  registryRoot: string,
  installName: string
): InstalledParadigmEntry {
  return {
    name: installName,
    ...(config.version && { version: config.version }),
    ...(config.description && { description: config.description }),
    ...(config.author && { author: config.author }),
    ...(config.tags && { tags: config.tags }),
    ...(config.license && { license: config.license }),
    ...(config.homepage && { homepage: config.homepage }),
    ...(config.maestro_version && { maestroVersion: config.maestro_version }),
    source,
    installedAt: new Date().toISOString(),
    path: join(registryRoot, installName),
    paradigm: join(registryRoot, installName, "paradigm.yaml"),
  };
}
