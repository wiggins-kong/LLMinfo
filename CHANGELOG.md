# Changelog

本文件记录 LLMinfo 的所有重要变更。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Fixed

- **CI 镜像构建失败**（`gyp ERR! find Python`）：`better-sqlite3` 的 tarball 声明了
  `"gypfile": false` 以阻止编译，但 `package-lock.json` 不记录该字段，npm 在
  lockfile 驱动的 `npm ci` 下判定 `pkg.gypfile !== false` 成立，合成出
  `node-gyp rebuild`，而 `node:24-slim` 没有 Python。改为 `npm ci --ignore-scripts`
  （行内 flag，非 ENV，否则会连带屏蔽 `postbuild`）
- **容器内 `npm run create-user` / `npm run migrate` 不可用**：standalone 产物不含
  `scripts/` 与 `src/`，且运行镜像没有 `tsx`。改为在 Dockerfile 中显式复制这两份
  脚本及其依赖的模块，并让 npm 脚本直接用 `node` 运行（Node 24 原生类型擦除）
- 移除构建阶段 `AUTH_SECRET` 的 `ENV` 声明（改用行内变量），消除 Docker 的
  `SecretsUsedInArgOrEnv` 警告


## [1.0.0] - 2026-09-19

首个可用版本。自托管 LLM 模型信息看板：服务端定时同步 models.dev，
浏览器端在 Web Worker 中筛选排序，单容器部署，面向公网暴露。

### Added

**数据同步与清洗**

- 服务端每 60 分钟带 `If-None-Match` 条件请求同步 `https://models.dev/api.json`，
  命中 304 时零流量且不改动数据
- 同步写入为**单事务整体替换**，读取方只会看到旧的或新的完整快照
- 任何失败（网络中断、JSON 非法、Schema 校验失败、上游返回空数据集）
  都保留上一份可用快照，并记录 `last_error`，绝不清空数据
- 基于字段内容计算 `content_hash` 作为数据集 ETag，价格或规格变化即失效
- 供应商 logo 尽力抓取并缓存到 `/data/logos/`，失败降级为首字母色块
- SQLite 行锁防止多实例或重启期间的并发同步，锁超时 5 分钟

**数据清洗规则**

- 缺失 `cost` 字段的 413 条报价显示「未标价」，与 `input=output=0` 的
  628 条「免费」报价严格区分
- `1970-01-01` 哨兵日期归一为 `null`
- `limit.context` 为 `0` 或负数时视为未知
- `limit.context` 为 `99,999,999` 时显示为「1亿+」
- 阶梯价（`tiers`）与超 200K 上下文价（`context_over_200k`）在详情页展开并加角标

**对外接口**

- `GET /api/dataset` — 精简数据集，带 `ETag` 与
  `private, max-age=0, must-revalidate`，重复轮询命中 304
- `POST /api/refresh` — 手动刷新，每账号 5 分钟 5 次
- `GET /api/status` — 同步元数据（最后同步时间、计数、最近错误）
- `GET|POST|DELETE /api/favorites` — 收藏
- `GET|POST|DELETE /api/views` — 保存的筛选视图（每用户上限 50 个）
- `GET /api/logo/[id]` — 本地缓存的供应商 logo，带沙箱 CSP
- `GET /api/health` — 健康检查，同时触发启动引导流程

**认证与安全**

- 注册接口彻底关闭；首个管理员账号由启动流程创建，环境变量仅在首次生效
- 密码使用 Argon2id（19 MiB 内存 / t=2 / p=1），哈希参数在启动路径、
  CLI 与认证提供方三处共用同一常量，避免不一致导致已有密码失效
- 可选 TOTP 两步验证，含一次性备用码
- 会话 Cookie 为 `HttpOnly + Secure + SameSite=Lax`，7 天滚动过期
- 登录限流 8 次/分钟；刷新、导出、TOTP 校验分别限流，计数持久化在 SQLite
- 按 SakuraFrp 的真实行为**只取 `X-Forwarded-For` 的最后一个 IP** 作为限流键
  （frpc 将真实 IP 追加在末尾，前面的内容客户端可伪造）
- 非 root 容器运行，`no-new-privileges`，`/data` 为唯一可写卷

**前端**

- Windows 11 Fluent 设计语言：Mica 用于常驻表面（窗口底色、侧栏），
  Acrylic 仅用于瞬时表面（标题栏、表头、详情抽屉、浮层、移动端标签栏）
- 6 个预设强调色 + 自定义取色器，写入 localStorage
- 首次访问无偏好时桌面跟随系统、移动端默认亮色；手动切换后持久化优先
- 毛玻璃开关：关闭后退回不透明表面，便于对比滚动性能
- 表格密度「舒适 / 紧凑」两档（行高 42px / 34px）
- 双视角：模型聚合（按 `modelId` 合并）与供应商报价（明细）
- 虚拟滚动表格，列显隐随断点自适应
- 筛选：搜索、供应商、家族、输入模态、7 项能力、状态、价格区间、
  上下文区间、输出上限、知识截止、发布/更新日期、仅免费、仅未标价
- 排序：输入价、输出价、混合价、缓存读写、上下文、输出上限、
  发布日、更新日、名称、供应商数、能力数
- 混合价默认 `(3×输入 + 输出) / 4`，可切 1:1，缓存价不参与
- 缺失价格在任意排序方向下恒排末尾
- 详情抽屉：说明、跨供应商比价矩阵、阶梯价、能力、模态、接入片段
- 三张分析图（仅桌面，随筛选联动）：性价比散点、供应商分布、上下文分布
- 最多 4 个模型并排对比，差异项高亮最优值
- 月成本计算器，支持缓存命中率与预设用量档位
- CSV / JSON 导出（仅桌面），基于当前筛选结果在浏览器端生成
- 键盘：`/` 聚焦搜索、`Esc` 关闭浮层与抽屉
- 查询状态全部写入 URL，可分享、可收藏、支持浏览器前进后退
- 移动端为独立信息架构：卡片流 + 横向滚动筛选 + 底部标签栏四项
  （模型 / 对比 / 收藏 / 成本估算），图表与导出保持桌面专属
- 尊重 `prefers-reduced-motion`，亮暗两套主题对比度均达 4.5:1

**性能**

- 7,800+ 条报价的筛选、排序与聚合全部在 Web Worker 中完成，主线程只渲染
  可见窗口；worker 忽略过期响应，避免乱序回写
- IndexedDB 缓存数据集，冷启动先渲染缓存再后台按 ETag 重验证
- 数据集在服务端按内容哈希做进程内缓存，避免重复序列化 7,000+ 行
- SQLite 连接惰性创建，`next build` 期间不打开数据库文件

**部署**

- `Dockerfile`：`node:24-slim`、非 root、`dumb-init` 作 PID 1、内置 HEALTHCHECK；
  选用 Debian 而非 Alpine，因为 `better-sqlite3` 自带 glibc 预编译产物，
  无需编译器工具链
- `docker-compose.yml`：数据卷挂载、健康检查、`restart: unless-stopped`
- GitHub Actions 工作流：类型检查 + 单元测试后构建并推送
  `ghcr.io/wiggins-kong/llminfo`（`latest` 与 `sha-<短哈希>`），仅 linux/amd64
- `scripts/create-user.ts`：在容器内添加账号（注册接口关闭后的唯一途径）
- `scripts/migrate.ts`：不启动 Next.js 即可建表
- `scripts/gen-auth-schema.ts`：从 better-auth 自身定义生成其建表 SQL
- `scripts/prepare-standalone.mjs`：将 `.next/static` 与 `public/`
  镜像进 standalone 产物（Next.js 不会自动复制）

**测试**

- 69 个单元测试：数据清洗规则、定价与月成本、筛选排序引擎、聚合逻辑、
  CSV 转义、上游数据怪癖回归
- 46 个端到端测试：桌面暗色、桌面亮色、移动端三个项目，覆盖登录、
  表格、筛选、排序、详情、对比、收藏、导出、成本估算、主题持久化、
  未登录重定向、错误密码、移动端卡片流与无横向溢出

### Fixed

开发期间通过实际运行发现并修复的问题，均补充了回归测试：

- **上游 `interleaved` 字段有两种形态**（87 个布尔值、1,010 个
  `{field: ...}` 对象），原先的严格布尔校验会导致整个 7,860 行同步失败；
  现改为宽松解析，对象视为「支持」
- **上游 `reasoning_options[].values` 含 `null`**，同样会中断同步；现过滤掉
  非字符串项
- **上游日期存在月粒度**（235 条形如 `2025-04`），原先被当作非法值丢弃；
  现同时接受 `YYYY-MM` 与 `YYYY-MM-DD`，无效日期从 244 条降至 9 条
  （仅剩真正的 1970 哨兵）
- **`Proxy` 的 `in` 陷阱缺失**：better-auth 用 `"aggregate" in db` 探测驱动类型，
  而 `in` 默认查代理目标（空对象），导致 adapter 初始化失败并报
  "Failed to initialize database adapter"；补 `has`、`ownKeys`、
  `getOwnPropertyDescriptor` 三个陷阱后解决
- **better-auth 建表 SQL 缺少 `id` 主键列**：手写 DDL 与 better-auth 自身
  迁移行为不一致；改为由其定义生成
- **`disableSignUp` 会连带阻止启动建号**：首个管理员原先调用
  `signUpEmail` 接口，被该开关挡下；现直接写入 `user` 与 `account` 两行
- **Cookie 缓存与 SQLite 的日期类型不兼容**：better-auth 的缓存载荷校验要求
  `Date` 实例，而 Kysely 的 SQLite 方言返回整数，导致每次请求都告警并回退查库；
  已关闭该缓存并注明原因
- **详情抽屉挂在 0 高度容器内**，实际不可见；改为相对整个应用外壳定位
- **外观浮层被渲染了两份**，隐藏的那份注册的全局点击外部关闭监听会把可见的
  那份关掉；改为只挂载一个实例并按断点定位
- **移动端状态栏的单位文案被裁掉**，且状态栏不换行

### Changed

- 清理了 14 个已声明但从未被引用的运行时依赖
  （`@radix-ui/*` 全系列、`@tanstack/react-table`、`nuqs`、`zustand`、
  `next-themes`、`class-variance-authority`、`@better-auth/passkey`）
- 移除 `lint` 脚本（Next.js 16 已删除 `next lint` 命令）
- 移除指向不存在文件的 `seed-demo` 脚本

### Security

- 公网部署的安全基线：注册关闭、Argon2id、可选 TOTP、登录限流、
  安全响应头、非 root 容器
- 注意：SakuraFrp 的「访问认证」功能**仅支持 TCP/UDP 隧道**，HTTP 隧道
  不适用，因此公网暴露的安全性完全由本应用承担

[Unreleased]: https://github.com/wiggins-kong/LLMinfo/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/wiggins-kong/LLMinfo/releases/tag/v1.0.0
