import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE, readLocalData, writeLocalData } from "@/lib/client-store";

describe("local data", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => void store.clear(),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("ignores old fields and returns a v2 default", () => {
    localStorage.setItem(
      "llminfo.data.v1",
      JSON.stringify({
        version: 1,
        favorites: ["old/model"],
        compare: ["old/model"],
        savedViews: [{ id: "1", name: "old", query: "q=old" }],
        appearance: { ...DEFAULT_APPEARANCE, theme: "dark" },
      }),
    );
    const data = readLocalData();
    expect(data).toEqual({ version: 2, appearance: DEFAULT_APPEARANCE, splitRatio: 0.38 });
  });

  it("persists appearance and a clamped split ratio", () => {
    writeLocalData({
      version: 2,
      appearance: { ...DEFAULT_APPEARANCE, density: "compact" },
      splitRatio: 0.2,
    });
    const data = readLocalData();
    expect(data.appearance.density).toBe("compact");
    expect(data.splitRatio).toBe(0.24);
  });
});
