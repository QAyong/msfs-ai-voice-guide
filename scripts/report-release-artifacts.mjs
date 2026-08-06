import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactRoot = join(projectRoot, 'release-v2', 'artifacts');
const setupFiles = (await readdir(artifactRoot))
  .filter((name) => name.toLowerCase().endsWith('-setup.exe'))
  .sort();
if (setupFiles.length !== 1) {
  throw new Error(`应当只生成一个候选安装包，实际找到：${setupFiles.join(', ') || '无'}`);
}

const records = [];
for (const name of setupFiles) {
  const path = join(artifactRoot, name);
  const contents = await readFile(path);
  records.push({
    name,
    bytes: (await stat(path)).size,
    sha256: createHash('sha256').update(contents).digest('hex'),
  });
}
await writeFile(
  join(artifactRoot, 'SHA256SUMS.txt'),
  `${records.map((record) => `${record.sha256}  ${record.name}`).join('\n')}\n`,
  'utf8',
);
await writeFile(
  join(artifactRoot, 'release-report.json'),
  `${JSON.stringify({ schemaVersion: 1, artifacts: records }, null, 2)}\n`,
  'utf8',
);
process.stdout.write(
  `Release artifact ready: ${records[0].name}, ${records[0].bytes} bytes, SHA256 ${records[0].sha256}\n`,
);
