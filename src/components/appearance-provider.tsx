"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export const ACCENT_PRESETS = [
  { id: "fluent-blue", label: "Fluent 蓝", light: "#0f6cbd", dark: "#60cdff", ink: "#0b5392", inkDark: "#9adcff" },
  { id: "teal", label: "青", light: "#0f766e", dark: "#5eead4", ink: "#0f5c56", inkDark: "#8ff0e2" },
  { id: "violet", label: "紫", light: "#6d28d9", dark: "#c4b5fd", ink: "#5b21b6", inkDark: "#ddd6fe" },
  { id: "amber", label: "琥珀", light: "#a16207", dark: "#fcd34d", ink: "#854d0e", inkDark: "#fde68a" },
  { id: "rose", label: "玫红", light: "#be123c", dark: "#fda4af", ink: "#9f1239", inkDark: "#fecdd3" },
  { id: "slate", label: "石墨", light: "#475569", dark: "#cbd5e1", ink: "#334155", inkDark: "#e2e8f0" },
] as const;

export type AccentId = (typeof ACCENT_PRESETS)[number]["id"] | "custom";
export type Density = "comfortable" | "compact";
export type ThemeMode = "system" | "light" | "dark";

interface AppearanceState {
  theme: ThemeMode;
  density: Density;
  acrylic: boolean;
  accentId: AccentId;
  customAccent: string;
  setTheme: (t: ThemeMode) => void;
  setDensity: (d: Density) => void;
  setAcrylic: (v: boolean) => void;
  setAccent: (id: AccentId, custom?: string) => void;
  /** True until persisted preferences have been read on the client. */
  ready: boolean;
}

const STORAGE_KEY = "llminfo.appearance.v1";

const AppearanceContext = createContext<AppearanceState | null>(null);

function readStored(): Partial<{
  theme: ThemeMode;
  density: Density;
  acrylic: boolean;
  accentId: AccentId;
  customAccent: string;
}> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, never>) : {};
  } catch {
    return {};
  }
}

/** Below this width the app defaults to light, per the product decision. */
const MOBILE_BREAKPOINT = 1024;

function defaultTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";
  // Desktop follows the OS; phones default to light regardless of OS setting.
  if (window.innerWidth < MOBILE_BREAKPOINT) return "light";
  return "system";
}

function prefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("system");
  const [density, setDensityState] = useState<Density>("comfortable");
  const [acrylic, setAcrylicState] = useState(true);
  const [accentId, setAccentIdState] = useState<AccentId>("fluent-blue");
  const [customAccent, setCustomAccentState] = useState("#0f6cbd");
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage once, so SSR markup and first client render agree.
  useEffect(() => {
    const stored = readStored();
    setThemeState(stored.theme ?? defaultTheme());
    setDensityState(stored.density ?? "comfortable");
    setAcrylicState(stored.acrylic ?? true);
    setAccentIdState(stored.accentId ?? "fluent-blue");
    setCustomAccentState(stored.customAccent ?? "#0f6cbd");
    setReady(true);
  }, []);

  const persist = useCallback(
    (patch: Record<string, unknown>) => {
      try {
        const current = readStored();
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
      } catch {
        // storage disabled — preferences simply won't persist
      }
    },
    [],
  );

  const setTheme = useCallback(
    (next: ThemeMode) => {
      setThemeState(next);
      persist({ theme: next });
    },
    [persist],
  );

  const setDensity = useCallback(
    (next: Density) => {
      setDensityState(next);
      persist({ density: next });
    },
    [persist],
  );

  const setAcrylic = useCallback(
    (next: boolean) => {
      setAcrylicState(next);
      persist({ acrylic: next });
    },
    [persist],
  );

  const setAccent = useCallback(
    (id: AccentId, custom?: string) => {
      setAccentIdState(id);
      if (custom) setCustomAccentState(custom);
      persist({ accentId: id, ...(custom ? { customAccent: custom } : {}) });
    },
    [persist],
  );

  // Resolve "system" against the live media query and keep listening.
  useEffect(() => {
    if (!ready) return;
    const root = document.documentElement;

    const apply = () => {
      const resolved = theme === "system" ? (prefersDark() ? "dark" : "light") : theme;
      root.classList.toggle("dark", resolved === "dark");
      root.dataset.theme = resolved;
    };

    apply();

    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme, ready]);

  // Push density, material mode and accent colour onto :root as CSS variables.
  useEffect(() => {
    if (!ready) return;
    const root = document.documentElement;
    root.dataset.density = density;
    root.dataset.acrylic = acrylic ? "on" : "off";

    const preset = ACCENT_PRESETS.find((p) => p.id === accentId);
    const isDark = root.classList.contains("dark");
    const base = preset ? (isDark ? preset.dark : preset.light) : customAccent;
    const ink = preset ? (isDark ? preset.inkDark : preset.ink) : customAccent;

    root.style.setProperty("--accent", base);
    root.style.setProperty("--accent-ink", ink);
    root.style.setProperty("--accent-soft", `color-mix(in srgb, ${base} 14%, transparent)`);
    root.style.setProperty("--accent-line", `color-mix(in srgb, ${base} 36%, transparent)`);
    root.style.setProperty("--on-accent", isDark ? "#003350" : "#ffffff");
  }, [accentId, customAccent, density, acrylic, ready, theme]);

  const value = useMemo<AppearanceState>(
    () => ({
      theme,
      density,
      acrylic,
      accentId,
      customAccent,
      setTheme,
      setDensity,
      setAcrylic,
      setAccent,
      ready,
    }),
    [theme, density, acrylic, accentId, customAccent, setTheme, setDensity, setAcrylic, setAccent, ready],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceState {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error("useAppearance must be used inside AppearanceProvider");
  return ctx;
}
