import {
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { getCachedCodeExampleRoots } from './sync-source.mjs';
import {
  buildFullTranslationPlan,
  buildTranslationSources,
  getOutputPathForPage,
} from './translate.mjs';

const INCLUDE_CODE_PATTERN = /^include-code::([^\[\s]+)\[([^\]\n]*)]/gm;
const CODE_EXTENSIONS = [
  { extension: '.java', language: 'java' },
  { extension: '.kt', language: 'kotlin' },
];

export function anchorToCodePath(anchor) {
  return anchor
    .split('.')
    .map((segment) => segment.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
    .join('/');
}

function getNearestAnchor(content, index) {
  const anchors = [...content.slice(0, index).matchAll(/^\[\[([^\]]+)]]/gm)];
  return anchors.at(-1)?.[1];
}

export function collectIncludeCodeContexts(content) {
  return [...content.matchAll(INCLUDE_CODE_PATTERN)].map((match) => ({
    macro: match[0],
    target: match[1],
    attributes: match[2],
    anchor: getNearestAnchor(content, match.index),
    lineNumber: lineNumberAt(content, match.index),
  }));
}

function parseMacroAttributes(attributes) {
  const result = {};
  for (const attribute of attributes.split(',').map((item) => item.trim()).filter(Boolean)) {
    const [name, ...valueParts] = attribute.split('=');
    result[name] = valueParts.length > 0 ? valueParts.join('=') : true;
  }
  return result;
}

function selectSourceContext({ sourceMacroContexts, macroIndex, target, attributes, usedIndexes }) {
  const sameOrdinalContext = sourceMacroContexts[macroIndex];
  if (sameOrdinalContext?.target === target && sameOrdinalContext.attributes === attributes) {
    usedIndexes.add(macroIndex);
    return sameOrdinalContext;
  }

  const matchedIndex = sourceMacroContexts.findIndex((context, index) => (
    !usedIndexes.has(index)
    && context.target === target
    && context.attributes === attributes
  ));
  if (matchedIndex !== -1) {
    usedIndexes.add(matchedIndex);
    return sourceMacroContexts[matchedIndex];
  }

  if (sameOrdinalContext && !usedIndexes.has(macroIndex)) {
    usedIndexes.add(macroIndex);
    return sameOrdinalContext;
  }

  return undefined;
}

function buildCandidateFiles({ anchor, target, codeExampleRoots }) {
  const anchorPath = anchorToCodePath(anchor);
  const anchorPathSegments = anchorPath.split('/').filter(Boolean);
  const targetPaths = [];
  for (let length = anchorPathSegments.length; length >= 0; length -= 1) {
    const basePath = anchorPathSegments.slice(0, length).join('/');
    const targetPath = path.posix.normalize(path.posix.join(basePath, target));
    if (targetPath.startsWith('../') || targetPath === '..') {
      continue;
    }
    if (!targetPaths.includes(targetPath)) {
      targetPaths.push(targetPath);
    }
  }

  if (targetPaths.length === 0) {
    throw new Error(`include-code 目标越过源码根目录：${target}`);
  }

  const parsed = path.posix.parse(targetPaths[0]);
  const extensions = parsed.ext
    ? [{ extension: '', language: parsed.ext === '.kt' ? 'kotlin' : 'java' }]
    : CODE_EXTENSIONS;

  const candidates = [];
  for (const targetPath of targetPaths) {
    for (const { extension, language } of extensions) {
      for (const root of codeExampleRoots) {
        candidates.push({
          file: path.join(root, 'org', 'springframework', 'boot', 'docs', ...targetPath.split('/')) + extension,
          language,
        });
      }
    }
  }
  return candidates;
}

export function resolveIncludeCodeSource({
  anchor,
  target,
  codeExampleRoots = getCachedCodeExampleRoots(),
  exists = existsSync,
} = {}) {
  if (!anchor) {
    throw new Error(`include-code 缺少可用于解析源码路径的 anchor：${target}`);
  }

  const matches = buildCandidateFiles({ anchor, target, codeExampleRoots })
    .filter((candidate) => exists(candidate.file));

  if (matches.length === 0) {
    throw new Error(`找不到 include-code 源码：anchor=${anchor} target=${target}`);
  }

  return matches[0];
}

function stripLeadingLicense(source) {
  const trimmedStart = source.trimStart();
  if (!trimmedStart.startsWith('/*')) {
    return source;
  }

  const endIndex = trimmedStart.indexOf('*/');
  if (endIndex === -1) {
    return source;
  }

  return trimmedStart.slice(endIndex + 2).replace(/^\r?\n/, '');
}

function stripPackageDeclaration(source) {
  return source
    .split(/\r?\n/)
    .filter((line) => !/^\s*package\s+[\w.]+;?\s*$/.test(line))
    .join('\n')
    .replace(/^\s*\n/, '');
}

function removeTagMarkerLines(source) {
  return trimBlankLines(source
    .split(/\r?\n/)
    .filter((line) => !/^\s*\/\/\s*(?:end::|tag::)[\w-]+\[]/.test(line))
    .join('\n'));
}

function stripLicenseAndPackage(source) {
  return stripPackageDeclaration(stripLeadingLicense(source));
}

function trimBlankLines(source) {
  const lines = source.split(/\r?\n/);
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }
  while (lines.length > 0 && lines.at(-1).trim() === '') {
    lines.pop();
  }
  return lines.join('\n');
}

export function extractTaggedCode(source, tag) {
  if (!tag || tag === '*') {
    return removeTagMarkerLines(source);
  }

  const excluded = tag.startsWith('!');
  const tagName = excluded ? tag.slice(1) : tag;
  const lines = source.split(/\r?\n/);
  const result = [];
  let insideRequestedTag = false;
  let found = false;

  for (const line of lines) {
    if (new RegExp(`^\\s*//\\s*tag::${tagName}\\[]`).test(line)) {
      insideRequestedTag = true;
      found = true;
      continue;
    }

    if (new RegExp(`^\\s*//\\s*end::${tagName}\\[]`).test(line)) {
      insideRequestedTag = false;
      continue;
    }

    if (/^\s*\/\/\s*(?:end::|tag::)[\w-]+\[]/.test(line)) {
      continue;
    }

    if ((excluded && !insideRequestedTag) || (!excluded && insideRequestedTag)) {
      result.push(line);
    }
  }

  if (!found) {
    throw new Error(`源码中找不到 tag：${tagName}`);
  }

  return trimBlankLines(result.join('\n'));
}

export function stripNonDisplayedJavaSource(source) {
  return extractTaggedCode(stripLicenseAndPackage(source));
}

function formatSourceBlock({ code, language }) {
  return [
    `[source,${language}]`,
    '----',
    code.trimEnd(),
    '----',
  ].join('\n');
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

export function materializeIncludeCodeInContent({
  relativePath,
  content,
  sourceMacroContexts = [],
  codeExampleRoots = getCachedCodeExampleRoots(),
  exists = existsSync,
  read = (file) => readFileSync(file, 'utf8'),
} = {}) {
  const replacements = [];
  let macroIndex = 0;
  const usedSourceContextIndexes = new Set();
  const materialized = content.replace(INCLUDE_CODE_PATTERN, (macro, target, attributes, index) => {
    const sourceContext = selectSourceContext({
      sourceMacroContexts,
      macroIndex,
      target,
      attributes,
      usedIndexes: usedSourceContextIndexes,
    });
    const anchor = sourceContext?.anchor ?? getNearestAnchor(content, index);
    const parsedAttributes = parseMacroAttributes(attributes);
    const lineNumber = lineNumberAt(content, index);
    macroIndex += 1;
    let source;
    try {
      source = resolveIncludeCodeSource({
        anchor,
        target,
        codeExampleRoots,
        exists,
      });
    } catch (error) {
      throw new Error(`${relativePath}:${lineNumber} ${macro} 解析失败：${error.message}`);
    }
    const strippedSource = stripLicenseAndPackage(read(source.file));
    const code = extractTaggedCode(strippedSource, parsedAttributes.tag);
    if (code.length === 0) {
      throw new Error(`${relativePath}:${lineNumber} 的 include-code 展开后为空：${macro}`);
    }

    const replacement = formatSourceBlock({ code, language: source.language });
    replacements.push({
      relativePath,
      lineNumber,
      macro,
      sourceFile: source.file,
      language: source.language,
    });
    return replacement;
  });

  return {
    content: materialized,
    replacements,
  };
}

export function materializeTranslatedIncludeCode({
  plan = buildFullTranslationPlan({ sources: buildTranslationSources() }),
  outputRoot = 'content/boot',
  codeExampleRoots = getCachedCodeExampleRoots(),
  exists = existsSync,
  read = (file) => readFileSync(file, 'utf8'),
  write = (file, content) => writeFileSync(file, content),
} = {}) {
  const changedFiles = [];
  const replacements = [];

  for (const item of plan) {
    if (item.action !== 'translate') {
      continue;
    }

    const outputPath = getOutputPathForPage(item.relativePath, outputRoot);
    if (!exists(outputPath)) {
      continue;
    }

    const original = read(outputPath);
    if (!original.includes('include-code::')) {
      continue;
    }
    const sourcePath = path.join(item.sourceRoot, item.relativePath);
    const sourceMacroContexts = exists(sourcePath)
      ? collectIncludeCodeContexts(read(sourcePath))
      : [];

    const result = materializeIncludeCodeInContent({
      relativePath: item.relativePath,
      content: original,
      sourceMacroContexts,
      codeExampleRoots,
      exists,
      read,
    });

    if (result.content !== original) {
      write(outputPath, result.content);
      changedFiles.push(outputPath);
      replacements.push(...result.replacements);
    }
  }

  return {
    changedFiles,
    replacements,
  };
}
