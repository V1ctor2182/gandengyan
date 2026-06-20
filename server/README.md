# 后端：腾讯文档当数据库（OAuth 代理）

把腾讯文档表格当数据库，让前端（GitHub Pages 上的 index.html）能**读**榜单、**写**新一局。
腾讯文档的开放接口需要 `client_secret` 和 OAuth，密钥不能放前端，所以用这个小后端代管。

```
前端(GitHub Pages)  ──HTTPS──►  本后端(Vercel 云函数)  ──OpenAPI──►  腾讯文档表格
                                  └ 保管密钥 / 自动刷新 token / CORS
```

## 接口契约（前端只认这两个）

- `GET  /api/data`  → `{ players:[{id,name}], rounds:[{deltas:{id:val}}] }`
- `POST /api/round` ← `{ values:[按列顺序的一行数字] }`，把新一局追加进表格

另有两个一次性用的：`GET /api/auth`（去授权）、`GET /api/callback`（授权回调）。

## 你需要做的（按顺序）

### 1. 注册腾讯文档应用，拿 client_id / client_secret
- 去 https://docs.qq.com/open/ 注册开发者并创建应用。
- 记下 **Client ID** 和 **Client Secret**。
- 回调地址先留空，等第 3 步拿到后端域名再填 `https://<你的后端>/api/callback`。
- ⚠️ 这步若需要企业认证/审核，是整条路的门槛，先确认能过。

### 2. 开一个免费 KV（存 token）
- 去 https://upstash.com 建一个免费 Redis，拿到 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN`。

### 3. 部署后端到 Vercel
- 在 https://vercel.com 新建项目，**Root Directory 选 `server/`**。
- 配置环境变量：
  | 变量 | 值 |
  |---|---|
  | `QQ_CLIENT_ID` | 第 1 步的 Client ID |
  | `QQ_CLIENT_SECRET` | 第 1 步的 Client Secret |
  | `QQ_REDIRECT_URI` | `https://<部署后的域名>/api/callback` |
  | `QQ_FILE_ID` | 你那张腾讯文档表格的 fileID（见下） |
  | `FLIP_SIGN` | `1` 表示把分数正负反过来（你的表是原始符号就填 1） |
  | `UPSTASH_REDIS_REST_URL` | 第 2 步 |
  | `UPSTASH_REDIS_REST_TOKEN` | 第 2 步 |
  | `ALLOW_ORIGIN` | `https://v1ctor2182.github.io` |
- 部署后拿到域名，回第 1 步把回调地址填成 `https://<域名>/api/callback` 并保存。

### 4. fileID 怎么拿
腾讯文档表格链接形如 `https://docs.qq.com/sheet/XXXXXXXX`，`XXXXXXXX` 就是 fileID（按你应用文档确认是否需要带前缀）。

### 5. 一次性授权
浏览器打开 `https://<后端域名>/api/auth` → 扫码同意 → 看到"授权成功"。
之后 30 天内免登录，到期后端自动用 refresh_token 续（refresh 有效期 1 年）。

### 6. 验证
- 打开 `https://<后端域名>/api/data`，应返回 JSON 榜单数据。
- 若报错或字段对不上，多半是 `lib/tencent.js` 底部 `SHEET_READ / SHEET_APPEND / extractGrid` 三处端点要按你应用的真实返回微调——把 `/api/data` 的报错发我即可。

## 待校正点（第一次真连时）

`server/lib/tencent.js` 底部的：
- `SHEET_READ` —— 读取整表/区间的真实路径
- `SHEET_APPEND` —— 追加行的真实路径
- `extractGrid()` —— 把接口返回拍平成二维数组（首行人名、其余每行一局）

其余（OAuth、刷新、CORS、归一化、符号反转）都是确定可用的。
