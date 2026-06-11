import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectMissingGeneratedPartials,
  ensureGeneratedPartials,
  resolvePartialOutputPath,
} from '../scripts/lib/generated-partials.mjs';

test('按当前模块解析 partial include 输出路径', () => {
  assert.equal(
    resolvePartialOutputPath({
      outputRoot: 'content/boot',
      relativePath: 'modules/maven-plugin/pages/goals.adoc',
      partialPath: 'goals/overview.adoc',
    }),
    'content/boot/modules/maven-plugin/partials/goals/overview.adoc',
  );

  assert.equal(
    resolvePartialOutputPath({
      outputRoot: 'content/boot',
      relativePath: 'modules/reference/pages/features/logging.adoc',
      moduleName: 'ROOT',
      partialPath: 'logging/logging-format.txt',
    }),
    'content/boot/modules/ROOT/partials/logging/logging-format.txt',
  );
});

test('收集缺失的生成型 partial', () => {
  const files = {
    'content/boot/modules/api/pages/rest/actuator/sessions.adoc': [
      '[cols="3,1,3"]',
      'include::partial$rest/actuator/sessions/username/response-fields.adoc[]',
      'include::partial$rest/actuator/sessions/username/curl-request.adoc[]',
      'include::ROOT:partial$logging/logging-format.txt[]',
    ].join('\n'),
    'content/boot/modules/api/partials/rest/actuator/sessions/username/curl-request.adoc': '已存在',
  };

  const missing = collectMissingGeneratedPartials({
    contentRoot: 'content/boot',
    files: Object.keys(files),
    exists: (file) => Object.hasOwn(files, file),
    read: (file) => files[file],
  });

  assert.deepEqual(missing, [
    {
      outputPath: 'content/boot/modules/ROOT/partials/logging/logging-format.txt',
      partialPath: 'logging/logging-format.txt',
      columnCount: undefined,
    },
    {
      outputPath: 'content/boot/modules/api/partials/rest/actuator/sessions/username/response-fields.adoc',
      partialPath: 'rest/actuator/sessions/username/response-fields.adoc',
      columnCount: 3,
    },
  ]);
});

test('缺失生成型 partial 时失败而不是写入占位', () => {
  const files = {
    'content/boot/modules/api/pages/rest/actuator/sessions.adoc': [
      '[cols="3,1,3"]',
      'include::partial$rest/actuator/sessions/username/response-fields.adoc[]',
    ].join('\n'),
  };
  const writes = [];

  assert.throws(
    () => ensureGeneratedPartials({
      contentRoot: 'content/boot',
      files: Object.keys(files),
      exists: (file) => Object.hasOwn(files, file),
      read: (file) => files[file],
      write: (...args) => writes.push(args),
    }),
    /缺少官方生成型 partial/,
  );
  assert.deepEqual(writes, []);
});
