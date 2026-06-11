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
