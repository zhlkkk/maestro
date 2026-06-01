import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface InstalledParadigmEntry {
  name: string;
  version?: string;
  description?: string;
  author?: string;
  tags?: string[];
  license?: string;
  homepage?: string;
  maestroVersion?: string;
  source: string;
  installedAt: string;
  path: string;
  paradigm: string;
}

export interface ParadigmIndex {
  version: 1;
  paradigms: InstalledParadigmEntry[];
}

export function getParadigmRegistryRoot(
  cwd: string = process.cwd(),
  customDir?: string
): string {
  return resolve(cwd, customDir ?? ".maestro/paradigms");
}

export function getParadigmIndexPath(registryRoot: string): string {
  return join(registryRoot, "index.json");
}

export function readParadigmIndex(registryRoot: string): ParadigmIndex {
  const indexPath = getParadigmIndexPath(registryRoot);
  if (!existsSync(indexPath)) {
    return { version: 1, paradigms: [] };
  }

  const parsed = JSON.parse(readFileSync(indexPath, "utf-8")) as Partial<ParadigmIndex>;
  return {
    version: 1,
    paradigms: Array.isArray(parsed.paradigms) ? parsed.paradigms : [],
  };
}

export function writeParadigmIndex(registryRoot: string, index: ParadigmIndex): void {
  mkdirSync(registryRoot, { recursive: true });
  writeFileSync(
    getParadigmIndexPath(registryRoot),
    `${JSON.stringify(index, null, 2)}\n`,
    "utf-8"
  );
}

export function findInstalledParadigm(
  name: string,
  cwd: string = process.cwd()
): InstalledParadigmEntry | undefined {
  const registryRoot = getParadigmRegistryRoot(cwd);
  const index = readParadigmIndex(registryRoot);
  return index.paradigms.find((entry) => entry.name === name);
}

export function sanitizeParadigmName(name: string): string {
  const sanitized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || "paradigm";
}
