# Spring Boot 4.1.0 中文文档站 MVP

这是 Spring Boot `4.1.0` 官方文档的非官方中文翻译站 MVP。

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

## MVP 范围

当前已翻译：

- 首页
- 文档概览
- 社区
- 系统要求
- 安装
- 升级
- 教程首页
- 开发第一个 Spring Boot 应用

`reference`、`how-to`、`api`、`appendix` 等完整模块不在本轮范围内。

因此构建时会输出这些未翻译模块的 xref 错误日志，但不会中断静态站生成。

## 密钥

不要把真实 DeepSeek API key 写入仓库。

本地可以使用环境变量或 `.env`：

```bash
DEEPSEEK_API_KEY=sk-本地真实密钥
```

`.env` 已被 `.gitignore` 忽略。
