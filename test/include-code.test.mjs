import assert from 'node:assert/strict';
import test from 'node:test';

import {
  anchorToCodePath,
  collectIncludeCodeContexts,
  extractTaggedCode,
  materializeIncludeCodeInContent,
  resolveIncludeCodeSource,
  stripNonDisplayedJavaSource,
} from '../scripts/lib/include-code.mjs';

test('anchor 能转换为官方示例源码包路径', () => {
  assert.equal(
    anchorToCodePath('howto.native-image.developing-your-first-application.sample-application'),
    'howto/nativeimage/developingyourfirstapplication/sampleapplication',
  );
});

test('include-code 能按最近 anchor 解析 Java 示例源码', () => {
  const existingFiles = new Set([
    '/cache/src/main/java/org/springframework/boot/docs/howto/nativeimage/developingyourfirstapplication/sampleapplication/MyApplication.java',
  ]);

  const resolved = resolveIncludeCodeSource({
    anchor: 'howto.native-image.developing-your-first-application.sample-application',
    target: 'MyApplication',
    codeExampleRoots: ['/cache/src/main/java'],
    exists: (file) => existingFiles.has(file),
  });

  assert.equal(
    resolved.file,
    '/cache/src/main/java/org/springframework/boot/docs/howto/nativeimage/developingyourfirstapplication/sampleapplication/MyApplication.java',
  );
  assert.equal(resolved.language, 'java');
});

test('include-code 能解析相对上级目录目标', () => {
  const existingFiles = new Set([
    '/cache/src/main/java/org/springframework/boot/docs/actuator/endpoints/implementingcustom/MyEndpoint.java',
  ]);

  const resolved = resolveIncludeCodeSource({
    anchor: 'actuator.endpoints.implementing-custom.input',
    target: '../MyEndpoint',
    codeExampleRoots: ['/cache/src/main/java'],
    exists: (file) => existingFiles.has(file),
  });

  assert.equal(
    resolved.file,
    '/cache/src/main/java/org/springframework/boot/docs/actuator/endpoints/implementingcustom/MyEndpoint.java',
  );
});

test('include-code 精确目录不存在时会按 anchor 父目录查找', () => {
  const existingFiles = new Set([
    '/cache/src/main/java/org/springframework/boot/docs/features/externalconfig/MyBean.java',
  ]);

  const resolved = resolveIncludeCodeSource({
    anchor: 'features.external-config.order',
    target: 'MyBean',
    codeExampleRoots: ['/cache/src/main/java'],
    exists: (file) => existingFiles.has(file),
  });

  assert.equal(
    resolved.file,
    '/cache/src/main/java/org/springframework/boot/docs/features/externalconfig/MyBean.java',
  );
});


test('展开 Java 源码时去掉 license、package 和 tag 标记', () => {
  const source = [
    '/*',
    ' * Copyright 2012-present the original author or authors.',
    ' */',
    '',
    'package org.springframework.boot.docs.example;',
    '',
    'import org.springframework.boot.SpringApplication;',
    '',
    'class MyApplication {',
    '\t// tag::main[]',
    '\tvoid run() {}',
    '\t// end::main[]',
    '}',
    '',
  ].join('\n');

  assert.equal(stripNonDisplayedJavaSource(source), [
    'import org.springframework.boot.SpringApplication;',
    '',
    'class MyApplication {',
    '\tvoid run() {}',
    '}',
  ].join('\n'));
});

test('tag=name 只保留指定 tag 内容，tag=!name 排除指定 tag 内容', () => {
  const source = [
    'class MyApplication {',
    '\t// tag::main[]',
    '\tvoid mainMethod() {}',
    '\t// end::main[]',
    '\tvoid helper() {}',
    '}',
  ].join('\n');

  assert.equal(extractTaggedCode(source, 'main'), '\tvoid mainMethod() {}');
  assert.equal(extractTaggedCode(source, '!main'), [
    'class MyApplication {',
    '\tvoid helper() {}',
    '}',
  ].join('\n'));
});

test('文档中的 include-code 宏会展开为 AsciiDoc source 代码块', () => {
  const file = '/cache/src/main/java/org/springframework/boot/docs/howto/nativeimage/developingyourfirstapplication/sampleapplication/MyApplication.java';
  const files = new Map([
    [file, [
      'package org.springframework.boot.docs.example;',
      '',
      'class MyApplication {}',
      '',
    ].join('\n')],
  ]);

  const result = materializeIncludeCodeInContent({
    relativePath: 'modules/how-to/pages/native-image/developing-your-first-application.adoc',
    content: [
      '[[howto.native-image.developing-your-first-application.sample-application]]',
      '== 示例应用',
      '',
      'include-code::MyApplication[]',
      '',
    ].join('\n'),
    codeExampleRoots: ['/cache/src/main/java'],
    exists: (candidate) => files.has(candidate),
    read: (candidate) => files.get(candidate),
  });

  assert.equal(result.replacements.length, 1);
  assert.match(result.content, /\[source,java]\n----\nclass MyApplication \{\}\n----/);
});

test('译文缺少 anchor 时使用上游同序号 include-code 的 anchor 回退解析', () => {
  const file = '/cache/src/main/java/org/springframework/boot/docs/howto/traditionaldeployment/war/MyApplication.java';
  const files = new Map([
    [file, 'class MyApplication {}\n'],
  ]);
  const sourceContexts = collectIncludeCodeContexts([
    '[[howto.traditional-deployment.war]]',
    '== Create a Deployable War File',
    '',
    'include-code::MyApplication[]',
    '',
  ].join('\n'));

  const result = materializeIncludeCodeInContent({
    relativePath: 'modules/how-to/pages/deployment/traditional-deployment.adoc',
    content: [
      '= 传统部署',
      '',
      '== 创建可部署的 War 文件',
      '',
      'include-code::MyApplication[]',
      '',
    ].join('\n'),
    sourceMacroContexts: sourceContexts,
    codeExampleRoots: ['/cache/src/main/java'],
    exists: (candidate) => files.has(candidate),
    read: (candidate) => files.get(candidate),
  });

  assert.match(result.content, /class MyApplication \{\}/);
});

test('译文最近 anchor 过期时优先使用上游同 target 宏的 anchor', () => {
  const file = '/cache/src/main/java/org/springframework/boot/docs/howto/webserver/createwebsocketendpointsusingserverendpoint/MyWebSocketConfiguration.java';
  const files = new Map([
    [file, 'class MyWebSocketConfiguration {}\n'],
  ]);
  const sourceContexts = collectIncludeCodeContexts([
    '[[howto.webserver.enable-tomcat-mbean-registry]]',
    'include-code::MyTomcatConfiguration[]',
    '',
    '[[howto.webserver.create-websocket-endpoints-using-serverendpoint]]',
    'include-code::MyWebSocketConfiguration[]',
    '',
  ].join('\n'));

  const result = materializeIncludeCodeInContent({
    relativePath: 'modules/how-to/pages/webserver.adoc',
    content: [
      '[[howto.webserver.enable-tomcat-mbean-registry]]',
      'include-code::MyWebSocketConfiguration[]',
      '',
    ].join('\n'),
    sourceMacroContexts: sourceContexts,
    codeExampleRoots: ['/cache/src/main/java'],
    exists: (candidate) => files.has(candidate),
    read: (candidate) => files.get(candidate),
  });

  assert.match(result.content, /class MyWebSocketConfiguration \{\}/);
});
