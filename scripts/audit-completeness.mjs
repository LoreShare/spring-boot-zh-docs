#!/usr/bin/env node

import {
  auditTranslationCompleteness,
  buildCompletenessSummary,
  writeCompletenessReports,
} from './lib/completeness-audit.mjs';

try {
  const issues = auditTranslationCompleteness();
  writeCompletenessReports({ issues });
  console.log(buildCompletenessSummary(issues));

  if (issues.some((issue) => issue.severity === 'error')) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`完整性审计失败：${error.message}`);
  process.exitCode = 1;
}
