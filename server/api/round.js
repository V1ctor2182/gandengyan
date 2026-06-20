// 前端记一局：POST <后端域名>/api/round  body: { values:[按列顺序的一行数字] }
import { cors } from '../lib/cors.js';
import { appendRound } from '../lib/tencent.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: '只支持 POST' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || !Array.isArray(body.values)) return res.status(400).json({ error: '缺少 values 数组' });
    const r = await appendRound(body.values);
    res.status(200).json({ ok: true, result: r });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
