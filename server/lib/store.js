// 极简 KV：用 Upstash Redis 的 REST 接口存 token（免费、无需服务器）。
// 需要环境变量：UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
const U = process.env.UPSTASH_REDIS_REST_URL;
const T = process.env.UPSTASH_REDIS_REST_TOKEN;

export async function kvGet(key) {
  const r = await fetch(`${U}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${T}` },
  });
  const j = await r.json();
  return j.result ?? null; // 字符串或 null
}

export async function kvSet(key, valueStr) {
  await fetch(`${U}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${T}` },
    body: valueStr,
  });
}
