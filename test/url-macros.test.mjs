import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeUrlMacrosInContent,
} from '../scripts/lib/url-macros.mjs';

test('能把中文正文中风险裸 URL 宏改为显式 link 宏', () => {
  const source = [
    '除了本用户指南外，https://docs.spring.io/spring-boot/4.1.0/maven-plugin/api/java/[API 文档,role=link-external, window=_blank] 也可用。',
    '响应式关系数据库连接（https://r2dbc.io[R2DBC]）项目将响应式编程 API 引入关系数据库。',
    '可以使用https://docs.couchbase.com/server/current/manage/manage-security/configure-client-certificates.html[客户端证书]代替用户名和密码进行身份验证。',
    '显式 link:https://example.com/[链接] 保持不变。',
    '列表项开头的 URL 宏保持不变：',
    '* https://docs.spring.io/spring-boot/4.1.0/api/java/[Spring Boot,role=link-external, window=_blank]',
    'inline `https://example.com[不改]` 保持不变。',
    '----',
    'https://example.com[不改]',
    '----',
    '',
  ].join('\n');

  const normalized = normalizeUrlMacrosInContent({ content: source });

  assert.equal(normalized.changed, true);
  assert.equal(normalized.content, [
    '除了本用户指南外，link:https://docs.spring.io/spring-boot/4.1.0/maven-plugin/api/java/[API 文档,role=link-external, window=_blank] 也可用。',
    '响应式关系数据库连接（link:https://r2dbc.io[R2DBC]）项目将响应式编程 API 引入关系数据库。',
    '可以使用link:https://docs.couchbase.com/server/current/manage/manage-security/configure-client-certificates.html[客户端证书]代替用户名和密码进行身份验证。',
    '显式 link:https://example.com/[链接] 保持不变。',
    '列表项开头的 URL 宏保持不变：',
    '* https://docs.spring.io/spring-boot/4.1.0/api/java/[Spring Boot,role=link-external, window=_blank]',
    'inline `https://example.com[不改]` 保持不变。',
    '----',
    'https://example.com[不改]',
    '----',
    '',
  ].join('\n'));
});
