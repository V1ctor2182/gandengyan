"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  GameState, Player, Round, Loser, DeltaRound,
  held, scoreOf, calcText, roundDeltas, totals, genRoom, isDeltaRound,
} from "@/lib/scoring";

/* 内置 Supabase（公开 anon key，靠 RLS） */
const CLOUD = {
  url: "https://xlupwlcjqwxjiqaihtjr.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsdXB3bGNqcXd4amlxYWlodGpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMTQ3OTMsImV4cCI6MjA5NzY5MDc5M30.wbLCCgYF7qIj0TYXbf-7ZcFUB_FJ4hDvLvWfJ7eLOb4",
};
const PAL = ["#2f6f4f","#c0563a","#3a6ea5","#b8902f","#8a5fb0","#4aa6a0","#c76a8e","#6b8e3a","#d08a3e","#5a6470"];

const Trash = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 12h10l1-12"/></svg>;
const XMark = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>;
const Spade = ({ cls }: { cls?: string }) => <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.6C8.7 7 4 9.3 4 13.4c0 2.4 1.9 4.1 4.1 4.1 1.1 0 2-.4 2.7-1.1-.2 1.8-1 3.1-2.3 4h7c-1.3-.9-2.1-2.2-2.3-4 .7.7 1.6 1.1 2.7 1.1 2.2 0 4.1-1.7 4.1-4.1C20 9.3 15.3 7 12 2.6Z"/></svg>;

type Draft = { winnerId: string | null; dealBomb: number; losers: Record<string, Loser> };
type Sheet = "new" | "grid" | "hist" | "players" | "room" | "menu" | "stats" | "cloud";

export default function App() {
  const [, force] = useReducer((x) => x + 1, 0);
  const rerender = () => force();

  const S = useRef<GameState>({ code: null, name: "", players: [], rounds: [] }).current;
  const sbRef = useRef<SupabaseClient | null>(null);
  const roomRef = useRef<string | null>(null);
  const draft = useRef<Draft | null>(null);
  const lastCell = useRef<{ el: HTMLInputElement; i: number; pid: string } | null>(null);
  const reloadT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mounted, setMounted] = useState(false);
  const [landing, setLanding] = useState(false);
  const [open, setOpen] = useState<Record<Sheet, boolean>>({ new:false, grid:false, hist:false, players:false, room:false, menu:false, stats:false, cloud:false });
  const [statFocus, setStatFocus] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState("");
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const room = () => roomRef.current || "";
  const sb = () => sbRef.current!;
  const show = (s: Sheet) => setOpen((o) => ({ ...o, [s]: true }));
  const hide = (s: Sheet) => setOpen((o) => ({ ...o, [s]: false }));
  function toast(msg: string) { setToastMsg(msg); if (toastT.current) clearTimeout(toastT.current); toastT.current = setTimeout(() => setToastMsg(""), 1500); }

  /* ---------- boot / 路由 ---------- */
  useEffect(() => {
    setMounted(true);
    try { sbRef.current = createClient(CLOUD.url, CLOUD.key); } catch {}
    const code = new URL(location.href).searchParams.get("g");
    if (!code) { setLanding(true); return; }
    roomRef.current = code.toUpperCase();
    loadCloud();
    subscribeCloud();
    return () => { if (sbRef.current) sbRef.current.removeAllChannels(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- 离线缓存 + 待同步队列 ---------- */
  const ccKey = () => "gdy_cc_" + room();
  const pqKey = () => "gdy_pq_" + room();
  const getPending = (): Record<string, number>[] => { try { return JSON.parse(localStorage.getItem(pqKey()) || "[]"); } catch { return []; } };
  const setPending = (a: Record<string, number>[]) => { try { localStorage.setItem(pqKey(), JSON.stringify(a)); } catch {} };

  function applyCloudState(server: { name: string; players: Player[]; rounds: Round[] }) {
    const players = server.players.slice();
    const have = new Set(players.map((p) => p.id));
    const pend = getPending();
    pend.forEach((d) => Object.keys(d).forEach((n) => { if (!have.has(n)) { have.add(n); players.push({ id: n, name: n }); } }));
    const rounds: Round[] = server.rounds.concat(pend.map((d) => ({ deltas: d, _pending: true } as DeltaRound)));
    S.code = room(); S.name = server.name || S.name || ("对局 " + room()); S.players = players; S.rounds = rounds;
    rerender();
  }

  async function loadCloud() {
    try {
      const [g, r1, r2] = await Promise.all([
        sb().from("gdy_games").select("name").eq("room", room()).maybeSingle(),
        sb().from("gdy_rounds").select("id,deltas").eq("room", room()).order("id", { ascending: true }),
        sb().from("gdy_players").select("name,ord").eq("room", room()).order("ord", { ascending: true }),
      ]);
      if (r1.error) throw r1.error;
      const names: string[] = (r2.data || []).map((p: any) => p.name);
      const seen = new Set(names);
      (r1.data || []).forEach((r: any) => Object.keys(r.deltas || {}).forEach((n) => { if (!seen.has(n)) { seen.add(n); names.push(n); } }));
      const server = {
        name: (g && (g as any).data && (g as any).data.name) || ("对局 " + room()),
        players: names.map((n) => ({ id: n, name: n })),
        rounds: (r1.data || []).map((r: any) => ({ _id: r.id, deltas: r.deltas || {} } as DeltaRound)) as Round[],
      };
      try { localStorage.setItem(ccKey(), JSON.stringify(server)); } catch {}
      applyCloudState(server);
      flushQueue();
    } catch (e) {
      console.warn(e);
      let cached = null; try { cached = JSON.parse(localStorage.getItem(ccKey()) || "null"); } catch {}
      if (cached) { applyCloudState(cached); toast("离线中 · 显示本地缓存"); }
      else toast("数据加载失败，请稍后重试");
    }
  }
  function subscribeCloud() {
    sb().channel("gdy-" + room())
      .on("postgres_changes", { event: "*", schema: "public", table: "gdy_rounds", filter: "room=eq." + room() }, reloadSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "gdy_players", filter: "room=eq." + room() }, reloadSoon)
      .subscribe();
    window.addEventListener("online", () => { toast("已联网 · 同步中"); loadCloud(); });
  }
  function reloadSoon() { if (reloadT.current) clearTimeout(reloadT.current); reloadT.current = setTimeout(loadCloud, 250); }
  function enqueueRound(deltas: Record<string, number>) {
    const pend = getPending(); pend.push(deltas); setPending(pend);
    Object.keys(deltas).forEach((n) => { if (!S.players.find((p) => p.id === n)) S.players.push({ id: n, name: n }); });
    S.rounds.push({ deltas, _pending: true });
    rerender();
  }
  async function flushQueue() {
    const pend = getPending(); if (!pend.length || !navigator.onLine) return;
    const remaining: Record<string, number>[] = [];
    for (const d of pend) { const { error } = await sb().from("gdy_rounds").insert({ room: room(), deltas: d }); if (error) remaining.push(d); }
    const changed = remaining.length !== pend.length; setPending(remaining);
    if (changed) loadCloud();
  }
  function cloudPersistRound(r: DeltaRound) {
    if (r._pending) { setPending(S.rounds.filter((x): x is DeltaRound => isDeltaRound(x) && !!x._pending).map((x) => x.deltas)); return; }
    if (r._id != null) sb().from("gdy_rounds").update({ deltas: r.deltas }).eq("id", r._id).then(({ error }) => { if (error) { toast("离线中 · 改动未同步"); console.warn(error); } });
  }
  async function cloudInsertRound(deltas: Record<string, number>) {
    if (!navigator.onLine) { enqueueRound(deltas); toast("离线已记 · 联网后同步"); return; }
    const { error } = await sb().from("gdy_rounds").insert({ room: room(), deltas });
    if (error) { enqueueRound(deltas); toast("已记 · 待联网同步"); console.warn(error); }
    else { toast("已记录"); loadCloud(); }
  }
  function cloudDeleteRound(id: number) { sb().from("gdy_rounds").delete().eq("id", id).then(({ error }) => { if (error) { toast("离线中 · 暂不能删，联网后再试"); console.warn(error); } else loadCloud(); }); }
  function cloudAddPlayer(name: string) { sb().from("gdy_players").upsert({ room: room(), name, ord: S.players.length }, { onConflict: "room,name" }).then(({ error }) => { if (error) { toast("添加失败"); console.warn(error); } else loadCloud(); }); }

  /* ---------- 落地页 ---------- */
  async function createGame(name: string, joinCode: string) {
    name = (name || "").trim();
    if (!name) { toast("给这场对局起个名字"); return; }
    const code = genRoom();
    const { error } = await sb().from("gdy_games").upsert({ room: code, name });
    if (error) { toast("创建失败"); console.warn(error); return; }
    gotoGame(code);
  }
  function gotoGame(code: string) { const u = new URL(location.href); u.searchParams.set("g", code); location.href = u.toString(); }
  function joinGame(code: string) { code = (code || "").trim().toUpperCase(); if (!code) { toast("输入场号"); return; } gotoGame(code); }
  function roomLink() { const u = new URL(location.href); u.searchParams.set("g", room()); return u.toString(); }
  async function copyText(t: string) { try { await navigator.clipboard.writeText(t); toast("链接已复制"); } catch { prompt("复制链接：", t); } }
  function shareRoom() { const l = roomLink(); if ((navigator as any).share) (navigator as any).share({ title: "干瞪眼记分 · " + (S.name || room()), url: l }).catch(() => {}); else copyText(l); }

  /* ---------- 记一局（计算器） ---------- */
  function openNew() {
    if (S.players.length < 2) { alert("至少需要 2 个玩家"); return; }
    const losers: Record<string, Loser> = {};
    S.players.forEach((p) => (losers[p.id] = { cards: 1, twos: 0, bombs: 0, allHeld: false }));
    draft.current = { winnerId: null, dealBomb: 0, losers };
    show("new"); rerender();
  }
  function draftWinSum() { const d = draft.current; if (!d) return 0; let s = 0; S.players.forEach((p) => { if (p.id !== d.winnerId) s += scoreOf(d.losers[p.id], d.dealBomb); }); return s; }
  function saveNew() {
    const d = draft.current!;
    if (!d.winnerId) { alert("请先选择赢家"); return; }
    const deltas: Record<string, number> = {}; let sum = 0;
    S.players.forEach((p) => { if (p.id === d.winnerId) return; const sc = scoreOf(d.losers[p.id], d.dealBomb); deltas[p.id] = -sc; sum += sc; });
    deltas[d.winnerId] = (deltas[d.winnerId] || 0) + sum;
    hide("new"); cloudInsertRound(deltas);
  }

  /* ---------- 表格 ---------- */
  function rowSum(r: Round) { const dd = isDeltaRound(r) ? r.deltas : roundDeltas(r, S.players); let s = 0; S.players.forEach((p) => (s += dd[p.id] || 0)); return s; }
  function ensureDelta(i: number): DeltaRound {
    let r = S.rounds[i];
    if (!isDeltaRound(r)) { r = { deltas: roundDeltas(r, S.players), _id: (r as any)._id }; S.rounds[i] = r; }
    return r as DeltaRound;
  }
  function gridSet(i: number, pid: string, raw: string) {
    const v = parseInt(raw, 10) || 0;
    const r = ensureDelta(i); r.deltas[pid] = v;
    cloudPersistRound(r); rerender();
  }
  function autoBalance(i: number) {
    const r = ensureDelta(i); const s = rowSum(r);
    if (s === 0) { toast("这一局已平账"); return; }
    const zeros = S.players.filter((p) => !r.deltas[p.id]);
    if (zeros.length !== 1) { toast("把赢家那格留 0，再点平账自动补"); return; }
    r.deltas[zeros[0].id] = -s; cloudPersistRound(r); rerender(); toast("已平账");
  }
  function gridAddRow() {
    if (!S.players.length) { toast("先添加玩家"); return; }
    const d: Record<string, number> = {}; S.players.forEach((p) => (d[p.id] = 0));
    cloudInsertRound(d);
  }
  function gridNegate() {
    const lc = lastCell.current; if (!lc) { toast("先点一个格子"); return; }
    const v = -(parseInt(lc.el.value, 10) || 0); lc.el.value = String(v); gridSet(lc.i, lc.pid, String(v));
    try { lc.el.focus(); lc.el.select(); } catch {}
  }
  function gridFocusNext(i: number, p: number) {
    const n = S.players.length; let ni = i, np = p + 1;
    if (np >= n) { ni = i + 1; np = 0; }
    if (ni >= S.rounds.length) return;
    const el = document.querySelector<HTMLInputElement>(`.gcell input[data-i="${ni}"][data-p="${np}"]`);
    if (el) el.focus();
  }

  /* ---------- 玩家 ---------- */
  function addPlayer() {
    const nm = prompt("新玩家名字");
    if (nm && nm.trim()) { cloudAddPlayer(nm.trim()); hide("players"); }
  }

  /* ---------- 菜单 ---------- */
  function undoLast() {
    if (!S.rounds.length) { alert("没有可撤销的局"); return; }
    const last = S.rounds[S.rounds.length - 1];
    if (isDeltaRound(last) && last._id != null) cloudDeleteRound(last._id);
    hide("menu");
  }

  if (!mounted) return <div className="wrap" />;

  const t = totals(S.players, S.rounds);
  const order = [...S.players].sort((a, b) => t[b.id] - t[a.id]);
  const max = order.length ? Math.max(...order.map((p) => t[p.id])) : 0;
  const sgn = (v: number) => (v > 0 ? "+" : "") + v;

  return (
    <>
      {/* 落地页 */}
      <Landing on={landing} onCreate={createGame} onJoin={joinGame} />

      <div className="wrap">
        <header>
          <div className="brand">
            <Spade cls="mk" />
            <div>
              <h1>干瞪眼记分</h1>
              <div className="sub">Scorecard</div>
            </div>
          </div>
          <div className="hbtns">
            <button className="icon-btn" aria-label="战绩走势" onClick={() => { setStatFocus(null); show("stats"); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4v15.5a.5.5 0 0 0 .5.5H20"/><path d="M7.5 14.5 11 10l3 2.5 4-5.5"/></svg>
            </button>
            <button className="icon-btn" aria-label="历史" onClick={() => show("hist")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.6V12l3 1.8"/></svg>
            </button>
            <button className="icon-btn" aria-label="更多" onClick={() => show("menu")}>
              <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
            </button>
          </div>
        </header>

        {/* 本场条 */}
        <div className="sessionbar" onClick={() => show("room")}>
          <span className="sicon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.3A3.5 3.5 0 0 1 18 18H7Z"/></svg></span>
          <div className="st">
            <div className="snm">{S.name || "对局"}</div>
            <div className="smeta">{(room() ? room() + " · " : "") + S.rounds.length + " 局 · 点此分享 / 换场"}</div>
          </div>
          <span className="chev">分享 ›</span>
        </div>

        <div className="sec-head"><span className="t">总分榜</span><span className="meta">{S.rounds.length ? "已记 " + S.rounds.length + " 局" : "尚无记录"}</span></div>

        <div className="board">
          {!S.players.length ? (
            <div className="emptybig">
              <div className="eb-t">先把牌友加进来</div>
              <div className="eb-s">添加玩家后就能记分、用表格录入。</div>
              <button className="btn btn-primary" onClick={addPlayer}>添加玩家</button>
              <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => show("grid")}>表格录入</button>
            </div>
          ) : order.map((p, i) => {
            const v = t[p.id]; const lead = S.rounds.length > 0 && v === max && v > 0;
            return (
              <div className={"prow" + (lead ? " lead" : "")} key={p.id}>
                <div className="rank">{i + 1}</div>
                <div className="nm">{p.name}{lead && <span className="lead-tag">领先</span>}</div>
                <div className={"sc num " + (v > 0 ? "pos" : v < 0 ? "neg" : "zero")}>{sgn(v)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 底部操作条 */}
      <div className="fab">
        <div className="fab-tip">习惯用表格的，点「表格」可整行录入、随手改分</div>
        <div className="fab-row">
          <button className="btn btn-ghost" aria-label="玩家" onClick={() => show("players")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8.5" r="3.1"/><path d="M3.8 18.6c0-2.9 2.4-4.7 5.2-4.7s5.2 1.8 5.2 4.7"/><path d="M16 5.7a3 3 0 0 1 0 5.4"/><path d="M17.3 13.6c2.2.5 3.6 2 3.6 4.4"/></svg>玩家
          </button>
          <button className="btn btn-primary" onClick={openNew}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"><path d="M12 6v12M6 12h12"/></svg>记一局
          </button>
          <button className="btn fab-grid" aria-label="表格录入" onClick={() => show("grid")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9 4.5v15M15 4.5v15"/></svg>表格
          </button>
        </div>
      </div>

      <div className={"toast" + (toastMsg ? " on" : "")}>{toastMsg}</div>

      {/* ---- 记一局 ---- */}
      <Mask on={open.new} onClose={() => hide("new")}>
        <div className="grip" /><h3>记一局</h3>
        <RecordSheet draft={draft} players={S.players} onChange={rerender} winSum={draftWinSum()} />
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={() => hide("new")}>取消</button>
          <button className="btn btn-primary" onClick={saveNew}>确认记录</button>
        </div>
      </Mask>

      {/* ---- 表格 ---- */}
      <Mask on={open.grid} onClose={() => hide("grid")}>
        <div className="grip" /><h3>表格录入</h3>
        <GridSheet S={S} t={t} rowSum={rowSum} gridSet={gridSet} autoBalance={autoBalance} lastCell={lastCell} focusNext={gridFocusNext} />
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={gridAddRow}>＋ 加一局</button>
          <button className="btn btn-ghost" style={{ flex: "0 0 auto", padding: "14px 20px", fontSize: 18 }} onClick={gridNegate}>±</button>
          <button className="btn btn-ghost" onClick={() => hide("grid")}>关闭</button>
        </div>
        <div className="note" style={{ marginTop: 8 }}>点单元格直接改分。手机输负数：选中格子打数字后点 <b>±</b> 变负。「平账」列每局应为 0；不平时点它，把差额自动补到留空(0)的那格（赢家）。改动即时保存。</div>
      </Mask>

      {/* ---- 历史 ---- */}
      <Mask on={open.hist} onClose={() => hide("hist")}>
        <div className="grip" /><h3>对局历史</h3>
        <HistorySheet S={S} onDelete={(r) => { if (isDeltaRound(r) && r._id != null) cloudDeleteRound(r._id); hide("hist"); }} />
        <button className="btn btn-ghost" style={{ marginTop: 6 }} onClick={() => hide("hist")}>关闭</button>
      </Mask>

      {/* ---- 玩家 ---- */}
      <Mask on={open.players} onClose={() => hide("players")}>
        <div className="grip" /><h3>玩家设置</h3>
        <div>
          {S.players.map((p, i) => (
            <div className="prow-edit" key={p.id}>
              <input defaultValue={p.name} readOnly placeholder={"玩家" + (i + 1)} />
              <button className="rm" aria-label="删除玩家" onClick={() => toast("联机对局暂不支持在这改名/删除玩家")}><XMark /></button>
            </div>
          ))}
        </div>
        <button className="btn addp" style={{ margin: "4px 0 14px" }} onClick={addPlayer}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 6v12M6 12h12"/></svg>添加玩家
        </button>
        <div className="note">2–12 人。改名/删除请在数据后台调整。</div>
        <button className="btn btn-ghost" style={{ marginTop: 14 }} onClick={() => hide("players")}>完成</button>
      </Mask>

      {/* ---- 本场 ---- */}
      <Mask on={open.room} onClose={() => hide("room")}>
        <div className="grip" /><h3>{S.name || "本场"}</h3>
        <div className="codebig">{room()}</div>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={shareRoom}>分享链接</button>
          <button className="btn btn-ghost" onClick={() => copyText(roomLink())}>复制链接</button>
        </div>
        <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => { hide("room"); setLanding(true); }}>新开一场</button>
        <div className="label">加入别的场</div>
        <RoomJoin onJoin={joinGame} />
        <div className="note" style={{ marginTop: 10 }}>把链接发给牌友，打开就是这一场、实时同步。不同的场 = 不同链接，互不相见。</div>
        <button className="btn btn-ghost" style={{ marginTop: 14 }} onClick={() => hide("room")}>关闭</button>
      </Mask>

      {/* ---- 更多 ---- */}
      <Mask on={open.menu} onClose={() => hide("menu")}>
        <div className="grip" /><h3>更多</h3>
        <div className="menu-item"><button className="btn btn-ghost" onClick={undoLast}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 7 5 11l4 4"/><path d="M5 11h9a5 5 0 0 1 0 10"/></svg>撤销最近一局
        </button></div>
        <div className="rulebox note">
          <b>算分规则</b><br />
          每个输家：剩牌数 × 2^(2的个数) × 2^(炸弹个数) ×（剩牌≥5 关到底 ×2）× 2^(场上炸弹数)，封顶 100。<br />
          赢家收走所有输家之和（零和）。三张及以上算炸弹，2 不入顺，能拆炸弹。
        </div>
        <button className="btn btn-ghost" style={{ marginTop: 14 }} onClick={() => hide("menu")}>关闭</button>
      </Mask>

      {/* ---- 战绩 ---- */}
      <Mask on={open.stats} onClose={() => hide("stats")}>
        <div className="grip" /><h3>战绩 · 走势</h3>
        <StatsSheet S={S} t={t} statFocus={statFocus} setStatFocus={setStatFocus} />
        <button className="btn btn-ghost" style={{ marginTop: 14 }} onClick={() => hide("stats")}>关闭</button>
      </Mask>
    </>
  );
}

/* ============ 子组件 ============ */
function Mask({ on, onClose, children }: { on: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className={"mask" + (on ? " on" : "")} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">{children}</div>
    </div>
  );
}

function Landing({ on, onCreate, onJoin }: { on: boolean; onCreate: (n: string, j: string) => void; onJoin: (c: string) => void }) {
  const [name, setName] = useState(""); const [code, setCode] = useState("");
  return (
    <div className={"landing" + (on ? " on" : "")}>
      <div className="land-card">
        <div className="land-logo"><Spade /></div>
        <h1 className="land-title">干瞪眼记分</h1>
        <p className="land-sub">创建一场对局，得到一个专属链接，发给牌友就能一起记、实时同步。</p>
        <input className="cinput land-in" placeholder="给这场起个名字，如「周五局」" maxLength={20} value={name}
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onCreate(name, ""); }} />
        <button className="btn btn-primary" onClick={() => onCreate(name, "")}>创建对局</button>
        <div className="land-or">或加入别人的对局</div>
        <div className="joinrow">
          <input className="cinput" placeholder="输入 5 位场号" maxLength={5} value={code} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <button className="btn btn-ghost" style={{ width: "auto", padding: "13px 20px" }} onClick={() => onJoin(code)}>加入</button>
        </div>
      </div>
    </div>
  );
}

function RoomJoin({ onJoin }: { onJoin: (c: string) => void }) {
  const [code, setCode] = useState("");
  return (
    <div className="joinrow">
      <input className="cinput" placeholder="输入 5 位场号" maxLength={5} value={code} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
        onChange={(e) => setCode(e.target.value.toUpperCase())} />
      <button className="btn btn-primary" style={{ width: "auto", padding: "13px 18px" }} onClick={() => onJoin(code)}>加入</button>
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <div className="sl">{label}</div>
      <div className="ctrl">
        <button disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
        <div className="v num">{value}</div>
        <button disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
      </div>
    </div>
  );
}

function RecordSheet({ draft, players, onChange, winSum }: { draft: React.MutableRefObject<Draft | null>; players: Player[]; onChange: () => void; winSum: number }) {
  const d = draft.current; if (!d) return null;
  const upd = () => onChange();
  return (
    <>
      <div className="label">谁赢了（先出完牌的）</div>
      <div className="chips">
        {players.map((p) => (
          <div key={p.id} className={"chip" + (d.winnerId === p.id ? " on" : "")} onClick={() => { d.winnerId = p.id; upd(); }}>{p.name}</div>
        ))}
      </div>
      {!d.winnerId ? (
        <div className="note" style={{ margin: "16px 2px" }}>先选出赢家，再录入其余玩家的剩牌。</div>
      ) : (
        <>
          <div className="label">输家剩牌（赢家自动跳过）</div>
          {players.filter((p) => p.id !== d.winnerId).map((p) => {
            const L = d.losers[p.id];
            return (
              <div className="lcard" key={p.id}>
                <div className="top"><div className="lnm">{p.name}</div><div className="lsc num">{"−" + scoreOf(L, d.dealBomb)}</div></div>
                <div className="calc">{calcText(L, d.dealBomb)}</div>
                <div className="stepgrid">
                  <Stepper label="剩牌" value={L.cards} min={0} max={6} onChange={(v) => { L.cards = v; upd(); }} />
                  <Stepper label="2 的个数" value={L.twos} min={0} max={4} onChange={(v) => { L.twos = v; upd(); }} />
                  <Stepper label="炸弹个数" value={L.bombs} min={0} max={2} onChange={(v) => { L.bombs = v; upd(); }} />
                  <div className={"heldhint" + (held(L) ? " on" : "")}><span>满手关到底 ×2</span></div>
                </div>
              </div>
            );
          })}
        </>
      )}
      <div className="dealbomb">
        <div className="t"><div className="b1">本局场上出过的炸弹数</div><div className="b2">每个炸弹，所有输家再 ×2</div></div>
        <div className="ctrl">
          <button disabled={d.dealBomb <= 0} onClick={() => { d.dealBomb--; upd(); }}>−</button>
          <div className="v num">{d.dealBomb}</div>
          <button disabled={d.dealBomb >= 6} onClick={() => { d.dealBomb++; upd(); }}>+</button>
        </div>
      </div>
      <div className="winsum">{d.winnerId ? (players.find((p) => p.id === d.winnerId)?.name + " 赢得 +" + winSum) : ""}</div>
    </>
  );
}

function GridCell({ i, p, value, onCommit, onFocusCell, focusNext, lastCell }: {
  i: number; p: number; value: number; onCommit: (v: string) => void;
  onFocusCell: (el: HTMLInputElement) => void; focusNext: (i: number, p: number) => void; lastCell: React.MutableRefObject<any>;
}) {
  return (
    <td className="gcell">
      <input
        key={value}
        defaultValue={value}
        data-i={i} data-p={p}
        inputMode="numeric"
        onFocus={(e) => { const el = e.currentTarget; onFocusCell(el); setTimeout(() => { try { el.select(); } catch {} try { el.scrollIntoView({ block: "center" }); } catch {} }, 0); }}
        onChange={(e) => onCommit(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); onCommit(e.currentTarget.value); focusNext(i, p); } }}
      />
    </td>
  );
}

function GridSheet({ S, t, rowSum, gridSet, autoBalance, lastCell, focusNext }: {
  S: GameState; t: Record<string, number>; rowSum: (r: Round) => number;
  gridSet: (i: number, pid: string, raw: string) => void; autoBalance: (i: number) => void;
  lastCell: React.MutableRefObject<any>; focusNext: (i: number, p: number) => void;
}) {
  const players = S.players;
  if (!players.length) return <div className="empty">先添加玩家，再用表格录入。</div>;
  const balTxt = (s: number) => (s === 0 ? "平" : (s > 0 ? "+" : "") + s);
  let gt = 0;
  return (
    <div className="gridwrap">
      <table className="gtable">
        <thead><tr><th className="idx">局</th>{players.map((p) => <th key={p.id}>{p.name}</th>)}<th>平账</th></tr></thead>
        <tbody>
          {S.rounds.map((r, i) => {
            const dd = isDeltaRound(r) ? r.deltas : roundDeltas(r, players);
            const s = rowSum(r);
            return (
              <tr key={i}>
                <td className="idx">{i + 1}</td>
                {players.map((p, j) => (
                  <GridCell key={p.id} i={i} p={j} value={dd[p.id] || 0}
                    onCommit={(raw) => gridSet(i, p.id, raw)}
                    onFocusCell={(el) => (lastCell.current = { el, i, pid: p.id })}
                    focusNext={focusNext} lastCell={lastCell} />
                ))}
                <td className={"gbal " + (s === 0 ? "ok" : "bad")} onClick={() => autoBalance(i)}>{balTxt(s)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="gtot">
            <td className="idx">累计</td>
            {players.map((p) => { const v = t[p.id]; gt += v; return <td key={p.id} className={v > 0 ? "pos" : v < 0 ? "neg" : ""}>{(v > 0 ? "+" : "") + v}</td>; })}
            <td className={"gbal " + (gt === 0 ? "ok" : "bad")}>{balTxt(gt)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function HistorySheet({ S, onDelete }: { S: GameState; onDelete: (r: Round) => void }) {
  if (!S.rounds.length) return <div className="empty">还没有记录</div>;
  const nameOf = (id: string) => S.players.find((p) => p.id === id)?.name ?? "(已删)";
  const roundSumCalc = (r: any) => { let s = 0; S.players.forEach((p) => { if (p.id !== r.winnerId) s += scoreOf(r.losers[p.id], r.dealBomb); }); return s; };
  return (
    <div>
      {[...S.rounds].reverse().map((r, ri) => {
        const idx = S.rounds.length - ri;
        if (isDeltaRound(r)) {
          let tId: string | null = null, tV = -Infinity;
          for (const id in r.deltas) if (r.deltas[id] > tV) { tV = r.deltas[id]; tId = id; }
          return (
            <div className="hrow" key={ri}>
              <div className="hh">
                <div className="hidx">{"第 " + idx + " 局"}</div>
                <div className="win">{"导入" + (tId ? " · " + nameOf(tId) + " +" + tV : "")}</div>
                <button className="del" aria-label="删除" onClick={() => onDelete(r)}><Trash /></button>
              </div>
              <div className="hd">{Object.keys(r.deltas).map((id) => { const v = r.deltas[id]; return <div className="pill" key={id}>{nameOf(id)}<b className={v >= 0 ? "up" : ""}>{(v >= 0 ? "+" : "") + v}</b></div>; })}</div>
            </div>
          );
        }
        const rc: any = r;
        return (
          <div className="hrow" key={ri}>
            <div className="hh">
              <div className="hidx">{"第 " + idx + " 局" + (rc.dealBomb ? " · 场上炸弹 ×" + rc.dealBomb : "")}</div>
              <div className="win">{nameOf(rc.winnerId) + " 赢 +" + roundSumCalc(rc)}</div>
              <button className="del" aria-label="删除" onClick={() => onDelete(r)}><Trash /></button>
            </div>
            <div className="hd">{Object.keys(rc.losers).map((id) => { const l = rc.losers[id]; let extra = ""; if (l.twos) extra += " " + l.twos + "个2"; if (l.bombs) extra += " " + l.bombs + "炸"; if (held(l)) extra += " 关"; return <div className="pill" key={id}>{nameOf(id) + " 剩" + l.cards + extra}<b>{"−" + scoreOf(l, rc.dealBomb)}</b></div>; })}</div>
          </div>
        );
      })}
    </div>
  );
}

function StatsSheet({ S, t, statFocus, setStatFocus }: { S: GameState; t: Record<string, number>; statFocus: string | null; setStatFocus: (s: string | null) => void }) {
  const players = S.players, N = S.rounds.length;
  if (!N) return <div className="empty">这盘还没有记录，记几局后再来看走势。</div>;
  const cum: Record<string, number[]> = {}, per: Record<string, number[]> = {};
  players.forEach((p) => { cum[p.id] = [0]; per[p.id] = []; });
  S.rounds.forEach((r) => { const d = roundDeltas(r, players); players.forEach((p) => { const v = d[p.id] || 0; per[p.id].push(v); cum[p.id].push(cum[p.id][cum[p.id].length - 1] + v); }); });
  let minY = 0, maxY = 0; players.forEach((p) => cum[p.id].forEach((v) => { if (v < minY) minY = v; if (v > maxY) maxY = v; }));
  const W = 720, H = 300, pL = 8, pR = 8, pT = 16, pB = 18, span = (maxY - minY) || 1;
  const X = (k: number) => pL + (N ? k / N : 0) * (W - pL - pR), Y = (v: number) => pT + (maxY - v) / span * (H - pT - pB);
  const sorted = [...players].map((p, i) => ({ p, i })).sort((a, b) => (statFocus === a.p.id ? 1 : 0) - (statFocus === b.p.id ? 1 : 0));
  const tot = t; const rank = [...players].sort((a, b) => tot[b.id] - tot[a.id]);
  const lead = rank.length > 1 ? tot[rank[0].id] - tot[rank[1].id] : (rank[0] ? tot[rank[0].id] : 0);
  let best = { v: -Infinity, n: "", k: 0 }, worst = { v: Infinity, n: "", k: 0 };
  players.forEach((p) => per[p.id].forEach((v, k) => { if (v > best.v) best = { v, n: p.name, k }; if (v < worst.v) worst = { v, n: p.name, k }; }));
  const stdv = (a: number[]) => { if (!a.length) return 0; const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length); };
  let calm = { s: Infinity, n: "" }, wild = { s: -Infinity, n: "" };
  players.forEach((p) => { const s = stdv(per[p.id]); if (s < calm.s) calm = { s, n: p.name }; if (s > wild.s) wild = { s, n: p.name }; });
  const Card = (k: string, v: React.ReactNode, s: string) => <div className="statcard"><div className="k">{k}</div><div className="v">{v}</div><div className="s">{s}</div></div>;
  return (
    <div>
      <div className="chartbox">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
          <line x1={pL} y1={Y(0)} x2={W - pR} y2={Y(0)} style={{ stroke: "var(--line)" }} strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <text x={pL + 2} y={pT + 9} fontSize="15" style={{ fill: "var(--faint)" }}>{"+" + maxY}</text>
          <text x={pL + 2} y={H - pB + 13} fontSize="15" style={{ fill: "var(--faint)" }}>{minY}</text>
          {sorted.map(({ p, i }) => {
            const pts = cum[p.id].map((v, k) => X(k).toFixed(1) + "," + Y(v).toFixed(1)).join(" ");
            const dim = statFocus && statFocus !== p.id;
            return dim
              ? <polyline key={p.id} points={pts} fill="none" style={{ stroke: "var(--line)" }} strokeOpacity="0.7" strokeWidth="1.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              : <polyline key={p.id} points={pts} fill="none" stroke={PAL[i % PAL.length]} strokeWidth={statFocus === p.id ? 3.2 : 2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />;
          })}
        </svg>
        <div className="legend">
          {players.map((p, i) => { const sel = statFocus === p.id, dim = statFocus && !sel; return (
            <div key={p.id} className={"lgi" + (sel ? " sel" : "") + (dim ? " dim" : "")} onClick={() => setStatFocus(statFocus === p.id ? null : p.id)}>
              <span className="sw" style={{ background: PAL[i % PAL.length] }} />{p.name}
            </div>
          ); })}
        </div>
        <div className="note" style={{ marginTop: 8 }}>纵轴 = 累计总分，横轴 = 第几局。点下面名字可单独看某人。</div>
      </div>
      <div className="statgrid">
        {Card("领先优势", "+" + lead, (rank[0]?.name || "") + " 居首 +" + (rank[0] ? tot[rank[0].id] : 0))}
        {Card("局数", N + " 局", players.length + " 人参战")}
        {Card("单局最高", (best.v > 0 ? "+" : "") + best.v, best.n + " · 第" + (best.k + 1) + "局")}
        {Card("单局最低", String(worst.v), worst.n + " · 第" + (worst.k + 1) + "局")}
        {Card("最稳", calm.n, "每局波动 ±" + calm.s.toFixed(0))}
        {Card("最浪", wild.n, "每局波动 ±" + wild.s.toFixed(0))}
      </div>
      <div className="label" style={{ marginTop: 14 }}>每人战绩</div>
      <div className="sttable">
        <div className="r head"><span className="rk">#</span><span className="nm">玩家</span><span className="col">总分</span><span className="col">最佳</span><span className="col">最差</span></div>
        {rank.map((p, idx) => {
          const pi = players.indexOf(p), a = per[p.id], bb = a.length ? Math.max(...a) : 0, ww = a.length ? Math.min(...a) : 0, v = tot[p.id];
          return (
            <div className="r" key={p.id}>
              <span className="rk">{idx + 1}</span>
              <span className="nm"><span className="sw" style={{ background: PAL[pi % PAL.length] }} />{p.name}</span>
              <span className="col" style={{ fontWeight: 700, color: v > 0 ? "var(--accent)" : v < 0 ? "var(--brick)" : "var(--faint)" }}>{(v > 0 ? "+" : "") + v}</span>
              <span className="col" style={{ color: "var(--accent)" }}>{(bb > 0 ? "+" : "") + bb}</span>
              <span className="col" style={{ color: "var(--brick)" }}>{ww}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
