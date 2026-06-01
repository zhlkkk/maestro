import {
  getParadigmRegistryRoot,
  readParadigmIndex,
} from "./paradigm-registry.js";

export interface ListParadigmsOptions {
  dir?: string;
}

export async function listParadigmsCommand(
  options: ListParadigmsOptions = {}
): Promise<number> {
  const registryRoot = getParadigmRegistryRoot(process.cwd(), options.dir);
  const index = readParadigmIndex(registryRoot);

  if (index.paradigms.length === 0) {
    console.log(`No installed paradigms found in ${registryRoot}`);
    return 0;
  }

  console.log(`Installed paradigms in ${registryRoot}`);
  console.log("");
  console.log("| Name | Version | Source |");
  console.log("|------|---------|--------|");

  for (const entry of index.paradigms) {
    console.log(
      `| ${entry.name} | ${entry.version ?? "-"} | ${entry.source} |`
    );
  }

  return 0;
}
