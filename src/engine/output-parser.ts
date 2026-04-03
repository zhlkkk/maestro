import { parse as parseYaml } from "yaml";

export interface OutputParseResult {
  success: true;
  status: string;
  rawContent: string;
}

export interface OutputParseError {
  success: false;
  error: string;
}

export type ParsedOutput = OutputParseResult | OutputParseError;

/**
 * Parse an output_file's YAML frontmatter to extract the status field.
 * Status is normalized: lowercase + trimmed.
 *
 * Handles: missing content, empty content, missing frontmatter,
 * invalid YAML, missing status field, non-string status values.
 */
export function parseOutputFile(content: string | null, fileName: string): ParsedOutput {
  if (content === null) {
    return {
      success: false,
      error: `Output file "${fileName}" was not created by the agent`,
    };
  }

  if (content.trim() === "") {
    return {
      success: false,
      error: `Output file "${fileName}" is empty (expected YAML frontmatter with status field)`,
    };
  }

  // Extract YAML frontmatter between --- markers
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return {
      success: false,
      error: `Output file "${fileName}" has no YAML frontmatter (expected "---\\nstatus: <value>\\n---" at the start)`,
    };
  }

  let frontmatter: unknown;
  try {
    frontmatter = parseYaml(frontmatterMatch[1]!);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Output file "${fileName}" has invalid YAML frontmatter: ${msg}`,
    };
  }

  if (!frontmatter || typeof frontmatter !== "object") {
    return {
      success: false,
      error: `Output file "${fileName}" frontmatter is not a YAML object`,
    };
  }

  const obj = frontmatter as Record<string, unknown>;
  const status = obj.status;

  if (status === undefined || status === null) {
    return {
      success: false,
      error: `Output file "${fileName}" frontmatter is missing the "status" field`,
    };
  }

  if (typeof status !== "string") {
    return {
      success: false,
      error: `Output file "${fileName}" status field must be a string, got ${typeof status}: ${JSON.stringify(status)}`,
    };
  }

  return {
    success: true,
    status: status.toLowerCase().trim(),
    rawContent: content,
  };
}
