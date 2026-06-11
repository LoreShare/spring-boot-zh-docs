#!/usr/bin/env node

import { normalizeXrefLabelFiles } from './lib/xref-labels.mjs';

try {
  const changedFiles = normalizeXrefLabelFiles();
  if (changedFiles.length === 0) {
    console.log('xref 可见文本归一化完成：无需修改');
  } else {
    console.log(`xref 可见文本归一化完成：更新 ${changedFiles.length} 个文件`);
    for (const file of changedFiles) {
      console.log(`- ${file}`);
    }
  }
} catch (error) {
  console.error(`xref 可见文本归一化失败：${error.message}`);
  process.exitCode = 1;
}
