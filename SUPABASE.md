# 云同步：用 Supabase 当共享表（数据库）

让多人打开同一个网址、看同一份实时榜单；数据存在 Supabase 的一张表里，你也能在 Supabase 后台像表格一样查看/编辑。零后端、纯前端直连。

## 一、建项目和表

1. 去 https://supabase.com 注册，新建一个免费 project。
2. 打开 **SQL Editor**，把下面这段跑一次：

```sql
create table if not exists gdy_rounds(
  id bigint generated always as identity primary key,
  room text not null, idx int, deltas jsonb not null,
  created_at timestamptz not null default now());
create table if not exists gdy_players(
  room text not null, name text not null, ord int not null default 0,
  primary key(room,name));
create index if not exists gdy_rounds_room on gdy_rounds(room);
alter table gdy_rounds enable row level security;
alter table gdy_players enable row level security;
create policy "all" on gdy_rounds for all using(true) with check(true);
create policy "all" on gdy_players for all using(true) with check(true);
alter publication supabase_realtime add table gdy_rounds;
alter publication supabase_realtime add table gdy_players;
```

> **一个链接一场**：每条数据都带 `room`（场号，来自网址 `?g=场号`）。`gdy_rounds` 就是「局表」：每行一局，`deltas` 是各人加减分（按名字），例如 `{"谢":-170,"刘":20}`。到 **Table Editor** 里能直接看/改，用 `room` 列区分不同的场。

## 部署后免配置（推荐）

把 Project URL 和 anon key 填进 `index.html` 顶部脚本里的 `CLOUD_BAKED = {url:"", key:""}`，部署后**所有访客自动连上、开链接即用**，不用各自粘贴 key。顶部「本场 XXXXX」点开可分享链接 / 新开一场 / 加入别的场。

## 二、连接 App

1. Supabase 后台 → **Settings → API**，复制 **Project URL** 和 **anon public** key。
2. App 里 ⋯ → **云同步** → 粘贴这两个 → **连接**。
3. 连上后是「云端共享表」模式：记一局、删一局都会写进 Supabase，别人秒级同步。

## 三、把现有数据搬上去

连接后，云同步面板里点 **上传本地数据到云端**，会把你当前本地这盘（含导入的历史）追加进云端表。

## 说明与边界

- anon key 是公开用的；这里 RLS 设成「谁都能读写」，适合熟人之间的记分。想更严格可改 policy。
- 云端模式目前是**单一共享表**（不分多对局）；多对局存档仍是本地模式的功能。
- 改名 / 删玩家：在 Supabase 的 Table Editor 里改 `gdy_players` 和对应 `deltas` 最稳妥。
- 断网或没连云端时，App 自动用本地模式，数据存在浏览器（IndexedDB）。
