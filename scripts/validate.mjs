#!/usr/bin/env node

import { validateAll } from './lib/validate.mjs';

const issues = validateAll();

if (issues.length === 0) {
  console.log('校验通过：未发现 AsciiDoc 结构、xref、术语或密钥问题');
} else {
  console.error('校验失败：');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exitCode = 1;
}
