# Development Guide

面向接手开发的工程师与 AI agent。目标：在新机器上克隆仓库后，无需询问任何人
即可继续开发单文件版 LLMinfo。

- 当前版本：`2.0.0`
- 运行时：Node.js >= 22
- 已验证平台：Windows（PowerShell），CI 为 Ubuntu

## 1. 五分钟上手

```bash
git clone https://github.com/wiggins-kong/LLMinfo.git
cd LLMinfo
npm install
npm run dev      # http://localhost:5173，开发预览
npm run build    # 生成 llminfo.html
```

`npm run dev` 只是开发预览；最终交付物是 `npm run build` 生成的单个 HTML。
浏览器测试必须基于构建产物，因为 Playwright 直接打开 `file://` 页面。

## 2. 命令速查

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | Vite 开发服务器 |
| `npm run build` | 生成单文件 `llminfo.html` |
| `npm run typecheck` | TypeScript 检查 |
| `npm test` | Vitest 单元测试 |
| `npm run test:watch` | 单元测试 watch |
| `npm run e2e` | Playwright 三浏览器 `file://` 测试（需先构建） |
| `npm run e2e:install` | 安装 Playwright Chromium / Firefox / WebKit |

## 3. 代码地图

```
src/
  main.ts                 应用状态、事件、视图渲染
  styles.css              设计令牌与 Fluent 材质
  lib/
    types.ts              前后端共用的 DTO
    source-schema.ts      models.dev 载荷的宽松 Zod schema
    normalize.ts          数据清洗：日期、上下文、模态、能力标记
    transform.ts          上游数据 → providers / models / offers
    pricing.ts            混合价与月成本计算
    query-engine.ts       过滤 / 排序 / 聚合（纯函数）
    export.ts             CSV / JSON 生成与下载
    source.ts             直连 models.dev 的抓取逻辑
    client-store.ts       localStorage、URL 状态与导入导出
    worker-client.ts      内联 Blob Worker 客户端
  workers/query.worker.ts Worker 参考实现与消息协议
  ui/
    format.ts             格式化与首字母色块
    icons.ts              内联 Lucide 图标
    charts.ts             内联 ECharts 图表
scripts/build-html.mjs    esbuild 单文件打包脚本
tests/                    Vitest 单元测试
e2e/                      Playwright 端到端测试
```

## 4. 数据流与关键约束

1. **只在线。** 页面启动后直接 `fetch("https://models.dev/api.json")`。
   `file://` 下浏览器不暴露 ETag / CORS 响应头，所以不要依赖 304；
   每小时完整重拉是刻意选择。
2. **不缓存数据集。** 只持久化收藏、视图、外观与对比。关闭页面后数据必须重新获取。
3. **计算放 Worker。** 查询通过 `createQueryClient()` 发往内联 Blob Worker。
   Worker 源码同时保留在 `src/workers/query.worker.ts` 作为协议参考。
4. **虚拟滚动。** 超过 120 行时只渲染可视窗口，避免 7,000+ 行 DOM。
5. **无外部资源。** 不允许新增 CDN、外部字体或远程样式；ECharts 与图标必须内联。
6. **失败不清空。** 刷新失败保留当前内存数据并显示错误，绝不能用空数据覆盖界面。

## 5. 单文件构建

`scripts/build-html.mjs` 使用 esbuild 打包 `src/main.ts`：

- `format: "iife"`，输出单个 `<script>`
- CSS 由 esbuild 收集后写入 `<style>`
- ECharts 只按需引入 Scatter / Bar / Canvas 渲染器
- 产物内嵌 CSP：`connect-src https://models.dev`、`worker-src blob:`、
  `img-src https://models.dev data:`
- 生成物 `llminfo.html` 不提交到仓库，由 CI 作为 Release 附件发布

构建后运行 `tests/build-output.test.ts` 会断言产物不含外部 script / stylesheet / CDN。

## 6. 本地状态

`src/lib/client-store.ts` 定义：

```json
{
  "version": 1,
  "favorites": ["model-id"],
  "savedViews": [{ "id": "...", "name": "...", "query": "q=...", "createdAt": "..." }],
  "appearance": { "theme": "system", "density": "comfortable", "acrylic": true, "accentId": "fluent-blue", "customAccent": "#0f6cbd" },
  "compare": ["model-id"]
}
```

导入会整体替换，导入前有确认弹窗；清除同样二次确认。查询条件本身放在 URL
查询参数中，不写入 localStorage，便于分享与书签。

## 7. 测试

```bash
npm run typecheck
npm test
npm run build
npm run e2e
```

E2E 直接在 `file://` 下运行，覆盖：

- 首次加载与虚拟滚动
- 搜索、筛选、排序
- 详情抽屉、对比
- 报价视图
- 图表（桌面）
- 成本估算
- 收藏持久化与清除
- URL 状态恢复

若本机 Firefox 无法启动（例如 `spawn UNKNOWN`），可在本机单独跑：

```bash
npx playwright test --project=desktop-chromium --project=desktop-webkit --project=mobile
```

CI 会运行完整的 Chromium / Firefox / WebKit 矩阵。

## 8. 上游数据

- 端点：`https://models.dev/api.json`
- 体积：约 4.7 MB（gzip 约 0.5 MB）
- 已知怪癖与处理方式：

| 字段 | 现象 | 处理 |
| --- | --- | --- |
| `interleaved` | 布尔或对象 | 对象视为 true |
| `reasoning_options[].values` | 偶含 null | 过滤非字符串 |
| 日期 | 月粒度、`1970-01-01` | 保留月粒度，哨兵转 null |
| `limit.context` | 0、负数、超大值 | 非正数转 null，超大显示「1亿+」 |
| `cost` | 缺失、0、阶梯价 | 未标价与免费分开处理 |
| `experimental` | 对象 | 标记为实验性 |

改动 schema 或清洗逻辑时必须同步更新 `tests/upstream-quirks.test.ts`。

## 9. 发布

打 `vX.Y.Z` 标签后，`release.yml` 会：

1. 校验标签与 `package.json` 版本一致
2. 从 `CHANGELOG.md` 提取对应版本说明
3. `npm ci && npm run build`
4. 创建 GitHub Release 并上传 `llminfo.html`

`verify.yml` 在 main 推送与 PR 上执行类型检查、单元测试、构建和完整浏览器矩阵。

## 10. 提交约定

- 提交信息用中文，格式 `<type>: <摘要>`
- type 取 `feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `perf`
- 改动清洗或定价逻辑时必须补测试
- 发版更新 `CHANGELOG.md` 与 `package.json` 版本号
