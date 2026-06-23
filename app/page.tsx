"use client";
import dynamic from "next/dynamic";

// 整个 App 依赖 window/location/crypto，纯客户端运行，关闭 SSR 避免水合问题。
const App = dynamic(() => import("@/components/App"), { ssr: false });

export default function Page() {
  return <App />;
}
