import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppearanceProvider } from "@/components/appearance-provider";

export const metadata: Metadata = {
  title: "LLMinfo · 模型信息看板",
  description: "自托管的 LLM 模型信息看板：实时价格、上下文、能力与跨供应商比价。",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="mica-surface min-h-screen">
        <AppearanceProvider>{children}</AppearanceProvider>
      </body>
    </html>
  );
}
