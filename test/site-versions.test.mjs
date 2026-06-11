import assert from 'node:assert/strict';
import test from 'node:test';

test('版本工具能解析 latest 内容根目录', async () => {
  const versions = await import('../scripts/lib/site-versions.mjs');

  assert.equal(versions.getVersionedContentRoot('4.1.0'), 'versions/4.1.0/content/boot');
  assert.equal(
    versions.getLatestContentRoot({
      read: () => '{"latest":"4.1.0","versions":["4.1.0"]}',
    }),
    'versions/4.1.0/content/boot',
  );
});
