#!/usr/bin/env node

import { normalizeUrlMacroFiles } from './lib/url-macros.mjs';

try {
  const changedFiles = normalizeUrlMacroFiles();
  if (changedFiles.length === 0) {
    console.log('URL 宏归一化完成：无需修改');
  } else {
    console.log(`URL 宏归一化完成：更新 ${changedFiles.length} 个文件`);
    for (const file of changedFiles) {
      console.log(`- ${file}`);
    }
  }
} catch (error) {
  console.error(`URL 宏归一化失败：${error.message}`);
  process.exitCode = 1;
}
