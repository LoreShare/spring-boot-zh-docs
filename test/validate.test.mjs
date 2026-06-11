import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectXrefs,
  detectSecrets,
  findMissingProtectedTerms,
  hasBalancedListingBlocks,
  validateTranslatedFiles,
  validateTranslatedPage,
} from '../scripts/lib/validate.mjs';

test('能收集 AsciiDoc xref 目标', () => {
  assert.deepEqual(
    collectXrefs('请看 xref:index.adoc[] 和 xref:tutorial:index.adoc[教程]。'),
    ['index.adoc', 'tutorial:index.adoc'],
  );
});

test('能识别 listing 代码块是否成对', () => {
  assert.equal(hasBalancedListingBlocks('正文\n----\ncode\n----\n正文'), true);
  assert.equal(hasBalancedListingBlocks('正文\n----\ncode\n正文'), false);
});

test('能识别疑似真实密钥', () => {
  const fakeSecret = `sk-${'1234567890abcdefghijklmnop'}`;
  assert.deepEqual(detectSecrets(`DEEPSEEK_API_KEY=${fakeSecret}`), [fakeSecret]);
  assert.deepEqual(detectSecrets('DEEPSEEK_API_KEY=sk-请在本地替换'), []);
});

test('能找出译文中缺失的不翻译术语', () => {
  assert.deepEqual(
    findMissingProtectedTerms('Spring Boot and Actuator', 'Spring Boot 和执行器'),
    ['Actuator'],
  );
});

test('页面校验汇总 xref、代码块和术语问题', () => {
  const issues = validateTranslatedPage({
    relativePath: 'modules/ROOT/pages/index.adoc',
    source: 'Spring Boot\n\nxref:installing.adoc[]\n\n----\ncode\n----\n',
    translated: 'Spring 引导\n\n----\ncode\n',
  });

  assert.deepEqual(issues, [
    'modules/ROOT/pages/index.adoc：listing/source 代码块分隔符数量不成对',
    'modules/ROOT/pages/index.adoc：缺少 xref 目标 installing.adoc',
    'modules/ROOT/pages/index.adoc：缺少不翻译术语 Spring Boot',
  ]);
});

test('全量校验按翻译计划检查所有输出文件', () => {
  const files = {
    'source/modules/ROOT/pages/index.adoc': 'Spring Boot\nxref:installing.adoc[]\n',
    'output/modules/ROOT/pages/index.adoc': 'Spring Boot\nxref:installing.adoc[]\n',
    'source/modules/ROOT/pages/missing.adoc': 'Spring Boot\n',
  };

  const issues = validateTranslatedFiles({
    sourceRoot: 'source',
    outputRoot: 'output',
    plan: [
      { relativePath: 'modules/ROOT/pages/index.adoc', action: 'translate' },
      { relativePath: 'modules/ROOT/pages/missing.adoc', action: 'translate' },
    ],
    exists: (file) => Object.hasOwn(files, file),
    read: (file) => files[file],
  });

  assert.deepEqual(issues, [
    'modules/ROOT/pages/missing.adoc：找不到译文页面 output/modules/ROOT/pages/missing.adoc',
  ]);
});
