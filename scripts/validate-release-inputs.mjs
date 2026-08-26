import { createHash } from 'node:crypto';
import { access, readFile, stat, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'));
const outputPath = resolve(projectRoot, 'out', 'release-manifest.json');

const requiredFiles = [
  { component: 'livekit', relativePath: 'out/livekit/livekit-server.exe' },
  { component: 'livekit', relativePath: 'out/livekit/LICENSE' },
  { component: 'msfs', relativePath: 'out/msfs/msfs.exe' },
  { component: 'msfs', relativePath: 'out/msfs/msfsd.exe' },
  { component: 'msfs', relativePath: 'out/msfs/SimConnect.dll' },
  { component: 'msfs', relativePath: 'out/msfs/build-metadata.json' },
  { component: 'msfs', relativePath: 'out/msfs/component-manifest.json' },
  {
    component: 'msfs-community',
    relativePath: 'out/msfs/community/msfs-native-cli-route-bridge/manifest.json',
  },
  {
    component: 'msfs-community',
    relativePath: 'out/msfs/community/msfs-native-cli-route-bridge/layout.json',
  },
  {
    component: 'msfs-community',
    relativePath: 'out/msfs/community/msfs-native-cli-route-bridge/modules/msfs-route-bridge.wasm',
  },
  { component: 'application', relativePath: 'resources/app-icon.ico' },
  { component: 'application', relativePath: 'resources/app-icon.png' },
  { component: 'application', relativePath: '.env.example' },
  { component: 'native', relativePath: 'out/main/native/global-push-to-talk.node' },
];

const sha256 = async (path) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

const recordFile = async (entry) => {
  const absolutePath = resolve(projectRoot, entry.relativePath);
  await access(absolutePath).catch(() => {
    throw new Error(`缺少发布输入文件：${absolutePath}`);
  });
  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile() || fileStat.size === 0) {
    throw new Error(`发布输入文件为空或不是普通文件：${absolutePath}`);
  }
  return {
    component: entry.component,
    path: entry.relativePath.replaceAll('\\', '/'),
    bytes: fileStat.size,
    sha256: await sha256(absolutePath),
  };
};

const fileRecords = await Promise.all(requiredFiles.map(recordFile));

const ttsRoot = resolve(projectRoot, 'out', 'tts');
const pending = [ttsRoot];
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
    fileRecords.push(
      await recordFile({
        component: 'tts',
        relativePath: relative(projectRoot, path),
      }),
    );
  }
}

const msfsComponentManifestPath = resolve(projectRoot, 'out/msfs/component-manifest.json');
const msfsComponentManifest = JSON.parse(await readFile(msfsComponentManifestPath, 'utf8'));
if (
  msfsComponentManifest.schemaVersion !== 1 ||
  msfsComponentManifest.component !== 'msfs-cli-runtime' ||
  msfsComponentManifest.protocolMajor !== 1 ||
  !Array.isArray(msfsComponentManifest.files)
) {
  throw new Error('MSFS CLI 组件清单格式或协议版本无效。');
}
for (const file of msfsComponentManifest.files) {
  const path = resolve(projectRoot, 'out', 'msfs', file.path);
  const information = await stat(path);
  const hash = await sha256(path);
  if (information.size !== file.bytes || hash !== file.sha256) {
    throw new Error(`MSFS CLI 组件文件与快照清单不一致：${file.path}`);
  }
}

const communityManifestPath = resolve(
  projectRoot,
  'out/msfs/community/msfs-native-cli-route-bridge/manifest.json',
);
const communityManifest = JSON.parse(await readFile(communityManifestPath, 'utf8'));
const communityPackageName = communityManifest.package_name ?? communityManifest.name;
if (communityPackageName && communityPackageName !== 'msfs-native-cli-route-bridge') {
  throw new Error(`Community Package 名称不匹配：${communityPackageName}`);
}
if (communityManifest.package_version !== msfsComponentManifest.bridgePackageVersion) {
  throw new Error('MSFS CLI 快照清单与 Bridge 版本不一致。');
}

const communityLayoutPath = resolve(
  projectRoot,
  'out/msfs/community/msfs-native-cli-route-bridge/layout.json',
);
JSON.parse(await readFile(communityLayoutPath, 'utf8'));

const manifest = {
  schemaVersion: 2,
  product: {
    name: packageJson.name,
    productName: '晓晓飞行导游',
    version: packageJson.version,
    platform: 'win32',
    arch: 'x64',
  },
  candidate: true,
  generatedAt: new Date().toISOString(),
  components: [
    {
      name: 'livekit-server',
      files: fileRecords.filter((file) => file.component === 'livekit'),
    },
    {
      name: 'msfs-cli-runtime',
      fingerprint: msfsComponentManifest.fingerprint,
      protocolMajor: msfsComponentManifest.protocolMajor,
      bridgePackageVersion: msfsComponentManifest.bridgePackageVersion,
      files: fileRecords.filter((file) => file.component === 'msfs'),
    },
    {
      name: 'msfs-community-package',
      packageName: 'msfs-native-cli-route-bridge',
      files: fileRecords.filter((file) => file.component === 'msfs-community'),
    },
    {
      name: 'tts-samples',
      files: fileRecords.filter((file) => file.component === 'tts'),
    },
    {
      name: 'desktop-runtime',
      files: fileRecords.filter((file) => file.component === 'application'),
    },
    {
      name: 'native-input',
      files: fileRecords.filter((file) => file.component === 'native'),
    },
  ],
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
process.stdout.write(`Release inputs validated; manifest written to ${outputPath}\n`);
