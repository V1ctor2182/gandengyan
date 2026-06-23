# 干瞪眼 · 架构设计方案（记分 → 可在线对战）

> 目标：在保留现有"记分"能力的基础上，演进到"用户能在网站上真正对局打干瞪眼"。
> 本文是动手前的设计稿，确定方向与边界，逐步实施，不推倒重来。

---

## 0. 为什么要重构（一句话）

记分只需"信任客户端报数"；**真打牌**需要一个**权威服务端**来发牌、判合法、藏手牌、防作弊——纯前端做不到。这是引入框架与服务端的唯一硬理由（不是"静态不安全"）。

---

## 1. 目标与范围

**做**
- 把现有记分器平移进新结构，保持功能不变、数据不丢。
- 一套纯函数的**规则引擎**（发牌 / 判牌型 / 判大小 / 判胜负 / 算分）。
- **在线对局**：建房、加入、出牌/过牌、各人只看自己手牌、实时同步、胜负结算自动进记分。

**暂不做（留接口）**
- 排行榜/账号体系/好友、AI 托管、观战回放、移动端原生封装。

---

## 2. 技术选型

| 层 | 选择 | 理由 |
|---|---|---|
| 前端框架 | **Next.js（App Router）+ TypeScript** | 一个仓库同时有前端与服务端逻辑；Vercel 原生支持；生态大 |
| 样式 | 复用现有设计 token，迁到 CSS Modules 或 Tailwind | 现有视觉保留，组件化 |
| 数据库 / 实时 / 鉴权 | **Supabase**（Postgres + Realtime + Auth 匿名登录） | 已在用；Realtime 推公共状态、RLS 藏私有手牌、匿名 Auth 给身份且免密 |
| 权威逻辑 | Next.js **Route Handler**（service key） | 出牌校验、发牌只在服务端跑，客户端永不直写牌局表 |
| 规则引擎 | 纯 TS 模块 + 单元测试（Vitest） | 前后端共用、可测、可演进规则 |
| 部署 | Vercel（前端+API） + Supabase | 与现状一致，零新增主机 |

**为什么不是 Vite**：只是打包器，给不了服务端，照样缺裁决层。
**为什么不是专用游戏服务器（Colyseus 等）**：干瞪眼是回合制、非高帧实时，用不上常驻 websocket 主机（要常开、要花钱）；Next.js + Supabase Realtime 足够。

---

## 3. 总体架构

```
            浏览器（Next.js 前端，React）
        ┌─────────────────────────────────────┐
        │  记分页 /score/[code]                │
        │  牌桌页 /play/[code]                 │
        └──────────────┬───────────┬──────────┘
                       │           │
       (1) 出牌/过牌   │           │ (3) 订阅公共状态 + 自己的手牌
       POST /api/...   │           │   Supabase Realtime（受 RLS 约束）
                       ▼           ▼
        Next.js Route Handler   ┌──────────────────────────┐
        （service key，权威）   │        Supabase           │
        - 校验是否轮到你        │  Postgres: 牌局/手牌/出牌 │
        - 校验牌型合法/更大     │  RLS: 手牌只给本人        │
        - 发牌/更新状态/判胜    │  Realtime: 推状态变化     │
        - 胜负→写记分          │  Auth: 匿名身份(auth.uid)  │
            └───────────────────►──────────────────────────┘
```

**铁律**：客户端**只能读**（自己的手牌 + 公共状态），所有**写牌局**都走 Route Handler 用 service key 裁决。

---

## 4. 目录结构

```
app/
  layout.tsx  globals.css
  page.tsx                      # 落地页：创建/加入（记分 or 对局）
  score/[code]/page.tsx         # 记分器（平移现有功能）
  play/[code]/page.tsx          # 牌桌 UI
  api/
    match/join/route.ts         # 认座（把座位绑到 auth.uid）
    game/[id]/start/route.ts    # 开局发牌
    game/[id]/play/route.ts     # 出牌（权威校验）
    game/[id]/pass/route.ts     # 过牌
lib/
  supabase/
    client.ts                   # 浏览器客户端（anon key）
    server.ts                   # 服务端客户端（service role key，仅 Route Handler 用）
  rules/                        # ★ 纯函数规则引擎（无副作用、可测）
    types.ts                    # Card / Combo / GameState 类型
    deck.ts                     # 构造牌堆、洗牌、发牌
    combos.ts                   # 判牌型 classify()、判大小 canBeat()
    rules.ts                    # 出牌合法性、回合推进、判胜
    scoring.ts                  # 现有算分公式（复用）
    *.test.ts                   # 单元测试
  game/
    engine.ts                   # 服务端编排：applyMove(state, move) → newState
components/
  score/ ScoreBoard / Grid / ...
  play/  Table / Hand / SeatList / PlayArea / ...
supabase/
  migrations/                   # SQL 版本化（建表、RLS、realtime）
```

---

## 5. 数据模型（Postgres）

### 5.1 记分（沿用现有，平移）
- `gdy_games(room pk, name, created_at)`
- `gdy_rounds(id, room, deltas jsonb, created_at)`
- `gdy_players(room, name, ord, pk(room,name))`
> 现有数据继续用，记分页直接读这三张表。

### 5.2 对局（新增）
```sql
-- 一桌：2–4 人的一个房间
create table match (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                 -- 分享码（=链接 ?g=）
  name text,
  status text not null default 'waiting',    -- waiting | playing | finished
  config jsonb not null default '{}',         -- 变体配置：手牌数、是否能拆炸弹等
  created_at timestamptz default now()
);

-- 座位：把玩家(auth.uid)绑到这桌
create table seat (
  match_id uuid references match(id),
  seat_no int,                                -- 0..3
  user_id uuid not null,                      -- auth.uid()
  name text,
  connected bool default true,
  primary key (match_id, seat_no)
);

-- 一手牌（一局对局，一桌可连打多局）
create table game (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references match(id),
  status text not null default 'playing',     -- playing | finished
  turn_seat int,                              -- 轮到谁
  last_play jsonb,                            -- {seat, combo} 上一手（公共可见）
  pass_count int default 0,
  started_at timestamptz default now()
);

-- ★ 私有手牌：RLS 只允许本人读，客户端绝不可写
create table hand (
  game_id uuid references game(id),
  seat_no int,
  user_id uuid not null,
  cards jsonb not null,                       -- 该玩家当前手牌
  primary key (game_id, seat_no)
);

-- 出牌流水（append-only，公共可见——出过的牌本就公开）
create table move (
  id bigint generated always as identity primary key,
  game_id uuid references game(id),
  seq int,
  seat_no int,
  kind text,                                  -- play | pass
  combo jsonb,                                -- 出的牌（pass 为 null）
  created_at timestamptz default now()
);
```

### 5.3 RLS（关键安全点）
- `hand`：`select` 仅 `using (user_id = auth.uid())`；**无** insert/update/delete 给 anon（只有 service role 能写）。→ 谁都偷不到别人的牌。
- `game / move / seat / match`：公共字段可 `select`（true）；**写一律拒绝 anon**，只服务端 service role 写。
- `gdy_*` 记分表：等 Auth 接入后可顺手收紧（目前全开，低风险）。

---

## 6. 规则引擎（纯 TS）

```ts
type Suit = 'S'|'H'|'C'|'D'|'JOKER';
type Card = { rank: number; suit: Suit; id: string };   // rank: 3..15(2), 16(小王),17(大王)
type ComboType = 'single'|'pair'|'triple'|'straight'|'bomb'|'rocket';
type Combo = { type: ComboType; cards: Card[]; key: number; len: number };

createDeck(): Card[]                       // 54 张（或按变体）
shuffle(deck, seed): Card[]                // 可注入种子，便于复现/测试
deal(deck, nPlayers, handSize): Card[][]   // 按变体发牌

classify(cards: Card[]): Combo | null      // 判牌型；非法返回 null
canBeat(prev: Combo, next: Combo): boolean // next 能否压过 prev
isLegalPlay(hand, prev, cards): boolean    // 在手 + 牌型对 + 更大/炸弹
isWin(hand): boolean                       // 手牌空
scoreRound(...): Record<seat, delta>       // 复用现有算分（封顶100等）
```

**干瞪眼规则（按之前确认，写进引擎为常量/配置）**
- 大小：大王 > 小王 > 2 > A > K > … > 3。
- 牌型：单、对、三条、顺子（≥5 连，**2 与王不入顺**）、炸弹（**三张及以上**同点）、王炸（双王最大）。**无连对**。
- 炸弹可压任何非王炸；**能拆炸弹**。
- 算分（输家）：`剩牌数 × 2^(2的个数) × 2^(炸弹个数) × (剩牌≥5关到底 ×2) × 2^(场上炸弹数)`，封顶 100，零和。

> ⚠️ **待你确认的对战规则**（见第 10 节）：发牌张数 / 人数 / 用整副还是减牌、首出谁、要不要不要管牌后重新起牌等——这些影响 `deal/turn`。

---

## 7. 出牌流程（时序）

```
玩家A 点“出这几张”
  └─ POST /api/game/[id]/play { cards }  （带 Auth token）
        Route Handler（service key）:
          1. 读 game + A 的 hand，校验：是否轮到 A？cards 是否都在 A 手里？
          2. classify(cards) 合法？canBeat(last_play, combo)？（或新起一手）
          3. 通过 → 从 A.hand 移除这些牌；写 move；更新 last_play/turn_seat/pass_count
          4. isWin(A.hand) → game.status=finished；按 scoreRound 写 gdy_rounds
          5. 全部在一个事务里（service role）
        ↓ Postgres 变更
  Realtime 自动推送：
    - 所有人收到 game/move 更新（公共：轮到谁、A 出了什么、各人剩几张）
    - 每个人只收到自己 hand 行的变更（RLS 过滤）→ 重新渲染自己的手牌
```

**反作弊**：合法性全在服务端判；客户端发的只是"意图"，服务端不信任、全量校验。

---

## 8. 鉴权与房间（保持"免密、开链接即玩"）

- 首次进站：`supabase.auth.signInAnonymously()` → 拿到持久匿名身份（`auth.uid()`），存本地。无需输账号密码。
- 建房 `match`（生成 code）→ 链接 `?g=code` 分享。
- 进房：输/点 code → `POST /api/match/join` 认座（把空座绑到你的 uid）。
- 想跨设备/防丢号：以后可"匿名账号升级绑邮箱"，不影响现有体验。

---

## 9. 迁移计划（渐进，现状一直可用）

- **P0 脚手架**：建 Next.js+TS 项目（同仓库），接 Supabase 浏览器/服务端客户端 + 匿名 Auth。Vercel 自动识别 Next。静态版保留在 `/legacy` 或 GitHub Pages 过渡。
- **P1 平移记分器**：把现有记分搬到 `/score/[code]`，拆组件，沿用 `gdy_*` 表，达到功能对齐（线上数据无缝）。
- **P2 规则引擎**：纯函数 + 测试，先不接 UI，把发牌/判牌/判胜/算分跑通跑对。
- **P3 对局 MVP**：建 `match/seat/game/hand/move` 表 + RLS；Route Handler 出牌/过牌/开局；牌桌 UI（看手牌、出牌、过牌、实时同步）。
- **P4 打磨**：断线重连、座位状态、结算自动进记分、动效、（可选）观战。

每个阶段都能独立上线、独立验证。

---

## 10. 待你拍板的点（开放问题）

1. **对战的确切规则**：每人发几张？几人一桌（2/3/4）？用整副 54 张还是减牌变体？首出怎么定？一圈全过后谁重新起牌？（这些直接决定 `deck/deal/turn` 逻辑）
2. **记分页与对战页的关系**：同一个房间码下，"打完一局自动记分"是否就是默认流程？
3. **视觉**：沿用现在的纸张/墨绿设计（迁到组件），还是借机重做？
4. **是否要观战/旁观**（影响 RLS 与 Realtime 频道设计）。
5. **样式方案**：Tailwind 还是 CSS Modules（沿用现有 token）。

---

## 11. 风险与对策

| 风险 | 对策 |
|---|---|
| 私有手牌泄露 | `hand` 表 RLS 仅本人可读 + 永不广播；只服务端写 |
| 作弊（非法出牌/偷看） | 服务端权威校验每一步；客户端只发意图 |
| Serverless 冷启动延迟 | 回合制可接受；必要时用 Edge Runtime |
| Realtime 是否遵守 RLS | P3 先验证 `hand` 行级实时只推本人（Supabase 支持，需开 realtime + 策略） |
| 迁移期数据/链接断裂 | 沿用 `gdy_*` 表与 `?g=` 码；静态版过渡并存 |
| 成本 | 朋友间使用，Vercel/Supabase 免费额度足够 |

---

## 12. 决策摘要

- **要不要重构**：因为"能在线打牌"才重构，**值得**；只为"安全"不值得。
- **栈**：Next.js + TypeScript + Supabase（Postgres/Realtime/匿名 Auth）+ 纯函数规则引擎，部署 Vercel。
- **核心原则**：权威服务端裁决 + 私有手牌靠 RLS + 渐进迁移、现状不停服。
