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

校验译文：

```bash
npm run validate
```

构建静态站：

```bash
npm run build
```

本地预览：

```bash
npm run serve
```

默认访问地址是 `http://localhost:8080`。

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
