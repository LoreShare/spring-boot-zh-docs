#!/usr/bin/env node

import { parsePathsOption, translateAll } from './lib/translate.mjs';
import { ensureGeneratedPartials } from './lib/generated-partials.mjs';
import { translateGeneratedContent } from './lib/generated-content.mjs';

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
  const generatedResults = await translateGeneratedContent({
    force,
    selectedPaths,
    onProgress: (event) => {
      if (event.status === 'skipped') {
        console.log(`跳过已存在生成型内容：${event.outputPath}`);
      } else if (event.status === 'copied') {
        console.log(`复制生成型内容：${event.outputPath}`);
      } else if (event.status === 'translating') {
        console.log(`开始翻译生成型内容：${event.relativePath}（${event.chunkIndex}/${event.chunkCount}）`);
      } else if (event.status === 'retrying') {
        console.log(`缩小生成型内容分块重试：${event.relativePath}（${event.maxChunkChars} 字符）`);
      }
    },
  });
  const generatedTranslated = generatedResults.filter((result) => result.status === 'translated').length;
  const generatedCopied = generatedResults.filter((result) => result.status === 'copied').length;
  const generatedSkipped = generatedResults.filter((result) => result.status === 'skipped').length;
  ensureGeneratedPartials();
  console.log(`全量处理完成：翻译 ${translated} 个，复制 ${copied} 个，跳过 ${skipped} 个；生成型内容翻译 ${generatedTranslated} 个，复制 ${generatedCopied} 个，跳过 ${generatedSkipped} 个`);
} catch (error) {
  console.error(`全量翻译失败：${error.message}`);
  process.exitCode = 1;
}
