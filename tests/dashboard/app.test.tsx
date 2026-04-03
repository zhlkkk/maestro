import { describe, expect, test } from "bun:test";
import { createOutputBuffer } from "../../src/dashboard/output-panel.js";

describe("OutputBuffer", () => {
  test("adds text and splits by newline", () => {
    const buffer = createOutputBuffer(10);
    buffer.addText("line 1\nline 2\nline 3");
    expect(buffer.getLines()).toEqual(["line 1", "line 2", "line 3"]);
  });

  test("respects max lines limit", () => {
    const buffer = createOutputBuffer(3);
    buffer.addText("a\nb\nc\nd\ne");
    expect(buffer.getLines()).toEqual(["c", "d", "e"]);
  });

  test("accumulates across multiple addText calls", () => {
    const buffer = createOutputBuffer(10);
    buffer.addText("first");
    buffer.addText("second");
    expect(buffer.getLines()).toHaveLength(2);
    expect(buffer.getLines()[0]).toBe("first");
    expect(buffer.getLines()[1]).toBe("second");
  });

  test("clear resets buffer", () => {
    const buffer = createOutputBuffer(10);
    buffer.addText("data");
    buffer.clear();
    expect(buffer.getLines()).toHaveLength(0);
  });

  test("handles empty text", () => {
    const buffer = createOutputBuffer(10);
    buffer.addText("");
    expect(buffer.getLines()).toEqual([""]);
  });
});
