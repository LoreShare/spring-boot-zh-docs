import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GENERATED_CONTENT_TASKS,
  buildGeneratedContentSyncSteps,
  findGeneratedContentArchive,
  getGeneratedContentAction,
  postProcessGeneratedAdoc,
  shouldImportGeneratedContentFile,
  shouldOverwriteGeneratedOutput,
} from '../scripts/lib/generated-content.mjs';

test('生成型内容同步使用完整 checkout 并执行官方 Gradle 任务', () => {
  const steps = buildGeneratedContentSyncSteps({
    cacheDir: '.cache/spring-boot-v4.1.0',
    cacheGitExists: true,
  });

  assert.deepEqual(steps, [
    {
      command: 'git',
      args: ['fetch', '--tags', '--force', 'origin', 'v4.1.0'],
      cwd: '.cache/spring-boot-v4.1.0',
    },
    {
      command: 'git',
      args: ['checkout', 'v4.1.0'],
      cwd: '.cache/spring-boot-v4.1.0',
    },
    {
      command: 'git',
      args: ['sparse-checkout', 'disable'],
      cwd: '.cache/spring-boot-v4.1.0',
    },
    {
      command: './gradlew',
      args: [
        '--no-daemon',
        ':documentation:spring-boot-docs:zipRootAntoraAggregateContent',
        ':documentation:spring-boot-actuator-docs:zipActuatorRestApiAntoraAggregateContent',
        ':build-plugin:spring-boot-maven-plugin:zipMavenPluginAntoraAggregateContent',
      ],
      cwd: '.cache/spring-boot-v4.1.0',
    },
  ]);
});

test('生成型内容任务覆盖 root、Actuator REST API 和 Maven 插件聚合产物', () => {
  assert.deepEqual(GENERATED_CONTENT_TASKS.map((task) => task.sourceId), [
    'root-generated',
    'actuator-rest-api-generated',
    'maven-plugin-generated',
  ]);
});

test('能按官方 zip 命名定位生成型内容归档', () => {
  const archive = findGeneratedContentArchive({
    cacheDir: '.cache/spring-boot-v4.1.0',
    task: GENERATED_CONTENT_TASKS[0],
    exists: () => true,
    readdir: () => [
      'spring-boot-docs-4.1.0-root-aggregate-content.zip',
      'spring-boot-docs-4.1.0-root-catalog-content.zip',
    ],
  });

  assert.equal(
    archive,
    '.cache/spring-boot-v4.1.0/documentation/spring-boot-docs/build/generated/docs/antora-content/spring-boot-docs-4.1.0-root-aggregate-content.zip',
  );
});

test('生成型内容按文件类型决定翻译或复制', () => {
  assert.equal(
    getGeneratedContentAction('modules/appendix/partials/configuration-properties/core.adoc'),
    'translate',
  );
  assert.equal(
    getGeneratedContentAction('modules/ROOT/partials/logging/logging-format.txt'),
    'copy',
  );
  assert.equal(
    getGeneratedContentAction('modules/ROOT/examples/resources/graphql/schema.graphqls'),
    'copy',
  );
});

test('生成型内容只导入 Antora 内容文件，不导入组件描述符', () => {
  assert.equal(
    shouldImportGeneratedContentFile('modules/appendix/partials/configuration-properties/core.adoc'),
    true,
  );
  assert.equal(
    shouldImportGeneratedContentFile('modules/ROOT/examples/resources/graphql/schema.graphqls'),
    true,
  );
  assert.equal(
    shouldImportGeneratedContentFile('modules/antora.yml'),
    false,
  );
  assert.equal(
    shouldImportGeneratedContentFile('outside/modules/ROOT/partials/example.adoc'),
    false,
  );
});

test('已有占位输出必须被真实生成型内容覆盖', () => {
  assert.equal(
    shouldOverwriteGeneratedOutput({
      outputExists: true,
      outputContent: '该片段由官方构建流程生成，当前中文站暂未纳入完整生成内容。请参考官方英文文档。\n',
      force: false,
    }),
    true,
  );
  assert.equal(
    shouldOverwriteGeneratedOutput({
      outputExists: true,
      outputContent: '= 已翻译内容\n',
      force: false,
    }),
    false,
  );
});

test('生成型内容后处理保留官方表格结构', () => {
  const source = [
    '[[appendix.application-properties.core]]',
    '== Core Properties',
    '[cols="4,3,3", options="header"]',
    '|===',
    '|Name|Description|Default Value',
    '',
    '|[[application-properties.core.debug]]xref:#application-properties.core.debug[`+debug+`]',
    '|+++Enable debug logs.+++',
    '|`+false+`',
    '',
    '|===',
  ].join('\n');
  const translated = [
    '== 核心属性',
    '|===',
    '|名称|描述|默认值',
    '',
    '|[[application-properties.core.debug]]xref:#application-properties.core.debug[`+debug+`]',
    '|启用调试日志。',
    '|`+false+`',
    '',
    '|===',
  ].join('\n');

  const processed = postProcessGeneratedAdoc({ source, translated });

  assert.match(processed, /^\[\[appendix\.application-properties\.core\]\]/);
  assert.match(processed, /\[cols="4,3,3", options="header"\]\n\|===/);
  assert.match(processed, /\|===\n\|名称\|描述\|默认值/);
  assert.match(processed, /\|\+\+\+启用调试日志。\+\+\+/);
});

test('生成型内容后处理移除额外表格分隔符', () => {
  const source = [
    '|===',
    '| Name | Description',
    '',
    '| [[spring-boot-starter-jsonb]]`spring-boot-starter-jsonb`',
    '| Starter for using JSON-B',
    '',
    '| [[spring-boot-starter-kafka]]`spring-boot-starter-kafka`',
    '| Starter for using Apache Kafka',
    '|===',
  ].join('\n');
  const translated = [
    '|===',
    '| 名称 | 描述',
    '',
    '| [[spring-boot-starter-jsonb]]`spring-boot-starter-jsonb`',
    '| 用于使用 JSON-B 的 starter',
    '|===',
    '| [[spring-boot-starter-kafka]]`spring-boot-starter-kafka`',
    '| 用于使用 Apache Kafka 的 starter',
    '|===',
  ].join('\n');

  const processed = postProcessGeneratedAdoc({ source, translated });

  assert.equal(processed.match(/^\|===$/gm).length, 2);
  assert.match(processed, /\| 用于使用 JSON-B 的 starter\n\n\| \[\[spring-boot-starter-kafka\]\]/);
});

test('生成型内容后处理把 API xref 改为官方外链', () => {
  const processed = postProcessGeneratedAdoc({
    source: '',
    translated: [
      '| xref:api:java/org/springframework/boot/SpringApplication.html[javadoc]',
      '| `xref:maven-plugin:api/java/org/springframework/boot/maven/Docker.html[Docker]`',
    ].join('\n'),
  });

  assert.match(
    processed,
    /link:https:\/\/docs\.spring\.io\/spring-boot\/4\.1\.0\/api\/java\/org\/springframework\/boot\/SpringApplication\.html\[javadoc\]/,
  );
  assert.match(
    processed,
    /`link:https:\/\/docs\.spring\.io\/spring-boot\/maven-plugin\/api\/java\/org\/springframework\/boot\/maven\/Docker\.html\[Docker\]`/,
  );
});
