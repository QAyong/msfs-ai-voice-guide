import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import process from 'node:process';

const projectRoot = resolve(import.meta.dirname, '..');
const sourceDirectory = resolve(projectRoot, 'native', 'msfs-cli');
const fallbackBuildDirectory = resolve(projectRoot, 'dev-runtime', 'msfs-cli-build');
const configuredBuildDirectory = process.env.MSFS_CLI_BUILD_DIR?.trim()
  ? resolve(process.env.MSFS_CLI_BUILD_DIR.trim())
  : fallbackBuildDirectory;
const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
const programFilesX86 = process.env['ProgramFiles(x86)'] ?? programFiles;
const configuredCmake = process.env.CMAKE_COMMAND?.trim().replace(/^"|"$/g, '');
const configuredVsDevCmd = process.env.VSDEVCMD?.trim().replace(/^"|"$/g, '');
const cmakeCandidates = [
  configuredCmake,
  join(programFiles, 'CMake', 'bin', 'cmake.exe'),
  join(
    programFiles,
    'Microsoft Visual Studio',
    '2022',
    'Community',
    'Common7',
    'IDE',
    'CommonExtensions',
    'Microsoft',
    'CMake',
    'CMake',
    'bin',
    'cmake.exe',
  ),
  join(
    programFiles,
    'Microsoft Visual Studio',
    '18',
    'Community',
    'Common7',
    'IDE',
    'CommonExtensions',
    'Microsoft',
    'CMake',
    'CMake',
    'bin',
    'cmake.exe',
  ),
].filter((candidate, index, all) => candidate && all.indexOf(candidate) === index);

const cmakeFromPath = spawnSync('where.exe', ['cmake'], { encoding: 'utf8' })
  .stdout.split(/\r?\n/)
  .map((candidate) => candidate.trim())
  .find(Boolean);
const cmake = [...cmakeCandidates, cmakeFromPath].find(
  (candidate) => candidate && existsSync(candidate),
);
const vsDevCmdCandidates = [
  configuredVsDevCmd,
  join(
    programFiles,
    'Microsoft Visual Studio',
    '2022',
    'Community',
    'Common7',
    'Tools',
    'VsDevCmd.bat',
  ),
  join(
    programFiles,
    'Microsoft Visual Studio',
    '18',
    'Community',
    'Common7',
    'Tools',
    'VsDevCmd.bat',
  ),
  join(
    programFilesX86,
    'Microsoft Visual Studio',
    '2022',
    'Community',
    'Common7',
    'Tools',
    'VsDevCmd.bat',
  ),
].filter((candidate, index, all) => candidate && all.indexOf(candidate) === index);
const vsDevCmd = vsDevCmdCandidates.find((candidate) => existsSync(candidate));
if (!cmake) {
  throw new Error('找不到 CMake。请安装 CMake 或 Visual Studio CMake 工具，并设置 CMAKE_COMMAND。');
}

const quoteForCmd = (value) => `"${value.replaceAll('"', '\\"')}"`;

const buildDirectory = configuredBuildDirectory;

const run = (args) =>
  new Promise((resolve, reject) => {
    const cmakeCommand = [quoteForCmd(cmake), ...args.map(quoteForCmd)].join(' ');
    const command = vsDevCmd
      ? `call ${quoteForCmd(vsDevCmd)} -arch=x64 -host_arch=x64 && ${cmakeCommand}`
      : cmakeCommand;
    const child = spawn('cmd.exe', ['/d', '/s', '/c', command], {
      cwd: projectRoot,
      stdio: 'inherit',
      windowsHide: true,
      windowsVerbatimArguments: true,
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`CMake exited with code ${code ?? 'unknown'}.`));
    });
  });

if (!existsSync(resolve(buildDirectory, 'CMakeCache.txt'))) {
  await run([
    '-S',
    sourceDirectory,
    '-B',
    buildDirectory,
    '-G',
    'Ninja',
    '-DCMAKE_BUILD_TYPE=Release',
  ]);
}

await run(['--build', buildDirectory, '--config', 'Release']);
process.stdout.write(`MSFS CLI native build completed: ${buildDirectory}\n`);
