// 允许 GitHub Pages 前端跨域访问。设 ALLOW_ORIGIN 环境变量为你的 Pages 域名，
// 例如 https://v1ctor2182.github.io（不带末尾斜杠）。默认 * 方便先跑通。
export function cors(req, res) {
  const origin = process.env.ALLOW_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}
