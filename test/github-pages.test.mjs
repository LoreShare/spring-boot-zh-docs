import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import * as buildSiteModule from '../scripts/lib/build-site.mjs';

const readProjectFile = (relativePath) =>
  fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('版本配置记录 latest 和全部 GA 版本', () => {
  const config = JSON.parse(readProjectFile('site-versions.json'));

  assert.deepEqual(config, {
    latest: '4.1.0',
    versions: ['4.1.0'],
  });
});

test('Antora playbook 使用多版本内容目录', () => {
  const playbook = readProjectFile('antora-playbook.yml');

  assert.match(playbook, /start_paths:\s*\n\s*-\s+versions\/\*\/content\/boot/);
  assert.doesNotMatch(playbook, /start_path:\s+content\/boot/);
});

test('Antora playbook 禁用本机编辑链接', () => {
  const playbook = readProjectFile('antora-playbook.yml');

  assert.match(playbook, /content:\s*\n\s+edit_url:\s+false/);
});

test('构建脚本支持本地默认地址和 SITE_URL 覆盖', () => {
  assert.equal(buildSiteModule.resolveSiteUrl({ env: {} }), 'http://localhost:8080');
  assert.equal(
    buildSiteModule.resolveSiteUrl({
      env: { SITE_URL: 'https://example.github.io/spring-boot-zh' },
    }),
    'https://example.github.io/spring-boot-zh',
  );

  assert.deepEqual(
    buildSiteModule.buildAntoraArgs({
      playbook: 'antora-playbook.yml',
      siteUrl: 'https://example.github.io/spring-boot-zh',
    }),
    ['generate', 'antora-playbook.yml', '--url', 'https://example.github.io/spring-boot-zh'],
  );
});

test('构建脚本生成 GitHub Pages 需要的 .nojekyll 文件', () => {
  const writes = {};
  const directories = [];

  const created = buildSiteModule.createNoJekyllFile({
    outputDir: 'build/site',
    mkdir: (directory) => directories.push(directory),
    write: (file, content) => {
      writes[file] = content;
    },
  });

  assert.equal(created, 'build/site/.nojekyll');
  assert.deepEqual(directories, ['build/site']);
  assert.equal(writes['build/site/.nojekyll'], '');
});

test('兼容入口根据 latest 版本生成', () => {
  assert.deepEqual(buildSiteModule.createCompatibilityRedirectsForVersion('4.1.0'), [
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

test('GitHub Pages workflow 只能手动发布且不执行翻译', () => {
  const workflow = readProjectFile('.github/workflows/pages.yml');

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\npush:/);
  assert.match(workflow, /uses:\s+actions\/configure-pages@v5/);
  assert.match(workflow, /uses:\s+actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /uses:\s+actions\/deploy-pages@v4/);
  assert.match(workflow, /path:\s+build\/site/);
  assert.match(workflow, /SITE_URL:\s+\$\{\{\s*steps\.pages\.outputs\.base_url\s*\}\}/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run validate/);
  assert.match(workflow, /npm run build/);
  assert.doesNotMatch(workflow, /translate:mvp|translate:all|DEEPSEEK_API_KEY/);
});
