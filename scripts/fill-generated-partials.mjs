#!/usr/bin/env node

import { ensureGeneratedPartials } from './lib/generated-partials.mjs';

try {
  const generated = ensureGeneratedPartials();
  console.log(`生成型 partial 补齐完成：新增 ${generated.length} 个`);
} catch (error) {
  console.error(`生成型 partial 补齐失败：${error.message}`);
  process.exitCode = 1;
}
