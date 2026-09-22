import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  clampPage,
  getTotalPages,
  normalizePageSize,
  pageAfterPageSizeChange,
  pageWindow,
} from "@/lib/pagination";

const items = Array.from({ length: 230 }, (_, index) => index + 1);

describe("pagination", () => {
  it("uses the approved page sizes and default", () => {
    expect(PAGE_SIZE_OPTIONS).toEqual([50, 100, 150, 200]);
    expect(DEFAULT_PAGE_SIZE).toBe(50);
    expect(normalizePageSize(75)).toBe(50);
    expect(normalizePageSize(150)).toBe(150);
  });

  it("returns a one-page range for an empty result", () => {
    const window = pageWindow([], 8, 50);
    expect(window).toMatchObject({
      items: [],
      page: 1,
      pageSize: 50,
      totalItems: 0,
      totalPages: 1,
      start: 0,
      end: 0,
    });
    expect(getTotalPages(0, 50)).toBe(1);
  });

  it("clamps pages to the available result range", () => {
    expect(clampPage(0, 230, 50)).toBe(1);
    expect(clampPage(99, 230, 50)).toBe(5);
    expect(clampPage(Number.NaN, 230, 50)).toBe(1);
  });

  it("returns the current range and sliced items", () => {
    const window = pageWindow(items, 3, 50);
    expect(window).toMatchObject({
      page: 3,
      totalPages: 5,
      start: 100,
      end: 150,
      totalItems: 230,
    });
    expect(window.items[0]).toBe(101);
    expect(window.items.at(-1)).toBe(150);
  });

  it("keeps the first visible item when changing page size", () => {
    expect(pageAfterPageSizeChange(3, 50, 100, 230)).toBe(2);
    expect(pageAfterPageSizeChange(2, 50, 100, 230)).toBe(1);
    expect(pageAfterPageSizeChange(1, 50, 200, 230)).toBe(1);
    expect(pageAfterPageSizeChange(5, 50, 50, 230)).toBe(5);
  });
});
