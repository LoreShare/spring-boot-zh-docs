import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { auditBuiltSiteHtml as defaultAuditBuiltSiteHtml } from './completeness-audit.mjs';
import { readSiteVersions } from './site-versions.mjs';

const DEFAULT_SITE_URL = 'http://localhost:8080';
const LOCAL_EDIT_LINK_PATTERN = /<div class="edit-this-page"><a href="file:\/\/\/[^"]+">Edit this Page<\/a><\/div>\n?/g;
const DEFAULT_HEADER_PATTERN = /<header class="header">[\s\S]*?<\/header>\n?/g;
const HEADERLESS_STYLE_ID = 'spring-boot-zh-headerless';
const HEADERLESS_STYLE = [
  `<style id="${HEADERLESS_STYLE_ID}">`,
  'body {',
  '  padding-top: 0;',
  '}',
  '</style>',
].join('\n');

export function createCompatibilityRedirectsForVersion(version) {
  return [
    {
      aliasPath: 'maven-plugin/index.html',
      targetPath: `boot/${version}/maven-plugin/index.html`,
    },
    {
      aliasPath: 'gradle-plugin/index.html',
      targetPath: `boot/${version}/gradle-plugin/index.html`,
    },
    {
      aliasPath: 'api/rest/actuator/index.html',
      targetPath: `boot/${version}/api/rest/actuator/index.html`,
    },
  ];
}

export const COMPATIBILITY_REDIRECTS = createCompatibilityRedirectsForVersion(readSiteVersions().latest);

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

export function buildRedirectHtml(relativeTarget) {
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '  <meta charset="utf-8">',
    `  <meta http-equiv="refresh" content="0; url=${relativeTarget}">`,
    `  <link rel="canonical" href="${relativeTarget}">`,
    '  <title>Spring Boot 中文文档</title>',
    '</head>',
    '<body>',
    `  <p>正在跳转到 <a href="${relativeTarget}">Spring Boot 中文文档</a>。</p>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

export function createCompatibilityRedirects({
  outputDir = 'build/site',
  redirects = COMPATIBILITY_REDIRECTS,
  mkdir = (directory) => mkdirSync(directory, { recursive: true }),
  write = (file, content) => writeFileSync(file, content),
} = {}) {
  const created = [];

  for (const redirect of redirects) {
    const aliasFile = path.join(outputDir, redirect.aliasPath);
    const aliasDirectory = path.dirname(aliasFile);
    const targetFile = path.join(outputDir, redirect.targetPath);
    const relativeTarget = toPosixPath(path.relative(aliasDirectory, targetFile));

    mkdir(aliasDirectory);
    write(aliasFile, buildRedirectHtml(relativeTarget));
    created.push(toPosixPath(aliasFile));
  }

  return created;
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

export function resolveSiteUrl({
  env = process.env,
  defaultUrl = DEFAULT_SITE_URL,
} = {}) {
  const value = env.SITE_URL || defaultUrl;
  return trimTrailingSlash(value.trim());
}

export function buildAntoraArgs({
  playbook = 'antora-playbook.yml',
  siteUrl = resolveSiteUrl(),
} = {}) {
  return ['generate', playbook, '--url', siteUrl];
}

export function runAntoraBuild({
  playbook = 'antora-playbook.yml',
  command = 'antora',
  spawn = spawnSync,
  siteUrl = resolveSiteUrl(),
} = {}) {
  const result = spawn(command, buildAntoraArgs({ playbook, siteUrl }), {
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    throw new Error(`执行 Antora 构建失败：${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`Antora 构建退出码异常：${result.status}`);
  }
}

export function createNoJekyllFile({
  outputDir = 'build/site',
  mkdir = (directory) => mkdirSync(directory, { recursive: true }),
  write = (file, content) => writeFileSync(file, content),
} = {}) {
  mkdir(outputDir);
  const file = path.join(outputDir, '.nojekyll');
  write(file, '');
  return toPosixPath(file);
}

function listHtmlFiles(directory) {
  const results = [];

  function walk(currentDirectory) {
    for (const entry of readdirSync(currentDirectory)) {
      const file = path.join(currentDirectory, entry);
      const stats = statSync(file);
      if (stats.isDirectory()) {
        walk(file);
      } else if (file.endsWith('.html')) {
        results.push(file);
      }
    }
  }

  walk(directory);
  return results.sort();
}

export function removeLocalEditLinks({
  outputDir = 'build/site',
  listFiles = () => listHtmlFiles(outputDir),
  read = (file) => readFileSync(file, 'utf8'),
  write = (file, content) => writeFileSync(file, content),
} = {}) {
  const changed = [];

  for (const file of listFiles()) {
    const html = read(file);
    const nextHtml = html.replace(LOCAL_EDIT_LINK_PATTERN, '');
    if (nextHtml === html) {
      continue;
    }
    write(file, nextHtml);
    changed.push(toPosixPath(path.relative(outputDir, file)));
  }

  return changed;
}

function ensureHeaderlessStyle(html) {
  if (html.includes(`id="${HEADERLESS_STYLE_ID}"`)) {
    return html;
  }
  if (html.includes('</head>')) {
    return html.replace('</head>', `${HEADERLESS_STYLE}\n</head>`);
  }
  return html;
}

export function removeDefaultHeader({
  outputDir = 'build/site',
  listFiles = () => listHtmlFiles(outputDir),
  read = (file) => readFileSync(file, 'utf8'),
  write = (file, content) => writeFileSync(file, content),
} = {}) {
  const changed = [];

  for (const file of listFiles()) {
    const html = read(file);
    const withoutHeader = html.replace(DEFAULT_HEADER_PATTERN, '');
    if (withoutHeader === html) {
      continue;
    }
    const nextHtml = ensureHeaderlessStyle(withoutHeader);
    write(file, nextHtml);
    changed.push(toPosixPath(path.relative(outputDir, file)));
  }

  return changed;
}

export function validateBuiltSiteHtml({
  outputDir = 'build/site',
  auditBuiltSiteHtml = defaultAuditBuiltSiteHtml,
} = {}) {
  const issues = auditBuiltSiteHtml({ outputDir });
  const errors = issues.filter((issue) => issue.severity === 'error');
  if (errors.length > 0) {
    const details = errors
      .map((issue) => `${issue.relativePath}：${issue.code}：${issue.message}`)
      .join('\n');
    throw new Error(`构建产物完整性校验失败：\n${details}`);
  }
  return issues;
}

export function buildSite(options = {}) {
  runAntoraBuild(options);
  removeLocalEditLinks(options);
  removeDefaultHeader(options);
  const created = createCompatibilityRedirects(options);
  created.push(createNoJekyllFile(options));
  validateBuiltSiteHtml(options);
  return created;
}
