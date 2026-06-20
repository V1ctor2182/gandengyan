// 腾讯文档 OpenAPI 封装：OAuth 流程 + token 自动刷新 + 表格读写。
// 已确认部分：authorize / token 端点、scope=all、Access-Token/Client-Id/Open-Id 认证头、
//            access_token 约 30 天、refresh_token 约 1 年。
// 待校正：表格"读区间 / 追加行"的精确端点（见底部 SHEET_* 常量），第一次真连时按你应用的
//        OpenAPI 控制台/文档确认即可，只需改两行。
import { kvGet, kvSet } from './store.js';

const CID = process.env.QQ_CLIENT_ID;
const CSEC = process.env.QQ_CLIENT_SECRET;
const REDIRECT = process.env.QQ_REDIRECT_URI;     // 必须与开放平台后台填的回调完全一致
const FILE_ID = process.env.QQ_FILE_ID;           // 你那张腾讯文档表格的 fileID
const FLIP = process.env.FLIP_SIGN === '1';       // 是否把分数正负反过来（你的表是原始符号）

const AUTHORIZE = 'https://docs.qq.com/oauth/v2/authorize';
const TOKEN = 'https://docs.qq.com/oauth/v2/token';
const BASE = 'https://docs.qq.com/openapi';

export function authorizeUrl(state = '') {
  const q = new URLSearchParams({
    client_id: CID, redirect_uri: REDIRECT, response_type: 'code', scope: 'all', state,
  });
  return `${AUTHORIZE}?${q}`;
}

export async function exchangeCode(code) {
  const q = new URLSearchParams({
    client_id: CID, client_secret: CSEC, redirect_uri: REDIRECT,
    grant_type: 'authorization_code', code,
  });
  const r = await fetch(`${TOKEN}?${q}`);
  return r.json();
}

async function refresh(refreshToken) {
  const q = new URLSearchParams({
    client_id: CID, client_secret: CSEC,
    grant_type: 'refresh_token', refresh_token: refreshToken,
  });
  const r = await fetch(`${TOKEN}?${q}`);
  return r.json();
}

export async function saveTokens(j, prevRefresh) {
  const rec = {
    access_token: j.access_token,
    refresh_token: j.refresh_token || prevRefresh, // 万一刷新不返回新 refresh 就沿用旧的
    user_id: j.user_id,
    exp: Date.now() + (j.expires_in || 86400) * 1000 - 60000, // 提前 1 分钟过期
  };
  await kvSet('qq_tokens', JSON.stringify(rec));
  return rec;
}

async function validToken() {
  const s = await kvGet('qq_tokens');
  if (!s) throw new Error('尚未授权：先用浏览器打开 /api/auth 完成一次扫码授权');
  let t = JSON.parse(s);
  if (Date.now() > t.exp) {
    const j = await refresh(t.refresh_token);
    if (!j.access_token) throw new Error('刷新 token 失败：' + JSON.stringify(j));
    t = await saveTokens(j, t.refresh_token);
  }
  return t;
}

async function api(path, { method = 'GET', body } = {}) {
  const t = await validToken();
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Access-Token': t.access_token,
      'Client-Id': CID,
      'Open-Id': t.user_id,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (j.ret !== undefined && j.ret !== 0) throw new Error('腾讯文档接口报错：' + JSON.stringify(j));
  return j;
}

/* ============ 表格读写（端点待第一次真连时校正） ============ */
// 腾讯文档在线表格内容接口大致形如 /openapi/v2/sheet/...（按你应用文档为准）。
// 这两处是唯一需要核对/微调的地方：
const SHEET_READ = (fileID) => `/v2/sheet/${fileID}`;                 // TODO: 核对读取整表/区间的真实路径
const SHEET_APPEND = (fileID) => `/v2/sheet/${fileID}/rows:append`;   // TODO: 核对追加行的真实路径

// 读取整表 → 归一化成 { players:[{id,name}], rounds:[{deltas:{id:val}}] }
export async function readData() {
  const raw = await api(SHEET_READ(FILE_ID));
  // raw 的具体结构待校正；这里假设能拿到一个二维数组 rows（首行人名，其余每行一局）。
  const rows = extractGrid(raw);            // ← 校正点：把接口返回拍平成二维数组
  if (!rows || !rows.length) return { players: [], rounds: [] };
  const names = rows[0].map((s) => String(s).trim()).filter(Boolean);
  const players = names.map((n, i) => ({ id: 'p' + (i + 1), name: n }));
  const rounds = rows.slice(1)
    .filter((r) => r.some((v) => v !== '' && v != null))
    .map((r) => {
      const d = {};
      players.forEach((p, i) => {
        const v = Number(r[i] || 0);
        d[p.id] = FLIP ? -v : v;
      });
      return { deltas: d };
    });
  return { players, rounds };
}

// 追加一局：values 是按当前列顺序排好的一行数字（已处理好符号）
export async function appendRound(values) {
  return api(SHEET_APPEND(FILE_ID), { method: 'POST', body: { values } });
}

function extractGrid(raw) {
  // 占位：不同接口返回结构不同，第一次真连时按实际返回调整。
  if (Array.isArray(raw?.data?.values)) return raw.data.values;
  if (Array.isArray(raw?.values)) return raw.values;
  return null;
}
