# Spring Boot 4.1.0 中文文档站

这是 Spring Boot `4.1.0` 官方文档的非官方中文翻译站。译文由 DeepSeek `deepseek-v4-flash` 辅助生成，仍需要人工校对。

## 快速开始

安装依赖：

```bash
npm install
```

同步上游文档源：

```bash
npm run sync:source
```

翻译 MVP 页面：

```bash
DEEPSEEK_API_KEY=你的本地密钥 npm run translate:mvp
```

翻译全量页面：

```bash
DEEPSEEK_API_KEY=你的本地密钥 npm run translate:all
```

展开官方示例源码：

```bash
npm run materialize:include-code
```

校验译文：

```bash
npm run validate
```

生成完整性审计报告：

```bash
npm run audit:completeness
```

构建静态站：

```bash
npm run build
```

构建产物默认位于 latest 版本路径，例如 `build/site/boot/4.1.0`。
构建脚本会同时生成以下无版本前缀兼容入口：

```text
build/site/maven-plugin/index.html
build/site/gradle-plugin/index.html
build/site/api/rest/actuator/index.html
```

本地预览：

```bash
npm run serve
```

默认访问地址是 `http://localhost:8080`。

## GitHub Pages 发布

本站采用手动发布：翻译、校验、构建和预览先在本地完成；确认后推送代码，再到 GitHub Actions 手动触发 Pages 发布 workflow。

GitHub Actions 不执行 `translate:mvp` 或 `translate:all`，不读取 `DEEPSEEK_API_KEY`，也不随 `push` 自动上线。workflow 会在校验前执行 `npm run sync:source`，只同步固定上游源用于完整性审计。发布前本地至少执行：

```bash
npm test
npm run validate
npm run build
npm run serve
```

详细约定见 `docs/GitHub Pages手动发布.md`。

## Docker 运行

构建 Docker 镜像：

```bash
docker build -t spring-boot-zh-docs:4.1.0 .
```

运行容器：

```bash
docker run --rm -p 8080:80 --name spring-boot-zh-docs spring-boot-zh-docs:4.1.0
```

容器内使用 Node.js 构建静态站点，再由 nginx 暴露 `build/site`。由于 Antora playbook 使用当前 Git 仓库的 `HEAD` 作为本地内容源，Docker 构建上下文需要保留 `.git` 元数据；最终运行镜像只包含生成后的静态文件。

默认构建阶段使用 `node:24-alpine`，运行阶段使用 `nginx:alpine`。Dockerfile 不使用额外的 `# syntax=` 构建前端指令，避免在基础镜像之外增加一次外部镜像拉取。

## 翻译范围

当前已翻译并纳入导航：

- ROOT
- tutorial
- reference
- how-to
- build-tool-plugin
- cli
- api 导航 partial
- Maven Plugin
- Gradle Plugin
- Actuator REST API
- specification
- appendix

不包含官方构建时生成的 Javadoc 和 Kotlin API 页面。

Java API 和 Kotlin API 仍作为外部英文 API 参考链接保留，不生成中文镜像页面。

上游官方构建流程生成的配置属性表、插件目标表、Actuator REST API 请求/响应片段和少量 example 片段不在 Antora 源目录内。
当前站点使用中文占位 partial 补齐这些 include，避免构建产物出现 unresolved include。

Spring Boot 官方 `include-code::` 宏引用的 Java/Kotlin 示例源码会通过 `npm run sync:source` 同步，并由 `npm run materialize:include-code` 展开为本地 AsciiDoc 代码块。

## Token 用量

`reports/deepseek-usage.jsonl` 记录成功写入译文的 DeepSeek 请求用量：

- prompt tokens：1,058,213
- completion tokens：798,863
- total tokens：1,857,076

该统计不包含少量失败请求和调试请求的实际消耗。

## 密钥

不要把真实 DeepSeek API key 写入仓库。

本地可以使用环境变量或 `.env`：

```bash
DEEPSEEK_API_KEY=sk-本地真实密钥
```

`.env` 已被 `.gitignore` 忽略。
