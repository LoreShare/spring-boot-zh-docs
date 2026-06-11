import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { getLatestContentRoot } from './site-versions.mjs';

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function listAsciiDocFiles(directory) {
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
      } else if (stats.isFile() && entry.endsWith('.adoc')) {
        results.push(toPosixPath(fullPath));
      }
    }
  }

  walk(directory);
  return results.sort();
}

function getModuleNameFromRelativePath(relativePath) {
  const match = relativePath.match(/^modules\/([^/]+)\//);
  return match?.[1] ?? 'ROOT';
}

function countColumns(line) {
  const match = line.trim().match(/^\[cols=(?:"([^"]+)"|([^,\]]+))/);
  if (!match) {
    return undefined;
  }

  const cols = match[1] ?? match[2] ?? '';
  const columnCount = cols.split(',').map((item) => item.trim()).filter(Boolean).length;
  return columnCount > 0 ? columnCount : undefined;
}

function getPreviousNonEmptyLine(lines, index) {
  for (let currentIndex = index - 1; currentIndex >= 0; currentIndex -= 1) {
    if (lines[currentIndex].trim()) {
      return lines[currentIndex];
    }
  }
  return '';
}

export function resolvePartialOutputPath({
  outputRoot = getLatestContentRoot(),
  relativePath,
  moduleName,
  partialPath,
} = {}) {
  const resolvedModuleName = moduleName ?? getModuleNameFromRelativePath(relativePath);
  return toPosixPath(path.join(outputRoot, 'modules', resolvedModuleName, 'partials', partialPath));
}

function collectPartialIncludes({ relativePath, content }) {
  const includes = [];
  const lines = content.split(/\r?\n/);
  const includePattern = /\binclude::(?:(?<moduleName>[-\w]+):)?partial\$(?<partialPath>[^\[\s]+)\[/g;

  for (let index = 0; index < lines.length; index += 1) {
    for (const match of lines[index].matchAll(includePattern)) {
      includes.push({
        relativePath,
        moduleName: match.groups.moduleName,
        partialPath: match.groups.partialPath,
        columnCount: countColumns(getPreviousNonEmptyLine(lines, index)),
      });
    }
  }

  return includes;
}

function isTablePartial(partialPath, columnCount) {
  return columnCount
    || /(?:fields|parameters|properties|coordinates|versions|starters|slices|overview|goals)\.adoc$/.test(partialPath);
}

export function buildGeneratedPartialContent({ partialPath, columnCount } = {}) {
  void partialPath;
  void columnCount;
  throw new Error('禁止生成中文占位 partial；请先导入官方 Gradle 生成型内容');
}

function formatMissingGeneratedPartials(missing) {
  return missing.map((partial) => partial.outputPath).join('、');
}

export function assertNoMissingGeneratedPartials(options = {}) {
  const missing = collectMissingGeneratedPartials(options);
  if (missing.length > 0) {
    throw new Error(`缺少官方生成型 partial：${formatMissingGeneratedPartials(missing)}。请先运行 npm run sync:generated-content，再运行 npm run translate:all`);
  }
  return missing;
}

export function buildLegacyGeneratedPartialContent({ partialPath, columnCount } = {}) {
  if (partialPath.endsWith('.txt')) {
    return '该片段由官方构建流程生成，当前中文站暂未纳入完整生成内容。请参考官方英文文档。\n';
  }

  if (partialPath === 'auto-configuration-classes/nav.adoc') {
    return '*** 自动配置类列表由官方构建流程生成，当前中文站暂未纳入完整生成内容。\n';
  }

  if (isTablePartial(partialPath, columnCount)) {
    const span = columnCount ?? 1;
    return [
      '|===',
      `${span}+| 该表格片段由官方构建流程生成，当前中文站暂未纳入完整生成内容。请参考官方英文文档。`,
      '|===',
      '',
    ].join('\n');
  }

  if (/(?:curl-request|http-response|http-request|request-body|response-body)\.adoc$/.test(partialPath)) {
    return [
      '[source,text]',
      '----',
      '该请求或响应示例由官方构建流程生成，当前中文站暂未纳入完整生成内容。请参考官方英文文档。',
      '----',
      '',
    ].join('\n');
  }

  return '该片段由官方构建流程生成，当前中文站暂未纳入完整生成内容。请参考官方英文文档。\n';
}

export function collectMissingGeneratedPartials({
  contentRoot = getLatestContentRoot(),
  files = listAsciiDocFiles(contentRoot),
  exists = existsSync,
  read = (file) => readFileSync(file, 'utf8'),
} = {}) {
  const missing = new Map();

  for (const file of files) {
    const relativePath = toPosixPath(path.relative(contentRoot, file));
    const content = read(file);
    for (const include of collectPartialIncludes({ relativePath, content })) {
      const outputPath = resolvePartialOutputPath({
        outputRoot: contentRoot,
        relativePath,
        moduleName: include.moduleName,
        partialPath: include.partialPath,
      });
      if (!exists(outputPath) && !missing.has(outputPath)) {
        missing.set(outputPath, {
          outputPath,
          partialPath: include.partialPath,
          columnCount: include.columnCount,
        });
      }
    }
  }

  return [...missing.values()]
    .sort((left, right) => (left.outputPath < right.outputPath ? -1 : left.outputPath > right.outputPath ? 1 : 0));
}

export function ensureGeneratedPartials({
  contentRoot = getLatestContentRoot(),
  files,
  exists = existsSync,
  read = (file) => readFileSync(file, 'utf8'),
  write = (file, content) => writeFileSync(file, content),
} = {}) {
  const missing = collectMissingGeneratedPartials({
    contentRoot,
    files,
    exists,
    read,
  });

  if (missing.length > 0) {
    void write;
    throw new Error(`缺少官方生成型 partial：${formatMissingGeneratedPartials(missing)}。请先运行 npm run sync:generated-content，再运行 npm run translate:all`);
  }

  return missing;
}
