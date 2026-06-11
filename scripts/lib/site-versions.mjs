import { readFileSync } from 'node:fs';
import path from 'node:path';

export const SITE_VERSIONS_FILE = 'site-versions.json';

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

export function readSiteVersions({
  file = SITE_VERSIONS_FILE,
  read = (filePath) => readFileSync(filePath, 'utf8'),
} = {}) {
  const config = JSON.parse(read(file));
  if (!config.latest || !Array.isArray(config.versions)) {
    throw new Error(`${file} 必须包含 latest 和 versions`);
  }
  if (!config.versions.includes(config.latest)) {
    throw new Error(`${file} 的 latest 必须包含在 versions 中`);
  }
  return config;
}

export function getVersionedContentRoot(version) {
  return toPosixPath(path.join('versions', version, 'content', 'boot'));
}

export function getLatestContentRoot(options = {}) {
  return getVersionedContentRoot(readSiteVersions(options).latest);
}
