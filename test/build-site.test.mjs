import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPATIBILITY_REDIRECTS,
  buildRedirectHtml,
  createCompatibilityRedirects,
} from '../scripts/lib/build-site.mjs';

test('定义验收需要的无版本前缀兼容入口', () => {
  assert.deepEqual(COMPATIBILITY_REDIRECTS, [
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
  ]);
});

test('生成兼容入口 HTML', () => {
  const html = buildRedirectHtml('../boot/4.1.0/maven-plugin/index.html');

  assert.match(html, /Spring Boot 中文文档/);
  assert.match(html, /http-equiv="refresh"/);
  assert.match(html, /..\/boot\/4.1.0\/maven-plugin\/index.html/);
});

test('写入兼容入口时使用相对跳转路径', () => {
  const writes = {};
  const directories = [];

  const created = createCompatibilityRedirects({
    outputDir: 'build/site',
    redirects: [
      {
        aliasPath: 'maven-plugin/index.html',
        targetPath: 'boot/4.1.0/maven-plugin/index.html',
      },
    ],
    mkdir: (directory) => directories.push(directory),
    write: (file, content) => {
      writes[file] = content;
    },
  });

  assert.deepEqual(directories, ['build/site/maven-plugin']);
  assert.deepEqual(created, ['build/site/maven-plugin/index.html']);
  assert.match(writes['build/site/maven-plugin/index.html'], /\.\.\/boot\/4.1.0\/maven-plugin\/index.html/);
});
