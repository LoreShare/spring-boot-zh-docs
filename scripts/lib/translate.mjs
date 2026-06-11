import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { getCachedAntoraRoot } from './sync-source.mjs';

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

export function buildTranslationMessages({ relativePath, source }) {
  const systemPrompt = [
    '你是 Spring Boot 官方文档的中文技术译者。',
    '任务：把 AsciiDoc 页面翻译成自然、准确、克制的中文技术文档。',
    '只翻译自然语言，不要翻译代码、命令、配置键、类名、包名、路径、URL、xref 目标和 AsciiDoc 结构。',
    '必须完整保留 anchors、attributes、include 指令、xref/link/image 目标、代码块、inline code、表格结构和列表结构。',
    `以下术语不要翻译：${PROTECTED_TERMS.join('、')}。`,
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
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('当前 Node.js 环境不支持 fetch');
  }

  const messages = buildTranslationMessages({ relativePath, source });
  const response = await fetchImpl(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildDeepSeekRequest({ messages })),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DeepSeek 请求失败：HTTP ${response.status}；${body}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('DeepSeek 响应中缺少 choices[0].message.content');
  }

  return parseTranslationJson(content);
}

export async function translateMvp({
  sourceRoot = getCachedAntoraRoot(),
  outputRoot = 'content/boot',
  apiKey = readDeepSeekApiKey(),
  force = false,
  fetchImpl = globalThis.fetch,
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
      continue;
    }

    const source = readFileSync(sourcePath, 'utf8');
    const translation = await requestTranslation({ apiKey, relativePath, source, fetchImpl });

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
