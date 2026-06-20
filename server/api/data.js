// 前端读取数据：GET <后端域名>/api/data  → { players, rounds }
import { cors } from '../lib/cors.js';
import { readData } from '../lib/tencent.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    const data = await readData();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
