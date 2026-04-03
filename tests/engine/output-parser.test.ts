import { describe, expect, test } from "bun:test";
import { parseOutputFile } from "../../src/engine/output-parser.js";

describe("parseOutputFile", () => {
  test("parses valid frontmatter with approved status", () => {
    const result = parseOutputFile(
      "---\nstatus: approved\n---\nLooks good!",
      "REVIEW.md"
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.status).toBe("approved");
      expect(result.rawContent).toContain("Looks good!");
    }
  });

  test("parses valid frontmatter with rejected status", () => {
    const result = parseOutputFile(
      "---\nstatus: rejected\n---\nNeeds fixes",
      "REVIEW.md"
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.status).toBe("rejected");
    }
  });

  test("normalizes status to lowercase", () => {
    const result = parseOutputFile(
      "---\nstatus: Approved\n---\n",
      "REVIEW.md"
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.status).toBe("approved");
    }
  });

  test("trims whitespace from status", () => {
    const result = parseOutputFile(
      "---\nstatus: '  approved  '\n---\n",
      "REVIEW.md"
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.status).toBe("approved");
    }
  });

  test("null content → missing file error", () => {
    const result = parseOutputFile(null, "RESULT.md");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("was not created");
      expect(result.error).toContain("RESULT.md");
    }
  });

  test("empty content → empty file error", () => {
    const result = parseOutputFile("", "RESULT.md");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("empty");
    }
  });

  test("whitespace-only content → empty file error", () => {
    const result = parseOutputFile("   \n  \n  ", "RESULT.md");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("empty");
    }
  });

  test("no frontmatter markers → error", () => {
    const result = parseOutputFile("Just some text without frontmatter", "RESULT.md");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("no YAML frontmatter");
    }
  });

  test("invalid YAML in frontmatter → error", () => {
    const result = parseOutputFile("---\n{{invalid: yaml:\n---\n", "RESULT.md");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("invalid YAML frontmatter");
    }
  });

  test("missing status field → error", () => {
    const result = parseOutputFile("---\ntitle: something\n---\n", "RESULT.md");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('missing the "status" field');
    }
  });

  test("null status value → error", () => {
    const result = parseOutputFile("---\nstatus: null\n---\n", "RESULT.md");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("missing the");
    }
  });

  test("numeric status value → type error", () => {
    const result = parseOutputFile("---\nstatus: 123\n---\n", "RESULT.md");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("must be a string");
    }
  });

  test("boolean status value → type error", () => {
    const result = parseOutputFile("---\nstatus: true\n---\n", "RESULT.md");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("must be a string");
    }
  });

  test("frontmatter with extra fields — only reads status", () => {
    const result = parseOutputFile(
      "---\nstatus: complete\ntitle: Report\nauthor: Agent\n---\nContent",
      "RESULT.md"
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.status).toBe("complete");
    }
  });
});
