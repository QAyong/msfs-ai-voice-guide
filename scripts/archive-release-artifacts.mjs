import { access, mkdir, readdir, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const artifactRoot = join(projectRoot, 'release-v2', 'artifacts');
await mkdir(artifactRoot, { recursive: true });

const setupFiles = (await readdir(artifactRoot, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('-setup.exe'))
  .map((entry) => entry.name)
  .sort();

if (setupFiles.length === 0) {
  process.stdout.write('No previous release installer to archive.\n');
  process.exit(0);
}

for (const setupFile of setupFiles) {
  const version = setupFile.match(/-(.+)-win-x64-setup\.exe$/iu)?.[1] ?? 'unknown';
  let archiveDirectory = join(artifactRoot, 'archive', version);
  try {
    await mkdir(archiveDirectory, { recursive: false });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    archiveDirectory = join(artifactRoot, 'archive', `${version}-${Date.now()}`);
    await mkdir(archiveDirectory, { recursive: true });
  }

  const filesToArchive = [setupFile, `${setupFile}.blockmap`];
  for (const file of filesToArchive) {
    const source = join(artifactRoot, file);
    if (
      !(await access(source)
        .then(() => true)
        .catch(() => false))
    )
      continue;
    await rename(source, join(archiveDirectory, file));
  }
  process.stdout.write(`Archived previous release artifacts under ${archiveDirectory}\n`);
}
