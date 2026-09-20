import { describe, expect, it } from "vitest";
import {
  DESKTOP_TIMINGS,
  MAX_MOBILE_STAGGERED_ITEMS,
  MAX_STAGGERED_ITEMS,
  MOBILE_TIMINGS,
  QUERY_SETTLE_MS,
  REMOVE_MOBILE_MS,
  REMOVE_MS,
  motionTimings,
  removalDuration,
  shouldAnimateReason,
  staggerLimit,
} from "../src/ui/motion";

describe("motion timings", () => {
  it("uses the desktop timing profile outside mobile widths", () => {
    expect(motionTimings()).toEqual(DESKTOP_TIMINGS);
  });

  it("uses the mobile timing profile on narrow viewports", () => {
    expect(motionTimings(true)).toEqual(MOBILE_TIMINGS);
    expect(removalDuration(true)).toBe(REMOVE_MOBILE_MS);
    expect(staggerLimit(true)).toBe(MAX_MOBILE_STAGGERED_ITEMS);
  });

  it("keeps the query settle and removal windows stable", () => {
    expect(QUERY_SETTLE_MS).toBe(250);
    expect(REMOVE_MS).toBe(140);
    expect(MAX_STAGGERED_ITEMS).toBe(6);
  });

  it("treats every explicit render reason as animatable", () => {
    expect(shouldAnimateReason("startup")).toBe(true);
    expect(shouldAnimateReason("tab")).toBe(true);
    expect(shouldAnimateReason("query")).toBe(true);
    expect(shouldAnimateReason("sync")).toBe(true);
    expect(shouldAnimateReason("none")).toBe(false);
  });
});
