import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { getCachedAntoraRoot } from './sync-source.mjs';
import {
  MVP_PAGES,
  PROTECTED_TERMS,
  buildFullTranslationPlan,
  buildTranslationSources,
  getOutputPathForPage,
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
  return /^\[(source|listing|configprops)(,|\])/.test(trimmed) || /^\[subs=/.test(trimmed);
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

const ALLOWED_ENGLISH_WORDS = new Set([
  'amazon',
  'ant',
  'actuator',
  'annotation',
  'annotations',
  'apache',
  'aot',
  'api',
  'apis',
  'auditing',
  'bean',
  'beans',
  'boot',
  'buildpack',
  'buildpacks',
  'cassandra',
  'chocolatey',
  'classpath',
  'cli',
  'cloud',
  'cloudcaptain',
  'compose',
  'cookie',
  'couchbase',
  'cors',
  'data',
  'docker',
  'dockerfile',
  'endpoint',
  'endpoints',
  'elasticsearch',
  'exchanges',
  'flyway',
  'foundry',
  'gradle',
  'graalvm',
  'hateoas',
  'hibernate',
  'http',
  'https',
  'id',
  'image',
  'images',
  'infinispan',
  'integration',
  'ivy',
  'jar',
  'java',
  'javadoc',
  'jdbc',
  'jpa',
  'jersey',
  'jetty',
  'jms',
  'jmx',
  'jooq',
  'json',
  'jsonassert',
  'jsonpath',
  'junit',
  'kafka',
  'kotlin',
  'ldap',
  'liquibase',
  'livereload',
  'maven',
  'metrics',
  'micrometer',
  'mongodb',
  'mvc',
  'native',
  'neo4j',
  'netty',
  'nosql',
  'oci',
  'oauth2',
  'openshift',
  'paketo',
  'process',
  'plugin',
  'plugins',
  'profile',
  'profiles',
  'pulsar',
  'quartz',
  'r2dbc',
  'reactor',
  'redis',
  'rest',
  'runtime',
  'saml',
  'scoop',
  'security',
  'servlet',
  'session',
  'services',
  'spock',
  'spring',
  'sql',
  'ssl',
  'starter',
  'starters',
  'tanzu',
  'testcontainers',
  'tomcat',
  'tools',
  'undertow',
  'war',
  'web',
  'webflux',
  'websocket',
  'websockets',
  'windows',
  'xml',
  'yaml',
]);

const ALLOWED_ENGLISH_PHRASES = [
  'Apache Ant',
  'Calendar Interval',
  'Commons Logging',
  'Commons Logging API',
  'Daily Time Interval',
  'Dispatcher Handlers',
  'Dispatcher Servlets',
  'Elastic Common Schema',
  'Homebrew',
  'Mac',
  'Not Found',
  'No Content',
  'Bad Request',
  'Spring Cloud Vault',
];

const COMMON_ENGLISH_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'be',
  'by',
  'can',
  'for',
  'from',
  'how',
  'if',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'use',
  'used',
  'using',
  'when',
  'with',
  'you',
  'your',
]);

function splitMacroLabelAndAttributes(body) {
  const attributesMatch = body.match(/((?:,\s*[-\w]+=[^,\]]*)+)$/);
  if (!attributesMatch) {
    return { label: body };
  }
  return { label: body.slice(0, attributesMatch.index) };
}

function exposeTranslatableMacroLabels(line) {
  const macroPattern = /\b(?:xref|link):{1,2}[^\s\[]+\[((?:[^\[\]\n]|\[[^\]\n]*\])*)\]|https?:\/\/[^\s\[]+\[((?:[^\[\]\n]|\[[^\]\n]*\])*)\]/g;
  const attributeUrlPattern = /\{[-\w.]+\}[^\s\[]*\[((?:[^\[\]\n]|\[[^\]\n]*\])*)\]/g;
  return line.replace(macroPattern, (...args) => {
    const label = args[1] ?? args[2] ?? '';
    return ` ${splitMacroLabelAndAttributes(label).label} `;
  }).replace(attributeUrlPattern, (_match, label) => ` ${splitMacroLabelAndAttributes(label).label} `);
}

function removeProtectedInlineText(line) {
  return exposeTranslatableMacroLabels(line)
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/\b[a-z][a-z0-9-]*:{1,2}[^\s\[]+\[(?:[^\[\]\n]|\[[^\]\n]*\])*\]/gi, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\S*(?:[/#]|\.[A-Za-z0-9])\S*/g, ' ')
    .replace(/\b(?:yyyy|MM|dd|HH|mm|ss|SSS|Z|T)\b/g, ' ')
    .replace(/\b[A-Z][A-Z0-9_]{1,}\b/g, ' ')
    .replace(/\b[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+\b/g, ' ')
    .replace(/\[\[[^\]\n]+\]\]|\[#[-\w.]+\]|\{[-\w.]+\}|^\[[^\]\n]+\]$/gi, ' ')
    .replace(/[.#*_+=|:;,[\]{}()<>"\\/]/g, ' ');
}

function removeAllowedEnglish(text) {
  let cleaned = text;
  for (const phrase of ALLOWED_ENGLISH_PHRASES) {
    cleaned = cleaned.replace(buildTermPattern(phrase), ' ');
  }
  for (const term of PROTECTED_TERMS) {
    cleaned = cleaned.replace(buildTermPattern(term), ' ');
  }
  return cleaned;
}

function getEnglishWords(text) {
  return [...text.matchAll(/\b[A-Za-z][A-Za-z'-]*\b/g)]
    .map((match) => match[0])
    .filter((word) => !/[a-z][A-Z]/.test(word))
    .filter((word) => !ALLOWED_ENGLISH_WORDS.has(word.toLowerCase()));
}

function isLikelyEnglishTitle(words) {
  return words.length >= 2 && words.every((word) => /^[A-Z][a-z]+/.test(word));
}

function buildEnglishSample(text) {
  const fragments = text.match(/[A-Za-z][A-Za-z' -]*(?:[.!?])?/g) ?? [];
  return fragments
    .map((fragment) => fragment.trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)[0] ?? text.trim();
}

function isHighConfidenceEnglish(text) {
  const words = getEnglishWords(removeAllowedEnglish(text));
  if (words.length === 0) {
    return false;
  }

  const normalizedWords = words.map((word) => word.toLowerCase());
  return words.length >= 5
    || (words.length >= 2 && normalizedWords.some((word) => COMMON_ENGLISH_WORDS.has(word)))
    || (words.length >= 3 && normalizedWords.some((word) => COMMON_ENGLISH_WORDS.has(word)))
    || isLikelyEnglishTitle(words);
}

export function findUntranslatedEnglishSegments(content) {
  const issues = [];
  const lines = content.split(/\r?\n/);
  let inListingBlock = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '----') {
      inListingBlock = !inListingBlock;
      continue;
    }

    if (inListingBlock || line.trim() === '') {
      continue;
    }

    const visibleText = removeProtectedInlineText(line).replace(/\s+/g, ' ').trim();
    if (visibleText && isHighConfidenceEnglish(visibleText)) {
      issues.push(`第 ${index + 1} 行存在疑似未翻译英文：${buildEnglishSample(visibleText)}`);
    }
  }

  return issues;
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

  for (const issue of findUntranslatedEnglishSegments(translated)) {
    issues.push(`${relativePath}：${issue}`);
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
  plan = buildFullTranslationPlan({ sources: buildTranslationSources() }),
  exists = existsSync,
  read = (file) => readFileSync(file, 'utf8'),
} = {}) {
  const issues = [];

  for (const item of plan) {
    const sourcePath = path.join(item.sourceRoot ?? sourceRoot, item.relativePath);
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
