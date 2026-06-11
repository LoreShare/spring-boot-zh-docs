import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const UPSTREAM_REPOSITORY = 'https://github.com/spring-projects/spring-boot.git';
export const UPSTREAM_REF = 'v4.1.0';
export const CACHE_DIR = '.cache/spring-boot-v4.1.0';
export const ANTORA_SOURCE_PATH = 'documentation/spring-boot-docs/src/docs/antora';
export const ANTORA_SOURCE_PATHS = [
  ANTORA_SOURCE_PATH,
  'build-plugin/spring-boot-maven-plugin/src/docs/antora',
  'build-plugin/spring-boot-gradle-plugin/src/docs/antora',
  'documentation/spring-boot-actuator-docs/src/docs/antora',
];

export function getCachedAntoraRoot(cacheDir = CACHE_DIR) {
  return `${cacheDir}/${ANTORA_SOURCE_PATH}`;
}

export function buildSyncSteps({
  cacheDir = CACHE_DIR,
  cacheGitExists = existsSync(path.join(cacheDir, '.git')),
  cwd = process.cwd(),
  repository = UPSTREAM_REPOSITORY,
  ref = UPSTREAM_REF,
  antoraSourcePaths = ANTORA_SOURCE_PATHS,
} = {}) {
  if (!cacheGitExists) {
    return [
      {
        command: 'git',
        args: ['clone', '--filter=blob:none', '--sparse', '--branch', ref, repository, cacheDir],
        cwd,
      },
      {
        command: 'git',
        args: ['sparse-checkout', 'set', ...antoraSourcePaths],
        cwd: cacheDir,
      },
    ];
  }

  return [
    {
      command: 'git',
      args: ['fetch', '--tags', '--force', 'origin', ref],
      cwd: cacheDir,
    },
    {
      command: 'git',
      args: ['checkout', ref],
      cwd: cacheDir,
    },
    {
      command: 'git',
      args: ['sparse-checkout', 'set', ...antoraSourcePaths],
      cwd: cacheDir,
    },
  ];
}

export function runSyncStep(step) {
  const result = spawnSync(step.command, step.args, {
    cwd: step.cwd,
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    throw new Error(`执行命令失败：${step.command} ${step.args.join(' ')}；${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`命令退出码异常：${result.status}；命令：${step.command} ${step.args.join(' ')}`);
  }
}

export function syncSource({ cacheDir = CACHE_DIR } = {}) {
  mkdirSync(path.dirname(cacheDir), { recursive: true });

  const steps = buildSyncSteps({ cacheDir });
  for (const step of steps) {
    runSyncStep(step);
  }

  for (const antoraSourcePath of ANTORA_SOURCE_PATHS) {
    const antoraYml = path.join(cacheDir, antoraSourcePath, 'antora.yml');
    if (!existsSync(antoraYml)) {
      throw new Error(`同步后未找到 Antora 配置：${antoraYml}`);
    }
  }

  return {
    cacheDir,
    antoraRoot: getCachedAntoraRoot(cacheDir),
    antoraRoots: ANTORA_SOURCE_PATHS.map((antoraSourcePath) => `${cacheDir}/${antoraSourcePath}`),
  };
}
