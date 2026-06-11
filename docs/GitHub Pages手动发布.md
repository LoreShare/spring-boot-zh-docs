# GitHub Pages 手动发布方案

## 目标

本站采用“本地翻译预览、GitHub Actions 手动发布、保留全部 GA 版本”的发布模式。

GitHub Actions 只负责测试、校验、构建和发布静态站点，不执行 DeepSeek 翻译，不读取 `DEEPSEEK_API_KEY`，也不随 `push` 自动上线。

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
4. workflow 执行 `npm ci`、`npm test`、`npm run validate`、`npm run build`。
5. workflow 上传 `build/site` 并部署到 GitHub Pages。

workflow 不配置 `push` 触发器，避免未经本地预览的内容自动上线。

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

## 密钥规则

- DeepSeek API key 只用于本地翻译。
- GitHub Actions 不配置 DeepSeek Secret。
- 仓库不提交 `.env`、真实 key 或任何私密配置。
