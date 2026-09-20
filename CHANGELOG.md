# Changelog

## [2.0.0] - 2026-09-20

### Changed

- **彻底移除 Docker 主线**：删除 Next.js、SQLite、better-auth、Drizzle、
  服务端 API、认证与镜像构建链路。
- **交付物改为单个 HTML 文件**：`npm run build` 生成 `llminfo.html`，
  用户下载后双击即可运行，无服务端、无账号、无数据库。
- **静态资源全部内联**：ECharts、图标、样式与 Worker 均打包进 HTML，
  不依赖 CDN；字体使用系统字体栈。
- **数据直连 models.dev**：页面启动时拉取最新数据，每小时完整刷新，
  并提供「立即同步」；不缓存数据集。
- **本地状态**：收藏、保存视图、外观设置与对比列表存入浏览器 localStorage，
  设置面板支持导出、导入与清除。
- **功能对齐**：保留双视角查询、详情抽屉、跨供应商比价、对比、三张图表、
  成本估算、CSV / JSON 导出与 URL 状态。
- **测试与 CI**：Vitest 单元测试保留并扩展，Playwright 直接在 `file://`
  下覆盖 Chromium / Firefox / WebKit 与移动视口；Release 自动附带
  `llminfo.html`。

### Removed

- Dockerfile、docker-compose、entrypoint、standalone 打包脚本
- 登录、TOTP、Argon2、会话、限流、用户表与相关脚本
- Next.js App Router、API 路由、服务端数据库与旧 E2E 登录流程
