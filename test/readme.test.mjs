import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const readProjectFile = (relativePath) =>
  fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

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
