// 授权回调：开放平台后台把回调地址填成 <后端域名>/api/callback
import { exchangeCode, saveTokens } from '../lib/tencent.js';

export default async function handler(req, res) {
  try {
    const code = new URL(req.url, 'http://x').searchParams.get('code');
    if (!code) return res.status(400).send('缺少 code');
    const j = await exchangeCode(code);
    if (!j.access_token) return res.status(400).send('换取 token 失败：' + JSON.stringify(j));
    await saveTokens(j);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send('<h2>授权成功 ✅ 可以关掉此页，回 App 用了。</h2>');
  } catch (e) {
    res.status(500).send('出错：' + e.message);
  }
}
