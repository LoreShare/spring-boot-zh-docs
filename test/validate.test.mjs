import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectXrefs,
  detectSecrets,
  findUntranslatedEnglishSegments,
  findMissingProtectedTerms,
  findPartialIncludeTargets,
  hasBalancedListingBlocks,
  hasBalancedTabsBlocks,
  findCodeBlockAttributesWithoutDelimiter,
  validatePartialIncludes,
  validateAll,
  validateTranslatedFiles,
  validateTranslatedPage,
} from '../scripts/lib/validate.mjs';

test('能收集 AsciiDoc xref 目标', () => {
  assert.deepEqual(
    collectXrefs('请看 xref:index.adoc[] 和 xref:tutorial:index.adoc[教程]。'),
    ['index.adoc', 'tutorial:index.adoc'],
  );
});

test('能识别 listing 代码块是否成对', () => {
  assert.equal(hasBalancedListingBlocks('正文\n----\ncode\n----\n正文'), true);
  assert.equal(hasBalancedListingBlocks('正文\n----\ncode\n正文'), false);
});

test('能识别 tabs/example 块是否成对', () => {
  assert.equal(hasBalancedTabsBlocks('[tabs]\n======\nA::\n+\ntext\n======'), true);
  assert.equal(hasBalancedTabsBlocks('[tabs]\n======\nA::\n+\ntext'), false);
});

test('能识别代码块属性后缺少分隔符', () => {
  assert.deepEqual(
    findCodeBlockAttributesWithoutDelimiter('[source,shell]\n----\n$ java -jar app.jar\n----'),
    [],
  );

  assert.deepEqual(
    findCodeBlockAttributesWithoutDelimiter('[source,dockerfile]\ninclude::reference:partial$dockerfile[]'),
    [1],
  );

  assert.deepEqual(
    findCodeBlockAttributesWithoutDelimiter('[configprops,yaml]\nspring:\n  main:\n    banner-mode: "off"'),
    [1],
  );
});

test('能识别疑似真实密钥', () => {
  const fakeSecret = `sk-${'1234567890abcdefghijklmnop'}`;
  assert.deepEqual(detectSecrets(`DEEPSEEK_API_KEY=${fakeSecret}`), [fakeSecret]);
  assert.deepEqual(detectSecrets('DEEPSEEK_API_KEY=sk-请在本地替换'), []);
});

test('能找出译文中缺失的不翻译术语', () => {
  assert.deepEqual(
    findMissingProtectedTerms('Spring Boot and Actuator', 'Spring Boot 和执行器'),
    ['Actuator'],
  );

  assert.deepEqual(
    findMissingProtectedTerms('WARNING: keep going', '警告：继续'),
    [],
  );

  assert.deepEqual(
    findMissingProtectedTerms('Deploy WAR files to endpoints', '部署文件到端点'),
    ['WAR', 'endpoint'],
  );
});

test('能找出代码块外的高置信度英文残留', () => {
  assert.deepEqual(
    findUntranslatedEnglishSegments([
      'This section describes how to use the plugin.',
      '',
      '请参阅 xref:appendix:test-auto-configuration/index.adoc[found in the appendix]。',
      '请参阅 xref:maven-plugin:using.adoc[Using the Plugin]。',
      '',
      '`This code should stay in English`',
      '',
      '----',
      'This code block should stay in English',
      '----',
      '',
      'Spring Boot Actuator endpoint 保持英文术语。',
    ].join('\n')),
    [
      '第 1 行存在疑似未翻译英文：This section describes how to use the plugin',
      '第 3 行存在疑似未翻译英文：found in the appendix',
      '第 4 行存在疑似未翻译英文：Using the Plugin',
    ],
  );
});

test('英文残留校验忽略技术专名和外部链接目标', () => {
  assert.deepEqual(
    findUntranslatedEnglishSegments([
      '你应该始终确保运行的是 {url-github-wiki}/Supported-Versions[受支持的 Spring Boot 版本]。',
      '如果你开发 Spring Boot Web 应用程序，请查看 Spring MVC、Jersey、Spring WebFlux 和 Spring Session。',
      '更多详情请参阅 Spring 框架参考文档中的 {url-spring-framework-docs}/testing/testcontext-framework/tx.html#testcontext-tx-enabling-transactions[相关章节]。',
      '* *GraalVM Native Images：* xref:reference:packaging/native-image/index.adoc[简介]',
      '详见 {url-gradle-javadoc}/org/gradle/api/tasks/JavaExec.html#setArgsString(java.lang.String)[`JavaExec.setArgsString` 的 javadoc]。',
    ].join('\n')),
    [],
  );
});

test('英文残留校验忽略专有名词、状态码和格式片段', () => {
  assert.deepEqual(
    findUntranslatedEnglishSegments([
      '如果你使用 Mac 并且使用 https://brew.sh/[Homebrew]，可以通过以下命令安装 Spring Boot CLI：',
      '=== Dispatcher Servlets 响应结构',
      '=== Daily Time Interval 触发器响应结构',
      '默认情况下，Spring Boot 使用状态码“UP”、“DOWN”、“OUT_OF_SERVICE”和“UNKNOWN”。',
      '如果不返回值，响应状态将为 404（Not Found）。',
      'Spring Boot 使用 https://commons.apache.org/logging[Commons Logging] 进行所有内部日志记录。',
      '如果你需要一种安全的方式来存储凭据和密码，https://cloud.spring.io/spring-cloud-vault/[Spring Cloud Vault] 项目提供支持。',
      "|java.time 的 yyyy-MM-dd HH:mm:ss、yyyy-MM-dd'T'HH:mm:ss 和 yyyy-MM-dd HH:mm:ssZ",
      '要启用结构化日志，请使用 xref:#features.logging.structured.ecs[Elastic Common Schema (ECS)]。',
      '默认情况下，如果你使用 starters，则使用 Logback 进行日志记录。',
      '如果 Groovy 在 classpath 上，您也应该能够使用 `logback.groovy` 配置 Logback。',
      '该应用可以部署到 Amazon Elastic Container Service、Elastic Beanstalk、Azure Spring Cloud、App Engine Flex。',
      '故障排查可参考 Stack Overflow、Liberica Native Image Kit、Native Tools Command Prompt。',
      '指标可导出到 Dynatrace Operator for Kubernetes、New Relic、Prometheus Pushgateway、SaaS Stackdriver。',
      'New Relic 注册表会定期将指标推送到 New Relic。',
      '追踪可使用 Micrometer Observation、OpenZipkin Brave、Zipkin、OpenTelemetry。',
      '数据访问可使用 Spring Data Redis、Spring Data Envers、Apache ZooKeeper、Caffeine、Lettuce。',
      '测试可使用 JUnit Jupiter、AssertJ、HtmlUnit、Selenium、WebTestClient 和 Spring REST Docs。',
      'Web 栈支持 Reactive Streams、Spring WebFlux、Problem Details、Server Sent Events 和 Spring Security。',
      '构建镜像时可以配置 builder、run image、buildpack 和 buildpacks。',
    ].join('\n')),
    [],
  );
});

test('页面校验汇总英文残留问题', () => {
  const issues = validateTranslatedPage({
    relativePath: 'modules/maven-plugin/pages/index.adoc',
    source: '= Spring Boot Maven Plugin\n',
    translated: '= Spring Boot Maven Plugin\n\nGetting Started\n',
  });

  assert.deepEqual(issues, [
    'modules/maven-plugin/pages/index.adoc：第 3 行存在疑似未翻译英文：Getting Started',
  ]);
});

test('页面校验汇总 xref、代码块和术语问题', () => {
  const issues = validateTranslatedPage({
    relativePath: 'modules/ROOT/pages/index.adoc',
    source: 'Spring Boot\n\nxref:installing.adoc[]\n\n----\ncode\n----\n',
    translated: 'Spring 引导\n\n[source,shell]\n$ java -jar app.jar\n\n----\ncode\n',
  });

  assert.deepEqual(issues, [
    'modules/ROOT/pages/index.adoc：listing/source 代码块分隔符数量不成对',
    'modules/ROOT/pages/index.adoc：第 3 行代码块属性后缺少 ---- 分隔符',
    'modules/ROOT/pages/index.adoc：缺少 xref 目标 installing.adoc',
    'modules/ROOT/pages/index.adoc：缺少不翻译术语 Spring Boot',
  ]);
});

test('允许 Java 和 Kotlin API xref 改为官方外部链接', () => {
  const issues = validateTranslatedPage({
    relativePath: 'modules/api/partials/nav-java-api.adoc',
    source: [
      'xref:api:java/index.html[Spring Boot]',
      'xref:api:kotlin/index.html[Spring Boot]',
      'xref:maven-plugin:api/java/index.html[Maven Plugin]',
      'xref:gradle-plugin:api/java/index.html[Gradle Plugin]',
    ].join('\n'),
    translated: [
      'https://docs.spring.io/spring-boot/4.1.0/api/java/[Spring Boot,role=link-external, window=_blank]',
      'https://docs.spring.io/spring-boot/4.1.0/api/kotlin/[Spring Boot,role=link-external, window=_blank]',
      'https://docs.spring.io/spring-boot/4.1.0/maven-plugin/api/java/[Maven Plugin,role=link-external, window=_blank]',
      'https://docs.spring.io/spring-boot/4.1.0/gradle-plugin/api/java/[Gradle Plugin,role=link-external, window=_blank]',
    ].join('\n'),
  });

  assert.deepEqual(issues, []);
});

test('能解析并校验 partial include 目标', () => {
  assert.deepEqual(
    findPartialIncludeTargets('include::partial$goals/overview.adoc[]\ninclude::api:partial$nav-rest-api.adoc[]'),
    [
      { moduleName: undefined, partialPath: 'goals/overview.adoc' },
      { moduleName: 'api', partialPath: 'nav-rest-api.adoc' },
    ],
  );

  const files = {
    'output/modules/maven-plugin/partials/goals/overview.adoc': '占位内容',
    'output/modules/api/partials/nav-rest-api.adoc': '导航',
  };

  assert.deepEqual(
    validatePartialIncludes({
      relativePath: 'modules/maven-plugin/pages/goals.adoc',
      translated: 'include::partial$goals/overview.adoc[]\ninclude::api:partial$nav-rest-api.adoc[]',
      outputRoot: 'output',
      exists: (file) => Object.hasOwn(files, file),
    }),
    [],
  );

  assert.deepEqual(
    validatePartialIncludes({
      relativePath: 'modules/maven-plugin/pages/goals.adoc',
      translated: 'include::partial$goals/missing.adoc[]',
      outputRoot: 'output',
      exists: (file) => Object.hasOwn(files, file),
    }),
    ['modules/maven-plugin/pages/goals.adoc：找不到 partial include 目标 output/modules/maven-plugin/partials/goals/missing.adoc'],
  );
});

test('全量校验按翻译计划检查所有输出文件', () => {
  const files = {
    'source/modules/ROOT/pages/index.adoc': 'Spring Boot\nxref:installing.adoc[]\n',
    'output/modules/ROOT/pages/index.adoc': 'Spring Boot\nxref:installing.adoc[]\n',
    'source/modules/ROOT/pages/missing.adoc': 'Spring Boot\n',
  };

  const issues = validateTranslatedFiles({
    sourceRoot: 'source',
    outputRoot: 'output',
    plan: [
      { relativePath: 'modules/ROOT/pages/index.adoc', action: 'translate' },
      { relativePath: 'modules/ROOT/pages/missing.adoc', action: 'translate' },
    ],
    exists: (file) => Object.hasOwn(files, file),
    read: (file) => files[file],
  });

  assert.deepEqual(issues, [
    'modules/ROOT/pages/missing.adoc：找不到译文页面 output/modules/ROOT/pages/missing.adoc',
  ]);
});

test('全量校验支持多源翻译计划中的 sourceRoot', () => {
  const files = {
    'source/maven/modules/maven-plugin/pages/index.adoc': 'Spring Boot Maven Plugin\n',
    'output/modules/maven-plugin/pages/index.adoc': 'Spring Boot Maven Plugin\n',
  };

  const issues = validateTranslatedFiles({
    sourceRoot: 'source/core',
    outputRoot: 'output',
    plan: [
      {
        sourceId: 'maven-plugin',
        sourceRoot: 'source/maven',
        relativePath: 'modules/maven-plugin/pages/index.adoc',
        action: 'translate',
      },
    ],
    exists: (file) => Object.hasOwn(files, file),
    read: (file) => files[file],
  });

  assert.deepEqual(issues, []);
});

test('validateAll 纳入完整性审计错误', () => {
  const issues = validateAll({
    validateTranslatedFilesFn: () => [],
    validateProjectSecretsFn: () => [],
    auditTranslationCompletenessFn: () => [
      {
        severity: 'error',
        code: 'listing-block-missing',
        relativePath: 'modules/how-to/pages/example.adoc',
        message: '译文代码块数量少于上游',
      },
      {
        severity: 'warning',
        code: 'anchor-missing',
        relativePath: 'modules/how-to/pages/example.adoc',
        message: '译文缺少 anchor',
      },
    ],
  });

  assert.deepEqual(issues, [
    'modules/how-to/pages/example.adoc：完整性审计 listing-block-missing：译文代码块数量少于上游',
  ]);
});
