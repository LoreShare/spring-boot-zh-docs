#!/usr/bin/env node

import { ensureGeneratedPartials } from './lib/generated-partials.mjs';

try {
  const generated = ensureGeneratedPartials();
  console.log(`生成型 partial 校验完成：缺失 ${generated.length} 个`);
} catch (error) {
  console.error(`生成型 partial 校验失败：${error.message}`);
  process.exitCode = 1;
}
