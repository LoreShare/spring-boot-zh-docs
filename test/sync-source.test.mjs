import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ANTORA_SOURCE_PATH,
  ANTORA_SOURCE_PATHS,
  buildSyncSteps,
  getCachedAntoraRoot,
} from '../scripts/lib/sync-source.mjs';

test('新缓存目录使用稀疏克隆并设置所有 Antora 文档路径', () => {
  const steps = buildSyncSteps({
    cacheDir: '.cache/spring-boot-v4.1.0',
    cacheGitExists: false,
  });

  assert.deepEqual(steps, [
    {
      command: 'git',
      args: [
        'clone',
        '--filter=blob:none',
        '--sparse',
        '--branch',
        'v4.1.0',
        'https://github.com/spring-projects/spring-boot.git',
        '.cache/spring-boot-v4.1.0',
      ],
      cwd: process.cwd(),
    },
    {
      command: 'git',
      args: ['sparse-checkout', 'set', ...ANTORA_SOURCE_PATHS],
      cwd: '.cache/spring-boot-v4.1.0',
    },
  ]);
});

test('已有缓存目录拉取上游并重新设置所有稀疏路径', () => {
  const steps = buildSyncSteps({
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
      args: ['sparse-checkout', 'set', ...ANTORA_SOURCE_PATHS],
      cwd: '.cache/spring-boot-v4.1.0',
    },
  ]);
});

test('同步范围包含生成站点缺失的插件和 REST API 文档源', () => {
  assert.deepEqual(ANTORA_SOURCE_PATHS, [
    ANTORA_SOURCE_PATH,
    'build-plugin/spring-boot-maven-plugin/src/docs/antora',
    'build-plugin/spring-boot-gradle-plugin/src/docs/antora',
    'documentation/spring-boot-actuator-docs/src/docs/antora',
  ]);
});

test('能得到缓存中的 Antora 根目录', () => {
  assert.equal(
    getCachedAntoraRoot('.cache/spring-boot-v4.1.0'),
    '.cache/spring-boot-v4.1.0/documentation/spring-boot-docs/src/docs/antora',
  );
});
