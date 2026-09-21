import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const artifact = path.resolve(__dirname, "..", "llminfo.html");

describe("single-file build output", () => {
  it.skipIf(!existsSync(artifact))("contains no external resources", () => {
    const html = readFileSync(artifact, "utf8");
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    expect(html).not.toMatch(/https:\/\/unpkg\.com|cdnjs|jsdelivr|esm\.sh/);
    expect(html).toContain("models.dev");
    expect(html).toContain("createElement");
  });

  it.skipIf(!existsSync(artifact))("inlines the stylesheet", () => {
    const html = readFileSync(artifact, "utf8");
    expect(html).toMatch(/<style>/);
    expect(html).toContain("--accent");
  });

  it.skipIf(!existsSync(artifact))("does not bundle removed dashboard features", () => {
    const html = readFileSync(artifact, "utf8");
    expect(html).not.toContain("echarts");
    expect(html).not.toContain("monthlyCost");
    expect(html).not.toContain("favorites");
    expect(html).not.toContain("compare-toggle");
    expect(html).not.toContain("file-spreadsheet");
  });
});
