#!/usr/bin/env node

import { syncGeneratedContent } from './lib/generated-content.mjs';

try {
  const sources = syncGeneratedContent();
  for (const source of sources) {
    console.log(`已同步官方生成型内容：${source.sourceId} -> ${source.sourceRoot}`);
  }
  console.log(`官方生成型内容同步完成：${sources.length} 个来源`);
} catch (error) {
  console.error(`官方生成型内容同步失败：${error.message}`);
  process.exitCode = 1;
}
