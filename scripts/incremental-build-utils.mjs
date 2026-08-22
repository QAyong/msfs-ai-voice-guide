import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const collectFiles = async (rootDirectory) => {
  const files = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  };
  await visit(resolve(rootDirectory));
  return files.sort();
};

export const fingerprintDirectory = async (directory) => {
  const rootDirectory = resolve(directory);
  const hash = createHash('sha256');
  const files = await collectFiles(rootDirectory);
  for (const path of files) {
    hash.update(relative(rootDirectory, path).replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(await readFile(path));
    hash.update('\0');
  }
  return { fingerprint: hash.digest('hex'), files: files.length };
};

export const fingerprintFiles = async (entries) => {
  const hash = createHash('sha256');
  for (const entry of [...entries].sort((left, right) => left.label.localeCompare(right.label))) {
    hash.update(entry.label);
    hash.update('\0');
    hash.update(await readFile(resolve(entry.path)));
    hash.update('\0');
  }
  return hash.digest('hex');
};
