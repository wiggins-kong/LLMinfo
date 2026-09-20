# LLMinfo

单文件 LLM 模型信息看板。下载 `llminfo.html` 后双击即可运行，浏览器会直接从
[models.dev](https://models.dev) 拉取最新数据并在本地完成筛选、排序、图表与导出。

- **单文件**：无服务端、无数据库、无账号、无 Docker、无 CDN
- **完整功能**：双视角查询、详情抽屉、跨供应商比价、对比、收藏、保存视图、
  三张图表、成本估算、CSV / JSON 导出
- **本地优先**：收藏、保存视图、外观设置与对比选择保存在浏览器中，可导入导出
- **Windows 11 Fluent 视觉**：Mica / Acrylic 材质、亮暗主题、表格密度与强调色

## 使用

从 [GitHub Releases](https://github.com/wiggins-kong/LLMinfo/releases) 下载
`llminfo.html`，用当前版本的 Chrome、Edge、Firefox 或 Safari 打开即可。

首次打开需要联网下载约 4.7 MB 的上游数据（gzip 后约 0.5 MB）。之后每小时自动
完整刷新一次，也可以点击「立即同步」。刷新失败时页面会保留当前内存中的数据，
但**不会缓存数据集**：关闭页面后重新打开必须联网。

## 本地数据

以下内容保存在浏览器本地，不会上传到任何服务器：

- 收藏的模型
- 保存的筛选视图
- 外观设置（主题、密度、毛玻璃、强调色）
- 对比列表

设置面板提供「导出」「导入」「清除本地数据」。导入会整体替换当前本地数据。
换浏览器、使用无痕模式或清除站点数据都会导致这些内容丢失。

> 双击打开时页面地址是 `file://`，浏览器会把它归入本地站点存储。数据由浏览器
> 自身管理，不会在仓库或下载目录中生成额外文件。

## 开发

```bash
npm install
npm run dev        # Vite 开发服务器（开发预览）
npm run build      # 生成单文件 llminfo.html
npm run typecheck
npm test
npm run e2e        # 需要先执行 npm run build
```

浏览器测试直接在 `file://` 下打开产物，覆盖 Chromium、Firefox 与 WebKit，
以及桌面和移动视口。若本机未安装 Playwright 浏览器：

```bash
npm run e2e:install
```

## 架构

```
models.dev/api.json
        │  fetch（页面直连，每小时完整重拉）
        ▼
 source-schema.ts 宽松校验 → normalize.ts / transform.ts 归一化
        ▼
 query.worker.ts（内联 Blob Worker）过滤 / 排序 / 聚合
        ▼
 虚拟滚动表格 · 详情抽屉 · 图表 · 成本估算 · 导出
```

- `src/lib/`：可复用的纯逻辑（归一化、定价、查询、导出、本地存储）
- `src/ui/`：原生 DOM 渲染工具、内联图标、ECharts 图表
- `src/main.ts`：应用状态、事件绑定与视图渲染
- `scripts/build-html.mjs`：用 esbuild 把 TS / CSS / 图标 / ECharts 内联成单文件
- `tests/`：Vitest 单元测试
- `e2e/`：Playwright `file://` 端到端测试

## 数据来源

- 上游：`https://models.dev/api.json`
- 价格单位：USD / 百万 token
- 已知上游怪癖（`interleaved` 对象、缺失 `cost`、月粒度日期、`1970-01-01`
  哨兵、超大 context 等）由 `source-schema.ts` 与 `normalize.ts` 容错，
  并有回归测试覆盖
- 上游返回空数据集或非法 JSON 时，本次刷新失败并显示错误，不修改当前数据

## 明确不做

- 账号、多用户、权限、服务端安全边界
- 数据集离线缓存或价格历史
- CDN 或外部静态资源依赖
- 移动端图表与导出（图表与导出为桌面专属）
