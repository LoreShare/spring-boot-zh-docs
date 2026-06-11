import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

export const COMPATIBILITY_REDIRECTS = [
  {
    aliasPath: 'maven-plugin/index.html',
    targetPath: 'boot/4.1.0/maven-plugin/index.html',
  },
  {
    aliasPath: 'gradle-plugin/index.html',
    targetPath: 'boot/4.1.0/gradle-plugin/index.html',
  },
  {
    aliasPath: 'api/rest/actuator/index.html',
    targetPath: 'boot/4.1.0/api/rest/actuator/index.html',
  },
];

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

export function runAntoraBuild({
  playbook = 'antora-playbook.yml',
  command = 'antora',
  spawn = spawnSync,
} = {}) {
  const result = spawn(command, [playbook], {
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

export function buildSite(options = {}) {
  runAntoraBuild(options);
  return createCompatibilityRedirects(options);
}
