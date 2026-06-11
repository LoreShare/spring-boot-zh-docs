import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GENERATED_CONTENT_TASKS,
  buildGeneratedContentSyncSteps,
  findGeneratedContentArchive,
  getGeneratedContentAction,
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
