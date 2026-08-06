import { createRequire } from 'node:module';
import { lstat, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = resolve(process.argv[2] ?? join(projectRoot, 'release-v2', 'app'));
const agentEntry = join(appRoot, 'out', 'main', 'agent-process.js');
const packagedRequire = createRequire(agentEntry);
const requiredImports = [
  '@livekit/agents',
  '@livekit/agents-plugin-openai',
  '@livekit/protocol',
  '@livekit/rtc-node',
  'livekit-server-sdk',
  'ws',
  'zod',
];

const imported = [];
for (const packageName of requiredImports) {
  const path = packagedRequire.resolve(packageName);
  packagedRequire(packageName);
  imported.push({ packageName, path });
}
const agentsRequire = createRequire(packagedRequire.resolve('@livekit/agents'));
for (const packageName of ['sharp', '@opentelemetry/core', '@livekit/rtc-node']) {
  const path = agentsRequire.resolve(packageName);
  agentsRequire(packageName);
  imported.push({ packageName: `@livekit/agents -> ${packageName}`, path });
}

const packageJson = JSON.parse(
  await lstat(join(appRoot, 'package.json')).then(() =>
    import('node:fs/promises').then(({ readFile }) =>
      readFile(join(appRoot, 'package.json'), 'utf8'),
    ),
  ),
);
if (packageJson.name !== '@xiaoxiao/desktop-runtime') {
  throw new Error(`生产应用使用了错误的 package.json：${packageJson.name}`);
}

let files = 0;
let bytes = 0;
let nodeModuleFiles = 0;
let nodeModuleBytes = 0;
const pending = [appRoot];
while (pending.length > 0) {
  const current = pending.pop();
  if (!current) continue;
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      pending.push(path);
      continue;
    }
    if (!entry.isFile()) continue;
    const information = await stat(path);
    files += 1;
    bytes += information.size;
    if (path.includes(`${join('node_modules', '')}`)) {
      nodeModuleFiles += 1;
      nodeModuleBytes += information.size;
    }
  }
}

const report = {
  schemaVersion: 1,
  appRoot,
  version: packageJson.version,
  files,
  bytes,
  nodeModuleFiles,
  nodeModuleBytes,
  imported,
};
await writeFile(
  join(projectRoot, 'release-v2', 'release-app-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
process.stdout.write(
  `Clean release application validated: ${files} files, ${bytes} bytes, ${imported.length} imports\n`,
);
