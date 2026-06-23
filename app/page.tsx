import { SpadeMark } from "@/components/SpadeMark";

export default function Home() {
  return (
    <div className="mx-auto max-w-[520px] px-[18px] pb-[150px] pt-2">
      <header className="flex items-center justify-between px-0.5 pb-5 pt-4">
        <div className="flex items-center gap-[11px]">
          <SpadeMark className="h-[30px] w-[30px] flex-none text-accent" />
          <div>
            <h1 className="m-0 text-[19px] font-bold tracking-[.02em]">干瞪眼记分</h1>
            <div className="mt-0.5 text-[11px] uppercase tracking-[.18em] text-faint">Scorecard</div>
          </div>
        </div>
      </header>

      <div className="mb-3 flex items-baseline justify-between px-0.5">
        <span className="text-[12px] font-bold uppercase tracking-[.16em] text-muted">总分榜</span>
      </div>

      <div className="overflow-hidden rounded-s bg-surface shadow-card">
        <div className="px-5 pb-[30px] pt-[34px] text-center">
          <div className="mb-1.5 text-[18px] font-bold">先把牌友加进来</div>
          <div className="mx-auto mb-5 max-w-[260px] text-[13.5px] leading-relaxed text-muted">
            添加玩家后就能记分、用表格录入。
          </div>
          <button className="mx-auto block w-full max-w-[240px] rounded-c bg-accent px-4 py-[14px] text-[16px] font-semibold text-on-accent active:scale-[.99]">
            添加玩家
          </button>
        </div>
      </div>

      <p className="mt-6 text-center text-[12px] text-faint">
        P0 脚手架 · 设计与 Tailwind 已就位，功能迁移进行中
      </p>
    </div>
  );
}
