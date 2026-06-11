import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { CACHE_DIR, UPSTREAM_REF, UPSTREAM_REPOSITORY } from './sync-source.mjs';
import {
  DEFAULT_USAGE_LOG,
  appendUsageRecord,
  filterTranslationPlanByPaths,
  getOutputPathForPage,
  readDeepSeekApiKey,
  translateContentWithRetries,
} from './translate.mjs';
import { getLatestContentRoot } from './site-versions.mjs';

export const GENERATED_CONTENT_TASKS = [
  {
    sourceId: 'root-generated',
    projectDir: 'documentation/spring-boot-docs',
    archiveClassifier: 'root-aggregate-content',
    gradleTask: ':documentation:spring-boot-docs:zipRootAntoraAggregateContent',
  },
  {
    sourceId: 'actuator-rest-api-generated',
    projectDir: 'documentation/spring-boot-actuator-docs',
    archiveClassifier: 'actuator-rest-api-aggregate-content',
    gradleTask: ':documentation:spring-boot-actuator-docs:zipActuatorRestApiAntoraAggregateContent',
  },
  {
    sourceId: 'maven-plugin-generated',
    projectDir: 'build-plugin/spring-boot-maven-plugin',
    archiveClassifier: 'maven-plugin-aggregate-content',
    gradleTask: ':build-plugin:spring-boot-maven-plugin:zipMavenPluginAntoraAggregateContent',
  },
];

export const GENERATED_PLACEHOLDER_PATTERN = /(?:当前中文站暂未纳入完整生成内容|该(?:表格片段|请求或响应示例|片段|示例输出)由官方构建流程生成|自动配置类列表由官方构建流程生成)/;

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function listFiles(directory) {
  const results = [];

  function walk(currentDirectory) {
    if (!existsSync(currentDirectory)) {
      return;
    }

    for (const entry of readdirSync(currentDirectory)) {
      const fullPath = path.join(currentDirectory, entry);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        walk(fullPath);
      } else if (stats.isFile()) {
        results.push(toPosixPath(path.relative(directory, fullPath)));
      }
    }
  }

  walk(directory);
  return results.sort();
}

export function containsGeneratedPlaceholder(content) {
  return GENERATED_PLACEHOLDER_PATTERN.test(content);
}

export function buildGeneratedContentSyncSteps({
  cacheDir = CACHE_DIR,
  cacheGitExists = existsSync(path.join(cacheDir, '.git')),
  cwd = process.cwd(),
  repository = UPSTREAM_REPOSITORY,
  ref = UPSTREAM_REF,
  tasks = GENERATED_CONTENT_TASKS,
} = {}) {
  const steps = cacheGitExists
    ? [
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
        args: ['sparse-checkout', 'disable'],
        cwd: cacheDir,
      },
    ]
    : [
      {
        command: 'git',
        args: ['clone', '--filter=blob:none', '--branch', ref, repository, cacheDir],
        cwd,
      },
    ];

  return [
    ...steps,
    {
      command: './gradlew',
      args: ['--no-daemon', ...tasks.map((task) => task.gradleTask)],
      cwd: cacheDir,
    },
  ];
}

export function runGeneratedContentSyncStep(step) {
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

function getArchiveDirectory(cacheDir, task) {
  return path.join(cacheDir, task.projectDir, 'build/generated/docs/antora-content');
}

export function findGeneratedContentArchive({
  cacheDir = CACHE_DIR,
  task,
  exists = existsSync,
  readdir = readdirSync,
} = {}) {
  const archiveDirectory = getArchiveDirectory(cacheDir, task);
  if (!exists(archiveDirectory)) {
    throw new Error(`找不到官方生成型内容目录：${archiveDirectory}。请先运行 npm run sync:generated-content`);
  }

  const candidates = readdir(archiveDirectory)
    .filter((entry) => entry.endsWith(`-${task.archiveClassifier}.zip`))
    .sort();

  if (candidates.length === 0) {
    throw new Error(`找不到官方生成型内容归档：${archiveDirectory}/*-${task.archiveClassifier}.zip`);
  }

  if (candidates.length > 1) {
    throw new Error(`官方生成型内容归档不唯一：${candidates.join('、')}`);
  }

  return toPosixPath(path.join(archiveDirectory, candidates[0]));
}

export function getGeneratedContentAction(relativePath) {
  return relativePath.endsWith('.adoc') ? 'translate' : 'copy';
}

export function shouldOverwriteGeneratedOutput({
  outputExists,
  outputContent = '',
  force = false,
} = {}) {
  return force || !outputExists || containsGeneratedPlaceholder(outputContent);
}

function getGeneratedContentExtractRoot(cacheDir, task) {
  return path.join(cacheDir, 'generated-content', task.sourceId);
}

function extractArchive({ archive, outputDirectory, spawn = spawnSync }) {
  rmSync(outputDirectory, { recursive: true, force: true });
  mkdirSync(outputDirectory, { recursive: true });
  const result = spawn('unzip', ['-qo', archive, '-d', outputDirectory], {
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    throw new Error(`解压官方生成型内容失败：${archive}；${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`解压官方生成型内容退出码异常：${result.status}；归档：${archive}`);
  }
}

export function extractGeneratedContentArchives({
  cacheDir = CACHE_DIR,
  tasks = GENERATED_CONTENT_TASKS,
  spawn = spawnSync,
} = {}) {
  return tasks.map((task) => {
    const archive = findGeneratedContentArchive({ cacheDir, task });
    const sourceRoot = getGeneratedContentExtractRoot(cacheDir, task);
    extractArchive({ archive, outputDirectory: sourceRoot, spawn });
    return {
      sourceId: task.sourceId,
      sourceRoot: toPosixPath(sourceRoot),
      archive,
    };
  });
}

export function syncGeneratedContent({ cacheDir = CACHE_DIR } = {}) {
  const steps = buildGeneratedContentSyncSteps({ cacheDir });
  for (const step of steps) {
    runGeneratedContentSyncStep(step);
  }
  return extractGeneratedContentArchives({ cacheDir });
}

function buildGeneratedContentPlan({ sources, selectedPaths = [] }) {
  const plan = sources.flatMap((source) => listFiles(source.sourceRoot)
    .filter((relativePath) => relativePath.startsWith('modules/'))
    .map((relativePath) => ({
      sourceId: source.sourceId,
      sourceRoot: source.sourceRoot,
      relativePath,
      action: getGeneratedContentAction(relativePath),
    })));
  return filterTranslationPlanByPaths(plan, selectedPaths);
}

export async function translateGeneratedContent({
  cacheDir = CACHE_DIR,
  sources,
  outputRoot = getLatestContentRoot(),
  apiKey = readDeepSeekApiKey(),
  force = false,
  fetchImpl = globalThis.fetch,
  requestTimeoutMs = 180_000,
  usageLogPath = DEFAULT_USAGE_LOG,
  maxChunkChars = 12_000,
  selectedPaths = [],
  onProgress = () => {},
} = {}) {
  const generatedSources = sources ?? extractGeneratedContentArchives({ cacheDir });
  const plan = buildGeneratedContentPlan({ sources: generatedSources, selectedPaths });
  const results = [];

  for (const item of plan) {
    const sourcePath = path.join(item.sourceRoot, item.relativePath);
    const outputPath = getOutputPathForPage(item.relativePath, outputRoot);
    const outputExists = existsSync(outputPath);
    const outputContent = outputExists ? readFileSync(outputPath, 'utf8') : '';

    if (!shouldOverwriteGeneratedOutput({ outputExists, outputContent, force })) {
      results.push({ ...item, outputPath, status: 'skipped' });
      onProgress({ ...item, outputPath, status: 'skipped' });
      continue;
    }

    mkdirSync(path.dirname(outputPath), { recursive: true });

    if (item.action === 'copy') {
      copyFileSync(sourcePath, outputPath);
      results.push({ ...item, outputPath, status: 'copied' });
      onProgress({ ...item, outputPath, status: 'copied' });
      continue;
    }

    const source = readFileSync(sourcePath, 'utf8');
    const translation = await translateContentWithRetries({
      apiKey,
      sourceId: item.sourceId,
      relativePath: item.relativePath,
      source,
      fetchImpl,
      requestTimeoutMs,
      initialMaxChunkChars: maxChunkChars,
      onProgress: (event) => onProgress({ ...item, outputPath, ...event }),
    });

    for (const record of translation.usageRecords) {
      appendUsageRecord(record, usageLogPath);
    }

    const translated = translation.translated;
    writeFileSync(outputPath, translated.endsWith('\n') ? translated : `${translated}\n`);
    results.push({ ...item, outputPath, status: 'translated', chunkCount: translation.chunkCount });
  }

  return results;
}
