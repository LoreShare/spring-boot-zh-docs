import assert from 'node:assert/strict';
import test from 'node:test';

import {
  auditBuiltSiteHtml,
  auditTranslatedPair,
  buildCompletenessSummary,
  writeCompletenessReports,
} from '../scripts/lib/completeness-audit.mjs';

test('完整性审计能发现译文缺失普通代码块', () => {
  const issues = auditTranslatedPair({
    relativePath: 'modules/how-to/pages/example.adoc',
    source: [
      '= Example',
      '',
      '[source,java]',
      '----',
      'class MyApplication {}',
      '----',
      '',
    ].join('\n'),
    translated: [
      '= 示例',
      '',
    ].join('\n'),
  });

  assert.ok(issues.some((issue) => issue.code === 'listing-block-missing'));
});

test('完整性审计能发现高置信正文块缺失', () => {
  const issues = auditTranslatedPair({
    relativePath: 'modules/how-to/pages/example.adoc',
    source: [
      '= Example',
      '',
      'This page introduces the sample.',
      '',
      'The first step creates an application.',
      '',
      'The second step runs the application.',
      '',
      'The last step verifies the output.',
      '',
    ].join('\n'),
    translated: [
      '= 示例',
      '',
      '本页介绍示例。',
      '',
    ].join('\n'),
  });

  assert.ok(issues.some((issue) => issue.code === 'visible-prose-missing'));
});

test('完整性审计能发现链接可见文本英文残留并保留目标检查', () => {
  const issues = auditTranslatedPair({
    relativePath: 'modules/how-to/pages/example.adoc',
    source: 'See link:https://example.com/reference[Reference Guide].\n',
    translated: '参见 link:https://example.com/reference[Reference Guide]。\n',
  });

  assert.ok(issues.some((issue) => issue.code === 'untranslated-visible-text'));
});

test('include-code 宏在译文中保留时不算缺失', () => {
  const issues = auditTranslatedPair({
    relativePath: 'modules/how-to/pages/example.adoc',
    source: 'include-code::MyApplication[]\n',
    translated: 'include-code::MyApplication[]\n',
  });

  assert.equal(issues.some((issue) => issue.code === 'include-code-missing'), false);
});

test('include-code 宏在译文中展开为代码块时不算缺失', () => {
  const issues = auditTranslatedPair({
    relativePath: 'modules/how-to/pages/example.adoc',
    source: 'include-code::MyApplication[]\n',
    translated: [
      '[source,java]',
      '----',
      'class MyApplication {}',
      '----',
      '',
    ].join('\n'),
  });

  assert.equal(issues.some((issue) => issue.code === 'include-code-missing'), false);
});

test('构建产物审计能发现未展开的 include-code 宏', () => {
  const files = new Map([
    ['build/site/example.html', '<p>include-code::MyApplication[]</p>'],
  ]);

  const issues = auditBuiltSiteHtml({
    outputDir: 'build/site',
    listFiles: () => [...files.keys()],
    read: (file) => files.get(file),
  });

  assert.deepEqual(issues.map((issue) => issue.code), ['raw-include-code-html']);
});

test('构建产物审计能发现生成型内容占位文本残留', () => {
  const files = new Map([
    ['build/site/example.html', '<p>当前中文站暂未纳入完整生成内容。请参考官方英文文档。</p>'],
  ]);

  const issues = auditBuiltSiteHtml({
    outputDir: 'build/site',
    listFiles: () => [...files.keys()],
    read: (file) => files.get(file),
  });

  assert.deepEqual(issues.map((issue) => issue.code), ['generated-placeholder-html']);
});

test('构建产物审计能发现未渲染的 javadoc 宏', () => {
  const files = new Map([
    ['build/site/example.html', '<p>javadoc:org.springframework.boot.SpringApplication[]</p>'],
  ]);

  const issues = auditBuiltSiteHtml({
    outputDir: 'build/site',
    listFiles: () => [...files.keys()],
    read: (file) => files.get(file),
  });

  assert.deepEqual(issues.map((issue) => issue.code), ['raw-javadoc-html']);
});

test('构建产物审计能发现原始 xref 可见文本和裸 xref', () => {
  const files = new Map([
    [
      'build/site/example.html',
      [
        '<p><a href="../installing.html#getting-started.installing.cli" class="xref page">ROOT:installing.adoc#getting-started.installing.cli</a></p>',
        '<p>在本文档后面部分介绍 xref:web/servlet.adoc#web.servlet.spring-mvc.static-content。</p>',
      ].join('\n'),
    ],
  ]);

  const issues = auditBuiltSiteHtml({
    outputDir: 'build/site',
    listFiles: () => [...files.keys()],
    read: (file) => files.get(file),
  });

  assert.deepEqual(issues.map((issue) => issue.code), [
    'raw-xref-label-html',
    'raw-xref-html',
  ]);
});

test('构建产物审计能发现未解析的 URL 属性', () => {
  const files = new Map([
    ['build/site/example.html', '<p>{url-spring-data-site}[Spring Data]</p>'],
  ]);

  const issues = auditBuiltSiteHtml({
    outputDir: 'build/site',
    listFiles: () => [...files.keys()],
    read: (file) => files.get(file),
  });

  assert.deepEqual(issues.map((issue) => issue.code), ['unresolved-url-attribute-html']);
});

test('构建产物审计能发现本机编辑链接残留', () => {
  const files = new Map([
    [
      'build/site/example.html',
      '<div class="edit-this-page"><a href="file:///tmp/content/example.adoc">Edit this Page</a></div>',
    ],
  ]);

  const issues = auditBuiltSiteHtml({
    outputDir: 'build/site',
    listFiles: () => [...files.keys()],
    read: (file) => files.get(file),
  });

  assert.deepEqual(issues.map((issue) => issue.code), ['local-edit-url-html']);
});

test('构建产物审计能发现默认顶部导航残留', () => {
  const files = new Map([
    [
      'build/site/example.html',
      [
        '<body class="article">',
        '<header class="header">',
        '  <nav class="navbar">',
        '    <div id="topbar-nav" class="navbar-menu">Home Products Services Download</div>',
        '  </nav>',
        '</header>',
        '</body>',
      ].join('\n'),
    ],
  ]);

  const issues = auditBuiltSiteHtml({
    outputDir: 'build/site',
    listFiles: () => [...files.keys()],
    read: (file) => files.get(file),
  });

  assert.deepEqual(issues.map((issue) => issue.code), ['default-header-html']);
});

test('构建产物审计能发现旧版 headerless 样式缺少布局偏移修正', () => {
  const files = new Map([
    [
      'build/site/boot/4.1.0/upgrading.html',
      [
        '<!doctype html>',
        '<html lang="zh-CN">',
        '<head>',
        '<style id="spring-boot-zh-headerless">',
        'body {',
        '  padding-top: 0;',
        '}',
        '</style>',
        '</head>',
        '<body class="article">',
        '<div class="toolbar"></div>',
        '<aside class="nav"></aside>',
        '<aside class="toc sidebar"></aside>',
        '<main><h1 class="page">升级 Spring Boot</h1></main>',
        '</body>',
        '</html>',
      ].join('\n'),
    ],
  ]);

  const issues = auditBuiltSiteHtml({
    outputDir: 'build/site',
    listFiles: () => [...files.keys()],
    read: (file) => files.get(file),
  });

  assert.deepEqual(issues.map((issue) => issue.code), ['headerless-layout-html']);
});

test('完整性报告写入 JSONL 和 Markdown 摘要', () => {
  const writes = new Map();
  const issues = [
    {
      severity: 'error',
      code: 'listing-block-missing',
      relativePath: 'modules/how-to/pages/example.adoc',
      message: '缺少代码块',
    },
  ];

  writeCompletenessReports({
    issues,
    jsonlPath: 'reports/completeness-audit.jsonl',
    markdownPath: 'reports/completeness-audit.md',
    mkdir: () => {},
    write: (file, content) => writes.set(file, content),
  });

  assert.match(writes.get('reports/completeness-audit.jsonl'), /listing-block-missing/);
  assert.match(writes.get('reports/completeness-audit.md'), /缺少代码块/);
  assert.match(buildCompletenessSummary(issues), /1 个错误/);
});
