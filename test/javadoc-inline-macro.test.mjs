import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  renderJavadocLink,
  resolveJavadocReference,
} = require('../extensions/javadoc-inline-macro.cjs');

test('Javadoc 宏把 annotation 格式渲染为短注解名链接', () => {
  const reference = resolveJavadocReference({
    target: 'org.springframework.context.annotation.ComponentScan',
    attrs: { format: 'annotation' },
  });

  assert.equal(reference.text, '@ComponentScan');
  assert.equal(
    reference.href,
    'https://docs.spring.io/spring-framework/docs/7.0.x/javadoc-api/org/springframework/context/annotation/ComponentScan.html',
  );
});

test('Javadoc 宏把 Spring Boot 类和成员锚点渲染到 4.1.0 API', () => {
  const reference = resolveJavadocReference({
    target: 'org.springframework.boot.buildpack.platform.docker.type.ImageName#of(java.lang.String)',
    attrs: { 1: 'Image name' },
  });

  assert.equal(reference.text, 'Image name');
  assert.equal(
    reference.href,
    'https://docs.spring.io/spring-boot/4.1.0/api/java/org/springframework/boot/buildpack/platform/docker/type/ImageName.html#of(java.lang.String)',
  );
});

test('Javadoc 宏把嵌套类的美元符号转换为 Javadoc 文件名', () => {
  const reference = resolveJavadocReference({
    target: 'org.springframework.web.reactive.function.client.WebClient$Builder',
  });

  assert.equal(reference.text, 'WebClient.Builder');
  assert.equal(
    reference.href,
    'https://docs.spring.io/spring-framework/docs/7.0.x/javadoc-api/org/springframework/web/reactive/function/client/WebClient.Builder.html',
  );
});

test('Javadoc 宏支持目标中的 URL 属性前缀', () => {
  const reference = resolveJavadocReference({
    target: '{url-liquibase-javadoc}/liquibase.Liquibase',
    documentAttributes: {
      'url-liquibase-javadoc': 'https://javadoc.io/doc/org.liquibase/liquibase-core/latest',
    },
  });

  assert.equal(reference.text, 'Liquibase');
  assert.equal(
    reference.href,
    'https://javadoc.io/doc/org.liquibase/liquibase-core/latest/liquibase/Liquibase.html',
  );
});

test('Javadoc 宏支持现有文档中的第三方 API 包', () => {
  const cases = [
    [
      'com.zaxxer.hikari.HikariDataSource',
      'https://javadoc.io/doc/com.zaxxer/HikariCP/latest/com/zaxxer/hikari/HikariDataSource.html',
      'HikariDataSource',
    ],
    [
      'com.fasterxml.jackson.databind.ObjectMapper',
      'https://javadoc.io/doc/com.fasterxml.jackson.core/jackson-databind/latest/com/fasterxml/jackson/databind/ObjectMapper.html',
      'ObjectMapper',
    ],
    [
      'org.junit.jupiter.api.BeforeEach',
      'https://junit.org/junit5/docs/current/api/org/junit/jupiter/api/BeforeEach.html',
      'BeforeEach',
    ],
  ];

  for (const [target, href, text] of cases) {
    assert.deepEqual(resolveJavadocReference({ target }), { href, text });
  }
});

test('Javadoc 宏渲染 HTML 时会转义文本并保留外部链接属性', () => {
  const html = renderJavadocLink({
    target: 'org.springframework.boot.SpringApplication',
    attrs: { 1: '<SpringApplication>' },
  });

  assert.equal(
    html,
    '<a href="https://docs.spring.io/spring-boot/4.1.0/api/java/org/springframework/boot/SpringApplication.html" class="javadoc-link" target="_blank" rel="noopener">&lt;SpringApplication&gt;</a>',
  );
});

test('Javadoc 宏遇到未知 URL 属性时失败', () => {
  assert.throws(
    () => resolveJavadocReference({
      target: '{url-missing-javadoc}/com.example.Missing',
      documentAttributes: {},
    }),
    /无法解析 javadoc 属性：url-missing-javadoc/,
  );
});

test('Javadoc 宏遇到未知包名时失败', () => {
  assert.throws(
    () => resolveJavadocReference({
      target: 'com.example.Missing',
    }),
    /无法解析 javadoc 目标：com.example.Missing/,
  );
});
