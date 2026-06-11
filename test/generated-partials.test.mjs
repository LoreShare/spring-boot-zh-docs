import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGeneratedPartialContent,
  collectMissingGeneratedPartials,
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

test('生成表格和请求响应片段占位内容', () => {
  assert.equal(
    buildGeneratedPartialContent({ partialPath: 'rest/actuator/sessions/username/response-fields.adoc', columnCount: 3 }),
    '|===\n3+| 该表格片段由官方构建流程生成，当前中文站暂未纳入完整生成内容。请参考官方英文文档。\n|===\n',
  );

  assert.equal(
    buildGeneratedPartialContent({ partialPath: 'rest/actuator/sessions/username/curl-request.adoc' }),
    '[source,text]\n----\n该请求或响应示例由官方构建流程生成，当前中文站暂未纳入完整生成内容。请参考官方英文文档。\n----\n',
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
