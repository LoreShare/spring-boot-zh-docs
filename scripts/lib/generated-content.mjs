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
  postProcessTranslatedAdoc,
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

const GENERATED_API_LINK_TARGETS = [
  ['maven-plugin:api/java/', 'https://docs.spring.io/spring-boot/maven-plugin/api/java/'],
  ['api:java/', 'https://docs.spring.io/spring-boot/4.1.0/api/java/'],
  ['api:kotlin/', 'https://docs.spring.io/spring-boot/4.1.0/api/kotlin/'],
  ['api/java/', 'https://docs.spring.io/spring-boot/4.1.0/api/java/'],
  ['api/kotlin/', 'https://docs.spring.io/spring-boot/4.1.0/api/kotlin/'],
];

const MAVEN_PARAMETER_TABLE_LABELS = new Map([
  ['| Name', '| 名称'],
  ['| Type', '| 类型'],
  ['| Default value', '| 默认值'],
  ['| User property', '| 用户属性'],
  ['| Since', '| 起始版本'],
]);

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

export function shouldImportGeneratedContentFile(relativePath) {
  if (!relativePath.startsWith('modules/')) {
    return false;
  }
  return relativePath.split('/').at(-1) !== 'antora.yml';
}

function getGeneratedApiHref(target) {
  const mapping = GENERATED_API_LINK_TARGETS.find(([prefix]) => target.startsWith(prefix));
  if (!mapping) {
    return undefined;
  }
  const [prefix, baseUrl] = mapping;
  return `${baseUrl}${target.slice(prefix.length)}`;
}

function convertGeneratedApiXrefs(translated) {
  return translated.replace(
    /\bxref:((?:maven-plugin:)?api(?::|\/)(?:java|kotlin)\/[^\[\s]+)\[([^\]\n]*)\]/g,
    (match, target, label) => {
      const href = getGeneratedApiHref(target);
      return href ? `link:${href}[${label}]` : match;
    },
  );
}

function restoreTableDelimitersFromSource(source, translated) {
  const sourceLines = source.split('\n');
  const translatedLines = translated.split('\n');
  const sourceDelimiterCount = sourceLines.filter((line) => line.trim() === '|===').length;
  const translatedDelimiterIndexes = translatedLines
    .map((line, index) => (line.trim() === '|===' ? index : -1))
    .filter((index) => index !== -1);

  if (sourceDelimiterCount === 0 || translatedDelimiterIndexes.length <= sourceDelimiterCount) {
    return translated;
  }

  if (sourceLines.length === translatedLines.length) {
    translatedLines.forEach((line, index) => {
      if (line.trim() === '|===' && sourceLines[index]?.trim() !== '|===') {
        translatedLines[index] = '';
      }
    });
    return translatedLines.join('\n');
  }

  const extraDelimiterIndexes = translatedDelimiterIndexes.slice(1, 1 + (
    translatedDelimiterIndexes.length - sourceDelimiterCount
  ));
  for (const index of extraDelimiterIndexes) {
    translatedLines[index] = '';
  }
  return translatedLines.join('\n');
}

function isGeneratedPrefixStructuralLine(line) {
  return /^\[\[[^\]]+\]\]$/.test(line)
    || /^\[#[-\w.]+\]$/.test(line)
    || /^\[cols=/.test(line);
}

function restorePrefixStructuralLinesFromSource(source, translated) {
  const sourceLines = source.split('\n');
  const translatedLines = translated.split('\n');
  const firstSourceTableIndex = sourceLines.findIndex((line) => line.trim() === '|===');
  if (firstSourceTableIndex === -1) {
    return translated;
  }

  const sourcePrefixLines = sourceLines
    .slice(0, firstSourceTableIndex)
    .filter(isGeneratedPrefixStructuralLine);

  for (const line of sourcePrefixLines) {
    if (translatedLines.includes(line)) {
      continue;
    }

    if (/^\[\[[^\]]+\]\]$/.test(line) || /^\[#[-\w.]+\]$/.test(line)) {
      const headingIndex = translatedLines.findIndex((candidate) => /^=+\s/.test(candidate));
      translatedLines.splice(headingIndex === -1 ? 0 : headingIndex, 0, line);
      continue;
    }

    const tableIndex = translatedLines.findIndex((candidate) => candidate.trim() === '|===');
    translatedLines.splice(tableIndex === -1 ? translatedLines.length : tableIndex, 0, line);
  }

  return translatedLines.join('\n');
}

function findPreviousGeneratedTableCellLine(lines, startIndex) {
  for (let index = startIndex; index >= 0; index -= 1) {
    const line = lines[index];
    if (line.trim() === '') {
      continue;
    }
    if (line.startsWith('|') && line.trim() !== '|===' && !line.startsWith('|+++')) {
      return { line, distance: startIndex - index };
    }
    return undefined;
  }
  return undefined;
}

function buildLineIndexes(lines) {
  const indexes = new Map();
  lines.forEach((line, index) => {
    if (!indexes.has(line)) {
      indexes.set(line, []);
    }
    indexes.get(line).push(index);
  });
  return indexes;
}

function restoreTablePassthroughCellsFromSource(source, translated) {
  const sourceLines = source.split('\n');
  const translatedLines = translated.split('\n');
  const translatedIndexes = buildLineIndexes(translatedLines);

  sourceLines.forEach((line, sourceIndex) => {
    if (!line.startsWith('|+++') || !line.endsWith('+++')) {
      return;
    }

    const previousCell = findPreviousGeneratedTableCellLine(sourceLines, sourceIndex - 1);
    if (!previousCell) {
      return;
    }

    for (const translatedIndex of translatedIndexes.get(previousCell.line) ?? []) {
      const cellIndex = translatedIndex + previousCell.distance + 1;
      const translatedCell = translatedLines[cellIndex];
      if (!translatedCell?.startsWith('|') || translatedCell.startsWith('|+++') || translatedCell.trim() === '|===') {
        continue;
      }

      const cellContent = translatedCell.slice(1).replace(/^\+\+\+/, '').replace(/\+\+\+$/, '');
      translatedLines[cellIndex] = `|+++${cellContent}+++`;
    }
  });

  return translatedLines.join('\n');
}

function getGeneratedPropertyRows(lines) {
  const rows = [];
  lines.forEach((line, index) => {
    const match = line.match(/^\|\[\[(application-properties\.[^\]]+)\]\]/);
    if (!match) {
      return;
    }

    let descriptionIndex = -1;
    for (let candidateIndex = index + 1; candidateIndex < lines.length; candidateIndex += 1) {
      const candidate = lines[candidateIndex];
      if (candidate.trim() === '|===' || /^\|\[\[application-properties\./.test(candidate)) {
        break;
      }
      if (candidate.startsWith('|+++') || candidate.startsWith('|Replaced by ')) {
        descriptionIndex = candidateIndex;
        break;
      }
    }

    if (descriptionIndex !== -1) {
      rows.push({
        id: match[1],
        propertyLine: line,
        propertyIndex: index,
        descriptionIndex,
      });
    }
  });
  return rows;
}

function hasUnresolvedTranslationPlaceholder(line) {
  return /@@(?:ADOC_TOKEN|ADOC_MACRO|CODE_BLOCK|TERM)_\d+@@/.test(line);
}

function isTranslatedDescriptionCandidate(line) {
  if (!line?.startsWith('|') || line.trim() === '|===' || hasUnresolvedTranslationPlaceholder(line)) {
    return false;
  }
  if (/^\|\s*(?:名称|Name)\s*\|\s*(?:描述|Description)\s*\|/.test(line)) {
    return false;
  }
  if (/\[\[application-properties\./.test(line) || /xref:#application-properties\./.test(line)) {
    return false;
  }
  const content = line.slice(1).replace(/^\+\+\+/, '').replace(/\+\+\+$/, '');
  if (content.trim() === '') {
    return false;
  }
  if (/^`?\+[^`]*\+`?$/.test(content.trim())) {
    return false;
  }
  return /[\u4e00-\u9fff]/.test(content);
}

function collectTranslatedDescriptionCandidates(lines) {
  return lines.filter(isTranslatedDescriptionCandidate);
}

function getTranslatedHeading(lines) {
  return lines.find((line) => /^==+\s/.test(line) && /[\u4e00-\u9fff]/.test(line) && !hasUnresolvedTranslationPlaceholder(line));
}

function normalizeGeneratedDescriptionCell(sourceLine, translatedLine) {
  if (!translatedLine?.startsWith('|') || hasUnresolvedTranslationPlaceholder(translatedLine)) {
    return sourceLine;
  }

  const translatedContent = translatedLine
    .slice(1)
    .replace(/^\+\+\+/, '')
    .replace(/\+\+\+$/, '')
    .replace(/(?<!\\)\|/g, '\\|');

  if (sourceLine.startsWith('|+++') && sourceLine.endsWith('+++')) {
    return `|+++${translatedContent}+++`;
  }
  return `|${translatedContent}`;
}

function buildTranslatedDescriptionByProperty(sourceRows, translatedLines) {
  const descriptionByProperty = new Map();

  for (const row of sourceRows) {
    const translatedPropertyIndex = translatedLines.indexOf(row.propertyLine);
    if (translatedPropertyIndex === -1) {
      continue;
    }
    for (let index = translatedPropertyIndex + 1; index < translatedLines.length; index += 1) {
      const translatedDescription = translatedLines[index];
      if (translatedDescription.trim() === '|===' || /^\|\[\[application-properties\./.test(translatedDescription)) {
        break;
      }
      if (isTranslatedDescriptionCandidate(translatedDescription)) {
        descriptionByProperty.set(row.id, translatedDescription);
        break;
      }
    }
  }

  return descriptionByProperty;
}

function rebuildGeneratedPropertyTableFromSource(source, translated) {
  const sourceLines = source.split('\n');
  const translatedLines = translated.split('\n');
  const sourceRows = getGeneratedPropertyRows(sourceLines);
  if (sourceRows.length === 0) {
    return translated;
  }

  const translatedHeading = getTranslatedHeading(translatedLines);
  const descriptionByProperty = buildTranslatedDescriptionByProperty(sourceRows, translatedLines);
  const descriptionCandidates = collectTranslatedDescriptionCandidates(translatedLines);
  const rowIndexByDescriptionIndex = new Map(
    sourceRows.map((row, rowIndex) => [row.descriptionIndex, rowIndex]),
  );

  return sourceLines.map((line, index) => {
    if (translatedHeading && /^==+\s/.test(line)) {
      return translatedHeading;
    }
    if (line === '|Name|Description|Default Value') {
      return '|名称|描述|默认值';
    }

    const rowIndex = rowIndexByDescriptionIndex.get(index);
    if (rowIndex === undefined) {
      return line;
    }

    const row = sourceRows[rowIndex];
    const translatedDescription = descriptionByProperty.get(row.id)
      ?? descriptionCandidates[rowIndex];
    return normalizeGeneratedDescriptionCell(line, translatedDescription);
  }).join('\n');
}

function collectMavenParameterTableBlocks(lines) {
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== '[cols="10h,90"]') {
      continue;
    }

    const firstDelimiterIndex = lines.findIndex((line, candidateIndex) => (
      candidateIndex > index && line.trim() === '|==='
    ));
    if (firstDelimiterIndex === -1) {
      continue;
    }

    const endIndex = lines.findIndex((line, candidateIndex) => (
      candidateIndex > firstDelimiterIndex && line.trim() === '|==='
    ));
    if (endIndex === -1) {
      continue;
    }

    blocks.push({ startIndex: index, endIndex });
    index = endIndex;
  }
  return blocks;
}

function translateMavenParameterTableLabels(lines) {
  return lines.map((line) => MAVEN_PARAMETER_TABLE_LABELS.get(line) ?? line);
}

function rebuildMavenParameterTablesFromSource(source, translated) {
  if (!source.includes('[cols="10h,90"]')) {
    return translated;
  }

  const sourceLines = source.split('\n');
  const translatedLines = translated.split('\n');
  const sourceBlocks = collectMavenParameterTableBlocks(sourceLines);
  const translatedBlocks = collectMavenParameterTableBlocks(translatedLines);
  if (sourceBlocks.length === 0 || sourceBlocks.length !== translatedBlocks.length) {
    return translated;
  }

  for (let index = sourceBlocks.length - 1; index >= 0; index -= 1) {
    const sourceBlock = sourceBlocks[index];
    const translatedBlock = translatedBlocks[index];
    const replacement = translateMavenParameterTableLabels(
      sourceLines.slice(sourceBlock.startIndex, sourceBlock.endIndex + 1),
    );
    translatedLines.splice(
      translatedBlock.startIndex,
      translatedBlock.endIndex - translatedBlock.startIndex + 1,
      ...replacement,
    );
  }

  return translatedLines.join('\n');
}

function collectMavenParameterSections(lines) {
  const sections = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\[\[[^\]]+-goal\.parameter-details\.[^\]]+\]\]$/.test(lines[index])) {
      continue;
    }

    const nextIndex = lines.findIndex((line, candidateIndex) => (
      candidateIndex > index && /^\[\[[^\]]+-goal\.parameter-details\.[^\]]+\]\]$/.test(line)
    ));
    const endIndex = nextIndex === -1 ? lines.length : nextIndex;
    const sectionLines = lines.slice(index, endIndex);
    const tableStartIndex = sectionLines.findIndex((line) => line === '[cols="10h,90"]');
    if (tableStartIndex === -1) {
      continue;
    }

    sections.push({
      anchor: lines[index],
      lines: sectionLines,
      tableStartIndex,
    });
    index = endIndex - 1;
  }
  return sections;
}

function getTranslatedMavenSectionDescription(translatedLines, anchor) {
  const startIndex = translatedLines.indexOf(anchor);
  if (startIndex === -1) {
    return undefined;
  }

  const descriptionLines = [];
  for (let index = startIndex + 1; index < translatedLines.length; index += 1) {
    const line = translatedLines[index];
    if (/^\[\[[^\]]+-goal\.parameter-details\.[^\]]+\]\]$/.test(line)
      || line === '[cols="10h,90"]'
      || line.trim() === '|==='
      || line.startsWith('|')) {
      break;
    }
    if (/^===\s/.test(line) || line.trim() === '') {
      if (descriptionLines.length > 0 && line.trim() === '') {
        break;
      }
      continue;
    }

    const cleaned = line.replace(/\s*\[cols="10h,90"\].*$/, '').trim();
    if (cleaned && /[\u4e00-\u9fff]/.test(cleaned) && !hasUnresolvedTranslationPlaceholder(cleaned)) {
      descriptionLines.push(cleaned);
    }
  }

  return descriptionLines.length > 0 ? descriptionLines.join('\n') : undefined;
}

function rebuildMavenParameterSection(section, translatedDescription) {
  const beforeDescription = section.lines.slice(0, 2);
  const sourceDescription = section.lines.slice(2, section.tableStartIndex);
  const description = translatedDescription
    ? [`${translatedDescription}`, '']
    : sourceDescription;
  const table = translateMavenParameterTableLabels(section.lines.slice(section.tableStartIndex));
  return [...beforeDescription, ...description, ...table];
}

function rebuildMavenParameterSectionsFromSource(source, translated) {
  const sourceLines = source.split('\n');
  const translatedLines = translated.split('\n');
  const sourceSections = collectMavenParameterSections(sourceLines);
  if (sourceSections.length === 0) {
    return translated;
  }

  const firstTranslatedSectionIndex = translatedLines.indexOf(sourceSections[0].anchor);
  if (firstTranslatedSectionIndex === -1) {
    return translated;
  }

  const prefix = translatedLines.slice(0, firstTranslatedSectionIndex);
  const rebuiltSections = sourceSections.flatMap((section) => rebuildMavenParameterSection(
    section,
    getTranslatedMavenSectionDescription(translatedLines, section.anchor),
  ));

  return [...prefix, ...rebuiltSections].join('\n');
}

export function postProcessGeneratedAdoc({ source, translated }) {
  return postProcessTranslatedAdoc({
    relativePath: '',
    source,
    translated: convertGeneratedApiXrefs(
      rebuildMavenParameterSectionsFromSource(
        source,
        rebuildMavenParameterTablesFromSource(
          source,
          rebuildGeneratedPropertyTableFromSource(
            source,
            restoreTablePassthroughCellsFromSource(
              source,
              restorePrefixStructuralLinesFromSource(
                source,
                restoreTableDelimitersFromSource(source, translated),
              ),
            ),
          ),
        ),
      ),
    ),
  });
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
    .filter((relativePath) => shouldImportGeneratedContentFile(relativePath))
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
      if (item.action === 'translate') {
        const source = readFileSync(sourcePath, 'utf8');
        const processed = postProcessGeneratedAdoc({ source, translated: outputContent });
        if (processed !== outputContent) {
          writeFileSync(outputPath, processed.endsWith('\n') ? processed : `${processed}\n`);
          results.push({ ...item, outputPath, status: 'postprocessed' });
          onProgress({ ...item, outputPath, status: 'postprocessed' });
          continue;
        }
      }

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

    const translated = postProcessGeneratedAdoc({ source, translated: translation.translated });
    writeFileSync(outputPath, translated.endsWith('\n') ? translated : `${translated}\n`);
    results.push({ ...item, outputPath, status: 'translated', chunkCount: translation.chunkCount });
  }

  return results;
}
