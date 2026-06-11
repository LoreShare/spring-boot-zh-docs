import path from 'node:path';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const PAGE_FILE_PATTERN = /\.adoc$/;
const DELIMITED_BLOCKS = new Set(['----', '....', '++++']);
const EMPTY_ANCHOR_XREF_PATTERN = /\bxref:([A-Za-z0-9_./:-]*\.adoc#[A-Za-z0-9_.-]+|#[A-Za-z0-9_.-]+)\[\]/g;
const BARE_ANCHOR_XREF_PATTERN = /\bxref:([A-Za-z0-9_./:-]*\.adoc#[A-Za-z0-9_.-]+|#[A-Za-z0-9_.-]+)(?=$|[\s。），),;:])/g;

function toPosixPath(file) {
  return file.split(path.sep).join('/');
}

function stripHeadingMarkup(text) {
  return text
    .replace(/\[\[[^\]\n]+]]/g, '')
    .replace(/\[#[-\w.]+]/g, '')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\b(?:xref|link):{1,2}[^\s\[]+\[([^\]\n]*)]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function getModulePagePath({ contentRoot, file }) {
  const relative = toPosixPath(path.relative(contentRoot, file));
  const match = relative.match(/^modules\/([^/]+)\/pages\/(.+)$/);
  if (!match) {
    return undefined;
  }
  return {
    moduleName: match[1],
    pagePath: match[2],
    relativePath: relative,
  };
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

function collectAnchors(line) {
  return [...line.matchAll(/\[\[([^\]\n]+)]]/g)].map((match) => match[1].trim()).filter(Boolean);
}

function slugifyImplicitAnchorSegment(title) {
  const cleaned = stripHeadingMarkup(title);
  if (/[\u4e00-\u9fff]/.test(cleaned)) {
    return undefined;
  }
  const slug = cleaned.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return slug || undefined;
}

export function buildXrefTitleIndex({
  contentRoot = 'versions/4.1.0/content/boot',
  files = listAsciiDocPageFiles(path.join(contentRoot, 'modules')),
  read = (file) => readFileSync(file, 'utf8'),
} = {}) {
  const titleIndex = new Map();

  for (const file of files) {
    const page = getModulePagePath({ contentRoot, file });
    if (!page) {
      continue;
    }
    const lines = read(file).split(/\r?\n/);
    const pageKey = `${page.moduleName}:${page.pagePath}`;
    const pageTitleLine = lines.find((line) => /^=\s+/.test(line));
    if (pageTitleLine) {
      titleIndex.set(pageKey, stripHeadingMarkup(pageTitleLine.replace(/^=\s+/, '')));
    }

    const headingStack = [];
    let pendingAnchors = [];
    for (let index = 0; index < lines.length; index += 1) {
      const anchors = collectAnchors(lines[index]);
      if (anchors.length > 0) {
        pendingAnchors.push(...anchors);
      }

      const blockTitleMatch = lines[index].match(/^\.(.+)$/);
      if (blockTitleMatch && pendingAnchors.length > 0) {
        const title = stripHeadingMarkup(blockTitleMatch[1]);
        for (const anchor of pendingAnchors) {
          titleIndex.set(`${pageKey}#${anchor}`, title);
        }
        pendingAnchors = [];
        continue;
      }

      const headingMatch = lines[index].match(/^(=+)\s+(.+)$/);
      if (!headingMatch) {
        continue;
      }

      const level = headingMatch[1].length;
      const title = stripHeadingMarkup(headingMatch[2]);
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }

      let currentAnchor;
      if (pendingAnchors.length > 0) {
        for (const anchor of pendingAnchors) {
          titleIndex.set(`${pageKey}#${anchor}`, title);
        }
        currentAnchor = pendingAnchors[pendingAnchors.length - 1];
        pendingAnchors = [];
      } else if (headingStack.length > 0) {
        const parentAnchor = headingStack[headingStack.length - 1].anchor;
        const segment = slugifyImplicitAnchorSegment(title);
        if (parentAnchor && segment) {
          currentAnchor = `${parentAnchor}.${segment}`;
          titleIndex.set(`${pageKey}#${currentAnchor}`, title);
        }
      }

      if (currentAnchor) {
        headingStack.push({ level, anchor: currentAnchor });
      }
    }
  }

  return titleIndex;
}

function getCurrentPage(relativePath) {
  const match = toPosixPath(relativePath).match(/^modules\/([^/]+)\/pages\/(.+)$/);
  if (!match) {
    return undefined;
  }
  return {
    moduleName: match[1],
    pagePath: match[2],
  };
}

function resolveXrefIndexKey(target, currentPage) {
  if (!currentPage) {
    return undefined;
  }
  if (target.startsWith('#')) {
    return `${currentPage.moduleName}:${currentPage.pagePath}${target}`;
  }
  const moduleMatch = target.match(/^([^:#/]+):(.*)$/);
  if (moduleMatch) {
    return `${moduleMatch[1]}:${moduleMatch[2]}`;
  }
  return `${currentPage.moduleName}:${target}`;
}

function normalizeTextSegment(segment, { currentPage, titleIndex }) {
  let changed = false;
  const withEmptyLabels = segment.replace(EMPTY_ANCHOR_XREF_PATTERN, (match, target) => {
    const label = titleIndex.get(resolveXrefIndexKey(target, currentPage));
    if (!label) {
      return match;
    }
    changed = true;
    return `xref:${target}[${label}]`;
  });
  const withBareXrefs = withEmptyLabels.replace(BARE_ANCHOR_XREF_PATTERN, (match, target) => {
    const label = titleIndex.get(resolveXrefIndexKey(target, currentPage));
    if (!label) {
      return match;
    }
    changed = true;
    return `xref:${target}[${label}]`;
  });
  return { content: withBareXrefs, changed };
}

function normalizeLine(line, options) {
  const segments = line.split(/(`[^`\n]*`)/g);
  let changed = false;
  const content = segments.map((segment) => {
    if (segment.startsWith('`') && segment.endsWith('`')) {
      return segment;
    }
    const normalized = normalizeTextSegment(segment, options);
    changed = changed || normalized.changed;
    return normalized.content;
  }).join('');
  return { content, changed };
}

export function normalizeXrefLabelsInContent({ relativePath, content, titleIndex }) {
  const currentPage = getCurrentPage(relativePath);
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
    const normalized = normalizeLine(line, { currentPage, titleIndex });
    changed = changed || normalized.changed;
    return normalized.content;
  });

  return {
    changed,
    content: normalizedLines.join('\n'),
  };
}

export function normalizeXrefLabelFiles({
  contentRoot = 'versions/4.1.0/content/boot',
  files = listAsciiDocPageFiles(path.join(contentRoot, 'modules')),
  read = (file) => readFileSync(file, 'utf8'),
  write = (file, content) => writeFileSync(file, content),
  titleIndex = buildXrefTitleIndex({ contentRoot, files, read }),
} = {}) {
  const changedFiles = [];

  for (const file of files) {
    const page = getModulePagePath({ contentRoot, file });
    if (!page) {
      continue;
    }
    const source = read(file);
    const normalized = normalizeXrefLabelsInContent({
      relativePath: page.relativePath,
      content: source,
      titleIndex,
    });
    if (!normalized.changed) {
      continue;
    }
    write(file, normalized.content);
    changedFiles.push(page.relativePath);
  }

  return changedFiles;
}
