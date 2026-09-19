# Development Guide

面向接手开发的工程师与 AI agent。目标：**在新机器上克隆仓库后，无需询问任何人即可
继续开发**。所有命令均在本仓库实测通过。

- 当前版本：`1.0.0`
- 运行时：Node.js >= 22（开发环境实测 v26.7.0），npm 11
- 已验证平台：Windows（PowerShell）。Linux/macOS 命令等价，差异处已标注

---

## 1. 五分钟上手

```bash
git clone https://github.com/wiggins-kong/LLMinfo.git
cd LLMinfo
npm install

cp .env.example .env        # 见下方「本地 .env 最小配置」
npm run migrate             # 建表，首次运行需要
npm run dev                 # http://localhost:3000
```

首次访问会自动完成三件事：创建管理员账号 → 拉取一次 models.dev 快照 →
启动每 60 分钟的后台同步。首屏可能要等几秒（要下载约 4.7 MB 的上游数据）。

### 本地 .env 最小配置

```dotenv
APP_URL=http://localhost:3000
DATA_DIR=./data
AUTH_SECRET=local-dev-secret-please-change-me-0123456789
ADMIN_EMAIL=admin@local.test
ADMIN_PASSWORD=local-dev-password
SYNC_INTERVAL_MINUTES=60
TRUST_PROXY_DEPTH=1
```

`ADMIN_PASSWORD` 至少 12 个字符，否则启动时会被拒绝（这是刻意的约束）。
`ADMIN_*` 仅在数据库里还没有任何用户时生效。

> **不要**在本地把 `APP_URL` 写成 `http://127.0.0.1:3000` 却用
> `http://localhost:3000` 访问：better-auth 会因来源不匹配返回
> `403 INVALID_ORIGIN`。两者必须一致。

---

## 2. 命令速查

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 开发服务器（Turbopack） |
| `npm run build` | 生产构建；`postbuild` 会把静态资源镜像进 standalone 产物 |
| `npm run start:standalone` | 以容器同款方式启动生产构建 |
| `npm run typecheck` | `tsc --noEmit`，CI 必跑 |
| `npm test` | 69 个单元测试（Vitest） |
| `npm run test:watch` | 单元测试 watch 模式 |
| `npm run e2e` | 46 个端到端测试（Playwright，需先 `npm run build`） |
| `npm run migrate` | 仅建表，不启动服务 |
| `npm run create-user -- <email> <password> [name]` | 添加账号 |
| `npm run gen-auth-schema` | 升级 better-auth 后重新生成其建表 SQL |

> 已移除 `npm run lint`：Next.js 16 删除了 `next lint` 命令。目前以
> `npm run typecheck` + `npm test` 作为质量门禁。

---

## 3. 代码地图

```
src/app/                     路由与 API（App Router）
  page.tsx                   仪表盘入口；先跑 bootstrap 再校验会话
  login/page.tsx             登录页（服务端重定向已登录用户）
  layout.tsx                 根布局 + 外观 Provider
  globals.css                设计令牌、Mica/Acrylic 材质、表格栅格、断点
  api/dataset/route.ts       精简数据集 + ETag + 304
  api/refresh/route.ts       手动同步（限流 5 次 / 5 分钟 / 账号）
  api/status/route.ts        同步元数据
  api/favorites/route.ts     收藏 CRUD
  api/views/route.ts         保存的筛选视图 CRUD
  api/logo/[id]/route.ts     本地缓存的供应商 logo
  api/health/route.ts        健康检查，同时触发 bootstrap
  api/auth/[...all]/route.ts better-auth 挂载点

src/components/
  dashboard.tsx              应用外壳：标题栏、侧栏、工具栏、标签页、状态栏
  model-table.tsx            虚拟滚动表格 + 移动端卡片（同一份数据两种呈现）
  filter-bar.tsx             筛选 chip 组
  detail-drawer.tsx          详情抽屉（跨供应商比价、阶梯价、接入片段）
  compare-panel.tsx          最多 4 个模型并排对比
  cost-calculator.tsx        月成本估算
  charts.tsx                 三张 ECharts 图（仅桌面）
  appearance-provider.tsx    主题 / 密度 / 毛玻璃 / 强调色
  settings-flyout.tsx        外观设置浮层（全局只挂载一个实例）
  format.tsx                 展示格式化与色块工具
  ui/primitives.tsx          Chip / ToolButton / Tag / SegmentedControl / Switch

src/lib/
  env.ts                     环境变量集中读取
  types.ts                   前后端共用的 DTO
  source-schema.ts           models.dev 载荷的宽松 Zod schema（见 §6）
  normalize.ts               数据清洗：日期、上下文、模态、能力标记
  transform.ts               上游数据 → providers / models / offers 三张表
  sync.ts                    同步引擎：条件请求、事务替换、行锁、logo 抓取
  dataset.ts                 组装客户端数据集 + 内容哈希缓存
  query-engine.ts            过滤 / 排序 / 聚合（纯函数，可单测）
  pricing.ts                 混合价与月成本计算
  export.ts                  CSV / JSON 生成与浏览器下载
  auth.ts                    better-auth 配置（Argon2id、TOTP、限流）
  user-admin.ts              账号创建（启动路径与 CLI 共用）
  bootstrap.ts               启动引导：建管理员、首次同步、启动调度器
  session.ts                 会话读取与未授权错误
  client-ip.ts               真实 IP 解析（SakuraFrp 专用逻辑）
  rate-limit.ts              固定窗口限流（SQLite 支撑）
  dataset-cache.ts           IndexedDB 缓存
  use-*.ts                   客户端 hooks：数据集、查询状态、worker、收藏、对比

src/db/
  schema.ts                  Drizzle 表定义
  schema-ddl.ts              唯一的建表 SQL（含 better-auth 生成部分）
  index.ts                   惰性单例连接 + Proxy

src/workers/query.worker.ts  Web Worker 查询入口（过滤 / 排序 / 聚合）
src/instrumentation.ts       服务端启动钩子，调用 bootstrap()

scripts/                     migrate / create-user / gen-auth-schema / prepare-standalone
tests/                       69 个 Vitest 单元测试
e2e/                         46 个 Playwright 测试 + 共享登录态
demo/llminfo-win11-glass.html 设计原型（可双击打开，非构建产物）
```

---

## 4. 架构与数据流

```
models.dev/api.json
        │  每 60 分钟，带 If-None-Match
        ▼
   sync.ts ── 304? ──► 仅更新 last_checked_at，零流量
        │  200
        ▼
 source-schema.ts 宽松校验 → transform.ts 归一化
        │
        ▼
 单事务整体替换 providers / models / offers + sync_state
        │
        ▼
 dataset.ts 组装 DTO（按 content_hash 进程内缓存）
        │
        ▼  GET /api/dataset（ETag = content_hash）
  浏览器：IndexedDB 缓存 → 先渲染缓存 → 后台按 ETag 重验证
        │
        ▼
 query.worker.ts 过滤 / 排序 / 聚合（主线程不阻塞）
        │
        ▼
 model-table.tsx 虚拟滚动只渲染可见行
```

关键设计约束，改动时请保持：

1. **同步失败绝不清空数据。** 网络错误、JSON 非法、校验失败、上游返回空数据集，
   一律保留上一份快照并写 `last_error`。
2. **快照替换必须是单事务。** 读取方不能看到半写状态。
3. **计算放 Worker。** 7,800+ 条数据的筛选排序不得回到主线程。
4. **材质纪律。** `backdrop-filter` 只允许出现在 Acrylic 白名单元素上
   （标题栏、表头、抽屉、浮层、移动端标签栏），否则表格滚动会掉帧。
5. **SQLite 连接必须惰性创建。** 在模块顶层 `new Database()` 会让
   `next build` 的多个 worker 争用同一个文件并报 `SQLITE_BUSY`。

---

## 5. 上游数据（models.dev）

- 端点：`https://models.dev/api.json`，约 4.7 MB，gzip 后约 465 KB
- 响应头：`ETag` 有效（实测 304 通过）、`Access-Control-Allow-Origin: *`、
  `Cache-Control: public, must-revalidate, max-age=0`
- **没有** WebSocket 或增量接口，「实时」只能是条件请求 + 轮询
- 价格单位是 **USD / 百万 token**（已对照上游 README 与 schema 确认）

### 已知的上游怪癖（代码已容错，`tests/upstream-quirks.test.ts` 有回归测试）

| 字段 | 现象 | 处理方式 |
| --- | --- | --- |
| `interleaved` | 87 个布尔值 + 1,010 个 `{field: ...}` 对象 | 对象视为 `true` |
| `reasoning_options[].values` | 偶尔含 `null` | 过滤非字符串项 |
| `release_date` / `last_updated` | 既有 `YYYY-MM-DD` 也有 `YYYY-MM`（235 条） | 两种都接受 |
| 同上 | 9 条为 `1970-01-01` 哨兵 | 归一为 `null` |
| `limit.context` | 136 条为 `0` 或负数 | 视为未知 |
| 同上 | 最大值为 `99,999,999` | 界面显示「1亿+」 |
| `cost` | 413 条完全没有该字段 | 显示「未标价」，**不是** 0 |
| `cost.input/output` | 628 条为 `0`/`0` | 显示「免费」 |
| `experimental` | 58 条为对象，含独立 fast 模式价格 | 标记为实验性 |

**改动 `source-schema.ts` 时务必跑一次真实载荷**，不要只依赖单元测试的构造数据：

```bash
npx tsx scripts/verify-parse.ts   # 若不存在则临时写一个，见下方片段
```

```ts
// 临时脚本：用真实 4.7 MB 载荷验证解析与转换
import { parseSourceDataset } from "../src/lib/source-schema";
import { transformDataset } from "../src/lib/transform";
const raw = await (await fetch("https://models.dev/api.json")).json();
const t = transformDataset(parseSourceDataset(raw));
console.log(t.providers.length, t.models.length, t.offers.length);
// 期望：222 providers / 约 3,726 models / 约 7,860 offers
```

上游计数会随时间增长，与上述数字有少量偏差属正常；数量级明显不对才是问题。

---

## 6. 认证与安全要点

- **注册关闭。** 账号只能由启动流程或 `npm run create-user` 创建。
  首个管理员**不走** `signUpEmail` 接口（会被 `disableSignUp` 挡下），
  而是直接写入 `user` + `account` 两行，见 `src/lib/user-admin.ts`。
- **Argon2id 参数三处共用。** `ARGON2_OPTIONS` 定义在 `user-admin.ts`，
  被启动路径、CLI 与 `auth.ts` 共同引用。改动它会导致已有密码无法验证。
- **真实 IP 只取 XFF 最后一个。** SakuraFrp 的 frpc 把真实 IP **追加**到
  `X-Forwarded-For` 末尾，前面的内容客户端可伪造。`client-ip.ts` 用
  `TRUST_PROXY_DEPTH` 从尾部取值。若前面再加 Cloudflare，把它改成 2。
- **`Proxy` 的三个陷阱不能删。** `src/db/index.ts` 里的 `has` / `ownKeys` /
  `getOwnPropertyDescriptor` 是 better-auth 探测驱动类型所必需的，
  只保留 `get` 会导致 adapter 初始化失败。
- **better-auth 表结构是生成的。** 升级 better-auth 后运行
  `npm run gen-auth-schema`，把输出更新进 `src/db/schema-ddl.ts`。
- **Cookie 缓存刻意关闭。** better-auth 的缓存载荷校验要求 `Date` 实例，
  而 Kysely 的 SQLite 方言返回整数，开启会每次请求告警并回退查库。
  原因已写在 `auth.ts` 注释里，不要「顺手打开」。

---

## 7. 测试

```bash
npm run typecheck     # 必过
npm test              # 69 个单元测试
npm run build         # 必过（会验证所有路由可编译）
npm run e2e           # 46 个端到端测试
```

### E2E 注意事项

- **必须先 `npm run build`**：Playwright 默认启动 `.next/standalone/server.js`。
- **登录限流是真实行为。** 登录限制为 8 次/分钟，因此 `e2e/auth.setup.ts`
  只登录一次并把会话存到 `e2e/.auth/state.json`（已 gitignore），
  其余测试复用它。**不要**在单个测试里各自登录，会触发 429。
- 认证类测试显式 `test.use({ storageState: { cookies: [], origins: [] } })`
  以未登录状态运行。
- 移动端专属断言用 `test.skip(({ viewport }) => width >= 1024)` 隔离，
  因为同一份 spec 会在三个项目下各跑一遍。
- 若内置浏览器下载受限，可用环境变量指向已安装的 Chromium：

```bash
# PowerShell
$env:E2E_CHROMIUM_PATH="$env:LOCALAPPDATA\ms-playwright\chromium-1243\chrome-win64\chrome.exe"
npm run e2e
```

- 对已运行的实例跑测试时，设置 `E2E_BASE_URL` 可跳过自动启动：

```bash
$env:E2E_BASE_URL="http://localhost:3666"
npm run e2e
```

---

## 8. 数据库

- 位置：`$DATA_DIR/llminfo.db`（本地默认 `./data`，容器内 `/data`）
- WAL 模式，`busy_timeout` 8 秒，外键开启
- 建表 SQL 的**唯一来源**是 `src/db/schema-ddl.ts`，启动与 `npm run migrate`
  都调用它；所有语句幂等，可安全重复执行
- 没有迁移版本号：当前策略是「幂等 DDL」。**新增列时**请用
  `ALTER TABLE ... ADD COLUMN` 并在 `schema-ddl.ts` 中保留
  `CREATE TABLE IF NOT EXISTS`，否则已部署的实例不会获得新列

### 表

| 表 | 说明 |
| --- | --- |
| `providers` | 供应商，含 `has_logo` 标记 |
| `models` | 按 `model_id` 聚合的模型行（预计算最优价与上下文） |
| `offers` | 主表，主键 `(provider_id, model_id)`，7,000+ 行 |
| `sync_state` | 单行：etag、content_hash、时间戳、计数、错误、行锁 |
| `favorites` / `saved_views` | 按 `user_id` 隔离，已为多用户预留 |
| `rate_limits` | 非 auth 接口的固定窗口计数 |
| `user` / `session` / `account` / `verification` / `twoFactor` / `rateLimit` | better-auth 自有表，由 `gen-auth-schema` 生成 |

### 备份

WAL 模式下直接复制 `.db` 可能丢数据，先 checkpoint：

```bash
docker compose exec llminfo node -e "
const db = require('better-sqlite3')('/data/llminfo.db');
db.pragma('wal_checkpoint(TRUNCATE)'); db.close();
"
docker compose cp llminfo:/data/llminfo.db ./backup.db
```

---

## 9. 前端约定

- **设计令牌集中在 `globals.css` 的 `:root` 与 `.dark`**，不要在组件里写死颜色；
  强调色由 `appearance-provider.tsx` 在运行时写入 `--accent` 系列变量。
- **材质**：常驻表面用 `.mica-surface`，瞬时表面用 `.mica-acrylic`。
  新增 `backdrop-filter` 前请先确认该元素属于 Acrylic 白名单。
- **表格栅格**定义在 `globals.css` 的 `.tbl-head` / `.tbl-row`，
  列数必须与 `model-table.tsx` 的 `COLUMNS` 数组一致，否则会错位。
- **移动端是独立信息架构**，不是把桌面表格压窄：卡片流 + 底部标签栏。
  断点 1024px，`shell-nav` / `shell-tabbar` / `tbl-desktop` / `tbl-mobile`
  由 CSS 控制显隐。
- **全局浮层只能挂载一个实例。** 曾经的 bug：为不同断点各挂一个外观浮层，
  隐藏那份注册的全局点击外部关闭监听会把可见那份关掉。
- 数字列一律用 `.tnum`（等宽 + `tabular-nums`），保证价格纵向对齐。
- 无障碍：焦点环可见、图标按钮有 `aria-label`、切换类控件用
  `aria-pressed` / `aria-checked`、尊重 `prefers-reduced-motion`。

---

## 10. 部署

### 镜像构建

CI（`.github/workflows/docker.yml`）在类型检查与单元测试通过后构建
`linux/amd64` 镜像并推送 `ghcr.io/wiggins-kong/llminfo`，标签为
`latest` 与 `sha-<短哈希>`。

Dockerfile 的三个关键点：

1. 基础镜像用 `node:24-slim`（Debian）而非 Alpine——`better-sqlite3`
   自带 glibc 预编译产物，Alpine 会退化成源码编译。
2. 构建阶段把 `DATA_DIR` 指向 `/tmp`，避免 `next build` 触碰真实数据卷。
3. `postbuild` 会把 `.next/static` 与 `public/` 复制进 standalone 产物；
   Next.js 不会自动做这件事，**漏掉会导致线上静态资源全部 404**。

### NAS 部署

```bash
mkdir -p /volume1/docker/llminfo && cd /volume1/docker/llminfo
# 放入 docker-compose.yml 与填好的 .env
docker compose up -d
```

SakuraFrp 侧：创建 HTTP 隧道指向 NAS 内网 IP 的 3000 端口，绑定子域名并
开启自动 HTTPS，然后把公网地址写回 `.env` 的 `APP_URL` 并重启容器。

> SakuraFrp 的「访问认证」**只支持 TCP/UDP 隧道**，HTTP 隧道不适用，
> 公网安全完全由本应用承担。

---

## 11. 排错

| 现象 | 原因与处理 |
| --- | --- |
| `403 INVALID_ORIGIN` | 访问地址与 `APP_URL` 不一致（`localhost` vs `127.0.0.1`、端口或协议不同）。改成一致 |
| `Failed to initialize database adapter` | 多半是 `src/db/index.ts` 的 `has` 陷阱被删，或 `schema-ddl.ts` 缺少 better-auth 表。跑 `npm run migrate` 确认表齐全 |
| `Too many requests` | 触发了登录限流（8 次/分钟）。等一分钟，或清空 `rateLimit` 表 |
| 同步一直失败 | 看 `/api/status` 的 `lastError`。数据不会被清空，可放心排查 |
| 线上页面样式全丢 | standalone 产物缺少静态资源。确认 `npm run build` 的 `postbuild` 有执行 |
| `SQLITE_BUSY`（构建时） | 有模块在顶层打开了数据库。连接必须惰性创建 |
| 表格滚动卡顿 | 检查是否有新增元素带了 `backdrop-filter` |
| E2E 超时在登录步骤 | 先 `npm run build`；或限流生效，清空 `rateLimit` 表 |

---

## 12. 提交约定

- 提交信息用中文，格式 `<type>: <摘要>`，
  type 取 `feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `perf`
- 改动同步或清洗逻辑时，**必须**同时更新 `tests/upstream-quirks.test.ts`
- 每次发版更新 `CHANGELOG.md` 与 `package.json` 的 `version`，
  然后打 `vX.Y.Z` 标签；CI 会据此推送带版本号的镜像标签

---

## 13. 当前状态与后续方向

### 已完成

- 全部 v1 功能：双视角表格、筛选排序、详情与跨供应商比价、三张图表、
  对比、收藏、成本估算、CSV/JSON 导出、URL 状态
- 单账号 + 预留多用户的数据隔离，可选 TOTP
- 容器化与 CI 发布链路

### 明确不做（避免重复讨论）

- **变更日志 / 价格历史**：不保留历史快照，因此没有趋势图
- **移动端图表与导出**：桌面专属，移动端只做查询、详情、对比、收藏、成本估算
- **Passkey / WebAuthn**：`@better-auth/passkey` 已从依赖中移除
- **多架构镜像**：只构建 linux/amd64（NAS 为 x86_64）

### 可能的下一步

- 若上游提供增量或推送接口，可替换轮询
- 若增加 Cloudflare，把 `TRUST_PROXY_DEPTH` 改为 2 并处理 `CF-Connecting-IP`
- 若要支持多用户，`favorites` 与 `saved_views` 已按 `user_id` 隔离，
  只需开放账号创建入口
