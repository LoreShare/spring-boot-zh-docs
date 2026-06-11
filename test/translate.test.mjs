import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_MODEL,
  COPY_ONLY_FILES,
  MVP_PAGES,
  PROTECTED_TERMS,
  buildDeepSeekRequest,
  buildFullTranslationPlan,
  buildTranslationMessages,
  createUsageRecord,
  filterTranslationPlanByPaths,
  getOutputPathForPage,
  parsePathsOption,
  prepareSourceForTranslation,
  parseTranslationJson,
  requestTranslation,
  splitAsciiDocForTranslation,
  translateContentWithRetries,
} from '../scripts/lib/translate.mjs';

test('DeepSeek 请求固定使用 deepseek-v4-flash 并要求 JSON 输出', () => {
  const messages = buildTranslationMessages({
    relativePath: 'modules/ROOT/pages/index.adoc',
    source: '= Spring Boot\n\nWelcome to Spring Boot.',
  });
  const request = buildDeepSeekRequest({ messages });

  assert.equal(DEFAULT_MODEL, 'deepseek-v4-flash');
  assert.equal(request.model, 'deepseek-v4-flash');
  assert.equal(request.temperature, 0.1);
  assert.deepEqual(request.response_format, { type: 'json_object' });
  assert.deepEqual(request.thinking, { type: 'disabled' });
  assert.match(request.messages[0].content, /translated_adoc/);
  assert.match(request.messages[0].content, /不要翻译代码/);
});

test('提示词包含默认保护术语和 AsciiDoc 保护要求', () => {
  const messages = buildTranslationMessages({
    relativePath: 'modules/ROOT/pages/installing.adoc',
    source: '`spring.main.banner-mode` and xref:index.adoc[]',
  });

  assert.ok(PROTECTED_TERMS.includes('Spring Boot'));
  assert.ok(PROTECTED_TERMS.includes('Actuator'));
  assert.match(messages[0].content, /Spring Boot/);
  assert.match(messages[0].content, /xref/);
  assert.match(messages[0].content, /普通英文句子必须翻译/);
  assert.match(messages[1].content, /modules\/ROOT\/pages\/installing\.adoc/);
});

test('上下文普通词不作为全局保护术语', () => {
  assert.ok(!PROTECTED_TERMS.includes('endpoint'));
  assert.ok(!PROTECTED_TERMS.includes('auto-configuration'));
  assert.ok(!PROTECTED_TERMS.includes('annotation'));

  const prepared = prepareSourceForTranslation([
    '`conditions` endpoint reports auto-configuration outcomes.',
    'Use javadoc:org.example.Demo[format=annotation] annotation.',
  ].join('\n'));

  assert.match(prepared.source, /endpoint reports auto-configuration outcomes/);
  assert.match(prepared.source, /annotation\./);
  assert.doesNotMatch(prepared.source, /@@TERM_\d+@@ reports @@TERM_\d+@@ outcomes/);
});

test('解析纯 JSON 或 fenced JSON 响应', () => {
  assert.deepEqual(
    parseTranslationJson('{"translated_adoc":"= 标题","warnings":[],"protected_terms":["Spring Boot"]}'),
    {
      translated_adoc: '= 标题',
      warnings: [],
      protected_terms: ['Spring Boot'],
    },
  );

  assert.deepEqual(
    parseTranslationJson('```json\n{"translated_adoc":"正文","warnings":["检查"],"protected_terms":[]}\n```'),
    {
      translated_adoc: '正文',
      warnings: ['检查'],
      protected_terms: [],
    },
  );
});

test('缺少 translated_adoc 时拒绝响应', () => {
  assert.throws(
    () => parseTranslationJson('{"warnings":[],"protected_terms":[]}'),
    /缺少 translated_adoc/,
  );
});

test('MVP 页面默认输出到 latest 版本内容目录', () => {
  assert.ok(MVP_PAGES.includes('modules/tutorial/pages/first-application/index.adoc'));
  assert.equal(
    getOutputPathForPage('modules/tutorial/pages/first-application/index.adoc'),
    'versions/4.1.0/content/boot/modules/tutorial/pages/first-application/index.adoc',
  );
});

test('DeepSeek 请求超时时返回中文错误', async () => {
  await assert.rejects(
    () => requestTranslation({
      apiKey: 'fake-key',
      relativePath: 'modules/ROOT/pages/index.adoc',
      source: '= Spring Boot',
      timeoutMs: 5,
      fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
    }),
    /DeepSeek 请求超时/,
  );
});

test('全量翻译计划跳过组件配置并区分翻译与复制', () => {
  const files = [
    'antora.yml',
    'nav.adoc',
    'modules/ROOT/pages/index.adoc',
    'modules/ROOT/pages/redirect.adoc',
    'modules/reference/partials/dockerfile',
  ];

  assert.ok(COPY_ONLY_FILES.includes('modules/ROOT/pages/redirect.adoc'));
  assert.deepEqual(buildFullTranslationPlan({ files }), [
    { relativePath: 'nav.adoc', action: 'copy' },
    { relativePath: 'modules/ROOT/pages/index.adoc', action: 'translate' },
    { relativePath: 'modules/ROOT/pages/redirect.adoc', action: 'copy' },
    { relativePath: 'modules/reference/partials/dockerfile', action: 'copy' },
  ]);
});

test('多源全量翻译计划包含插件和 Actuator REST API 文档', () => {
  const plan = buildFullTranslationPlan({
    sources: [
      {
        sourceId: 'core',
        sourceRoot: 'source/core',
        files: [
          'antora.yml',
          'local-nav.adoc',
          'nav.adoc',
          'modules/ROOT/pages/index.adoc',
        ],
      },
      {
        sourceId: 'maven-plugin',
        sourceRoot: 'source/maven-plugin',
        files: [
          'antora.yml',
          'local-nav.adoc',
          'modules/maven-plugin/pages/index.adoc',
          'modules/maven-plugin/examples/getting-started/pom.xml',
          'modules/maven-plugin/partials/nav-maven-plugin.adoc',
        ],
      },
      {
        sourceId: 'gradle-plugin',
        sourceRoot: 'source/gradle-plugin',
        files: [
          'modules/gradle-plugin/pages/index.adoc',
          'modules/gradle-plugin/examples/getting-started/apply-plugin.gradle',
        ],
      },
      {
        sourceId: 'actuator-rest-api',
        sourceRoot: 'source/actuator-rest-api',
        files: [
          'modules/api/pages/rest/actuator/index.adoc',
          'modules/api/partials/nav-actuator-rest-api.adoc',
        ],
      },
    ],
  });

  assert.deepEqual(plan, [
    {
      sourceId: 'core',
      sourceRoot: 'source/core',
      relativePath: 'nav.adoc',
      action: 'copy',
    },
    {
      sourceId: 'core',
      sourceRoot: 'source/core',
      relativePath: 'modules/ROOT/pages/index.adoc',
      action: 'translate',
    },
    {
      sourceId: 'actuator-rest-api',
      sourceRoot: 'source/actuator-rest-api',
      relativePath: 'modules/api/pages/rest/actuator/index.adoc',
      action: 'translate',
    },
    {
      sourceId: 'actuator-rest-api',
      sourceRoot: 'source/actuator-rest-api',
      relativePath: 'modules/api/partials/nav-actuator-rest-api.adoc',
      action: 'translate',
    },
    {
      sourceId: 'gradle-plugin',
      sourceRoot: 'source/gradle-plugin',
      relativePath: 'modules/gradle-plugin/examples/getting-started/apply-plugin.gradle',
      action: 'copy',
    },
    {
      sourceId: 'gradle-plugin',
      sourceRoot: 'source/gradle-plugin',
      relativePath: 'modules/gradle-plugin/pages/index.adoc',
      action: 'translate',
    },
    {
      sourceId: 'maven-plugin',
      sourceRoot: 'source/maven-plugin',
      relativePath: 'modules/maven-plugin/examples/getting-started/pom.xml',
      action: 'copy',
    },
    {
      sourceId: 'maven-plugin',
      sourceRoot: 'source/maven-plugin',
      relativePath: 'modules/maven-plugin/pages/index.adoc',
      action: 'translate',
    },
    {
      sourceId: 'maven-plugin',
      sourceRoot: 'source/maven-plugin',
      relativePath: 'modules/maven-plugin/partials/nav-maven-plugin.adoc',
      action: 'translate',
    },
  ]);
});

test('paths 参数按模块路径过滤全量翻译计划', () => {
  const plan = [
    { relativePath: 'modules/ROOT/pages/index.adoc', action: 'translate' },
    { relativePath: 'modules/maven-plugin/pages/index.adoc', action: 'translate' },
    { relativePath: 'modules/maven-plugin/pages/run.adoc', action: 'translate' },
    { relativePath: 'modules/gradle-plugin/pages/index.adoc', action: 'translate' },
  ];

  assert.deepEqual(parsePathsOption(['--force', '--paths=modules/maven-plugin,modules/gradle-plugin/pages/index.adoc']), [
    'modules/maven-plugin',
    'modules/gradle-plugin/pages/index.adoc',
  ]);

  assert.deepEqual(filterTranslationPlanByPaths(plan, [
    'modules/maven-plugin',
    'modules/gradle-plugin/pages/index.adoc',
  ]), [
    { relativePath: 'modules/maven-plugin/pages/index.adoc', action: 'translate' },
    { relativePath: 'modules/maven-plugin/pages/run.adoc', action: 'translate' },
    { relativePath: 'modules/gradle-plugin/pages/index.adoc', action: 'translate' },
  ]);
});

test('AsciiDoc 分块不在 listing 代码块内部切分', () => {
  const source = [
    '= 标题',
    '',
    '第一段很长很长。',
    '----',
    'line 1',
    'line 2',
    '----',
    '第二段也很长很长。',
  ].join('\n');

  const chunks = splitAsciiDocForTranslation(source, { maxChars: 24 });

  assert.equal(chunks.length, 3);
  assert.match(chunks[1].content, /----\nline 1\nline 2\n----/);
  assert.deepEqual(chunks.map((chunk) => chunk.index), [1, 2, 3]);
});

test('AsciiDoc 分块在 listing 代码块闭合后立即切分', () => {
  const source = [
    '说明。',
    '----',
    'line 1',
    '----',
    '后续正文。',
  ].join('\n');

  const chunks = splitAsciiDocForTranslation(source, { maxChars: 10_000 });

  assert.deepEqual(chunks.map((chunk) => chunk.content), [
    '说明。',
    '----\nline 1\n----',
    '后续正文。',
  ]);
});

test('usage 记录不包含密钥并保留 token 用量', () => {
  const record = createUsageRecord({
    relativePath: 'modules/ROOT/pages/index.adoc',
    chunkIndex: 1,
    chunkCount: 2,
    model: 'deepseek-v4-flash',
    usage: {
      prompt_tokens: 100,
      completion_tokens: 80,
      total_tokens: 180,
    },
  });

  assert.deepEqual(record, {
    relativePath: 'modules/ROOT/pages/index.adoc',
    chunkIndex: 1,
    chunkCount: 2,
    model: 'deepseek-v4-flash',
    promptTokens: 100,
    completionTokens: 80,
    totalTokens: 180,
  });
});

test('单块翻译失败时自动减小分块并重试', async () => {
  const calls = [];
  const result = await translateContentWithRetries({
    apiKey: 'fake-key',
    relativePath: 'modules/reference/pages/using/auto-configuration.adoc',
    source: ['第一段。', '第二段。', '第三段。', '第四段。'].join('\n'),
    initialMaxChunkChars: 100,
    minChunkChars: 8,
    requestTranslationImpl: async ({ source, chunkIndex, chunkCount }) => {
      calls.push({ source, chunkIndex, chunkCount });
      if (chunkCount === 1) {
        throw new SyntaxError('Unterminated string in JSON');
      }
      return {
        translated_adoc: `译文${chunkIndex}`,
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
        model: 'deepseek-v4-flash',
      };
    },
  });

  assert.equal(result.translated, '译文1\n译文2\n译文3\n译文4');
  assert.equal(result.usageRecords.length, 4);
  assert.ok(calls.length > 1);
  assert.equal(calls.at(-1).chunkCount, 4);
});

test('翻译结果会统一 REST API 页面标题和 endpoint 文案', async () => {
  const result = await translateContentWithRetries({
    apiKey: 'fake-key',
    relativePath: 'modules/api/pages/rest/actuator/conditions.adoc',
    source: [
      '= Conditions Evaluation Report (`conditions`)',
      '',
      '`conditions` endpoint provides information.',
    ].join('\n'),
    requestTranslationImpl: async () => ({
      translated_adoc: [
        '= 条件评估报告 (`conditions`)',
        '',
        '`conditions` endpoint 提供 auto-configuration 类信息。',
        '=== Graylog 扩展日志格式 (GELF)',
        'Actuator Health Endpoints 可以用作探针。',
        '高级消息队列协议（AMQP）是一种协议。',
        'Spring Boot 为面向切面编程（AOP）提供了 auto-configuration。',
        '== 面向切面编程',
        'Google 远程过程调用 是一个高性能 RPC 框架。',
      ].join('\n'),
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
      model: 'deepseek-v4-flash',
    }),
  });

  assert.equal(result.translated, [
    '= conditions',
    '',
    '`conditions` 端点提供自动配置类信息。',
    '=== GELF',
    'Actuator Health 端点可以用作探针。',
    'AMQP 是一种协议。',
    'Spring Boot 为 AOP 提供了自动配置。',
    '== AOP',
    'gRPC 是一个高性能 RPC 框架。',
  ].join('\n'));
});

test('发送翻译前保护代码块和不翻译术语并可恢复', () => {
  const source = [
    'Spring Boot 支持 native image。',
    '请参见 xref:actuator/endpoints.adoc#actuator.endpoints[] 和 `spring.main.banner-mode`。',
    '----',
    '$ java -jar demo.jar',
    '----',
    'Actuator endpoint。',
  ].join('\n');

  const prepared = prepareSourceForTranslation(source);

  assert.match(prepared.source, /@@TERM_\d+@@/);
  assert.match(prepared.source, /@@ADOC_TOKEN_\d+@@/);
  assert.match(prepared.source, /@@CODE_BLOCK_\d+@@/);
  assert.doesNotMatch(prepared.source, /java -jar/);
  assert.doesNotMatch(prepared.source, /xref:actuator/);
  assert.doesNotMatch(prepared.source, /spring\.main\.banner-mode/);

  const restored = prepared.restore(prepared.source);

  assert.match(restored, /Spring Boot/);
  assert.match(restored, /native image/);
  assert.match(restored, /xref:actuator\/endpoints\.adoc#actuator\.endpoints\[\]/);
  assert.match(restored, /`spring\.main\.banner-mode`/);
  assert.match(restored, /\$ java -jar demo\.jar/);
  assert.match(restored, /Actuator/);
  assert.match(restored, /endpoint/);
});

test('保护嵌套 xref 和 javadoc 宏', () => {
  const source = [
    'Several properties are provided for xref:how-to:spring-mvc.adoc#howto.spring-mvc.customize-jackson-jsonmapper[customizing the javadoc:tools.jackson.databind.json.JsonMapper[]].',
    'Use javadoc:org.springframework.boot.jackson.JacksonComponent[format=annotation] annotation with auto-configuration.',
  ].join('\n');

  const prepared = prepareSourceForTranslation(source);

  assert.doesNotMatch(prepared.source, /xref:how-to:spring-mvc/);
  assert.doesNotMatch(prepared.source, /javadoc:org\.springframework/);
  assert.doesNotMatch(prepared.source, /format=annotation/);

  const restored = prepared.restore(
    prepared.source
      .replace('Several properties are provided for ', '提供了几个属性用于')
      .replace('customizing the ', '自定义 '),
  );

  assert.match(restored, /xref:how-to:spring-mvc\.adoc#howto\.spring-mvc\.customize-jackson-jsonmapper/);
  assert.match(restored, /javadoc:tools\.jackson\.databind\.json\.JsonMapper\[\]/);
  assert.match(restored, /javadoc:org\.springframework\.boot\.jackson\.JacksonComponent\[format=annotation\]/);
  assert.match(restored, /annotation/);
  assert.match(restored, /auto-configuration/);
});

test('保护链接目标但保留可见链接文本用于翻译', () => {
  const source = [
    'See xref:maven-plugin:using.adoc[Using the Plugin] for details.',
    'Home link: xref:index.adoc[,role=navtree-icon-home]',
    'See xref:testing/spring-boot-applications.adoc#testing.spring-boot-applications.detecting-configuration[creating the javadoc:org.springframework.context.ApplicationContext[] used in your tests].',
  ].join('\n');

  const prepared = prepareSourceForTranslation(source);

  assert.doesNotMatch(prepared.source, /xref:maven-plugin:using\.adoc/);
  assert.doesNotMatch(prepared.source, /role=navtree-icon-home/);
  assert.doesNotMatch(prepared.source, /javadoc:org\.springframework/);
  assert.match(prepared.source, /Using the Plugin/);
  assert.match(prepared.source, /creating the/);

  const restored = prepared.restore(
    prepared.source
      .replace('Using the Plugin', '使用插件')
      .replace('creating the ', '创建 ')
      .replace(' used in your tests', ' 用于测试'),
  );

  assert.match(restored, /xref:maven-plugin:using\.adoc\[使用插件\]/);
  assert.match(restored, /xref:index\.adoc\[,role=navtree-icon-home\]/);
  assert.match(restored, /javadoc:org\.springframework\.context\.ApplicationContext\[\]/);
  assert.match(restored, /创建 javadoc:org\.springframework\.context\.ApplicationContext\[\] 用于测试/);
});

test('术语保护不匹配普通单词内部的短缩写', () => {
  const source = 'WARNING: Deploy WAR files to servlet endpoints.';
  const prepared = prepareSourceForTranslation(source);

  assert.match(prepared.source, /WARNING/);
  assert.doesNotMatch(prepared.source, /@@TERM_\d+@@NING/);
  assert.match(prepared.source, /servlet endpoints/);

  const restored = prepared.restore('WARNING: 部署 @@TERM_0@@ files 到 servlet 端点。');

  assert.match(restored, /WAR/);
  assert.match(restored, /servlet 端点/);
});

test('DeepSeek 响应缺少代码块占位符时拒绝响应', async () => {
  await assert.rejects(
    () => requestTranslation({
      apiKey: 'fake-key',
      relativePath: 'modules/reference/pages/web/spring-hateoas.adoc',
      source: '----\n$ java -jar app.jar\n----\n\nRun the app.',
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '{"translated_adoc":"运行应用。","warnings":[],"protected_terms":[]}',
            },
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        }),
      }),
    }),
    /缺少占位符/,
  );
});

test('只包含受保护内容的分块直接保留原文', async () => {
  const calls = [];
  const source = [
    'For example:',
    '----',
    '$ gradle nativeTest',
    '----',
  ].join('\n');

  const result = await translateContentWithRetries({
    apiKey: 'fake-key',
    relativePath: 'modules/how-to/pages/native-image/testing-native-applications.adoc',
    source,
    initialMaxChunkChars: 20,
    minChunkChars: 8,
    requestTranslationImpl: async ({ source }) => {
      calls.push(source);
      return {
        translated_adoc: '例如：',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
        model: 'deepseek-v4-flash',
      };
    },
  });

  assert.deepEqual(calls, ['For example:']);
  assert.match(result.translated, /例如：/);
  assert.match(result.translated, /\$ gradle nativeTest/);
  assert.equal(result.usageRecords.length, 1);
});

test('分块网络错误会先重试当前请求', async () => {
  let attempts = 0;
  const result = await translateContentWithRetries({
    apiKey: 'fake-key',
    relativePath: 'modules/reference/pages/web/spring-graphql.adoc',
    source: 'GraphQL endpoint。',
    chunkNetworkRetryDelayMs: 0,
    requestTranslationImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('fetch failed');
      }
      return {
        translated_adoc: 'GraphQL endpoint。',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
        model: 'deepseek-v4-flash',
      };
    },
  });

  assert.equal(attempts, 2);
  assert.equal(result.translated, 'GraphQL endpoint。');
  assert.equal(result.usageRecords.length, 1);
});

test('分块 JSON 解析错误会先重试当前请求', async () => {
  let attempts = 0;
  const result = await translateContentWithRetries({
    apiKey: 'fake-key',
    relativePath: 'modules/reference/pages/data/nosql.adoc',
    source: 'MongoDB repositories can be enabled.',
    initialMaxChunkChars: 100,
    minChunkChars: 100,
    chunkNetworkRetryDelayMs: 0,
    requestTranslationImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new SyntaxError('Unexpected token 有 in JSON');
      }
      return {
        translated_adoc: '可以启用 MongoDB repositories。',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
        model: 'deepseek-v4-flash',
      };
    },
  });

  assert.equal(attempts, 2);
  assert.equal(result.translated, '可以启用 MongoDB repositories。');
  assert.equal(result.usageRecords.length, 1);
});
