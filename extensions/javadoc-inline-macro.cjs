'use strict';

const SPRING_BOOT_JAVADOC = 'https://docs.spring.io/spring-boot/4.1.0/api/java/';
const SPRING_FRAMEWORK_JAVADOC = 'https://docs.spring.io/spring-framework/docs/7.0.x/javadoc-api/';

const DEFAULT_DOCUMENT_ATTRIBUTES = {
  'url-graphql-java-javadoc': 'https://javadoc.io/doc/com.graphql-java/graphql-java/latest',
  'url-liquibase-javadoc': 'https://javadoc.io/doc/org.liquibase/liquibase-core/latest',
  'url-lombok-javadoc': 'https://projectlombok.org/api',
  'url-mongodb-driver-core-javadoc': 'https://mongodb.github.io/mongo-java-driver/5.6/apidocs/driver-core',
  'url-mongodb-driver-sync-javadoc': 'https://mongodb.github.io/mongo-java-driver/5.6/apidocs/driver-sync',
  'url-spring-framework-javadoc': SPRING_FRAMEWORK_JAVADOC,
  'url-testcontainers-jdbc-javadoc': 'https://javadoc.io/doc/org.testcontainers/jdbc/latest',
  'url-testcontainers-mariadb-javadoc': 'https://javadoc.io/doc/org.testcontainers/mariadb/latest',
  'url-testcontainers-mongodb-javadoc': 'https://javadoc.io/doc/org.testcontainers/mongodb/latest',
  'url-testcontainers-mssqlserver-javadoc': 'https://javadoc.io/doc/org.testcontainers/mssqlserver/latest',
  'url-testcontainers-mysql-javadoc': 'https://javadoc.io/doc/org.testcontainers/mysql/latest',
  'url-testcontainers-neo4j-javadoc': 'https://javadoc.io/doc/org.testcontainers/neo4j/latest',
  'url-testcontainers-oracle-xe-javadoc': 'https://javadoc.io/doc/org.testcontainers/oracle-xe/latest',
  'url-testcontainers-postgresql-javadoc': 'https://javadoc.io/doc/org.testcontainers/postgresql/latest',
  'url-testcontainers-pulsar-javadoc': 'https://javadoc.io/doc/org.testcontainers/pulsar/latest',
  'url-testcontainers-rabbitmq-javadoc': 'https://javadoc.io/doc/org.testcontainers/rabbitmq/latest',
};

const PACKAGE_BASES = [
  ['org.springframework.boot.', SPRING_BOOT_JAVADOC],
  ['org.springframework.security.', 'https://docs.spring.io/spring-security/site/docs/current/api/'],
  ['org.springframework.data.', 'https://docs.spring.io/spring-data/commons/docs/current/api/'],
  ['org.springframework.kafka.', 'https://docs.spring.io/spring-kafka/api/'],
  ['org.springframework.amqp.', 'https://docs.spring.io/spring-amqp/api/'],
  ['org.springframework.pulsar.', 'https://docs.spring.io/spring-pulsar/docs/current/api/'],
  ['org.springframework.integration.', 'https://docs.spring.io/spring-integration/api/'],
  ['org.springframework.graphql.', 'https://docs.spring.io/spring-graphql/docs/current/api/'],
  ['org.springframework.grpc.', 'https://docs.spring.io/spring-grpc/docs/current/api/'],
  ['org.springframework.restdocs.', 'https://docs.spring.io/spring-restdocs/docs/current/api/'],
  ['org.springframework.session.', 'https://docs.spring.io/spring-session/docs/current/api/'],
  ['org.springframework.batch.', 'https://docs.spring.io/spring-batch/docs/current/api/'],
  ['org.springframework.', SPRING_FRAMEWORK_JAVADOC],
  ['org.testcontainers.', 'https://javadoc.io/doc/org.testcontainers/testcontainers/latest/'],
  ['org.apache.kafka.', 'https://kafka.apache.org/40/javadoc/'],
  ['org.apache.catalina.', 'https://tomcat.apache.org/tomcat-11.0-doc/api/'],
  ['org.apache.tomcat.', 'https://tomcat.apache.org/tomcat-11.0-doc/api/'],
  ['org.apache.activemq.', 'https://activemq.apache.org/components/artemis/documentation/javadocs/javadoc-latest/'],
  ['org.apache.pulsar.', 'https://pulsar.apache.org/api/client/'],
  ['org.messaginghub.', 'https://javadoc.io/doc/org.messaginghub/pooled-jms/latest/'],
  ['org.glassfish.jersey.', 'https://eclipse-ee4j.github.io/jersey.github.io/apidocs/latest/jersey/'],
  ['org.eclipse.jetty.', 'https://javadoc.jetty.org/jetty-12/'],
  ['org.apache.logging.log4j.', 'https://logging.apache.org/log4j/2.x/javadoc/log4j-core/'],
  ['org.flywaydb.', 'https://javadoc.io/doc/org.flywaydb/flyway-core/latest/'],
  ['org.hibernate.', 'https://docs.jboss.org/hibernate/orm/current/javadocs/'],
  ['org.infinispan.', 'https://docs.jboss.org/infinispan/15.2/apidocs/'],
  ['org.jspecify.', 'https://jspecify.dev/docs/api/'],
  ['org.junit.', 'https://junit.org/junit5/docs/current/api/'],
  ['org.neo4j.driver.', 'https://neo4j.com/docs/api/java-driver/current/'],
  ['org.openqa.selenium.', 'https://www.selenium.dev/selenium/docs/api/java/'],
  ['org.postgresql.', 'https://jdbc.postgresql.org/documentation/publicapi/'],
  ['org.quartz.', 'https://www.quartz-scheduler.org/api/2.5.x/'],
  ['org.thymeleaf.', 'https://www.thymeleaf.org/apidocs/thymeleaf-spring6/3.1.3.RELEASE/'],
  ['org.jooq.', 'https://www.jooq.org/javadoc/latest/'],
  ['org.h2.', 'https://www.h2database.com/javadoc/'],
  ['com.couchbase.client.', 'https://docs.couchbase.com/sdk-api/couchbase-java-client/'],
  ['com.fasterxml.jackson.annotation.', 'https://javadoc.io/doc/com.fasterxml.jackson.core/jackson-annotations/latest/'],
  ['com.fasterxml.jackson.databind.', 'https://javadoc.io/doc/com.fasterxml.jackson.core/jackson-databind/latest/'],
  ['com.github.benmanes.caffeine.', 'https://javadoc.io/doc/com.github.ben-manes.caffeine/caffeine/latest/'],
  ['com.hazelcast.', 'https://docs.hazelcast.org/docs/latest/javadoc/'],
  ['com.rabbitmq.', 'https://rabbitmq.github.io/rabbitmq-java-client/api/current/'],
  ['com.mongodb.', 'https://mongodb.github.io/mongo-java-driver/5.6/apidocs/driver-sync/'],
  ['com.redis.testcontainers.', 'https://javadoc.io/doc/com.redis/testcontainers-redis/latest/'],
  ['com.zaxxer.hikari.', 'https://javadoc.io/doc/com.zaxxer/HikariCP/latest/'],
  ['co.elastic.', 'https://artifacts.elastic.co/javadoc/co/elastic/clients/elasticsearch-java/current/'],
  ['ch.qos.logback.', 'https://logback.qos.ch/apidocs/'],
  ['io.lettuce.', 'https://javadoc.io/doc/io.lettuce/lettuce-core/latest/'],
  ['io.micrometer.', 'https://www.javadoc.io/doc/io.micrometer/micrometer-core/latest/'],
  ['io.netty.', 'https://netty.io/4.1/api/'],
  ['io.opentelemetry.', 'https://www.javadoc.io/doc/io.opentelemetry/opentelemetry-sdk/latest/'],
  ['io.prometheus.client.', 'https://javadoc.io/doc/io.prometheus/simpleclient_tracer_common/latest/'],
  ['io.prometheus.metrics.', 'https://javadoc.io/doc/io.prometheus/prometheus-metrics-tracer-common/latest/'],
  ['io.r2dbc.', 'https://r2dbc.io/spec/1.0.0.RELEASE/api/'],
  ['io.rsocket.', 'https://javadoc.io/doc/io.rsocket/rsocket-core/latest/'],
  ['io.grpc.', 'https://grpc.github.io/grpc-java/javadoc/'],
  ['tools.jackson.', 'https://javadoc.io/doc/tools.jackson.core/jackson-databind/latest/'],
  ['graphql.', 'https://javadoc.io/doc/com.graphql-java/graphql-java/latest/'],
  ['jakarta.', 'https://jakarta.ee/specifications/platform/11/apidocs/'],
  ['javax.', 'https://docs.oracle.com/en/java/javase/25/docs/api/'],
  ['java.', 'https://docs.oracle.com/en/java/javase/25/docs/api/'],
  ['liquibase.', 'https://javadoc.io/doc/org.liquibase/liquibase-core/latest/'],
  ['lombok.', 'https://projectlombok.org/api/'],
];

function normalizeBaseUrl(baseUrl) {
  return `${String(baseUrl).replace(/\/+$/, '')}/`;
}

function getSourceAttribute(source, name) {
  if (!source) {
    return undefined;
  }
  if (typeof source === 'function') {
    return source(name);
  }
  if (Object.prototype.hasOwnProperty.call(source, name)) {
    return source[name];
  }
  if (typeof source.get === 'function') {
    return source.get(name);
  }
  return undefined;
}

function getMacroAttribute(attrs, name) {
  if (!attrs) {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(attrs, name)) {
    return attrs[name];
  }
  if (Object.prototype.hasOwnProperty.call(attrs, String(name))) {
    return attrs[String(name)];
  }
  if (typeof attrs.get === 'function') {
    return attrs.get(name) ?? attrs.get(String(name));
  }
  return undefined;
}

function getExplicitText(attrs) {
  return getMacroAttribute(attrs, 1)
    ?? getMacroAttribute(attrs, 'text')
    ?? getMacroAttribute(attrs, '$positional')?.[0];
}

function expandAttributeReferences(target, documentAttributes = {}) {
  return target.replace(/\{(url-[^}]+)}/g, (match, attributeName) => {
    const value = getSourceAttribute(documentAttributes, attributeName)
      ?? DEFAULT_DOCUMENT_ATTRIBUTES[attributeName];
    if (!value) {
      throw new Error(`无法解析 javadoc 属性：${attributeName}`);
    }
    return value;
  });
}

function splitTarget(target, documentAttributes) {
  const expanded = expandAttributeReferences(target, documentAttributes);
  const urlMatch = expanded.match(/^(https?:\/\/.+\/)([^/]+)$/);
  if (urlMatch) {
    return {
      baseUrl: normalizeBaseUrl(urlMatch[1]),
      classTarget: urlMatch[2],
    };
  }

  const mapping = PACKAGE_BASES.find(([prefix]) => expanded.startsWith(prefix));
  if (!mapping) {
    throw new Error(`无法解析 javadoc 目标：${target}`);
  }

  return {
    baseUrl: normalizeBaseUrl(mapping[1]),
    classTarget: expanded,
  };
}

function splitClassAndMember(classTarget) {
  const [className, memberName] = classTarget.split('#');
  return { className, memberName };
}

function toJavadocClassPath(className) {
  const parts = className.split('.');
  const classSegment = parts.pop();
  if (!classSegment || parts.length === 0) {
    throw new Error(`无法解析 javadoc 类名：${className}`);
  }
  return `${parts.join('/')}/${classSegment.replace(/\$/g, '.')}.html`;
}

function getShortClassName(className) {
  return className.split('.').pop().replace(/\$/g, '.');
}

function resolveJavadocReference({ target, attrs = {}, documentAttributes = {} }) {
  const { baseUrl, classTarget } = splitTarget(target, documentAttributes);
  const { className, memberName } = splitClassAndMember(classTarget);
  const explicitText = getExplicitText(attrs);
  const format = getMacroAttribute(attrs, 'format');
  const shortClassName = getShortClassName(className);
  const text = explicitText
    ?? (format === 'annotation' ? `@${shortClassName}` : shortClassName);
  const href = `${baseUrl}${toJavadocClassPath(className)}${memberName ? `#${memberName}` : ''}`;

  return { href, text };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderJavadocLink(options) {
  const { href, text } = resolveJavadocReference(options);
  return `<a href="${escapeHtml(href)}" class="javadoc-link" target="_blank" rel="noopener">${escapeHtml(text)}</a>`;
}

function createDocumentAttributeGetter(parent) {
  const document = typeof parent?.getDocument === 'function' ? parent.getDocument() : undefined;
  return (name) => {
    if (document && typeof document.getAttribute === 'function' && document.hasAttribute(name)) {
      return document.getAttribute(name);
    }
    return DEFAULT_DOCUMENT_ATTRIBUTES[name];
  };
}

function register(registry) {
  registry.inlineMacro('javadoc', function () {
    this.process(function (parent, target, attrs) {
      return renderJavadocLink({
        target,
        attrs,
        documentAttributes: createDocumentAttributeGetter(parent),
      });
    });
  });
}

module.exports = {
  DEFAULT_DOCUMENT_ATTRIBUTES,
  PACKAGE_BASES,
  register,
  renderJavadocLink,
  resolveJavadocReference,
};
