import path from 'node:path';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const PAGE_FILE_PATTERN = /\.adoc$/;
const DELIMITED_BLOCKS = new Set(['----', '....', '++++']);
const URL_MACRO_PATTERN = /https?:\/\/[^\s\[]+\[(?:[^\[\]\n]|\[[^\]\n]*\])*\]/g;

function toPosixPath(file) {
  return file.split(path.sep).join('/');
}

function listAsciiDocPageFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }
  const results = [];
  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(file);
      } else if (PAGE_FILE_PATTERN.test(entry.name)) {
        results.push(file);
      }
    }
  }
  walk(directory);
  return results.sort();
}

function getRelativeContentPath({ contentRoot, file }) {
  const relative = toPosixPath(path.relative(contentRoot, file));
  return relative.startsWith('modules/') ? relative : undefined;
}

function hasAsciiDocMacroPrefix(segment, index) {
  const before = segment.slice(0, index);
  return /(?:^|[^A-Za-z0-9_-])(?:[A-Za-z][A-Za-z0-9_-]*:{1,2})$/.test(before);
}

function isRiskyNakedUrlMacro(segment, index) {
  if (index === 0 || hasAsciiDocMacroPrefix(segment, index)) {
    return false;
  }
  return !/\s/.test(segment[index - 1]);
}

function splitInlineCodeSegments(line) {
  return line.split(/(`[^`\n]*`)/g);
}

function normalizeTextSegment(segment) {
  let changed = false;
  const content = segment.replace(URL_MACRO_PATTERN, (match, offset) => {
    if (!isRiskyNakedUrlMacro(segment, offset)) {
      return match;
    }
    changed = true;
    return `link:${match}`;
  });
  return { changed, content };
}

function normalizeLine(line) {
  let changed = false;
  const content = splitInlineCodeSegments(line).map((segment) => {
    if (segment.startsWith('`') && segment.endsWith('`')) {
      return segment;
    }
    const normalized = normalizeTextSegment(segment);
    changed = changed || normalized.changed;
    return normalized.content;
  }).join('');
  return { changed, content };
}

export function findRiskyNakedUrlMacrosInContent(content) {
  const issues = [];
  const lines = content.split(/\r?\n/);
  let inDelimitedBlock = false;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (DELIMITED_BLOCKS.has(trimmed)) {
      inDelimitedBlock = !inDelimitedBlock;
      return;
    }
    if (inDelimitedBlock) {
      return;
    }

    for (const segment of splitInlineCodeSegments(line)) {
      if (segment.startsWith('`') && segment.endsWith('`')) {
        continue;
      }
      for (const match of segment.matchAll(URL_MACRO_PATTERN)) {
        if (isRiskyNakedUrlMacro(segment, match.index)) {
          issues.push({
            lineNumber: index + 1,
            macro: match[0],
          });
        }
      }
    }
  });

  return issues;
}

export function normalizeUrlMacrosInContent({ content }) {
  const lines = content.split(/\r?\n/);
  let changed = false;
  let inDelimitedBlock = false;
  const normalizedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (DELIMITED_BLOCKS.has(trimmed)) {
      inDelimitedBlock = !inDelimitedBlock;
      return line;
    }
    if (inDelimitedBlock) {
      return line;
    }

    const normalized = normalizeLine(line);
    changed = changed || normalized.changed;
    return normalized.content;
  });

  return {
    changed,
    content: normalizedLines.join('\n'),
  };
}

export function normalizeUrlMacroFiles({
  contentRoot = 'versions/4.1.0/content/boot',
  files = listAsciiDocPageFiles(path.join(contentRoot, 'modules')),
  read = (file) => readFileSync(file, 'utf8'),
  write = (file, content) => writeFileSync(file, content),
} = {}) {
  const changedFiles = [];

  for (const file of files) {
    const relativePath = getRelativeContentPath({ contentRoot, file });
    if (!relativePath) {
      continue;
    }
    const source = read(file);
    const normalized = normalizeUrlMacrosInContent({ content: source });
    if (!normalized.changed) {
      continue;
    }
    write(file, normalized.content);
    changedFiles.push(relativePath);
  }

  return changedFiles;
}
