import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const readProjectFile = (relativePath) =>
  fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('Dockerfile 使用 Node 构建阶段和 nginx 运行阶段', () => {
  const dockerfile = readProjectFile('Dockerfile');

  assert.match(dockerfile, /FROM node:24-alpine AS build/);
  assert.match(dockerfile, /RUN apk add --no-cache git/);
  assert.match(dockerfile, /RUN npm ci/);
  assert.match(dockerfile, /RUN npm run build/);
  assert.match(dockerfile, /FROM nginx:alpine AS runtime/);
  assert.match(dockerfile, /COPY --from=build\s+\/app\/build\/site\s+\/usr\/share\/nginx\/html/);
  assert.match(dockerfile, /EXPOSE 80/);
});

test('.dockerignore 排除本地产物但保留 Antora 需要的 Git 元数据', () => {
  const entries = readProjectFile('.dockerignore')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  assert.ok(entries.includes('node_modules'), '应排除本地依赖目录');
  assert.ok(entries.includes('build'), '应排除本地构建产物');
  assert.ok(entries.includes('reports'), '应排除本地报告产物');
  assert.ok(entries.includes('.env'), '应排除本地密钥文件');
  assert.ok(!entries.includes('.git'), '不能排除 .git，Antora 需要解析 HEAD');
  assert.ok(!entries.includes('.git/'), '不能排除 .git/，Antora 需要解析 HEAD');
});

test('nginx 配置以静态文件方式发布 Antora 站点', () => {
  const nginxConfig = readProjectFile('docker/nginx.conf');

  assert.match(nginxConfig, /listen 80;/);
  assert.match(nginxConfig, /root \/usr\/share\/nginx\/html;/);
  assert.match(nginxConfig, /index index\.html;/);
  assert.match(nginxConfig, /charset utf-8;/);
  assert.match(nginxConfig, /try_files \$uri \$uri\/ =404;/);
});
