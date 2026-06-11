#!/usr/bin/env node

import { translateMvp } from './lib/translate.mjs';

const force = process.argv.includes('--force');

try {
  const results = await translateMvp({
    force,
    onProgress: (event) => {
      if (event.status === 'translating') {
        console.log(`开始翻译：${event.relativePath}`);
      }
    },
  });
  for (const result of results) {
    if (result.status === 'skipped') {
      console.log(`跳过已存在译文：${result.outputPath}`);
      continue;
    }

    console.log(`翻译完成：${result.outputPath}`);
    for (const warning of result.warnings ?? []) {
      console.warn(`翻译提醒：${result.relativePath}：${warning}`);
    }
  }
} catch (error) {
  console.error(`MVP 翻译失败：${error.message}`);
  process.exitCode = 1;
}
