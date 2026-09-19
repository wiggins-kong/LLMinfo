"use client";

import { useEffect, useRef } from "react";
import { ACCENT_PRESETS, useAppearance } from "./appearance-provider";
import { SegmentedControl, Switch } from "./ui/primitives";

export function SettingsFlyout({ onClose }: { onClose: () => void }) {
  const {
    theme,
    setTheme,
    density,
    setDensity,
    acrylic,
    setAcrylic,
    accentId,
    customAccent,
    setAccent,
  } = useAppearance();

  const ref = useRef<HTMLDivElement>(null);

  // Light dismiss: clicking outside or pressing Escape closes the flyout.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    // Defer so the click that opened the flyout does not immediately close it.
    const timer = setTimeout(() => window.addEventListener("mousedown", onPointer), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
      clearTimeout(timer);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="外观设置"
      className="mica-acrylic-strong z-30 flex w-[248px] flex-col gap-3 rounded-[8px] border p-3"
      style={{ borderColor: "var(--stroke2)", boxShadow: "var(--sh2)" }}
    >
      <h3 className="text-[11px] font-bold tracking-[0.6px] uppercase" style={{ color: "var(--text4)" }}>
        主题
      </h3>
      <SegmentedControl
        label="主题"
        value={theme}
        onChange={setTheme}
        options={[
          { value: "system", label: "跟随系统" },
          { value: "light", label: "亮色" },
          { value: "dark", label: "暗色" },
        ]}
      />

      <h3 className="text-[11px] font-bold tracking-[0.6px] uppercase" style={{ color: "var(--text4)" }}>
        表格密度
      </h3>
      <SegmentedControl
        label="表格密度"
        value={density}
        onChange={setDensity}
        options={[
          { value: "comfortable", label: "舒适" },
          { value: "compact", label: "紧凑" },
        ]}
      />

      <div className="flex items-center justify-between gap-2.5 text-[12px]" style={{ color: "var(--text2)" }}>
        <span>毛玻璃材质</span>
        <Switch checked={acrylic} onChange={setAcrylic} label="毛玻璃材质" />
      </div>

      <h3 className="text-[11px] font-bold tracking-[0.6px] uppercase" style={{ color: "var(--text4)" }}>
        强调色
      </h3>
      <div className="grid grid-cols-6 gap-1.5">
        {ACCENT_PRESETS.map((preset) => {
          const active = accentId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              aria-label={preset.label}
              aria-pressed={active}
              onClick={() => setAccent(preset.id)}
              className="fluent-focus grid size-7 place-items-center rounded-[6px] border transition-transform"
              style={{
                background: preset.light,
                borderColor: active ? "var(--text)" : "var(--stroke2)",
                transform: active ? "scale(1.06)" : undefined,
              }}
            >
              {active && <span className="text-[11px] text-white">✓</span>}
            </button>
          );
        })}
      </div>

      <label className="flex items-center justify-between gap-2.5 text-[12px]" style={{ color: "var(--text2)" }}>
        <span>自定义</span>
        <input
          type="color"
          value={customAccent}
          onChange={(e) => setAccent("custom", e.target.value)}
          aria-label="自定义强调色"
          className="fluent-focus h-7 w-12 cursor-pointer rounded-[6px] border bg-transparent"
          style={{ borderColor: "var(--stroke2)" }}
        />
      </label>

      <p className="text-[11px] leading-relaxed" style={{ color: "var(--text3)" }}>
        价格为 USD / 百万 token。关闭毛玻璃会退回不透明表面，便于对比滚动性能。
      </p>
    </div>
  );
}
