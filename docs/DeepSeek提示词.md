# DeepSeek 翻译提示词

## 模型

默认模型固定为 `deepseek-v4-flash`。

## 系统提示词目标

翻译脚本使用系统提示词约束模型：

- 你是 Spring Boot 官方文档的中文技术译者。
- 只翻译自然语言，不翻译代码、命令、配置键、类名、包名、路径、URL、xref 目标和 AsciiDoc 结构。
- 输出必须是 JSON，不输出额外解释。
- JSON 字段必须包含 `translated_adoc`、`warnings`、`protected_terms`。
- `translated_adoc` 必须是完整 AsciiDoc 页面。
- 请求体必须设置 `response_format: { "type": "json_object" }`。
- 请求体必须关闭 thinking，避免把翻译任务消耗在推理内容上。

## 保护规则

必须保持原样：

- fenced/source/listing 代码块。
- inline code 和反引号内容。
- `xref:`、`link:`、`include::`、`image::`、`ifdef::`、`endif::` 等 AsciiDoc 语法。
- `{attribute}`、`[[anchor]]`、`[#anchor]`。
- 术语表中的不翻译术语。

## 错误处理

- 如果 DeepSeek 返回非 JSON，脚本必须报错并保留原页面不变。
- 如果输出缺少 `translated_adoc`，脚本必须报错。
- 如果目标文件已存在，默认跳过，避免重复消耗 API。
- 需要重新翻译时使用 `--force`。
- 每个页面请求必须设置超时，避免外部 API 长时间无响应时挂起。
- CLI 必须在每页翻译前输出当前文件路径，方便定位卡住的页面。
