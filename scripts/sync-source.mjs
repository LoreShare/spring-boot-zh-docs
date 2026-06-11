#!/usr/bin/env node

import { syncSource } from './lib/sync-source.mjs';

try {
  const result = syncSource();
  console.log(`文档源同步完成：${result.antoraRoot}`);
} catch (error) {
  console.error(`文档源同步失败：${error.message}`);
  process.exitCode = 1;
}
