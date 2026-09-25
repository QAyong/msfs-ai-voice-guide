import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import {
  collectOfficialAircraftCatalog,
  defaultOfficialPartnerPackageAllowlist,
} from '../src/msfs/official-aircraft-catalog.js';

type CliOptions = {
  roots: string[];
  outputPath: string;
  partnerAllowlist: string[];
};

function printUsage(): void {
  process.stdout.write(
    `用法：\n  pnpm msfs:catalog -- --root <MSFS package root> [--root <root> ...]\n\n选项：\n  --root <path>                  扫描一个包根目录，可重复\n  --output <path>                输出目录 JSON 文件\n  --allow-partner-package <id>   显式放行一个官方合作方包，可重复\n\n未提供 --root 时，会尝试读取 UserCfg.opt 和 MSFS2024_INSTALL_ROOT。\n`,
  );
}

function takeValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} 需要一个路径或包名。`);
  return value;
}

function parseArgs(argv: string[], projectRoot: string): CliOptions | { help: true } {
  const roots: string[] = [];
  const partnerAllowlist = [...defaultOfficialPartnerPackageAllowlist];
  let outputPath = join(projectRoot, 'docs', 'msfs', 'autopilot', 'official-aircraft-catalog.json');

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--root') {
      roots.push(takeValue(argv, index, '--root'));
      index += 1;
      continue;
    }
    if (argument === '--output') {
      outputPath = resolve(projectRoot, takeValue(argv, index, '--output'));
      index += 1;
      continue;
    }
    if (argument === '--allow-partner-package') {
      partnerAllowlist.push(takeValue(argv, index, '--allow-partner-package'));
      index += 1;
      continue;
    }
    throw new Error(`未知选项：${argument}`);
  }

  return { roots, outputPath, partnerAllowlist };
}

function parseInstalledPackagesPath(content: string): string | null {
  return content.match(/^\s*InstalledPackagesPath\s+"([^"]+)"\s*$/mu)?.[1] ?? null;
}

function parseSteamLibraryPaths(content: string): string[] {
  const paths: string[] = [];
  for (const match of content.matchAll(/^\s*"path"\s+"((?:\\\\.|[^"])*)"\s*$/gmu)) {
    const rawPath = match[1];
    if (!rawPath) continue;
    try {
      const parsed = JSON.parse(`"${rawPath}"`) as unknown;
      if (typeof parsed === 'string' && parsed.length > 0) paths.push(parsed);
    } catch {
      const fallback = rawPath.replaceAll('\\\\', '\\');
      if (fallback.length > 0) paths.push(fallback);
    }
  }
  return [...new Set(paths)];
}

async function readSteamLibraryPaths(steamRoot: string): Promise<string[]> {
  const libraryFile = join(steamRoot, 'steamapps', 'libraryfolders.vdf');
  try {
    return parseSteamLibraryPaths(await readFile(libraryFile, 'utf8'));
  } catch {
    return [];
  }
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function discoverDefaultRoots(): Promise<string[]> {
  const gameRoots = new Set<string>();
  const fallbackRoots = new Set<string>();
  const installRoot = process.env.MSFS2024_INSTALL_ROOT;
  if (installRoot) gameRoots.add(installRoot);

  const steamRoots = new Set<string>();
  const configuredSteamRoot = process.env.STEAM_PATH;
  if (configuredSteamRoot) steamRoots.add(configuredSteamRoot);
  const programFilesX86 = process.env['ProgramFiles(x86)'];
  if (programFilesX86) steamRoots.add(join(programFilesX86, 'Steam'));
  const programFiles = process.env.ProgramFiles;
  if (programFiles) steamRoots.add(join(programFiles, 'Steam'));
  steamRoots.add('C:\\Program Files (x86)\\Steam');
  steamRoots.add('C:\\Program Files\\Steam');

  const steamLibraries = new Set<string>();
  for (const steamRoot of steamRoots) {
    steamLibraries.add(steamRoot);
    for (const library of await readSteamLibraryPaths(steamRoot)) steamLibraries.add(library);
  }
  for (const library of steamLibraries) {
    for (const installName of ['MSFS2024', 'MicrosoftFlightSimulator2024']) {
      const gameRoot = join(library, 'steamapps', 'common', installName);
      gameRoots.add(gameRoot);
    }
  }

  const roots = new Set<string>();
  for (const gameRoot of gameRoots) {
    if (await directoryExists(gameRoot)) {
      roots.add(gameRoot);
      continue;
    }
    for (const child of ['minimalcache', 'Packages']) {
      const childRoot = join(gameRoot, child);
      if (await directoryExists(childRoot)) roots.add(childRoot);
    }
  }

  const appData = process.env.APPDATA;
  if (appData) {
    const userCfgPath = join(appData, 'Microsoft Flight Simulator 2024', 'UserCfg.opt');
    try {
      const userCfg = await readFile(userCfgPath, 'utf8');
      const installedPackagesPath = parseInstalledPackagesPath(userCfg);
      if (installedPackagesPath) {
        fallbackRoots.add(join(installedPackagesPath, 'Official2024'));
      }
    } catch {
      // An absent UserCfg is expected on machines where the simulator has not run yet.
    }
  }
  for (const root of fallbackRoots) {
    if (await directoryExists(root)) roots.add(root);
  }
  return [...roots].sort((left, right) => left.localeCompare(right));
}

const projectRoot = resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const parsed = parseArgs(argv[0] === '--' ? argv.slice(1) : argv, projectRoot);
if ('help' in parsed) {
  printUsage();
} else {
  const roots = parsed.roots.length > 0 ? parsed.roots : await discoverDefaultRoots();
  if (roots.length === 0) {
    throw new Error(
      '没有找到 MSFS 2024 包根目录。请使用 --root 指定，或设置 MSFS2024_INSTALL_ROOT。',
    );
  }

  const catalog = await collectOfficialAircraftCatalog({
    roots,
    partnerAllowlist: parsed.partnerAllowlist,
  });
  await mkdir(dirname(parsed.outputPath), { recursive: true });
  await writeFile(parsed.outputPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `${JSON.stringify(
      {
        outputPath: parsed.outputPath,
        roots: catalog.collection.roots,
        summary: catalog.summary,
        warningCount: catalog.collection.warnings.length,
      },
      null,
      2,
    )}\n`,
  );
}
