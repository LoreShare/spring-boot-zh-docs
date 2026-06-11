import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { getCachedAntoraRoot } from './sync-source.mjs';
import {
  MVP_PAGES,
  PROTECTED_TERMS,
  buildFullTranslationPlan,
  buildTranslationSources,
  getOutputPathForPage,
} from './translate.mjs';
import { auditTranslationCompleteness } from './completeness-audit.mjs';

export function collectXrefs(content) {
  return [...content.matchAll(/\bxref:([^\[\s]+)\[/g)].map((match) => match[1]);
}

export function hasBalancedListingBlocks(content) {
  const delimiterCount = content
    .split(/\r?\n/)
    .filter((line) => line.trim() === '----')
    .length;
  return delimiterCount % 2 === 0;
}

export function hasBalancedTabsBlocks(content) {
  const delimiterCount = content
    .split(/\r?\n/)
    .filter((line) => line.trim() === '======')
    .length;
  return delimiterCount % 2 === 0;
}

function isCodeBlockAttribute(line) {
  const trimmed = line.trim();
  return /^\[(source|listing|configprops)(,|\])/.test(trimmed) || /^\[subs=/.test(trimmed);
}

export function findCodeBlockAttributesWithoutDelimiter(content) {
  const lines = content.split(/\r?\n/);
  const lineNumbers = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (isCodeBlockAttribute(lines[index]) && lines[index + 1]?.trim() !== '----') {
      lineNumbers.push(index + 1);
    }
  }

  return lineNumbers;
}

export function detectSecrets(content) {
  return [...new Set(content.match(/\bsk-[A-Za-z0-9_-]{20,}\b/g) ?? [])];
}

function escapeRegex(source) {
  return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTermPattern(term, flags = '') {
  const pluralizableTerms = new Set([
    'bean',
    'starter',
    'auto-configuration',
    'annotation',
    'profile',
    'endpoint',
    'native image',
    'JAR',
    'WAR',
  ]);
  return new RegExp(
    `(?<![A-Za-z0-9])${escapeRegex(term)}${pluralizableTerms.has(term) ? 's?' : ''}(?![A-Za-z0-9])`,
    flags,
  );
}

const ALLOWED_ENGLISH_WORDS = new Set([
  'amazon',
  'ant',
  'actuator',
  'annotation',
  'annotations',
  'apache',
  'archaius',
  'aot',
  'api',
  'apis',
  'auditing',
  'ansi',
  'azul',
  'bean',
  'beans',
  'bellsoft',
  'boot',
  'brave',
  'builder',
  'builders',
  'buildpack',
  'buildpacks',
  'cassandra',
  'chocolatey',
  'classpath',
  'client',
  'cli',
  'cloud',
  'cloudcaptain',
  'collections',
  'compose',
  'cookie',
  'couchbase',
  'cors',
  'caffeine',
  'consul',
  'crac',
  'data',
  'docker',
  'docs',
  'dockerfile',
  'dynatrace',
  'endpoint',
  'endpoints',
  'edition',
  'elasticsearch',
  'eclipse',
  'exemplars',
  'exchanges',
  'filters',
  'flyway',
  'firefox',
  'freemarker',
  'foundry',
  'groovy',
  'gradle',
  'graalvm',
  'graylog',
  'github',
  'google',
  'gson',
  'guava',
  'hateoas',
  'hibernate',
  'http',
  'https',
  'id',
  'idea',
  'image',
  'images',
  'infinispan',
  'integration',
  'issuer',
  'ivy',
  'jar',
  'java',
  'javadoc',
  'jdbc',
  'jpa',
  'jersey',
  'jetty',
  'kit',
  'jms',
  'jmx',
  'jooq',
  'json',
  'jsonassert',
  'jackson',
  'jsonb',
  'jsonpath',
  'junit',
  'jwk',
  'jwt',
  'kubernetes',
  'logback',
  'kafka',
  'kotlin',
  'ldap',
  'liquibase',
  'listener',
  'listeners',
  'livereload',
  'lombok',
  'maven',
  'metrics',
  'micrometer',
  'mongodb',
  'mock',
  'mvc',
  'native',
  'neo4j',
  'netty',
  'netflix',
  'nosql',
  'oci',
  'oauth2',
  'oidc',
  'openmetrics',
  'openobservability',
  'opentelemetry',
  'openshift',
  'paketo',
  'pod',
  'pods',
  'process',
  'prometheus',
  'okta',
  'plugin',
  'plugins',
  'profile',
  'profiles',
  'pulsar',
  'resource',
  'quartz',
  'r2dbc',
  'reactor',
  'redis',
  'rest',
  'resttestclient',
  'runtime',
  'run',
  'saml',
  'scoop',
  'security',
  'server',
  'servlet',
  'servlets',
  'session',
  'services',
  'spock',
  'spy',
  'sybase',
  'stackdriver',
  'spring',
  'sql',
  'ssl',
  'starter',
  'starters',
  'safari',
  'tanzu',
  'testcontainers',
  'thymeleaf',
  'timeseries',
  'tomcat',
  'tools',
  'undertow',
  'ultimate',
  'uri',
  'war',
  'web',
  'webflux',
  'websocket',
  'websockets',
  'windows',
  'zulu',
  'xml',
  'yaml',
  'username',
  'zipkin',
]);

const ALLOWED_ENGLISH_PHRASES = [
  'Actuator Health Endpoints',
  'Amazon Elastic Container Service',
  'Apache Ant',
  'Apache Commons File Upload',
  'Apache ZooKeeper',
  'App Engine',
  'App Engine Flex',
  'Application Events',
  'AssertJ',
  'Azure App Service',
  'Azure Spring Cloud',
  'Azul Zulu JDK with CRaC',
  'Calendar Interval',
  'BellSoft Liberica with CRaC',
  'Bean Validation',
  'BellSoft Liberica JDK with CRaC',
  'Build Helper Maven Plugin',
  'Caffeine',
  'Connection Factory',
  'Container Engine',
  'Compute Engine',
  'Context Propagation',
  'Commons Logging',
  'Commons Logging API',
  'Daily Time Interval',
  'Dispatcher Handlers',
  'Dispatcher Servlets',
  'Dynatrace Kubernetes Operator',
  'Dynatrace Operator for Kubernetes',
  'Elastic Common Schema',
  'Elastic Beanstalk',
  'Elastic Beanstalk Java',
  'Facebook',
  'Failsafe',
  'Fluent Builder',
  'Graylog Extended Log Format',
  'Hello World',
  'Homebrew',
  'Hibernate Validator',
  'HtmlUnit',
  'IntelliJ IDEA Ultimate Edition',
  'IntelliJ Ultimate Edition',
  'Flight Recorder',
  'Java Flight Recorder',
  'Java Util Logging',
  'JUnit Jupiter',
  'JWK Set URI',
  'Kotlin Coroutines',
  'Kubernetes Probes',
  'Kubernetes Service',
  'Lettuce',
  "Let's Encrypt",
  'BellSoft Liberica Native Image Kit',
  'Liberica Native Image Kit',
  'LiveReload',
  'Mac',
  'Make Project',
  'Micrometer Dynatrace',
  'Micrometer Observation',
  'Native Tools Command Prompt',
  'x64 Native Tools Command Prompt',
  'Visual Studio Build Tools',
  'Windows SDK',
  'New Relic',
  'Not Found',
  'No Content',
  'Bad Request',
  'OpenID Connect',
  'OIDC Issuer URI',
  'OpenMetrics',
  'OpenTelemetry',
  'OpenZipkin Brave',
  'Problem Details',
  'Prometheus Exemplars',
  'Prometheus Pushgateway',
  'Protocol Buffers',
  'Reactive Streams',
  'SaaS Stackdriver',
  'Selenium',
  'Server Sent Events',
  'Spring Batch',
  'Spring Boot for Apache Geode',
  'Spring Boot with GraalVM',
  'Spring Cloud Vault',
  'Spring Cloud Sleuth',
  'Spring Data Envers',
  'Spring Data Redis',
  'Spring Framework',
  'Spring REST Docs',
  'Spring Security',
  'Spring Tools for Eclipse',
  'Spring WebFlux',
  'Stack Overflow',
  'WebTestClient',
];

const COMMON_ENGLISH_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'be',
  'by',
  'can',
  'for',
  'from',
  'how',
  'if',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'use',
  'used',
  'using',
  'when',
  'with',
  'you',
  'your',
]);

function splitMacroLabelAndAttributes(body) {
  const attributesMatch = body.match(/((?:,\s*[-\w]+=[^,\]]*)+)$/);
  if (!attributesMatch) {
    return { label: body };
  }
  return { label: body.slice(0, attributesMatch.index) };
}

function exposeTranslatableMacroLabels(line) {
  const macroPattern = /\b(?:xref|link):{1,2}[^\s\[]+\[((?:[^\[\]\n]|\[[^\]\n]*\])*)\]|https?:\/\/[^\s\[]+\[((?:[^\[\]\n]|\[[^\]\n]*\])*)\]/g;
  const attributeUrlPattern = /\{[-\w.]+\}[^\s\[]*\[((?:[^\[\]\n]|\[[^\]\n]*\])*)\]/g;
  return line.replace(macroPattern, (...args) => {
    const label = args[1] ?? args[2] ?? '';
    return ` ${splitMacroLabelAndAttributes(label).label} `;
  }).replace(attributeUrlPattern, (_match, label) => ` ${splitMacroLabelAndAttributes(label).label} `);
}

function removeProtectedInlineText(line) {
  return exposeTranslatableMacroLabels(line)
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/\b[a-z][a-z0-9-]*:{1,2}[^\s\[]+\[(?:[^\[\]\n]|\[[^\]\n]*\])*\]/gi, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\S*(?:[/#]|\.[A-Za-z0-9])\S*/g, ' ')
    .replace(/\b(?:yyyy|MM|dd|HH|mm|ss|SSS|Z|T)\b/g, ' ')
    .replace(/\b[A-Z][A-Z0-9_]{1,}\b/g, ' ')
    .replace(/\b[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+\b/g, ' ')
    .replace(/\[\[[^\]\n]+\]\]|\[#[-\w.]+\]|\{[-\w.]+\}|^\[[^\]\n]+\]$/gi, ' ')
    .replace(/[.#*_+=|:;,[\]{}()<>"\\/]/g, ' ');
}

function removeAllowedEnglish(text) {
  let cleaned = text;
  for (const phrase of ALLOWED_ENGLISH_PHRASES) {
    cleaned = cleaned.replace(buildTermPattern(phrase, 'g'), ' ');
  }
  for (const term of PROTECTED_TERMS) {
    cleaned = cleaned.replace(buildTermPattern(term, 'g'), ' ');
  }
  return cleaned;
}

function getEnglishWords(text) {
  return [...text.matchAll(/\b[A-Za-z][A-Za-z'-]*\b/g)]
    .map((match) => match[0])
    .filter((word) => !/[a-z][A-Z]/.test(word))
    .filter((word) => !ALLOWED_ENGLISH_WORDS.has(word.toLowerCase()));
}

function isLikelyEnglishTitle(words) {
  return words.length >= 2 && words.every((word) => /^[A-Z][a-z]+/.test(word));
}

function buildEnglishSample(text) {
  const fragments = text.match(/[A-Za-z][A-Za-z' -]*(?:[.!?])?/g) ?? [];
  return fragments
    .map((fragment) => fragment.trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)[0] ?? text.trim();
}

function isHighConfidenceEnglish(text) {
  const words = getEnglishWords(removeAllowedEnglish(text));
  if (words.length === 0) {
    return false;
  }

  const normalizedWords = words.map((word) => word.toLowerCase());
  return words.length >= 5
    || (words.length >= 2 && normalizedWords.some((word) => COMMON_ENGLISH_WORDS.has(word)))
    || (words.length >= 3 && normalizedWords.some((word) => COMMON_ENGLISH_WORDS.has(word)))
    || isLikelyEnglishTitle(words);
}

export function findUntranslatedEnglishSegments(content) {
  const issues = [];
  const lines = content.split(/\r?\n/);
  let inListingBlock = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '----') {
      inListingBlock = !inListingBlock;
      continue;
    }

    if (inListingBlock || line.trim() === '') {
      continue;
    }

    const visibleText = removeProtectedInlineText(line).replace(/\s+/g, ' ').trim();
    if (visibleText && isHighConfidenceEnglish(visibleText)) {
      issues.push(`第 ${index + 1} 行存在疑似未翻译英文：${buildEnglishSample(visibleText)}`);
    }
  }

  return issues;
}

export function findMissingProtectedTerms(source, translated) {
  return PROTECTED_TERMS.filter((term) => {
    const pattern = buildTermPattern(term);
    return pattern.test(source) && !pattern.test(translated);
  });
}

const EXTERNAL_API_XREF_TARGETS = new Set([
  'api/java/index.html',
  'api/kotlin/index.html',
  'api:java/index.html',
  'api:kotlin/index.html',
  'maven-plugin:api/java/index.html',
  'gradle-plugin:api/java/index.html',
]);

function shouldRequireXrefTarget(target) {
  return !EXTERNAL_API_XREF_TARGETS.has(target);
}

function getModuleNameFromRelativePath(relativePath) {
  const match = relativePath.match(/^modules\/([^/]+)\//);
  return match?.[1] ?? 'ROOT';
}

export function findPartialIncludeTargets(content) {
  return [...content.matchAll(/\binclude::(?:(?<moduleName>[-\w]+):)?partial\$(?<partialPath>[^\[\s]+)\[/g)]
    .map((match) => ({
      moduleName: match.groups.moduleName,
      partialPath: match.groups.partialPath,
    }));
}

export function validatePartialIncludes({
  relativePath,
  translated,
  outputRoot = 'content/boot',
  exists = existsSync,
} = {}) {
  const issues = [];
  const currentModuleName = getModuleNameFromRelativePath(relativePath);

  for (const includeTarget of findPartialIncludeTargets(translated)) {
    const moduleName = includeTarget.moduleName ?? currentModuleName;
    const partialPath = path.join(outputRoot, 'modules', moduleName, 'partials', includeTarget.partialPath);
    if (!exists(partialPath)) {
      issues.push(`${relativePath}：找不到 partial include 目标 ${partialPath}`);
    }
  }

  return issues;
}

export function validateTranslatedPage({ relativePath, source, translated }) {
  const issues = [];

  if (!hasBalancedListingBlocks(translated)) {
    issues.push(`${relativePath}：listing/source 代码块分隔符数量不成对`);
  }

  if (!hasBalancedTabsBlocks(translated)) {
    issues.push(`${relativePath}：tabs/example 块分隔符数量不成对`);
  }

  for (const lineNumber of findCodeBlockAttributesWithoutDelimiter(translated)) {
    issues.push(`${relativePath}：第 ${lineNumber} 行代码块属性后缺少 ---- 分隔符`);
  }

  for (const target of collectXrefs(source)) {
    if (shouldRequireXrefTarget(target) && !translated.includes(`xref:${target}`)) {
      issues.push(`${relativePath}：缺少 xref 目标 ${target}`);
    }
  }

  for (const term of findMissingProtectedTerms(source, translated)) {
    issues.push(`${relativePath}：缺少不翻译术语 ${term}`);
  }

  for (const issue of findUntranslatedEnglishSegments(translated)) {
    issues.push(`${relativePath}：${issue}`);
  }

  return issues;
}

export function listProjectFiles() {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8' },
  );
  return output.split('\0').filter(Boolean);
}

export function validateProjectSecrets({ files = listProjectFiles() } = {}) {
  const issues = [];

  for (const file of files) {
    if (!existsSync(file)) {
      continue;
    }

    const content = readFileSync(file, 'utf8');
    const secrets = detectSecrets(content);
    for (const secret of secrets) {
      issues.push(`${file}：发现疑似密钥 ${secret.slice(0, 7)}...，请移出仓库`);
    }
  }

  return issues;
}

export function validateMvpPages({
  sourceRoot = getCachedAntoraRoot(),
  outputRoot = 'content/boot',
} = {}) {
  const issues = [];

  for (const relativePath of MVP_PAGES) {
    const sourcePath = path.join(sourceRoot, relativePath);
    const outputPath = getOutputPathForPage(relativePath, outputRoot);

    if (!existsSync(sourcePath)) {
      issues.push(`${relativePath}：找不到上游页面 ${sourcePath}`);
      continue;
    }

    if (!existsSync(outputPath)) {
      issues.push(`${relativePath}：找不到译文页面 ${outputPath}`);
      continue;
    }

    issues.push(...validateTranslatedPage({
      relativePath,
      source: readFileSync(sourcePath, 'utf8'),
      translated: readFileSync(outputPath, 'utf8'),
    }));
  }

  return issues;
}

export function validateTranslatedFiles({
  sourceRoot = getCachedAntoraRoot(),
  outputRoot = 'content/boot',
  plan = buildFullTranslationPlan({ sources: buildTranslationSources() }),
  exists = existsSync,
  read = (file) => readFileSync(file, 'utf8'),
} = {}) {
  const issues = [];

  for (const item of plan) {
    const sourcePath = path.join(item.sourceRoot ?? sourceRoot, item.relativePath);
    const outputPath = getOutputPathForPage(item.relativePath, outputRoot);

    if (!exists(sourcePath)) {
      issues.push(`${item.relativePath}：找不到上游页面 ${sourcePath}`);
      continue;
    }

    if (!exists(outputPath)) {
      issues.push(`${item.relativePath}：找不到译文页面 ${outputPath}`);
      continue;
    }

    if (item.action === 'translate') {
      const translated = read(outputPath);
      issues.push(...validateTranslatedPage({
        relativePath: item.relativePath,
        source: read(sourcePath),
        translated,
      }));
      issues.push(...validatePartialIncludes({
        relativePath: item.relativePath,
        translated,
        outputRoot,
        exists,
      }));
    }
  }

  return issues;
}

function formatCompletenessIssue(issue) {
  return `${issue.relativePath}：完整性审计 ${issue.code}：${issue.message}`;
}

export function validateCompletenessAudit({
  auditTranslationCompletenessFn = auditTranslationCompleteness,
} = {}) {
  return auditTranslationCompletenessFn()
    .filter((issue) => issue.severity === 'error')
    .map(formatCompletenessIssue);
}

export function validateAll({
  validateTranslatedFilesFn = validateTranslatedFiles,
  validateProjectSecretsFn = validateProjectSecrets,
  auditTranslationCompletenessFn = auditTranslationCompleteness,
} = {}) {
  return [
    ...validateTranslatedFilesFn(),
    ...validateProjectSecretsFn(),
    ...validateCompletenessAudit({ auditTranslationCompletenessFn }),
  ];
}
