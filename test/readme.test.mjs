import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const readProjectFile = (relativePath) =>
  fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const projectRoot = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

test('README 明确 Spring Boot 中文站定位和在线访问入口', () => {
  const readme = readProjectFile('README.md');

  assert.match(readme, /^# Spring Boot 中文站/m);
  assert.match(readme, /Spring Boot `?4\.1\.0`?/);
  assert.match(readme, /最新稳定版/);
  assert.match(readme, /https:\/\/loreshare\.github\.io\/spring-boot-zh-docs\//);
  assert.match(readme, /https:\/\/loreshare\.github\.io\/spring-boot-zh-docs\/boot\/4\.1\.0\//);
  assert.match(readme, /后续.+稳定版.+更新/s);
  assert.match(readme, /非官方中文站/);
  assert.doesNotMatch(readme, /DEEPSEEK_API_KEY=sk-/);
});

test('README 展示站点截图和官方版本支持周期', () => {
  const readme = readProjectFile('README.md');
  const screenshotPath = 'docs/assets/spring-boot-zh-home.png';
  const screenshotFile = path.join(projectRoot, screenshotPath);

  assert.match(readme, new RegExp(`!\\[[^\\]]*Spring Boot 中文站[^\\]]*\\]\\(${screenshotPath}\\)`));
  assert.ok(fs.existsSync(screenshotFile), `README 引用的截图不存在：${screenshotPath}`);
  assert.match(readme, /https:\/\/spring\.io\/projects\/spring-boot#support/);
  assert.match(readme, /\|\s*4\.1\.x\s*\|\s*2026-06\s*\|\s*2027-07\s*\|\s*2028-07\s*\|/);
  assert.match(readme, /\|\s*4\.0\.x\s*\|\s*2025-11\s*\|\s*2026-12\s*\|\s*2027-12\s*\|/);
  assert.match(readme, /\|\s*3\.5\.x\s*\|\s*2025-05\s*\|\s*2026-06\s*\|\s*2032-06\s*\|/);
  assert.doesNotMatch(readme, /^## 当前范围$/m);
});
