import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPATIBILITY_REDIRECTS,
  buildSite,
  buildRedirectHtml,
  createCompatibilityRedirects,
  removeLocalEditLinks,
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

test('构建后移除默认 UI 生成的本机编辑链接', () => {
  const writes = {};
  const files = new Map([
    [
      'build/site/boot/4.1.0/index.html',
      [
        '<main>',
        '<div class="edit-this-page"><a href="file:///tmp/content/modules/ROOT/pages/index.adoc">Edit this Page</a></div>',
        '<p><code>file:///path/to/buildpack.tgz</code></p>',
        '</main>',
      ].join('\n'),
    ],
  ]);

  const changed = removeLocalEditLinks({
    outputDir: 'build/site',
    listFiles: () => [...files.keys()],
    read: (file) => files.get(file),
    write: (file, content) => {
      writes[file] = content;
    },
  });

  assert.deepEqual(changed, ['boot/4.1.0/index.html']);
  assert.doesNotMatch(writes['build/site/boot/4.1.0/index.html'], /Edit this Page/);
  assert.match(writes['build/site/boot/4.1.0/index.html'], /file:\/\/\/path\/to\/buildpack\.tgz/);
});

test('构建后发现未展开 include-code 时失败', () => {
  assert.throws(
    () => buildSite({
      spawn: () => ({ status: 0 }),
      auditBuiltSiteHtml: () => [
        {
          severity: 'error',
          code: 'raw-include-code-html',
          relativePath: 'boot/4.1.0/example.html',
          message: '构建产物仍包含未展开的 include-code 宏',
        },
      ],
      listFiles: () => [],
      mkdir: () => {},
      write: () => {},
    }),
    /构建产物完整性校验失败/,
  );
});
