# LLMinfo

自托管的 LLM 模型信息看板：实时同步 [models.dev](https://models.dev) 的模型规格与价格，
支持跨供应商比价、多维筛选排序、分析图表、收藏、对比与成本估算。

- **中文界面**，Windows 11 Fluent 设计语言（Mica + Acrylic 材质）
- **单容器部署**：Next.js + SQLite，无需外部数据库
- **默认安全**：注册关闭、Argon2id 密码、可选 TOTP、登录限流、安全响应头
- **公网可用**：为 SakuraFrp 内网穿透的真实 IP 与 TLS 终止场景做了专门处理

---

## 快速开始（Docker）

```bash
cp .env.example .env
# 编辑 .env，至少填写 APP_URL、AUTH_SECRET、ADMIN_EMAIL、ADMIN_PASSWORD
docker compose up -d
```

打开 `APP_URL` 指向的地址，用 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 登录。

首次启动时容器会自动：创建管理员账号 → 拉取一次 models.dev 快照 → 启动每 60 分钟的
条件同步。这些环境变量**只在数据库还没有任何用户时生效**，之后修改不会覆盖已有密码。

### 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `APP_URL` | 是 | 用户实际访问的完整地址，含 `https://`。用于可信来源校验与 Cookie 安全策略 |
| `AUTH_SECRET` | 是 | 会话签名密钥，至少 32 字符。生成：`openssl rand -base64 48` |
| `ADMIN_EMAIL` | 是 | 首个管理员邮箱（仅首次启动生效） |
| `ADMIN_PASSWORD` | 是 | 首个管理员密码，至少 12 字符（仅首次启动生效） |
| `DATA_DIR` | 否 | 数据目录，容器内固定为 `/data` |
| `SYNC_INTERVAL_MINUTES` | 否 | 同步间隔，默认 `60` |
| `TRUST_PROXY_DEPTH` | 否 | 可信代理跳数，默认 `1`（仅 SakuraFrp） |

---

## 部署到绿联 NAS + SakuraFrp

### 1. 拉取镜像

```bash
# 在 NAS 上
mkdir -p /volume1/docker/llminfo && cd /volume1/docker/llminfo
# 把仓库里的 docker-compose.yml 和 .env 放到这里
docker compose up -d
```

镜像来自 `ghcr.io/wiggins-kong/llminfo:latest`。若 NAS 无法访问 GHCR，
在本机执行 `docker save` 后导入即可。

### 2. 配置 SakuraFrp 隧道

1. 在 SakuraFrp 面板创建一个 **HTTP 隧道**，本地地址填 NAS 的内网 IP，
   本地端口填 `3000`。
2. 绑定子域名（免费提供 `nyat.app` 子域与 SSL 证书），或用自己的域名做 CNAME。
3. 打开「自动 HTTPS」。
4. 把最终的公网地址填进 `.env` 的 `APP_URL`，然后 `docker compose up -d` 重启。

> **访问认证不适用于 HTTP 隧道。** SakuraFrp 的「访问认证」功能只支持 TCP/UDP
> 隧道，HTTP(S) 隧道不走它。公网暴露的安全性完全由本应用承担：注册已关闭、
> 密码用 Argon2id、登录有限流、会话 Cookie 是 `HttpOnly + Secure + SameSite=Lax`。

### 3. 真实 IP 与限流（重要）

SakuraFrp 的 frpc 会把真实客户端 IP **追加到 `X-Forwarded-For` 的末尾**，
前面的内容是客户端可伪造的。因此应用**只读取 XFF 的最后一个 IP** 作为限流键
（`src/lib/client-ip.ts`）。默认 `TRUST_PROXY_DEPTH=1` 正是这个含义。

如果以后在 SakuraFrp 前面再加 Cloudflare：

1. 把 `TRUST_PROXY_DEPTH` 改成 `2`；
2. 注意 Cloudflare 会引入 `CF-Connecting-IP`，应用已支持该头作为回退。

---

## 日常运维

### 升级

```bash
docker compose pull && docker compose up -d
```

### 备份

数据库使用 WAL 模式，直接复制 `.db` 文件可能漏掉未 checkpoint 的数据。稳妥做法：

```bash
docker compose exec llminfo node -e "
const db = require('better-sqlite3')('/data/llminfo.db');
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
"
docker compose cp llminfo:/data/llminfo.db ./backup-$(date +%F).db
```

恢复时把备份文件放回 `./data/llminfo.db` 再重启容器。

### 添加用户

注册接口是关闭的，加人只能在容器内执行：

```bash
docker compose exec llminfo npm run create-user -- user@example.com '一个足够长的密码' '显示名'
```

> 该脚本在容器内直接用 Node 运行 TypeScript（Node 24 原生类型擦除），
> 不依赖 `tsx` 或任何构建工具，因此运行镜像保持精简。

### 忘记密码 / 丢失 TOTP

两种方式：

1. **重置密码**：停容器，用 `node` 直接改 `account` 表的 `password` 字段（Argon2id 哈希），
   或者删掉 `./data/llminfo.db` 重新初始化（会丢失收藏与已保存视图）。
2. **丢失 TOTP**：在登录页点「使用备用码」。备用码在开启两步验证时只展示一次。
   两者都丢失时，删除 `twoFactor` 表中对应用户的行即可关闭该账号的两步验证。

---

## 本地开发

```bash
npm install
cp .env.example .env      # 本地可把 APP_URL 设为 http://localhost:3000
npm run migrate           # 建表（首次）
npm run dev               # http://localhost:3000
```

常用脚本：

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 开发服务器 |
| `npm run build` | 生产构建（含 standalone 静态资源镜像） |
| `npm start` | 以 standalone 方式启动生产构建 |
| `npm run typecheck` | TypeScript 检查 |
| `npm test` | 单元测试（Vitest） |
| `npm run e2e` | 端到端测试（Playwright，需先 `npm run build`） |
| `npm run gen-auth-schema` | 升级 better-auth 后重新生成其建表 SQL |

---

## 数据来源与口径

- 数据来自 `https://models.dev/api.json`，服务端每 60 分钟带 `ETag` 条件请求同步一次；
  命中 304 时零流量、不改动数据。
- **价格单位是 USD / 百万 token**（已对照 models.dev 官方 README 与 schema 确认）。
- 同步是**单事务整体替换**：读取方只会看到旧的或新的完整快照，不会看到中间状态。
  任何失败（网络、JSON 非法、校验失败、返回空数据集）都会**保留上一份可用快照**。
- 上游数据的已知怪癖，代码里都做了容错并配了回归测试：
  - `interleaved` 既可能是布尔值，也可能是 `{field: ...}` 对象（约 1,010 个模型是后者）
  - `reasoning_options[].values` 里偶尔出现 `null`
  - 日期既有 `2026-07-24` 也有 `2025-04`（月粒度），另有 `1970-01-01` 哨兵值
  - `limit.context` 出现 `0` 与 `99,999,999`，分别表示未知与「1 亿+」
  - 413 条报价完全没有 `cost` 字段，这与「免费」是两种不同状态，界面分别展示

## 技术栈

Next.js 16（App Router，`output: standalone`）· TypeScript · Tailwind CSS 4 ·
TanStack Table + Virtual · ECharts · better-auth（Argon2id + TOTP）· Drizzle ORM ·
better-sqlite3 · Web Worker 过滤排序

## 架构要点

- **数据通道**：浏览器只请求 `/api/dataset`（服务端已裁剪字段），带 `ETag` 与
  `private, max-age=0, must-revalidate`，重复轮询命中 304。前端另用 IndexedDB 缓存，
  冷启动先渲染缓存再后台重验证。
- **计算位置**：7,800+ 条报价的筛选、排序与聚合全部在 Web Worker 中完成，主线程只渲染
  可见窗口（虚拟滚动），输入与拖动不会掉帧。
- **材质纪律**：Mica 只用于常驻表面（窗口底、侧栏），Acrylic 只用于瞬时表面
  （标题栏、表头、详情抽屉、弹层、移动端底部栏）。设置里可一键关闭毛玻璃退回纯色。
- **懒加载数据库**：SQLite 连接不在模块顶层创建，否则 `next build` 会在构建期打开并争用
  数据库文件。

## 目录结构

```
src/app          路由与 API（dataset / refresh / status / favorites / views / logo / auth）
src/components   UI 组件（表格、筛选、详情抽屉、图表、对比、成本估算）
src/lib          同步、清洗、定价、查询引擎、认证、限流、导出
src/workers      Web Worker 查询
src/db           架构定义与迁移
scripts          create-user / migrate / gen-auth-schema
tests            Vitest 单元测试
e2e              Playwright 端到端测试
demo             设计原型（Windows 11 毛玻璃风格，可双击打开）
```
