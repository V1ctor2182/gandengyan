import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // 图标用 app/icon.png、app/apple-icon.png 文件约定，Next 会自动带上 basePath。
  title: "干瞪眼记分",
  description: "干瞪眼记分 · 一个链接一场，实时同步",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "干瞪眼",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1e6f49" },
    { media: "(prefers-color-scheme: dark)", color: "#15140f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
