import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/export";

describe("csvCell", () => {
  it("passes through simple values", () => {
    expect(csvCell("claude-opus")).toBe("claude-opus");
    expect(csvCell(12.5)).toBe("12.5");
  });

  it("renders null and undefined as empty", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes values containing a comma, quote or newline", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("escapes embedded double quotes by doubling them", () => {
    expect(csvCell('a"b')).toBe('"a""b"');
  });
});

describe("toCsv", () => {
  it("joins cells with commas and rows with CRLF", () => {
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe("a,b\r\nc,d");
  });

  it("round-trips a value containing the delimiter", () => {
    const csv = toCsv([["model"], ["a,b"]]);
    expect(csv).toBe('model\r\n"a,b"');
  });
});
