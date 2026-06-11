#!/usr/bin/env node

import { buildSite } from './lib/build-site.mjs';

try {
  const created = buildSite();
  console.log(`兼容入口生成完成：${created.join('、')}`);
} catch (error) {
  console.error(`站点构建失败：${error.message}`);
  process.exitCode = 1;
}
