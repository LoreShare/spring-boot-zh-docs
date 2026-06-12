import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPATIBILITY_REDIRECTS,
  buildSite,
  buildRedirectHtml,
  createCompatibilityRedirects,
  copySiteRootFiles,
  removeDefaultHeader,
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

test('构建时复制站点根静态文件', () => {
  const copied = [];
  const directories = [];
  const entries = new Map([
    [
      'site-root',
      [
        {
          name: 'google993ab8b0f305f2d5.html',
          isDirectory: () => false,
          isFile: () => true,
        },
      ],
    ],
  ]);

  const created = copySiteRootFiles({
    outputDir: 'build/site',
    rootFilesDir: 'site-root',
    exists: () => true,
    listEntries: (directory) => entries.get(directory) || [],
    mkdir: (directory) => directories.push(directory),
    copy: (source, target) => copied.push([source, target]),
  });

  assert.deepEqual(directories, ['build/site']);
  assert.deepEqual(copied, [
    ['site-root/google993ab8b0f305f2d5.html', 'build/site/google993ab8b0f305f2d5.html'],
  ]);
  assert.deepEqual(created, ['build/site/google993ab8b0f305f2d5.html']);
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

test('构建后移除默认 Antora 顶部导航并清除顶部留白', () => {
  const writes = {};
  const files = new Map([
    [
      'build/site/boot/4.1.0/index.html',
      [
        '<!doctype html>',
        '<html lang="zh-CN">',
        '<head>',
        '  <title>Spring Boot 中文站</title>',
        '</head>',
        '<body class="article">',
        '<header class="header">',
        '  <nav class="navbar">',
        '    <div id="topbar-nav" class="navbar-menu">Home Products Services Download</div>',
        '  </nav>',
        '</header>',
        '<main>中文文档正文</main>',
        '</body>',
        '</html>',
      ].join('\n'),
    ],
  ]);

  const changed = removeDefaultHeader({
    outputDir: 'build/site',
    listFiles: () => [...files.keys()],
    read: (file) => files.get(file),
    write: (file, content) => {
      writes[file] = content;
      files.set(file, content);
    },
  });

  const html = writes['build/site/boot/4.1.0/index.html'];
  assert.deepEqual(changed, ['boot/4.1.0/index.html']);
  assert.doesNotMatch(html, /<header class="header"|id="topbar-nav"|Home Products Services Download/);
  assert.match(html, /spring-boot-zh-headerless/);
  assert.match(html, /body\s*\{\s*padding-top:\s*0/);
  assert.match(html, /\.toolbar\s*\{\s*top:\s*0/);
  assert.match(html, /\.nav-container\s*\{\s*top:\s*0/);
  assert.match(html, /\.nav\s*\{\s*top:\s*0;\s*height:\s*100vh/);
  assert.match(html, /\.toc\.sidebar\s+\.toc-menu\s*\{\s*top:\s*2\.5rem/);
  assert.match(html, /\.toc\.sidebar\s+\.toc-menu\s+ul\s*\{\s*max-height:\s*calc\(100vh - 5rem\)/);
  assert.match(html, /<main>中文文档正文<\/main>/);

  const secondChanged = removeDefaultHeader({
    outputDir: 'build/site',
    listFiles: () => [...files.keys()],
    read: (file) => files.get(file),
    write: (file, content) => {
      writes[file] = content;
      files.set(file, content);
    },
  });

  assert.deepEqual(secondChanged, []);
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
      exists: () => false,
      mkdir: () => {},
      write: () => {},
    }),
    /构建产物完整性校验失败/,
  );
});
