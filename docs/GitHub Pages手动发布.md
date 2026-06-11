# GitHub Pages 手动发布方案

## 目标

本站采用“本地翻译预览、GitHub Actions 手动发布、保留全部 GA 版本”的发布模式。

GitHub Actions 只负责同步固定上游源、测试、校验、构建和发布静态站点，不执行 DeepSeek 翻译，不读取 `DEEPSEEK_API_KEY`，也不随 `push` 自动上线。

线上站点地址：

```text
https://loreshare.github.io/spring-boot-zh-docs/
```

当前最新稳定版中文入口：

```text
https://loreshare.github.io/spring-boot-zh-docs/boot/4.1.0/
```

## 本地流程

新版本或译文调整必须先在本地完成：

```bash
npm run sync:source
DEEPSEEK_API_KEY=你的本地密钥 npm run translate:all
npm run materialize:include-code
npm test
npm run validate
npm run build
npm run serve
```

本地访问 `http://localhost:8080` 验收通过后，再提交中文 commit 并推送到 GitHub。

## 手动发布流程

GitHub Pages 发布只能手动触发：

1. 打开 GitHub 仓库的 Actions 页面。
2. 选择 Pages 发布 workflow。
3. 点击 `Run workflow`。
4. workflow 执行 `npm ci`、`npm test`、`npm run sync:source`、`npm run validate`、`npm run build`。
5. workflow 上传 `build/site` 并部署到 GitHub Pages。

workflow 不配置 `push` 触发器，避免未经本地预览的内容自动上线。

`npm run sync:source` 只同步 Spring Boot `4.1.0` 官方源，用于 `npm run validate` 的完整性审计；它不会调用 DeepSeek，也不会改写译文。

## 多版本约定

中文内容按 GA 版本保存：

```text
versions/<version>/content/boot
```

当前版本为：

```text
versions/4.1.0/content/boot
```

后续新 GA 版本新增目录，例如：

```text
versions/4.2.0/content/boot
```

所有 GA 版本都保留，不删除历史版本。Antora playbook 使用 `start_paths: versions/*/content/boot` 收集所有版本，页面中的版本选择器由 Antora 默认 UI 生成。

README 和公开页面说明应把本站定位为 Spring Boot 中文站：当前提供 Spring Boot `4.1.0` 最新稳定版中文化内容，后续 Spring Boot 发布新的稳定版后新增对应中文版本，并继续保留历史 GA 版本。

## README 展示约定

README 是 GitHub 仓库首页，优先服务第一次进入项目的读者：

- 开头必须直接说明本站是 Spring Boot 非官方中文站，当前提供 Spring Boot `4.1.0` 最新稳定版中文化内容。
- 在线访问入口必须放在靠前位置，并包含 Pages 首页和当前最新稳定版文档入口。
- README 必须展示站点效果截图，截图资源保存到仓库固定路径，不能引用本机临时文件。
- README 必须引用 Spring Boot 官方支持页面 `https://spring.io/projects/spring-boot#support`，并列出当前可见的主要 GA 分支支持周期，方便读者判断要查阅哪个版本。
- README 不再展示“当前范围”式的长清单；翻译范围、构建细节和已知限制由 `docs/构建配置.md`、`docs/验收记录.md` 等维护文档承载。
- README 不得出现真实 DeepSeek API key，只能说明密钥来自环境变量或 `.env`。

## 构建地址

本地构建默认站点地址为：

```text
http://localhost:8080
```

GitHub Actions 发布时必须通过环境变量传入 GitHub Pages 地址，例如：

```bash
SITE_URL="https://用户名.github.io/仓库名" npm run build
```

构建脚本使用该地址覆盖 Antora 的 `site.url`，避免线上页面出现 `localhost` canonical 或顶部品牌链接。

## GitHub Pages 兼容

构建产物必须包含：

```text
build/site/.nojekyll
```

该文件用于避免 GitHub Pages 按 Jekyll 规则忽略 Antora 的 `_` 静态资源目录。

公开发布的 HTML 不允许出现本机路径或 `file://` 编辑链接。当前 playbook 关闭 Antora 默认的远程编辑地址，构建脚本会删除默认 UI 回退生成的本地 `Edit this Page` 链接，并在产物审计中阻止这类链接残留。如果后续需要恢复编辑入口，必须改为指向 GitHub 仓库源码的 HTTPS 地址。

## 密钥规则

- DeepSeek API key 只用于本地翻译。
- GitHub Actions 不配置 DeepSeek Secret。
- 仓库不提交 `.env`、真实 key 或任何私密配置。
