import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { getCachedAntoraRoot } from './sync-source.mjs';
import {
  MVP_PAGES,
  PROTECTED_TERMS,
  buildFullTranslationPlan,
  getOutputPathForPage,
  listSourceFiles,
} from './translate.mjs';

export function collectXrefs(content) {
  return [...content.matchAll(/\bxref:([^\[\s]+)\[/g)].map((match) => match[1]);
}

export function hasBalancedListingBlocks(content) {
  const delimiterCount = content
    .split(/\r?\n/)
    .filter((line) => line.trim() === '----')
    .length;
  return delimiterCount % 2 === 0;
}

function isCodeBlockAttribute(line) {
  const trimmed = line.trim();
  return /^\[(source|listing)(,|\])/.test(trimmed) || /^\[subs=/.test(trimmed);
}

export function findCodeBlockAttributesWithoutDelimiter(content) {
  const lines = content.split(/\r?\n/);
  const lineNumbers = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (isCodeBlockAttribute(lines[index]) && lines[index + 1]?.trim() !== '----') {
      lineNumbers.push(index + 1);
    }
  }

  return lineNumbers;
}

export function detectSecrets(content) {
  return [...new Set(content.match(/\bsk-[A-Za-z0-9_-]{20,}\b/g) ?? [])];
}

function escapeRegex(source) {
  return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTermPattern(term) {
  const pluralizableTerms = new Set([
    'bean',
    'starter',
    'auto-configuration',
    'annotation',
    'profile',
    'endpoint',
    'native image',
    'JAR',
    'WAR',
  ]);
  return new RegExp(
    `(?<![A-Za-z0-9])${escapeRegex(term)}${pluralizableTerms.has(term) ? 's?' : ''}(?![A-Za-z0-9])`,
  );
}

export function findMissingProtectedTerms(source, translated) {
  return PROTECTED_TERMS.filter((term) => {
    const pattern = buildTermPattern(term);
    return pattern.test(source) && !pattern.test(translated);
  });
}

export function validateTranslatedPage({ relativePath, source, translated }) {
  const issues = [];

  if (!hasBalancedListingBlocks(translated)) {
    issues.push(`${relativePath}：listing/source 代码块分隔符数量不成对`);
  }

  for (const lineNumber of findCodeBlockAttributesWithoutDelimiter(translated)) {
    issues.push(`${relativePath}：第 ${lineNumber} 行代码块属性后缺少 ---- 分隔符`);
  }

  for (const target of collectXrefs(source)) {
    if (!translated.includes(`xref:${target}`)) {
      issues.push(`${relativePath}：缺少 xref 目标 ${target}`);
    }
  }

  for (const term of findMissingProtectedTerms(source, translated)) {
    issues.push(`${relativePath}：缺少不翻译术语 ${term}`);
  }

  return issues;
}

export function listProjectFiles() {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8' },
  );
  return output.split('\0').filter(Boolean);
}

export function validateProjectSecrets({ files = listProjectFiles() } = {}) {
  const issues = [];

  for (const file of files) {
    if (!existsSync(file)) {
      continue;
    }

    const content = readFileSync(file, 'utf8');
    const secrets = detectSecrets(content);
    for (const secret of secrets) {
      issues.push(`${file}：发现疑似密钥 ${secret.slice(0, 7)}...，请移出仓库`);
    }
  }

  return issues;
}

export function validateMvpPages({
  sourceRoot = getCachedAntoraRoot(),
  outputRoot = 'content/boot',
} = {}) {
  const issues = [];

  for (const relativePath of MVP_PAGES) {
    const sourcePath = path.join(sourceRoot, relativePath);
    const outputPath = getOutputPathForPage(relativePath, outputRoot);

    if (!existsSync(sourcePath)) {
      issues.push(`${relativePath}：找不到上游页面 ${sourcePath}`);
      continue;
    }

    if (!existsSync(outputPath)) {
      issues.push(`${relativePath}：找不到译文页面 ${outputPath}`);
      continue;
    }

    issues.push(...validateTranslatedPage({
      relativePath,
      source: readFileSync(sourcePath, 'utf8'),
      translated: readFileSync(outputPath, 'utf8'),
    }));
  }

  return issues;
}

export function validateTranslatedFiles({
  sourceRoot = getCachedAntoraRoot(),
  outputRoot = 'content/boot',
  plan = buildFullTranslationPlan({ files: listSourceFiles(sourceRoot) }),
  exists = existsSync,
  read = (file) => readFileSync(file, 'utf8'),
} = {}) {
  const issues = [];

  for (const item of plan) {
    const sourcePath = path.join(sourceRoot, item.relativePath);
    const outputPath = getOutputPathForPage(item.relativePath, outputRoot);

    if (!exists(sourcePath)) {
      issues.push(`${item.relativePath}：找不到上游页面 ${sourcePath}`);
      continue;
    }

    if (!exists(outputPath)) {
      issues.push(`${item.relativePath}：找不到译文页面 ${outputPath}`);
      continue;
    }

    if (item.action === 'translate') {
      issues.push(...validateTranslatedPage({
        relativePath: item.relativePath,
        source: read(sourcePath),
        translated: read(outputPath),
      }));
    }
  }

  return issues;
}

export function validateAll() {
  return [
    ...validateTranslatedFiles(),
    ...validateProjectSecrets(),
  ];
}
