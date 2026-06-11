import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import {
  buildFullTranslationPlan,
  buildTranslationSources,
  getOutputPathForPage,
} from './translate.mjs';
import { getLatestContentRoot } from './site-versions.mjs';
import { containsGeneratedPlaceholder } from './generated-content.mjs';

export const DEFAULT_COMPLETENESS_JSONL = 'reports/completeness-audit.jsonl';
export const DEFAULT_COMPLETENESS_MARKDOWN = 'reports/completeness-audit.md';

const PROTECTED_ENGLISH_TERMS = [
  'Spring',
  'Spring Boot',
  'Actuator',
  'Maven',
  'Gradle',
  'REST API',
  'Java',
  'Kotlin',
  'GraalVM',
  'AOT',
  'JAR',
  'WAR',
  'HTTP',
  'URL',
  'endpoint',
  'classpath',
  'starter',
  'bean',
  'annotation',
  'profile',
  'native image',
];

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function makeIssue({ severity = 'error', code, relativePath, message, lineNumber, details = {} }) {
  return {
    severity,
    code,
    relativePath,
    message,
    ...(lineNumber ? { lineNumber } : {}),
    ...(Object.keys(details).length > 0 ? { details } : {}),
  };
}

function countDelimitedBlocks(content, delimiter) {
  const count = content
    .split(/\r?\n/)
    .filter((line) => line.trim() === delimiter)
    .length;
  return Math.floor(count / 2);
}

function collectHeadings(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.match(/^(=+)\s+\S/))
    .filter(Boolean)
    .map((match) => match[1].length);
}

function collectAnchors(content) {
  return [...content.matchAll(/^\[\[([^\]]+)]]/gm)].map((match) => match[1]);
}

function collectBlockAttributes(content) {
  return [...content.matchAll(/^\[(source[^\]]*|subs=[^\]]*|cols=[^\]]*|tabs|NOTE|TIP|IMPORTANT|WARNING|CAUTION)]/gm)]
    .map((match) => match[1].split(',')[0]);
}

export function collectIncludeCodeMacros(content) {
  return [...content.matchAll(/^include-code::([^\[\s]+)\[([^\]\n]*)]/gm)]
    .map((match) => ({
      target: match[1],
      attributes: match[2],
      macro: match[0],
      lineNumber: content.slice(0, match.index).split(/\r?\n/).length,
    }));
}

function collectMacroTargets(content, pattern) {
  return [...content.matchAll(pattern)].map((match) => match[1]);
}

function stripDelimitedBlocks(content) {
  const delimiters = new Set(['----', '|===', '====', '======']);
  const lines = content.split(/\r?\n/);
  const result = [];
  let activeDelimiter = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (activeDelimiter) {
      if (trimmed === activeDelimiter) {
        activeDelimiter = null;
      }
      continue;
    }

    if (delimiters.has(trimmed)) {
      activeDelimiter = trimmed;
      continue;
    }

    result.push(line);
  }

  return result.join('\n');
}

function isStructuralLine(line) {
  const trimmed = line.trim();
  return trimmed.length === 0
    || trimmed.startsWith('//')
    || trimmed.startsWith('[[')
    || trimmed.startsWith('[')
    || /^=+\s/.test(trimmed)
    || /^(include|include-code|image)::/.test(trimmed)
    || /^(ifdef|ifndef|endif)::/.test(trimmed)
    || /^:!?\w/.test(trimmed);
}

function normalizeVisibleLine(line) {
  return line
    .replace(/^[*.-]\s+/, '')
    .replace(/^\.\s+/, '')
    .replace(/\b(?:xref|link):{1,2}[^\[]+\[([^\]]*)]/g, '$1')
    .replace(/\bimage::[^\[]+\[[^\]]*]/g, '')
    .replace(/https?:\/\/[^\s\[]+\[([^\]]*)]/g, '$1')
    .trim();
}

export function extractVisibleProseSegments(content) {
  return stripDelimitedBlocks(content)
    .split(/\r?\n/)
    .map(normalizeVisibleLine)
    .filter((line) => !isStructuralLine(line))
    .filter((line) => /[\p{Script=Han}A-Za-z]{2,}/u.test(line));
}

function removeProtectedEnglishTerms(text) {
  return PROTECTED_ENGLISH_TERMS.reduce((result, term) => {
    const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    return result.replace(pattern, ' ');
  }, text);
}

function hasNaturalEnglish(text) {
  const withoutProtectedTerms = removeProtectedEnglishTerms(text)
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/\b[\w.-]+\/[\w./-]+\b/g, ' ')
    .replace(/\b[\w.-]+\.[\w.-]+\b/g, ' ');
  const words = withoutProtectedTerms.match(/\b[A-Za-z][A-Za-z-]{2,}\b/g) ?? [];
  return words.length >= 2;
}

function findUntranslatedVisibleText(content) {
  return extractVisibleProseSegments(content)
    .filter(hasNaturalEnglish)
    .slice(0, 10);
}

function compareOrderedValues({ sourceValues, translatedValues, relativePath, code, label, severity = 'error' }) {
  if (sourceValues.length <= translatedValues.length
    && sourceValues.every((value, index) => translatedValues[index] === value)) {
    return [];
  }

  return [
    makeIssue({
      severity,
      code,
      relativePath,
      message: `${label} 数量或顺序与上游不一致`,
      details: {
        source: sourceValues,
        translated: translatedValues,
      },
    }),
  ];
}

export function auditTranslatedPair({ relativePath, source, translated }) {
  const issues = [];
  const sourceListingBlocks = countDelimitedBlocks(source, '----');
  const translatedListingBlocks = countDelimitedBlocks(translated, '----');
  const sourceTableBlocks = countDelimitedBlocks(source, '|===');
  const translatedTableBlocks = countDelimitedBlocks(translated, '|===');
  const sourceIncludeCodeMacros = collectIncludeCodeMacros(source);

  if (translatedListingBlocks < sourceListingBlocks) {
    issues.push(makeIssue({
      code: 'listing-block-missing',
      relativePath,
      message: `译文代码块数量少于上游：上游 ${sourceListingBlocks} 个，译文 ${translatedListingBlocks} 个`,
    }));
  }

  if (translatedTableBlocks < sourceTableBlocks) {
    issues.push(makeIssue({
      code: 'table-block-missing',
      relativePath,
      message: `译文表格块数量少于上游：上游 ${sourceTableBlocks} 个，译文 ${translatedTableBlocks} 个`,
    }));
  }

  const missingIncludeCodeMacros = sourceIncludeCodeMacros
    .filter((macro) => !translated.includes(macro.macro));
  if (translatedListingBlocks < sourceListingBlocks + missingIncludeCodeMacros.length) {
    for (const macro of missingIncludeCodeMacros) {
      issues.push(makeIssue({
        code: 'include-code-missing',
        relativePath,
        lineNumber: macro.lineNumber,
        message: `include-code 宏未保留，也没有展开为代码块：${macro.macro}`,
      }));
    }
  }

  issues.push(...compareOrderedValues({
    sourceValues: collectHeadings(source),
    translatedValues: collectHeadings(translated),
    relativePath,
    code: 'heading-structure-changed',
    label: '标题层级',
    severity: 'warning',
  }));

  const translatedAnchors = new Set(collectAnchors(translated));
  for (const anchor of collectAnchors(source)) {
    if (!translatedAnchors.has(anchor)) {
      issues.push(makeIssue({
        severity: 'warning',
        code: 'anchor-missing',
        relativePath,
        message: `译文缺少 anchor：${anchor}`,
      }));
    }
  }

  const sourceAttributes = collectBlockAttributes(source);
  const translatedAttributes = collectBlockAttributes(translated);
  if (translatedAttributes.length < sourceAttributes.length) {
    issues.push(makeIssue({
      severity: 'warning',
      code: 'block-attribute-missing',
      relativePath,
      message: `译文块属性数量少于上游：上游 ${sourceAttributes.length} 个，译文 ${translatedAttributes.length} 个`,
    }));
  }

  for (const [code, label, pattern] of [
    ['include-target-missing', 'include 目标', /\binclude::([^\[\s]+)\[/g],
    ['image-target-missing', 'image 目标', /\bimage::([^\[\s]+)\[/g],
    ['link-target-missing', 'link 目标', /\blink:([^\[\s]+)\[/g],
    ['url-target-missing', 'URL 宏目标', /\b(https?:\/\/[^\s\[]+)\[[^\]\n]*]/g],
  ]) {
    const translatedTargets = new Set(collectMacroTargets(translated, pattern));
    for (const target of collectMacroTargets(source, pattern)) {
      if (!translatedTargets.has(target)) {
        issues.push(makeIssue({
          code,
          relativePath,
          message: `译文缺少 ${label}：${target}`,
        }));
      }
    }
  }

  const sourceVisibleSegments = extractVisibleProseSegments(source);
  const translatedVisibleSegments = extractVisibleProseSegments(translated);
  if (sourceVisibleSegments.length >= 4
    && translatedVisibleSegments.length / sourceVisibleSegments.length < 0.55) {
    issues.push(makeIssue({
      severity: 'warning',
      code: 'visible-prose-missing',
      relativePath,
      message: `译文可见正文块明显少于上游：上游 ${sourceVisibleSegments.length} 段，译文 ${translatedVisibleSegments.length} 段`,
      details: {
        sourceSamples: sourceVisibleSegments.slice(0, 3),
        translatedSamples: translatedVisibleSegments.slice(0, 3),
      },
    }));
  }

  for (const segment of findUntranslatedVisibleText(translated)) {
    issues.push(makeIssue({
      severity: 'warning',
      code: 'untranslated-visible-text',
      relativePath,
      message: `可见文本疑似未翻译：${segment}`,
    }));
  }

  return issues;
}

function listHtmlFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  const results = [];
  function walk(currentDirectory) {
    for (const entry of readdirSync(currentDirectory)) {
      const fullPath = path.join(currentDirectory, entry);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        walk(fullPath);
      } else if (stats.isFile() && fullPath.endsWith('.html')) {
        results.push(toPosixPath(fullPath));
      }
    }
  }

  walk(directory);
  return results.sort();
}

function hasHeaderlessLayoutRules(html) {
  return [
    /id="spring-boot-zh-headerless"/,
    /body\s*\{\s*padding-top:\s*0\s*;/,
    /\.nav-container\s*\{\s*top:\s*0\s*;/,
    /\.toolbar\s*\{\s*top:\s*0\s*;/,
    /\.nav\s*\{\s*top:\s*0\s*;\s*height:\s*100vh\s*;/,
    /\.toc\.sidebar\s+\.toc-menu\s*\{\s*top:\s*2\.5rem\s*;/,
    /\.toc\.sidebar\s+\.toc-menu\s+ul\s*\{\s*max-height:\s*calc\(100vh - 5rem\)\s*;/,
  ].every((pattern) => pattern.test(html));
}

export function auditBuiltSiteHtml({
  outputDir = 'build/site',
  listFiles = () => listHtmlFiles(outputDir),
  read = (file) => readFileSync(file, 'utf8'),
} = {}) {
  const issues = [];

  for (const file of listFiles()) {
    const html = read(file);
    const relativePath = toPosixPath(path.relative(outputDir, file));
    if (html.includes('include-code::')) {
      issues.push(makeIssue({
        code: 'raw-include-code-html',
        relativePath,
        message: '构建产物仍包含未展开的 include-code 宏',
      }));
    }
    if (containsGeneratedPlaceholder(html)) {
      issues.push(makeIssue({
        code: 'generated-placeholder-html',
        relativePath,
        message: '构建产物仍包含生成型内容占位文本',
      }));
    }
    if (/Unresolved include directive/i.test(html)) {
      issues.push(makeIssue({
        code: 'unresolved-include-html',
        relativePath,
        message: '构建产物包含未解析的 include 指令',
      }));
    }
    if (/\bjavadoc:[^\s<]+/.test(html)) {
      issues.push(makeIssue({
        code: 'raw-javadoc-html',
        relativePath,
        message: '构建产物仍包含未渲染的 javadoc 宏',
      }));
    }
    if (/\{url-[^}]+}/.test(html)) {
      issues.push(makeIssue({
        code: 'unresolved-url-attribute-html',
        relativePath,
        message: '构建产物包含未解析的 URL 属性',
      }));
    }
    if (/<div class="edit-this-page"><a href="file:\/\/\/[^"]+">Edit this Page<\/a><\/div>/.test(html)) {
      issues.push(makeIssue({
        code: 'local-edit-url-html',
        relativePath,
        message: '构建产物包含本机 Edit this Page 链接',
      }));
    }
    const hasDefaultHeader = /<header class="header"|id="topbar-nav"/.test(html);
    if (hasDefaultHeader) {
      issues.push(makeIssue({
        code: 'default-header-html',
        relativePath,
        message: '构建产物仍包含 Antora 默认顶部导航栏',
      }));
    }
    if (!hasDefaultHeader && /<body class="article"/.test(html) && !hasHeaderlessLayoutRules(html)) {
      issues.push(makeIssue({
        code: 'headerless-layout-html',
        relativePath,
        message: '构建产物缺少完整的 headerless 布局偏移修正样式',
      }));
    }
  }

  return issues;
}

export function auditTranslationCompleteness({
  plan = buildFullTranslationPlan({ sources: buildTranslationSources() }),
  outputRoot = getLatestContentRoot(),
  exists = existsSync,
  read = (file) => readFileSync(file, 'utf8'),
} = {}) {
  const issues = [];

  for (const item of plan) {
    if (item.action !== 'translate') {
      continue;
    }

    const sourcePath = path.join(item.sourceRoot, item.relativePath);
    const outputPath = getOutputPathForPage(item.relativePath, outputRoot);

    if (!exists(sourcePath)) {
      issues.push(makeIssue({
        code: 'source-file-missing',
        relativePath: item.relativePath,
        message: `找不到上游源文件：${sourcePath}`,
      }));
      continue;
    }

    if (!exists(outputPath)) {
      issues.push(makeIssue({
        code: 'translated-file-missing',
        relativePath: item.relativePath,
        message: `找不到译文文件：${outputPath}`,
      }));
      continue;
    }

    issues.push(...auditTranslatedPair({
      relativePath: item.relativePath,
      source: read(sourcePath),
      translated: read(outputPath),
    }));
  }

  return issues;
}

export function buildCompletenessSummary(issues) {
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;
  return `完整性审计发现 ${errorCount} 个错误，${warningCount} 个警告。`;
}

function formatIssueForMarkdown(issue) {
  const location = issue.lineNumber ? `${issue.relativePath}:${issue.lineNumber}` : issue.relativePath;
  return `- [${issue.severity}] ${issue.code} ${location}：${issue.message}`;
}

export function writeCompletenessReports({
  issues,
  jsonlPath = DEFAULT_COMPLETENESS_JSONL,
  markdownPath = DEFAULT_COMPLETENESS_MARKDOWN,
  mkdir = (directory) => mkdirSync(directory, { recursive: true }),
  write = (file, content) => writeFileSync(file, content),
} = {}) {
  mkdir(path.dirname(jsonlPath));
  mkdir(path.dirname(markdownPath));
  const jsonl = issues.map((issue) => JSON.stringify(issue)).join('\n');
  write(jsonlPath, jsonl.length > 0 ? `${jsonl}\n` : '');
  write(markdownPath, [
    '# 翻译完整性审计报告',
    '',
    buildCompletenessSummary(issues),
    '',
    ...issues.map(formatIssueForMarkdown),
    '',
  ].join('\n'));
}
