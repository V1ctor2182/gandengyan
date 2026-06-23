// 干瞪眼算分 · 纯函数（无副作用、可测）。从原静态版平移而来。

export type Player = { id: string; name: string };

// 计算器记法的输家明细
export type Loser = { cards: number; twos: number; bombs: number; allHeld?: boolean };

// 一局有两种存法：计算器（winner/losers）或直接各人加减分（deltas，导入/表格用）
export type CalcRound = { winnerId: string; dealBomb: number; losers: Record<string, Loser> };
export type DeltaRound = { deltas: Record<string, number>; _id?: number; _pending?: boolean };
export type Round = CalcRound | DeltaRound;

export type GameState = {
  code: string | null;
  name: string;
  players: Player[];
  rounds: Round[];
};

export function isDeltaRound(r: Round): r is DeltaRound {
  return (r as DeltaRound).deltas !== undefined;
}

// 剩满 5 张 = 关到底，自动 ×2
export function held(l?: Loser): boolean {
  return !!(l && (l.allHeld || (l.cards || 0) >= 5));
}

export function rawScore(l: Loser, dealBomb: number): number {
  let s = Math.max(0, l.cards || 0);
  s *= Math.pow(2, l.twos || 0);
  s *= Math.pow(2, l.bombs || 0);
  if (held(l)) s *= 2;
  s *= Math.pow(2, dealBomb || 0);
  return s;
}

// 封顶 100
export function scoreOf(l: Loser | undefined, dealBomb: number): number {
  return l ? Math.min(rawScore(l, dealBomb), 100) : 0;
}

export function calcText(l: Loser | undefined, dealBomb: number): string {
  if (!l || !l.cards) return "";
  const p: string[] = [String(l.cards)];
  for (let i = 0; i < (l.twos || 0); i++) p.push("2(2)");
  for (let i = 0; i < (l.bombs || 0); i++) p.push("2(炸)");
  if (held(l)) p.push("2(关)");
  for (let i = 0; i < (dealBomb || 0); i++) p.push("2(场炸)");
  const raw = rawScore(l, dealBomb);
  let t = p.join(" × ") + " = " + raw;
  if (raw > 100) t += " → 100(封顶)";
  return t;
}

// 把任意一局换算成各人加减分（零和）
export function roundDeltas(r: Round, players: Player[]): Record<string, number> {
  if (isDeltaRound(r)) return r.deltas;
  const d: Record<string, number> = {};
  let sum = 0;
  players.forEach((p) => {
    if (p.id === r.winnerId) return;
    const sc = scoreOf(r.losers?.[p.id], r.dealBomb);
    d[p.id] = -sc;
    sum += sc;
  });
  d[r.winnerId] = (d[r.winnerId] || 0) + sum;
  return d;
}

// 累计总分
export function totals(players: Player[], rounds: Round[]): Record<string, number> {
  const t: Record<string, number> = {};
  players.forEach((p) => (t[p.id] = 0));
  rounds.forEach((r) => {
    if (isDeltaRound(r)) {
      for (const id in r.deltas) if (t[id] !== undefined) t[id] += r.deltas[id];
      return;
    }
    let sum = 0;
    players.forEach((p) => {
      if (p.id === r.winnerId) return;
      const sc = scoreOf(r.losers[p.id], r.dealBomb);
      if (t[p.id] !== undefined) t[p.id] -= sc;
      sum += sc;
    });
    if (t[r.winnerId] !== undefined) t[r.winnerId] += sum;
  });
  return t;
}

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function genRoom(): string {
  const x = crypto.getRandomValues(new Uint32Array(5));
  let s = "";
  for (let i = 0; i < 5; i++) s += ROOM_ALPHABET[x[i] % ROOM_ALPHABET.length];
  return s;
}
