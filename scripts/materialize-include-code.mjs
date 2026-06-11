#!/usr/bin/env node

import { materializeTranslatedIncludeCode } from './lib/include-code.mjs';

try {
  const result = materializeTranslatedIncludeCode();
  console.log(`include-code 展开完成：${result.replacements.length} 个宏，${result.changedFiles.length} 个文件。`);
} catch (error) {
  console.error(`include-code 展开失败：${error.message}`);
  process.exitCode = 1;
}
