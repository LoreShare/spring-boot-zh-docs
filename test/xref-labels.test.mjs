import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildXrefTitleIndex,
  normalizeXrefLabelsInContent,
} from '../scripts/lib/xref-labels.mjs';

test('能从页面标题和 anchor 标题建立 xref 标题索引', () => {
  const files = new Map([
    [
      'content/modules/ROOT/pages/installing.adoc',
      [
        '= 安装 Spring Boot',
        '',
        '[[getting-started.installing.cli]]',
        '== 安装 Spring Boot CLI',
        '',
      ].join('\n'),
    ],
    [
      'content/modules/reference/pages/web/servlet.adoc',
      [
        '= Servlet Web 应用',
        '',
        '[[web.servlet.spring-mvc.static-content]]',
        '==== 静态内容',
        '',
      ].join('\n'),
    ],
    [
      'content/modules/reference/pages/actuator/metrics.adoc',
      [
        '= 指标',
        '',
        '[[actuator.metrics.export]]',
        '== 支持的监控系统',
        '',
        '[[actuator.metrics.export.appoptics]]',
        '=== AppOptics',
        '',
        '=== Atlas',
        '',
      ].join('\n'),
    ],
    [
      'content/modules/reference/pages/using/devtools.adoc',
      [
        '= Developer Tools',
        '',
        '[[using.devtools.restart.restart-vs-reload]]',
        '.重启与重新加载',
        '****',
        '正文',
        '****',
        '',
      ].join('\n'),
    ],
  ]);

  const titleIndex = buildXrefTitleIndex({
    contentRoot: 'content',
    files: [...files.keys()],
    read: (file) => files.get(file),
  });

  assert.equal(titleIndex.get('ROOT:installing.adoc'), '安装 Spring Boot');
  assert.equal(titleIndex.get('ROOT:installing.adoc#getting-started.installing.cli'), '安装 Spring Boot CLI');
  assert.equal(titleIndex.get('reference:web/servlet.adoc#web.servlet.spring-mvc.static-content'), '静态内容');
  assert.equal(titleIndex.get('reference:actuator/metrics.adoc#actuator.metrics.export.atlas'), 'Atlas');
  assert.equal(titleIndex.get('reference:using/devtools.adoc#using.devtools.restart.restart-vs-reload'), '重启与重新加载');
});

test('能补齐空 anchor xref 和裸 xref 的可见文本', () => {
  const titleIndex = new Map([
    ['ROOT:installing.adoc#getting-started.installing.cli', '安装 Spring Boot CLI'],
    ['reference:web/servlet.adoc#web.servlet.spring-mvc.static-content', '静态内容'],
  ]);

  const normalized = normalizeXrefLabelsInContent({
    relativePath: 'modules/reference/pages/web/servlet.adoc',
    content: [
      '请参阅 xref:ROOT:installing.adoc#getting-started.installing.cli[]。',
      '在本文档后面部分介绍 xref:web/servlet.adoc#web.servlet.spring-mvc.static-content。',
      '',
    ].join('\n'),
    titleIndex,
  });

  assert.equal(normalized.changed, true);
  assert.equal(normalized.content, [
    '请参阅 xref:ROOT:installing.adoc#getting-started.installing.cli[安装 Spring Boot CLI]。',
    '在本文档后面部分介绍 xref:web/servlet.adoc#web.servlet.spring-mvc.static-content[静态内容]。',
    '',
  ].join('\n'));
});

test('不会改写代码块、inline code、已有文本和属性型空文本 xref', () => {
  const titleIndex = new Map([
    ['reference:web/servlet.adoc#web.servlet.spring-mvc.static-content', '静态内容'],
  ]);

  const source = [
    '已有文本 xref:web/servlet.adoc#web.servlet.spring-mvc.static-content[静态资源]。',
    '首页图标 xref:index.adoc[,role=navtree-icon-home]。',
    'inline `xref:web/servlet.adoc#web.servlet.spring-mvc.static-content` 保持不变。',
    '----',
    'xref:web/servlet.adoc#web.servlet.spring-mvc.static-content',
    '----',
    '',
  ].join('\n');

  const normalized = normalizeXrefLabelsInContent({
    relativePath: 'modules/reference/pages/web/servlet.adoc',
    content: source,
    titleIndex,
  });

  assert.equal(normalized.changed, false);
  assert.equal(normalized.content, source);
});
