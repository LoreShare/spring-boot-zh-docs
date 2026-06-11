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
  getOutputPathForPage,
  parseTranslationJson,
  requestTranslation,
  splitAsciiDocForTranslation,
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
  assert.match(messages[1].content, /modules\/ROOT\/pages\/installing\.adoc/);
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

test('MVP 页面输出到 content/boot 对应模块路径', () => {
  assert.ok(MVP_PAGES.includes('modules/tutorial/pages/first-application/index.adoc'));
  assert.equal(
    getOutputPathForPage('modules/tutorial/pages/first-application/index.adoc'),
    'content/boot/modules/tutorial/pages/first-application/index.adoc',
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
