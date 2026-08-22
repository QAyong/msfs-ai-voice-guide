import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readFile, realpath, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprintFiles } from './incremental-build-utils.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const releaseRoot = join(projectRoot, 'release-v2');
const appRoot = join(releaseRoot, 'app');
const runtimePackageRoot = join(projectRoot, 'packaging', 'desktop-runtime');
const runtimePackageName = '@xiaoxiao/desktop-runtime';
const cachePath = join(projectRoot, 'dev-runtime', 'build-cache', 'release-app.json');

const rootPackage = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'));
const runtimePackage = JSON.parse(await readFile(join(runtimePackageRoot, 'package.json'), 'utf8'));
if (rootPackage.version !== runtimePackage.version) {
  throw new Error(
    `应用版本与运行包版本不一致：${rootPackage.version} != ${runtimePackage.version}`,
  );
}

await mkdir(releaseRoot, { recursive: true });

const dependencyInputsFingerprint = await fingerprintFiles([
  { label: 'package.json', path: join(projectRoot, 'package.json') },
  {
    label: 'packaging/desktop-runtime/package.json',
    path: join(runtimePackageRoot, 'package.json'),
  },
  { label: 'pnpm-lock.yaml', path: join(projectRoot, 'pnpm-lock.yaml') },
  { label: 'pnpm-workspace.yaml', path: join(projectRoot, 'pnpm-workspace.yaml') },
]);
const dependencyEnvironment = {
  nodeAbi: process.versions.modules,
  platform: process.platform,
  arch: process.arch,
  packageManager: rootPackage.packageManager ?? 'pnpm',
  nodeLinker: 'hoisted',
};
const dependencyFingerprint = createHash('sha256')
  .update(
    JSON.stringify({ inputs: dependencyInputsFingerprint, environment: dependencyEnvironment }),
  )
  .digest('hex');
let cachedDependencies;
try {
  cachedDependencies = JSON.parse(await readFile(cachePath, 'utf8'));
} catch {
  cachedDependencies = undefined;
}
const existingPackage = await readFile(join(appRoot, 'package.json'), 'utf8')
  .then((value) => JSON.parse(value))
  .catch(() => undefined);
const canReuseDependencies =
  cachedDependencies?.schemaVersion === 1 &&
  cachedDependencies.fingerprint === dependencyFingerprint &&
  existingPackage?.name === runtimePackageName &&
  existingPackage.version === rootPackage.version &&
  (await lstat(join(appRoot, 'node_modules'))
    .then(() => true)
    .catch(() => false));

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const command = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : pnpmCommand;
if (!canReuseDependencies) {
  await rm(appRoot, { recursive: true, force: true });

  const pnpmArguments = ['--filter', runtimePackageName, '--prod', 'deploy', appRoot];
  const commandArguments =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', [pnpmCommand, ...pnpmArguments].join(' ')]
      : pnpmArguments;
  const deployment = spawnSync(command, commandArguments, {
    cwd: projectRoot,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (deployment.error) throw deployment.error;
  if (deployment.status !== 0) {
    throw new Error(`生产运行包部署失败，pnpm 退出码：${deployment.status}`);
  }

  // electron-builder follows pnpm junctions while collecting ASAR contents and can flatten
  // incompatible nested versions. Convert the already-minimal deploy lockfile to a physical,
  // hoisted production tree before packaging. This happens before ASAR creation; no dependency
  // files are copied into win-unpacked after packaging.
  const hoistedArguments = [
    'install',
    '--prod',
    '--frozen-lockfile',
    '--config.node-linker=hoisted',
  ];
  const hoistedCommandArguments =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', [pnpmCommand, ...hoistedArguments].join(' ')]
      : hoistedArguments;
  await rm(join(appRoot, 'node_modules'), { recursive: true, force: true });
  const hoistedInstall = spawnSync(command, hoistedCommandArguments, {
    cwd: appRoot,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (hoistedInstall.error) throw hoistedInstall.error;
  if (hoistedInstall.status !== 0) {
    throw new Error(`物理生产依赖树生成失败，pnpm 退出码：${hoistedInstall.status}`);
  }

  await mkdir(resolve(projectRoot, 'dev-runtime', 'build-cache'), { recursive: true });
  await writeFile(
    cachePath,
    `${JSON.stringify({ schemaVersion: 1, fingerprint: dependencyFingerprint, environment: dependencyEnvironment }, null, 2)}\n`,
    'utf8',
  );
} else {
  process.stdout.write(
    `Reusing unchanged production dependencies: ${join(appRoot, 'node_modules')}\n`,
  );
}

await rm(join(appRoot, 'out'), { recursive: true, force: true });
for (const directory of ['main', 'preload', 'renderer']) {
  const source = join(projectRoot, 'out', directory);
  const destination = join(appRoot, 'out', directory);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
}

const requiredPackages = Object.keys(runtimePackage.dependencies);
for (const packageName of requiredPackages) {
  const packagePath = join(appRoot, 'node_modules', ...packageName.split('/'), 'package.json');
  await lstat(packagePath).catch(() => {
    throw new Error(`生产运行包缺少依赖：${packageName}`);
  });
}

const forbiddenTopLevelPackages = [
  '@livekit/components-react',
  '@phosphor-icons/react',
  'archiver',
  'livekit-client',
  'react',
  'react-dom',
  'react-markdown',
  'remark-gfm',
];
for (const packageName of forbiddenTopLevelPackages) {
  const packagePath = join(appRoot, 'node_modules', ...packageName.split('/'), 'package.json');
  const present = await lstat(packagePath)
    .then(() => true)
    .catch(() => false);
  if (present) {
    throw new Error(`生产运行包不应包含前端或已打包依赖：${packageName}`);
  }
}

const pending = [join(appRoot, 'node_modules')];
while (pending.length > 0) {
  const current = pending.pop();
  if (!current) continue;
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      pending.push(path);
      continue;
    }
    if (!entry.isSymbolicLink()) continue;
    const target = await realpath(path);
    const targetRelative = relative(appRoot, target);
    if (isAbsolute(targetRelative) || targetRelative.startsWith('..')) {
      throw new Error(`生产运行包包含指向外部的链接：${path} -> ${target}`);
    }
  }
}

process.stdout.write(`Clean production application prepared at ${appRoot}\n`);
