# DeepSeek 翻译提示词

## 模型

默认模型固定为 `deepseek-v4-flash`。

## 系统提示词目标

翻译脚本使用系统提示词约束模型：

- 你是 Spring Boot 官方文档的中文技术译者。
- 只翻译自然语言，不翻译代码、命令、配置键、类名、包名、路径、URL、xref 目标和 AsciiDoc 结构。
- 专业术语、官方 endpoint ID、配置键、类名、命令、路径、协议名保持英文；普通说明、动作、描述和非专名标题必须使用中文。
- 不要在同一个可见标题、导航项或面包屑中输出“中文解释 (英文标识)”这类重复并列；需要保留官方 ID 时只保留 ID，需要解释含义时只写中文解释。
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
- 术语表中的专业术语和官方 endpoint ID。
- 脚本发送给 DeepSeek 前会把 listing/source 代码块、inline code、AsciiDoc 通用宏（例如 `xref:`、`javadoc:`、`configprop:`、`include-code::`）、anchors、attributes 和不翻译术语替换为 `@@CODE_BLOCK_N@@`、`@@ADOC_TOKEN_N@@`、`@@TERM_N@@` 占位符。
- DeepSeek 必须原样保留这些占位符；脚本收到响应后再恢复原文。

## 中文可见文案规则

- `endpoint` 在普通说明中译为“端点”，但 `conditions`、`httpexchanges` 等官方 endpoint ID 保持英文。
- `auto-configuration` 在普通说明中译为“自动配置”，但类名、包名、anchor 和 `AutoConfiguration` 标识保持英文。
- `annotation` 在普通说明中译为“注解”，但 Java 注解名保持英文。
- `bean` 在 Spring 容器对象语境中可保留为 `bean` 或 `Bean`，不要写成“bean 对象”这类重复表达。
- 导航、标题和面包屑不使用“条件评估报告 (conditions)”或“Spring 集成图 (integrationgraph)”这类中英重复形式。

## 错误处理

- 如果 DeepSeek 返回非 JSON，脚本必须报错并保留原页面不变。
- 如果输出缺少 `translated_adoc`，脚本必须报错。
- 如果输出缺少输入中的代码块占位符，脚本必须报错并触发重试，不能接受代码块已丢失的译文。
- 其他宏和术语占位符由后续 `npm run validate` 检查 xref、术语和代码块属性结构。
- 如果目标文件已存在，默认跳过，避免重复消耗 API。
- 需要重新翻译时使用 `--force`。
- 每个页面请求必须设置超时，避免外部 API 长时间无响应时挂起。
- CLI 必须在每页翻译前输出当前文件路径，方便定位卡住的页面。
