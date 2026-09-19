"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Loader2, ShieldCheck } from "lucide-react";

type Stage = "credentials" | "totp";

export function LoginForm() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitCredentials(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        twoFactorRedirect?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        setError(data.message ?? data.error ?? "邮箱或密码不正确");
        return;
      }

      // better-auth signals that a second factor is required before a session
      // is issued, so we must not navigate yet.
      if (data.twoFactorRedirect) {
        setStage("totp");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("网络错误，请重试");
    } finally {
      setBusy(false);
    }
  }

  async function submitTotp(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const endpoint = useBackupCode
        ? "/api/auth/two-factor/verify-backup-code"
        : "/api/auth/two-factor/verify-totp";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(useBackupCode ? { code } : { code }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        setError(data.message ?? data.error ?? "验证码不正确");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("网络错误，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <div
        className="mica-acrylic-strong w-full max-w-[400px] rounded-[12px] border p-7"
        style={{ borderColor: "var(--stroke2)", boxShadow: "var(--sh3)" }}
      >
        <div className="mb-6 flex items-center gap-3">
          <span
            className="grid size-9 place-items-center rounded-[8px]"
            style={{
              background: "linear-gradient(145deg, var(--accent), var(--accent-hi))",
              color: "var(--on-accent)",
            }}
            aria-hidden
          >
            <Layers size={18} />
          </span>
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight">LLMinfo</h1>
            <p className="text-[11.5px]" style={{ color: "var(--text3)" }}>
              自托管 LLM 模型信息看板
            </p>
          </div>
        </div>

        {stage === "credentials" ? (
          <form onSubmit={submitCredentials} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium" style={{ color: "var(--text2)" }}>
                邮箱
              </span>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="fluent-focus h-9 rounded-[6px] border px-3 text-[13px] outline-none"
                style={{
                  borderColor: "var(--stroke2)",
                  background: "var(--fill)",
                  color: "var(--text)",
                }}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium" style={{ color: "var(--text2)" }}>
                密码
              </span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="fluent-focus h-9 rounded-[6px] border px-3 text-[13px] outline-none"
                style={{
                  borderColor: "var(--stroke2)",
                  background: "var(--fill)",
                  color: "var(--text)",
                }}
              />
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-[6px] border px-3 py-2 text-[12px]"
                style={{
                  borderColor: "color-mix(in srgb, #dc2626 40%, transparent)",
                  background: "color-mix(in srgb, #dc2626 10%, transparent)",
                  color: "#dc2626",
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="fluent-focus mt-1 inline-flex h-9 items-center justify-center gap-2 rounded-[6px] text-[13px] font-semibold disabled:opacity-60"
              style={{ background: "var(--accent)", color: "var(--on-accent)" }}
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              登录
            </button>
          </form>
        ) : (
          <form onSubmit={submitTotp} className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text2)" }}>
              <ShieldCheck size={14} />
              两步验证
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium" style={{ color: "var(--text2)" }}>
                {useBackupCode ? "备用码" : "6 位验证码"}
              </span>
              <input
                inputMode={useBackupCode ? "text" : "numeric"}
                required
                autoFocus
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="fluent-focus tnum h-9 rounded-[6px] border px-3 text-[13px] outline-none"
                style={{
                  borderColor: "var(--stroke2)",
                  background: "var(--fill)",
                  color: "var(--text)",
                }}
              />
            </label>

            {error && (
              <p role="alert" className="text-[12px]" style={{ color: "#dc2626" }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="fluent-focus inline-flex h-9 items-center justify-center gap-2 rounded-[6px] text-[13px] font-semibold disabled:opacity-60"
              style={{ background: "var(--accent)", color: "var(--on-accent)" }}
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              验证
            </button>

            <button
              type="button"
              onClick={() => {
                setUseBackupCode((v) => !v);
                setCode("");
                setError(null);
              }}
              className="text-[12px] underline underline-offset-2"
              style={{ color: "var(--text3)" }}
            >
              {useBackupCode ? "改用验证器验证码" : "使用备用码"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
