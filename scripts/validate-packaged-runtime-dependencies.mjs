import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cp, lstat, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractAll } from '@electron/asar';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const unpackedRoot = resolve(
  process.argv[2] ?? join(projectRoot, 'release-v2', 'artifacts', 'win-unpacked'),
);
const resourcesRoot = join(unpackedRoot, 'resources');
const asarPath = join(resourcesRoot, 'app.asar');
const asarUnpackedPath = join(resourcesRoot, 'app.asar.unpacked');
const extractionRoot = await mkdtemp(join(tmpdir(), 'xiaoxiao-runtime-validation-'));
const sha256 = async (path) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

const requiredLooseFiles = [
  join(unpackedRoot, '晓晓飞行导游.exe'),
  asarPath,
  join(resourcesRoot, 'livekit', 'livekit-server.exe'),
  join(resourcesRoot, 'msfs', 'msfs.exe'),
  join(resourcesRoot, 'msfs', 'msfsd.exe'),
  join(resourcesRoot, 'msfs', 'SimConnect.dll'),
  join(resourcesRoot, 'msfs', 'component-manifest.json'),
  join(
    resourcesRoot,
    'msfs',
    'community',
    'msfs-native-cli-route-bridge',
    'modules',
    'msfs-route-bridge.wasm',
  ),
  join(resourcesRoot, 'native', 'global-push-to-talk.node'),
];
for (const path of requiredLooseFiles) {
  const information = await stat(path).catch(() => undefined);
  if (!information?.isFile() || information.size === 0) {
    throw new Error(`打包产物缺少运行文件：${path}`);
  }
}

try {
  extractAll(asarPath, extractionRoot);
  const hasUnpackedFiles = await lstat(asarUnpackedPath)
    .then(() => true)
    .catch(() => false);
  if (hasUnpackedFiles) {
    await cp(asarUnpackedPath, extractionRoot, { recursive: true, force: true });
  }

  const agentEntry = join(extractionRoot, 'out', 'main', 'agent-process.js');
  const importValidationScript = String.raw`
    const { createRequire } = require('node:module');
    const packagedRequire = createRequire(process.argv[1]);
    const imports = [];
    for (const packageName of [
      '@livekit/agents',
      '@livekit/agents-plugin-openai',
      '@livekit/protocol',
      '@livekit/rtc-node',
      'livekit-server-sdk',
      'ws',
      'zod',
    ]) {
      const path = packagedRequire.resolve(packageName);
      packagedRequire(packageName);
      imports.push({ packageName, path });
    }
    const agentsRequire = createRequire(packagedRequire.resolve('@livekit/agents'));
    for (const packageName of ['sharp', '@opentelemetry/core', '@livekit/rtc-node']) {
      const path = agentsRequire.resolve(packageName);
      agentsRequire(packageName);
      imports.push({ packageName: '@livekit/agents -> ' + packageName, path });
    }
    process.stdout.write(JSON.stringify(imports));
  `;
  const importValidation = spawnSync(process.execPath, ['-e', importValidationScript, agentEntry], {
    encoding: 'utf8',
    timeout: 60_000,
    windowsHide: true,
  });
  if (importValidation.error || importValidation.status !== 0) {
    throw new Error(`安装目录依赖导入失败：${importValidation.stderr || importValidation.error}`);
  }
  const imports = JSON.parse(importValidation.stdout);

  const componentManifestPath = join(resourcesRoot, 'msfs', 'component-manifest.json');
  const componentManifest = JSON.parse(await readFile(componentManifestPath, 'utf8'));
  if (
    componentManifest.schemaVersion !== 1 ||
    componentManifest.component !== 'msfs-cli-runtime' ||
    componentManifest.protocolMajor !== 1
  ) {
    throw new Error('安装目录中的 MSFS CLI 组件清单无效。');
  }
  for (const file of componentManifest.files) {
    const path = join(resourcesRoot, 'msfs', file.path);
    const information = await stat(path);
    if (information.size !== file.bytes || (await sha256(path)) !== file.sha256) {
      throw new Error(`安装目录中的 MSFS CLI 文件与快照不一致：${file.path}`);
    }
  }

  const appSmoke = spawnSync(join(unpackedRoot, '晓晓飞行导游.exe'), [], {
    env: { ...process.env, MSFS_PACKAGED_RUNTIME_SMOKE: '1' },
    encoding: 'utf8',
    timeout: 40_000,
    windowsHide: true,
  });
  if (appSmoke.error || appSmoke.status !== 0) {
    throw new Error(
      `安装态 Agent 子进程冒烟失败：${appSmoke.stderr || appSmoke.stdout || appSmoke.error}`,
    );
  }

  const cliPath = join(resourcesRoot, 'msfs', 'msfs.exe');
  const cliStatus = spawnSync(cliPath, ['status'], {
    encoding: 'utf8',
    timeout: 20_000,
    windowsHide: true,
  });
  const cliStop = spawnSync(cliPath, ['daemon', 'stop', '--json'], {
    encoding: 'utf8',
    timeout: 10_000,
    windowsHide: true,
  });
  if (cliStatus.error || cliStatus.status !== 0) {
    throw new Error(`打包后的 MSFS CLI status 失败：${cliStatus.stderr || cliStatus.error}`);
  }
  const statusEnvelope = JSON.parse(cliStatus.stdout.trim());
  if (statusEnvelope.ok !== true || statusEnvelope.data?.daemon !== 'ready') {
    throw new Error(`打包后的 MSFS CLI 返回异常：${cliStatus.stdout}`);
  }
  if (cliStop.error || cliStop.status !== 0) {
    throw new Error(`打包后的 MSFS daemon 无法停止：${cliStop.stderr || cliStop.error}`);
  }

  let looseFiles = 0;
  let looseBytes = 0;
  let unpackedDependencyFiles = 0;
  let unpackedDependencyBytes = 0;
  const pending = [unpackedRoot];
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
      looseFiles += 1;
      looseBytes += information.size;
      if (path.includes(`${join('app.asar.unpacked', 'node_modules')}`)) {
        unpackedDependencyFiles += 1;
        unpackedDependencyBytes += information.size;
      }
    }
  }
  if (unpackedDependencyFiles > 5_000 || unpackedDependencyBytes > 160 * 1024 * 1024) {
    throw new Error(
      `原生依赖解包范围过大：${unpackedDependencyFiles} files, ${unpackedDependencyBytes} bytes`,
    );
  }

  const report = {
    schemaVersion: 1,
    unpackedRoot,
    appAsarBytes: (await stat(asarPath)).size,
    looseFiles,
    looseBytes,
    unpackedDependencyFiles,
    unpackedDependencyBytes,
    msfsFingerprint: componentManifest.fingerprint,
    imports,
  };
  await writeFile(
    join(projectRoot, 'release-v2', 'runtime-validation-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(
    `Packaged runtime validated: ${looseFiles} loose files; ${unpackedDependencyFiles} native dependency files\n`,
  );
} finally {
  await rm(extractionRoot, { recursive: true, force: true });
}
