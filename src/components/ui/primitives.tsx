"use client";

import { cn } from "@/lib/utils";

export function Chip({
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "fluent-focus inline-flex h-[27px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] whitespace-nowrap transition-colors",
        className,
      )}
      style={{
        borderColor: active ? "var(--accent-line)" : "var(--stroke2)",
        background: active ? "var(--accent-soft)" : "var(--fill2)",
        color: active ? "var(--accent-ink)" : "var(--text2)",
        fontWeight: active ? 600 : 400,
      }}
      {...props}
    />
  );
}

export function ToolButton({
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "fluent-focus inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[6px] border px-2.5 text-[12px] whitespace-nowrap transition-colors disabled:opacity-55",
        className,
      )}
      style={{
        borderColor: active ? "var(--accent-line)" : "var(--stroke2)",
        background: active ? "var(--accent-soft)" : "var(--fill)",
        color: active ? "var(--accent-ink)" : "var(--text2)",
        fontWeight: active ? 600 : 400,
      }}
      {...props}
    />
  );
}

export function Tag({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "accent" | "ok" | "warn";
}) {
  const styles: Record<string, React.CSSProperties> = {
    neutral: { color: "var(--text3)", background: "var(--fill2)", borderColor: "var(--stroke2)" },
    accent: {
      color: "var(--accent-ink)",
      background: "var(--accent-soft)",
      borderColor: "var(--accent-line)",
    },
    ok: {
      color: "#0d6b3f",
      background: "color-mix(in srgb, #0d6b3f 11%, transparent)",
      borderColor: "color-mix(in srgb, #0d6b3f 24%, transparent)",
    },
    warn: {
      color: "#8a4b00",
      background: "color-mix(in srgb, #a16207 13%, transparent)",
      borderColor: "color-mix(in srgb, #a16207 26%, transparent)",
    },
  };

  return (
    <span
      className={cn(
        "inline-flex h-4 items-center rounded-[3px] border px-1.5 text-[10px] font-semibold tracking-[0.2px] whitespace-nowrap",
        className,
      )}
      style={styles[tone]}
      {...props}
    />
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex gap-0.5 rounded-[6px] border p-0.5"
      style={{ borderColor: "var(--stroke2)", background: "var(--fill2)" }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className="fluent-focus h-[26px] rounded-[4px] px-2.5 text-[11.5px] transition-colors"
            style={{
              background: active ? "var(--fill)" : "transparent",
              color: active ? "var(--text)" : "var(--text3)",
              fontWeight: active ? 600 : 400,
              boxShadow: active ? "var(--sh1)" : undefined,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="fluent-focus relative h-5 w-10 shrink-0 rounded-full border transition-colors"
      style={{
        borderColor: checked ? "transparent" : "var(--stroke2)",
        background: checked ? "var(--accent)" : "color-mix(in srgb, var(--text) 9%, transparent)",
      }}
    >
      <span
        className="absolute top-[3px] size-3 rounded-full transition-transform"
        style={{
          left: 3,
          transform: checked ? "translateX(20px)" : "none",
          background: checked ? "var(--on-accent)" : "var(--text3)",
        }}
      />
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block size-3.5 animate-spin rounded-full border-2", className)}
      style={{ borderColor: "var(--stroke2)", borderTopColor: "var(--accent)" }}
      aria-hidden
    />
  );
}
