// 一次性授权入口：浏览器打开 <后端域名>/api/auth，跳转腾讯文档扫码授权。
import { authorizeUrl } from '../lib/tencent.js';

export default function handler(req, res) {
  res.writeHead(302, { Location: authorizeUrl('gdy') });
  res.end();
}
