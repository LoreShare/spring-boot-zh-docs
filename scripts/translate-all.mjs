#!/usr/bin/env node

import { parsePathsOption, translateAll } from './lib/translate.mjs';

const force = process.argv.includes('--force');
const selectedPaths = parsePathsOption();

try {
  const results = await translateAll({
    force,
    selectedPaths,
    onProgress: (event) => {
      if (event.status === 'skipped') {
        console.log(`跳过已存在文件：${event.outputPath}`);
      } else if (event.status === 'copied') {
        console.log(`复制结构文件：${event.outputPath}`);
      } else if (event.status === 'translating') {
        console.log(`开始翻译：${event.relativePath}（${event.chunkIndex}/${event.chunkCount}）`);
      } else if (event.status === 'retrying') {
        console.log(`缩小分块重试：${event.relativePath}（${event.maxChunkChars} 字符）`);
      }
    },
  });

  const translated = results.filter((result) => result.status === 'translated').length;
  const copied = results.filter((result) => result.status === 'copied').length;
  const skipped = results.filter((result) => result.status === 'skipped').length;
  console.log(`全量处理完成：翻译 ${translated} 个，复制 ${copied} 个，跳过 ${skipped} 个`);
} catch (error) {
  console.error(`全量翻译失败：${error.message}`);
  process.exitCode = 1;
}
