import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { getCachedAntoraRoot, getCachedAntoraRoots } from './sync-source.mjs';

export const DEFAULT_MODEL = 'deepseek-v4-flash';
export const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

export const PROTECTED_TERMS = [
  'Spring',
  'Spring Boot',
  'bean',
  'starter',
  'Actuator',
  'auto-configuration',
  'classpath',
  'JAR',
  'WAR',
  'annotation',
  'profile',
  'endpoint',
  'native image',
  'GraalVM',
  'AOT',
  'Buildpack',
  'Maven',
  'Gradle',
  'Kotlin',
  'Java',
];

export const MVP_PAGES = [
  'modules/ROOT/pages/index.adoc',
  'modules/ROOT/pages/documentation.adoc',
  'modules/ROOT/pages/community.adoc',
  'modules/ROOT/pages/system-requirements.adoc',
  'modules/ROOT/pages/installing.adoc',
  'modules/ROOT/pages/upgrading.adoc',
  'modules/tutorial/pages/index.adoc',
  'modules/tutorial/pages/first-application/index.adoc',
];

export const COPY_ONLY_FILES = [
  'nav.adoc',
  'modules/ROOT/pages/redirect.adoc',
];

export const DEFAULT_USAGE_LOG = 'reports/deepseek-usage.jsonl';

export function buildTranslationMessages({ relativePath, source }) {
  const systemPrompt = [
    '你是 Spring Boot 官方文档的中文技术译者。',
    '任务：把 AsciiDoc 页面翻译成自然、准确、克制的中文技术文档。',
    '只翻译自然语言，不要翻译代码、命令、配置键、类名、包名、路径、URL、xref 目标和 AsciiDoc 结构。',
    '普通英文句子必须翻译成中文；不要照抄英文段落、英文标题、英文提示语或英文列表项。',
    'xref/link/URL 宏的目标和属性必须保留，但方括号中的可见链接文本如为自然语言必须翻译。',
    '必须完整保留 anchors、attributes、include 指令、xref/link/image 目标、代码块、inline code、表格结构和列表结构。',
    `以下术语不要翻译：${PROTECTED_TERMS.join('、')}。`,
    '输入中的 @@CODE_BLOCK_N@@、@@ADOC_TOKEN_N@@、@@ADOC_MACRO_N@@、@@TERM_N@@ 是不可翻译占位符，必须逐字原样保留。',
    '输出必须是 JSON，不输出 Markdown 代码围栏以外的解释。',
    'JSON 字段必须包含 translated_adoc、warnings、protected_terms。',
    'translated_adoc 必须是完整 AsciiDoc 页面。',
  ].join('\n');

  const userPrompt = [
    `文件路径：${relativePath}`,
    '请翻译下面的 AsciiDoc 页面，并返回 JSON：',
    source,
  ].join('\n\n');

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

export function buildDeepSeekRequest({ messages, model = DEFAULT_MODEL }) {
  return {
    model,
    messages,
    temperature: 0.1,
    max_tokens: 8192,
    stream: false,
    response_format: { type: 'json_object' },
    thinking: { type: 'disabled' },
  };
}

export function parseTranslationJson(rawText) {
  const trimmed = rawText.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const parsed = JSON.parse(withoutFence);
  if (typeof parsed.translated_adoc !== 'string' || parsed.translated_adoc.length === 0) {
    throw new Error('DeepSeek 响应缺少 translated_adoc');
  }

  return {
    translated_adoc: parsed.translated_adoc,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    protected_terms: Array.isArray(parsed.protected_terms) ? parsed.protected_terms : [],
  };
}

export function getOutputPathForPage(relativePath, outputRoot = 'content/boot') {
  return `${outputRoot}/${relativePath}`;
}

export function listSourceFiles(sourceRoot = getCachedAntoraRoot()) {
  const results = [];

  function walk(directory) {
    for (const entry of readdirSync(directory)) {
      const fullPath = path.join(directory, entry);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        walk(fullPath);
      } else if (stats.isFile()) {
        results.push(path.relative(sourceRoot, fullPath).split(path.sep).join('/'));
      }
    }
  }

  walk(sourceRoot);
  return results.sort();
}

export function buildTranslationSources(sourceRoots = getCachedAntoraRoots()) {
  const sourceIds = ['core', 'maven-plugin', 'gradle-plugin', 'actuator-rest-api'];
  return sourceRoots.map((sourceRoot, index) => ({
    sourceId: sourceIds[index] ?? `source-${index + 1}`,
    sourceRoot,
  }));
}

function replaceWithPlaceholders(source, pattern, prefix) {
  const values = [];
  const replaced = source.replace(pattern, (match) => {
    const placeholder = `@@${prefix}_${values.length}@@`;
    values.push({ placeholder, value: match });
    return placeholder;
  });

  return { replaced, values };
}

function restorePlaceholders(source, values) {
  return values.reduce(
    (restored, { placeholder, value }) => restored.split(placeholder).join(value),
    source,
  );
}

function splitMacroLabelAndAttributes(body) {
  const attributesMatch = body.match(/((?:,\s*[-\w]+=[^,\]]*)+)$/);
  if (!attributesMatch) {
    return { label: body, attributes: '' };
  }

  return {
    label: body.slice(0, attributesMatch.index),
    attributes: attributesMatch[0],
  };
}

function protectTranslatableMacroSyntax(source) {
  const values = [];
  const macroPattern = /\b(?:xref|link):{1,2}[^\s\[]+\[(?:[^\[\]\n]|\[[^\]\n]*\])*\]|https?:\/\/[^\s\[]+\[(?:[^\[\]\n]|\[[^\]\n]*\])*\]/g;
  const replaced = source.replace(macroPattern, (match) => {
    const openBracket = match.indexOf('[');
    const closeBracket = match.lastIndexOf(']');
    const head = match.slice(0, openBracket);
    const body = match.slice(openBracket + 1, closeBracket);
    const { label, attributes } = splitMacroLabelAndAttributes(body);
    const headPlaceholder = `@@ADOC_MACRO_${values.length}@@`;
    values.push({ placeholder: headPlaceholder, value: head });

    if (!attributes) {
      return `${headPlaceholder}[${label}]`;
    }

    const attributesPlaceholder = `@@ADOC_MACRO_${values.length}@@`;
    values.push({ placeholder: attributesPlaceholder, value: attributes });
    return `${headPlaceholder}[${label}${attributesPlaceholder}]`;
  });

  return { replaced, values };
}

function escapeRegex(source) {
  return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildProtectedTermsPattern() {
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
  const alternatives = [...PROTECTED_TERMS]
    .sort((left, right) => right.length - left.length)
    .map((term) => `${escapeRegex(term)}${pluralizableTerms.has(term) ? 's?' : ''}`);
  return new RegExp(`(?<![A-Za-z0-9])(?:${alternatives.join('|')})(?![A-Za-z0-9])`, 'g');
}

export function prepareSourceForTranslation(source) {
  const blockPattern = /(^|\n)----\n[\s\S]*?\n----(?=\n|$)/g;
  const blockProtection = replaceWithPlaceholders(source, blockPattern, 'CODE_BLOCK');

  const macroProtection = protectTranslatableMacroSyntax(blockProtection.replaced);

  const adocPattern = /`[^`\n]+`|\b[a-z][a-z0-9-]*:{1,2}[^\s\[]+\[(?:[^\[\]\n]|\[[^\]\n]*\])*\]|\[\[[^\]\n]+\]\]|\[#[-\w.]+\]|\{[-\w.]+\}|^\[[^\]\n]+\]$/gim;
  const adocProtection = replaceWithPlaceholders(macroProtection.replaced, adocPattern, 'ADOC_TOKEN');

  const termProtection = replaceWithPlaceholders(
    adocProtection.replaced,
    buildProtectedTermsPattern(),
    'TERM',
  );

  return {
    source: termProtection.replaced,
    placeholders: [
      ...blockProtection.values,
      ...macroProtection.values,
      ...adocProtection.values,
      ...termProtection.values,
    ].map(({ placeholder }) => placeholder),
    restore(translatedSource) {
      return restorePlaceholders(
        restorePlaceholders(
          restorePlaceholders(
            restorePlaceholders(translatedSource, termProtection.values),
            adocProtection.values,
          ),
          macroProtection.values,
        ),
        blockProtection.values,
      );
    },
  };
}

export function shouldSendToTranslator(source) {
  const prepared = prepareSourceForTranslation(source).source;
  const stripped = prepared
    .replace(/@@(?:CODE_BLOCK|ADOC_TOKEN|ADOC_MACRO|TERM)_\d+@@/g, '')
    .replace(/[ \t\r\n。、，；：,.!?()[\]{}<>"'`=:+*/\\|-]/g, '');
  return stripped.length > 0;
}

function isExcludedSourceFile(relativePath) {
  return relativePath === 'antora.yml' || relativePath === 'local-nav.adoc';
}

function sortTranslationItems(left, right) {
  if (left.relativePath === 'nav.adoc') {
    return -1;
  }
  if (right.relativePath === 'nav.adoc') {
    return 1;
  }
  return left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0;
}

function buildPlanItemsForFiles({ files, sourceId, sourceRoot } = {}) {
  return files
    .filter((relativePath) => !isExcludedSourceFile(relativePath))
    .sort((left, right) => sortTranslationItems({ relativePath: left }, { relativePath: right }))
    .map((relativePath) => ({
      ...(sourceId ? { sourceId } : {}),
      ...(sourceRoot ? { sourceRoot } : {}),
      relativePath,
      action: relativePath.endsWith('.adoc') && !COPY_ONLY_FILES.includes(relativePath)
        ? 'translate'
        : 'copy',
    }));
}

export function buildFullTranslationPlan({
  files,
  sources,
} = {}) {
  if (sources) {
    return sources
      .flatMap((source) => buildPlanItemsForFiles({
        files: source.files ?? listSourceFiles(source.sourceRoot),
        sourceId: source.sourceId,
        sourceRoot: source.sourceRoot,
      }))
      .sort(sortTranslationItems);
  }

  return buildPlanItemsForFiles({ files: files ?? listSourceFiles() })
    .filter((item) => item.relativePath !== 'antora.yml')
    .map((item) => ({
      relativePath: item.relativePath,
      action: item.action,
    }));
}

export function parsePathsOption(argv = process.argv.slice(2)) {
  const option = argv.find((argument) => argument.startsWith('--paths='));
  if (!option) {
    return [];
  }

  return option
    .slice('--paths='.length)
    .split(',')
    .map((item) => item.trim().replace(/^content\/boot\//, '').replace(/\/+$/, ''))
    .filter(Boolean);
}

export function filterTranslationPlanByPaths(plan, selectedPaths = []) {
  if (selectedPaths.length === 0) {
    return plan;
  }

  return plan.filter((item) => selectedPaths.some((selectedPath) => (
    item.relativePath === selectedPath || item.relativePath.startsWith(`${selectedPath}/`)
  )));
}

export function splitAsciiDocForTranslation(source, { maxChars = 12_000 } = {}) {
  const lines = source.split('\n');
  const chunks = [];
  let current = [];
  let currentLength = 0;
  let inListingBlock = false;

  function flush() {
    if (current.length === 0) {
      return;
    }

    chunks.push({
      index: chunks.length + 1,
      content: current.join('\n'),
    });
    current = [];
    currentLength = 0;
  }

  for (const line of lines) {
    if (!inListingBlock && line.trim() === '----' && current.length > 0) {
      flush();
    }

    const nextLength = currentLength + line.length + (current.length > 0 ? 1 : 0);
    if (!inListingBlock && current.length > 0 && nextLength > maxChars) {
      flush();
    }

    current.push(line);
    currentLength += line.length + (current.length > 1 ? 1 : 0);

    if (line.trim() === '----') {
      inListingBlock = !inListingBlock;
      if (!inListingBlock) {
        flush();
      }
    } else if (!inListingBlock && currentLength >= maxChars) {
      flush();
    }
  }

  flush();
  return chunks;
}

export function loadEnvFile(envPath = '.env') {
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function readDeepSeekApiKey() {
  loadEnvFile();
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('缺少 DEEPSEEK_API_KEY，请通过环境变量或本地 .env 提供');
  }
  return apiKey;
}

export async function requestTranslation({
  apiKey,
  relativePath,
  source,
  chunkIndex,
  chunkCount,
  fetchImpl = globalThis.fetch,
  timeoutMs = 180_000,
}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('当前 Node.js 环境不支持 fetch');
  }

  const requestPath = chunkCount && chunkCount > 1
    ? `${relativePath}（分块 ${chunkIndex}/${chunkCount}）`
    : relativePath;
  const prepared = prepareSourceForTranslation(source);
  const messages = buildTranslationMessages({ relativePath: requestPath, source: prepared.source });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;

  try {
    response = await fetchImpl(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildDeepSeekRequest({ messages })),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`DeepSeek 请求超时：${relativePath} 超过 ${timeoutMs}ms 未返回`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DeepSeek 请求失败：HTTP ${response.status}；${body}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('DeepSeek 响应中缺少 choices[0].message.content');
  }

  const translation = parseTranslationJson(content);
  const missingPlaceholders = prepared.placeholders
    .filter((placeholder) => placeholder.startsWith('@@CODE_BLOCK_'))
    .filter((placeholder) => !translation.translated_adoc.includes(placeholder));
  if (missingPlaceholders.length > 0) {
    throw new Error(`DeepSeek 响应缺少占位符：${missingPlaceholders.join('、')}`);
  }

  return {
    ...translation,
    translated_adoc: prepared.restore(translation.translated_adoc),
    usage: payload.usage ?? {},
    model: payload.model ?? DEFAULT_MODEL,
  };
}

export function createUsageRecord({
  sourceId,
  relativePath,
  chunkIndex,
  chunkCount,
  model,
  usage = {},
}) {
  return {
    ...(sourceId ? { sourceId } : {}),
    relativePath,
    chunkIndex,
    chunkCount,
    model,
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
  };
}

export function appendUsageRecord(record, usageLogPath = DEFAULT_USAGE_LOG) {
  mkdirSync(path.dirname(usageLogPath), { recursive: true });
  appendFileSync(usageLogPath, `${JSON.stringify(record)}\n`);
}

export function isRetryableTranslationError(error) {
  return error instanceof SyntaxError
    || /JSON|translated_adoc|Unexpected token|Unterminated string|占位符/i.test(error.message);
}

export function isRetryableNetworkError(error) {
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|network|socket|timeout/i
    .test(error.message);
}

function wait(ms) {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function requestTranslationWithNetworkRetries({
  maxAttempts = 3,
  retryDelayMs = 1_000,
  onProgress,
  requestTranslationImpl,
  request,
}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await requestTranslationImpl(request);
    } catch (error) {
      const retryableRequestError = isRetryableNetworkError(error) || isRetryableTranslationError(error);
      if (attempt >= maxAttempts || !retryableRequestError) {
        throw error;
      }

      onProgress({
        relativePath: request.relativePath,
        status: 'retrying-request',
        reason: error.message,
        attempt: attempt + 1,
        maxAttempts,
        chunkIndex: request.chunkIndex,
        chunkCount: request.chunkCount,
      });
      await wait(retryDelayMs);
    }
  }

  throw new Error('网络重试状态异常');
}

export async function translateContentWithRetries({
  apiKey,
  sourceId,
  relativePath,
  source,
  fetchImpl = globalThis.fetch,
  requestTimeoutMs = 180_000,
  initialMaxChunkChars = 12_000,
  minChunkChars = 3_000,
  requestTranslationImpl = requestTranslation,
  chunkNetworkMaxAttempts = 3,
  chunkNetworkRetryDelayMs = 1_000,
  onProgress = () => {},
} = {}) {
  let maxChunkChars = initialMaxChunkChars;
  let retried = false;

  while (true) {
    const chunks = splitAsciiDocForTranslation(source, { maxChars: maxChunkChars });
    const translatedChunks = [];
    const usageRecords = [];

    try {
      for (const chunk of chunks) {
        if (!shouldSendToTranslator(chunk.content)) {
          translatedChunks.push(chunk.content);
          onProgress({
            relativePath,
            status: 'kept',
            chunkIndex: chunk.index,
            chunkCount: chunks.length,
          });
          continue;
        }

        onProgress({
          relativePath,
          status: 'translating',
          chunkIndex: chunk.index,
          chunkCount: chunks.length,
        });

        const translation = await requestTranslationWithNetworkRetries({
          requestTranslationImpl,
          maxAttempts: chunkNetworkMaxAttempts,
          retryDelayMs: chunkNetworkRetryDelayMs,
          onProgress,
          request: {
            apiKey,
            relativePath,
            source: chunk.content,
            chunkIndex: chunk.index,
            chunkCount: chunks.length,
            fetchImpl,
            timeoutMs: requestTimeoutMs,
          },
        });

        usageRecords.push(createUsageRecord({
          sourceId,
          relativePath,
          chunkIndex: chunk.index,
          chunkCount: chunks.length,
          model: translation.model,
          usage: translation.usage,
        }));

        translatedChunks.push(translation.translated_adoc);
      }

      return {
        translated: translatedChunks.join('\n'),
        usageRecords,
        chunkCount: chunks.length,
      };
    } catch (error) {
      if (retried || maxChunkChars <= minChunkChars || !isRetryableTranslationError(error)) {
        throw error;
      }

      retried = true;
      maxChunkChars = minChunkChars;
      onProgress({
        relativePath,
        status: 'retrying',
        reason: error.message,
        maxChunkChars,
      });
    }
  }
}

export async function translateMvp({
  sourceRoot = getCachedAntoraRoot(),
  outputRoot = 'content/boot',
  apiKey = readDeepSeekApiKey(),
  force = false,
  fetchImpl = globalThis.fetch,
  requestTimeoutMs = 180_000,
  onProgress = () => {},
} = {}) {
  const results = [];

  for (const relativePath of MVP_PAGES) {
    const sourcePath = path.join(sourceRoot, relativePath);
    const outputPath = getOutputPathForPage(relativePath, outputRoot);

    if (!existsSync(sourcePath)) {
      throw new Error(`找不到上游页面：${sourcePath}`);
    }

    if (!force && existsSync(outputPath)) {
      results.push({ relativePath, outputPath, status: 'skipped' });
      onProgress({ relativePath, outputPath, status: 'skipped' });
      continue;
    }

    const source = readFileSync(sourcePath, 'utf8');
    onProgress({ relativePath, outputPath, status: 'translating' });
    const translation = await requestTranslation({
      apiKey,
      relativePath,
      source,
      fetchImpl,
      timeoutMs: requestTimeoutMs,
    });

    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, translation.translated_adoc.endsWith('\n')
      ? translation.translated_adoc
      : `${translation.translated_adoc}\n`);

    results.push({
      relativePath,
      outputPath,
      status: 'translated',
      warnings: translation.warnings,
    });
  }

  return results;
}

export async function translateAll({
  sourceRoot,
  sources = sourceRoot
    ? [{ sourceId: 'core', sourceRoot }]
    : buildTranslationSources(),
  outputRoot = 'content/boot',
  apiKey = readDeepSeekApiKey(),
  force = false,
  fetchImpl = globalThis.fetch,
  requestTimeoutMs = 180_000,
  usageLogPath = DEFAULT_USAGE_LOG,
  maxChunkChars = 12_000,
  selectedPaths = [],
  onProgress = () => {},
} = {}) {
  const plan = filterTranslationPlanByPaths(buildFullTranslationPlan({ sources }), selectedPaths);
  const results = [];

  for (const item of plan) {
    const sourcePath = path.join(item.sourceRoot, item.relativePath);
    const outputPath = getOutputPathForPage(item.relativePath, outputRoot);

    if (!force && existsSync(outputPath)) {
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
