import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';

const AIRCRAFT_CONTENT_TYPE = 'aircraft';
const MAX_DISCOVERY_DEPTH = 5;
const MAX_AIRCRAFT_CFG_DEPTH = 8;

export const directOfficialCreators = ['Asobo Studio', 'Microsoft'] as const;

export type AircraftAutopilotDocumentationStatus = 'unsupported' | 'unknown';

export type AircraftAutopilotEvidence = {
  source: 'official_release_notes' | 'official_forum';
  url: string;
  note: string;
};

export type AircraftAutopilotDocumentation = {
  status: AircraftAutopilotDocumentationStatus;
  reason: string;
  evidence: AircraftAutopilotEvidence[];
};

// Only explicit first-party statements are used to remove an aircraft from the
// static AP candidate set. Missing package-level systems.cfg data remains unknown.
const documentedUnsupportedAutopilotPackages: Record<string, AircraftAutopilotDocumentation> = {
  'fs24-asobo-aircraft-e330': {
    status: 'unsupported',
    reason:
      'An official Microsoft Flight Simulator forum staff reply states that the Extra 330LT is not equipped with an autopilot.',
    evidence: [
      {
        source: 'official_forum',
        url: 'https://forums.flightsimulator.com/t/official-community-fly-in-friday-kuala-lumpur-to-singapore/498966',
        note: 'Official Community Fly-In thread; Microsoft Flight Simulator staff reply dated 2022-02-18: the Extra 330LT is not equipped with an autopilot.',
      },
    ],
  },
  'fs24-asobo-aircraft-vl3': {
    status: 'unsupported',
    reason:
      'Official release notes state that autopilot was incorrectly exposed as available on the JMB VL-3 and was disabled.',
    evidence: [
      {
        source: 'official_release_notes',
        url: 'https://www.flightsimulator.com/release-notes-1-14-5-0/',
        note: 'Sim Update III (1.14.5.0), Planes > Autopilot / FMS: the autopilot incorrectly set as available on the JMB VL-3 was disabled.',
      },
    ],
  },
};

// Spec-028 names the TBM 930 as a first validation sample. It is a partner
// aircraft in its manifest, so it is admitted explicitly rather than by
// virtue of living in an MSFS package cache.
export const defaultOfficialPartnerPackageAllowlist = ['fs24-asobo-aircraft-tbm930'] as const;

export type AircraftGeneration = 'msfs2024' | 'legacy_msfs2020' | 'unknown';

export type AircraftPackageRole = 'flyable' | 'passive' | 'livery' | 'supporting' | 'unknown';

export type AircraftBoundaryStatus =
  | 'official'
  | 'official_partner_allowed'
  | 'official_partner_candidate'
  | 'third_party'
  | 'out_of_scope_legacy'
  | 'unknown';

export type AircraftClassification = {
  generation: AircraftGeneration;
  packageRole: AircraftPackageRole;
  boundaryStatus: AircraftBoundaryStatus;
  inScope: boolean;
  profileEligible: boolean;
  reason: string;
  autopilot: AircraftAutopilotDocumentation;
};

export type AircraftClassificationInput = {
  packageName: string;
  creator: string | null;
};

export type AircraftCfgVariant = {
  section: string;
  title: string | null;
  uiManufacturer: string | null;
  uiType: string | null;
  uiVariation: string | null;
  uiCreatedBy: string | null;
  uiTypeRole: string | null;
  icaoType: string | null;
  icaoModel: string | null;
  atcModel: string | null;
};

export type AircraftCfgIdentity = {
  title: string | null;
  manufacturer: string | null;
  model: string | null;
  variant: string | null;
  icao: string | null;
  uiCreatedBy: string | null;
  uiTypeRole: string | null;
};

export type ParsedAircraftCfg = {
  identity: AircraftCfgIdentity;
  variants: AircraftCfgVariant[];
};

export type OfficialAircraftPackage = {
  packageName: string;
  packageVersion: string | null;
  creator: string | null;
  title: string | null;
  manufacturer: string | null;
  model: string | null;
  variant: string | null;
  icao: string | null;
  uiCreatedBy: string | null;
  uiTypeRole: string | null;
  contentType: string | null;
  exportType: string | null;
  builder: string | null;
  minimumGameVersion: string | null;
  minimumCompatibilityVersion: string | null;
  totalPackageSize: string | null;
  ingested: boolean | null;
  generation: AircraftGeneration;
  packageRole: AircraftPackageRole;
  boundary: {
    status: AircraftBoundaryStatus;
    inScope: boolean;
    reason: string;
  };
  autopilot: AircraftAutopilotDocumentation;
  profileEligible: boolean;
  source: {
    root: string;
    rootKind: 'minimalcache' | 'official_packages' | 'packages' | 'other';
    packageRoot: string;
    packageRelativePath: string;
  };
  simObjects: {
    layoutStatus: 'available' | 'not_found' | 'unreadable';
    contentEntryCount: number;
    archiveEntryCount: number;
    paths: string[];
  };
  aircraftCfg: {
    status: 'available' | 'not_found' | 'archived_not_extracted' | 'unreadable';
    paths: string[];
    variants: AircraftCfgVariant[];
  };
  fingerprints: {
    identitySha256: string;
    files: Array<{ path: string; sha256: string }>;
  };
};

export type OfficialAircraftCatalog = {
  schemaVersion: 1;
  generatedAt: string;
  simulator: {
    product: 'Microsoft Flight Simulator 2024';
    gameVersion: string | null;
  };
  policy: {
    directOfficialCreators: string[];
    officialPartnerPackageAllowlist: string[];
    notes: string[];
  };
  collection: {
    roots: string[];
    discoveredManifestCount: number;
    discoveredAircraftPackageCount: number;
    warnings: string[];
  };
  summary: {
    totalPackages: number;
    inScopePackages: number;
    profileEligiblePackages: number;
    officialPackages: number;
    allowedPartnerPackages: number;
    partnerCandidates: number;
    autopilotUnsupportedPackages: number;
    autopilotUnknownPackages: number;
    legacyPackages: number;
    thirdPartyPackages: number;
    passivePackages: number;
    liveryPackages: number;
  };
  packages: OfficialAircraftPackage[];
};

type JsonObject = Record<string, unknown>;

type Manifest = {
  contentType: string | null;
  title: string | null;
  manufacturer: string | null;
  creator: string | null;
  packageVersion: string | null;
  exportType: string | null;
  builder: string | null;
  minimumGameVersion: string | null;
  minimumCompatibilityVersion: string | null;
  totalPackageSize: string | null;
  ingested: boolean | null;
};

type ManifestPath = {
  path: string;
  scanRoot: string;
};

type FileReadResult =
  | { status: 'available'; text: string; sha256: string }
  | { status: 'not_found' }
  | { status: 'unreadable'; message: string };

type LayoutSummary = {
  status: 'available' | 'not_found' | 'unreadable';
  contentEntryCount: number;
  archiveEntryCount: number;
  paths: string[];
  sha256: string | null;
};

type AircraftCfgResult = {
  status: 'available' | 'not_found' | 'archived_not_extracted' | 'unreadable';
  paths: string[];
  variants: AircraftCfgVariant[];
  hashes: Array<{ path: string; sha256: string }>;
};

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function manifestValue(manifest: JsonObject, key: string): string | null {
  return stringValue(manifest[key]);
}

function normalizeName(value: string | null): string {
  return value?.trim().toLocaleLowerCase('en-US') ?? '';
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/');
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function jsonSha256(value: unknown): string {
  return sha256(JSON.stringify(value));
}

function getCaseInsensitiveKey(object: Map<string, string>, key: string): string | null {
  return object.get(key.toLocaleLowerCase('en-US')) ?? null;
}

function stripCfgValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseManifest(value: unknown): Manifest | null {
  if (!isJsonObject(value)) return null;
  return {
    contentType: manifestValue(value, 'content_type'),
    title: manifestValue(value, 'title'),
    manufacturer: manifestValue(value, 'manufacturer'),
    creator: manifestValue(value, 'creator'),
    packageVersion: manifestValue(value, 'package_version'),
    exportType: manifestValue(value, 'export_type'),
    builder: manifestValue(value, 'builder'),
    minimumGameVersion: manifestValue(value, 'minimum_game_version'),
    minimumCompatibilityVersion: manifestValue(value, 'minimum_compatibility_version'),
    totalPackageSize: manifestValue(value, 'total_package_size'),
    ingested: booleanValue(value.ingested),
  };
}

function classifyPackageRole(packageName: string): AircraftPackageRole {
  const normalized = packageName.toLocaleLowerCase('en-US');
  if (normalized.includes('-livery-') || normalized.endsWith('-livery')) return 'livery';
  if (normalized.includes('-passiveaircraft-') || normalized.endsWith('-passiveaircraft')) {
    return 'passive';
  }
  if (normalized.includes('-certification-airplane-')) return 'supporting';
  if (normalized.includes('-aircraft-')) return 'flyable';
  return 'unknown';
}

function classifyGeneration(packageName: string): AircraftGeneration {
  const normalized = packageName.toLocaleLowerCase('en-US');
  if (normalized.startsWith('fs24-')) return 'msfs2024';
  if (normalized.startsWith('fs20-')) return 'legacy_msfs2020';
  return 'unknown';
}

function documentAutopilotCapability(packageName: string): AircraftAutopilotDocumentation {
  const documented = documentedUnsupportedAutopilotPackages[normalizeName(packageName)];
  if (documented) {
    return {
      ...documented,
      evidence: documented.evidence.map((item) => ({ ...item })),
    };
  }
  return {
    status: 'unknown',
    reason:
      'No accepted per-aircraft official systems.cfg evidence is registered for this package; autopilot capability remains unknown.',
    evidence: [],
  };
}

export function classifyAircraftPackage(
  input: AircraftClassificationInput,
  partnerAllowlist:
    ReadonlySet<string> | readonly string[] = defaultOfficialPartnerPackageAllowlist,
): AircraftClassification {
  const generation = classifyGeneration(input.packageName);
  const packageRole = classifyPackageRole(input.packageName);
  const normalizedPackageName = normalizeName(input.packageName);
  const partnerNames = Array.from(partnerAllowlist);
  const allowedPartners = new Set(partnerNames.map((value) => normalizeName(value)));
  const isAllowedPartner = allowedPartners.has(normalizedPackageName);
  const normalizedCreator = normalizeName(input.creator);
  const isDirectCreator = directOfficialCreators.some(
    (creator) => normalizeName(creator) === normalizedCreator,
  );
  const autopilot = documentAutopilotCapability(input.packageName);
  const flyableProfileEligible = packageRole === 'flyable' && autopilot.status !== 'unsupported';
  const officialNamespace =
    normalizedPackageName.startsWith('fs24-asobo-') ||
    normalizedPackageName.startsWith('fs24-microsoft-');

  if (generation === 'legacy_msfs2020') {
    return {
      generation,
      packageRole,
      boundaryStatus: 'out_of_scope_legacy',
      inScope: false,
      profileEligible: false,
      reason: 'The package uses the fs20 namespace and is outside the MSFS 2024 scope.',
      autopilot,
    };
  }

  if (generation !== 'msfs2024') {
    return {
      generation,
      packageRole,
      boundaryStatus: 'unknown',
      inScope: false,
      profileEligible: false,
      reason: 'The package namespace does not identify an MSFS 2024 package.',
      autopilot,
    };
  }

  if (isAllowedPartner) {
    return {
      generation,
      packageRole,
      boundaryStatus: 'official_partner_allowed',
      inScope: true,
      profileEligible: flyableProfileEligible,
      reason: 'The package is explicitly present in the Spec-028 partner allowlist.',
      autopilot,
    };
  }

  if (officialNamespace && isDirectCreator) {
    return {
      generation,
      packageRole,
      boundaryStatus: 'official',
      inScope: true,
      profileEligible: flyableProfileEligible,
      reason:
        'The package uses the MSFS 2024 official namespace and has an Asobo/Microsoft creator.',
      autopilot,
    };
  }

  if (officialNamespace && normalizedCreator.length > 0) {
    return {
      generation,
      packageRole,
      boundaryStatus: 'official_partner_candidate',
      inScope: true,
      profileEligible: flyableProfileEligible,
      reason:
        'The package uses an official namespace but its creator is not directly Asobo/Microsoft; it is included for static candidate collection, not executable control.',
      autopilot,
    };
  }

  return {
    generation,
    packageRole,
    boundaryStatus: officialNamespace ? 'unknown' : 'third_party',
    inScope: false,
    profileEligible: false,
    reason: officialNamespace
      ? 'The package creator is missing, so official ownership cannot be established.'
      : 'The package does not use an MSFS 2024 official namespace.',
    autopilot,
  };
}

export function parseAircraftCfg(content: string): ParsedAircraftCfg {
  const sections = new Map<string, { name: string; values: Map<string, string> }>();
  let current: { name: string; values: Map<string, string> } | null = null;

  for (const rawLine of content.replace(/^\uFEFF/, '').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith(';') || line.startsWith('#')) continue;

    const sectionMatch = line.match(/^\[([^\]]+)\]$/u);
    if (sectionMatch?.[1]) {
      const section = { name: sectionMatch[1].trim(), values: new Map<string, string>() };
      sections.set(section.name.toLocaleLowerCase('en-US'), section);
      current = section;
      continue;
    }

    if (!current) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim().toLocaleLowerCase('en-US');
    let value = line.slice(separator + 1).trim();
    value = value.replace(/\s+[;#].*$/u, '').trim();
    current.values.set(key, stripCfgValue(value));
  }

  const variants = [...sections.values()]
    .filter((section) => /^fltsim(?:\.\d+)?$/iu.test(section.name))
    .sort((left, right) => {
      const leftIndex = Number(left.name.match(/\.(\d+)$/u)?.[1] ?? 0);
      const rightIndex = Number(right.name.match(/\.(\d+)$/u)?.[1] ?? 0);
      return leftIndex - rightIndex;
    })
    .map((section): AircraftCfgVariant => ({
      section: section.name,
      title: getCaseInsensitiveKey(section.values, 'title'),
      uiManufacturer: getCaseInsensitiveKey(section.values, 'ui_manufacturer'),
      uiType: getCaseInsensitiveKey(section.values, 'ui_type'),
      uiVariation: getCaseInsensitiveKey(section.values, 'ui_variation'),
      uiCreatedBy: getCaseInsensitiveKey(section.values, 'ui_createdby'),
      uiTypeRole: getCaseInsensitiveKey(section.values, 'ui_typerole'),
      icaoType: getCaseInsensitiveKey(section.values, 'icao_type'),
      icaoModel: getCaseInsensitiveKey(section.values, 'icao_model'),
      atcModel: getCaseInsensitiveKey(section.values, 'atc_model'),
    }));

  const firstVariant = variants[0];
  const general = sections.get('general');
  const title = firstVariant?.title ?? null;
  const manufacturer = firstVariant?.uiManufacturer ?? null;
  const model = firstVariant?.uiType ?? firstVariant?.atcModel ?? null;
  const variant = firstVariant?.uiVariation ?? null;
  const icao = firstVariant?.icaoType ?? firstVariant?.icaoModel ?? firstVariant?.atcModel ?? null;

  return {
    identity: {
      title,
      manufacturer,
      model,
      variant,
      icao,
      uiCreatedBy: firstVariant?.uiCreatedBy ?? null,
      uiTypeRole:
        firstVariant?.uiTypeRole ??
        getCaseInsensitiveKey(general?.values ?? new Map(), 'ui_typerole'),
    },
    variants,
  };
}

async function readTextFile(path: string): Promise<FileReadResult> {
  try {
    const buffer = await readFile(path);
    return { status: 'available', text: buffer.toString('utf8'), sha256: sha256(buffer) };
  } catch (error) {
    const code = isJsonObject(error) && typeof error.code === 'string' ? error.code : 'UNKNOWN';
    if (code === 'ENOENT') return { status: 'not_found' };
    return { status: 'unreadable', message: `${code}: ${String(error)}` };
  }
}

async function findManifestPaths(root: string, depth = 0): Promise<ManifestPath[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const manifests = entries
    .filter((entry) => entry.isFile() && entry.name.toLocaleLowerCase('en-US') === 'manifest.json')
    .map((entry) => ({ path: join(root, entry.name), scanRoot: root }));
  if (manifests.length > 0 || depth >= MAX_DISCOVERY_DEPTH) return manifests;

  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => findManifestPaths(join(root, entry.name), depth + 1)),
  );
  return nested.flat();
}

async function discoverManifestPaths(roots: string[]): Promise<{
  manifests: ManifestPath[];
  warnings: string[];
}> {
  const manifests: ManifestPath[] = [];
  const warnings: string[] = [];

  for (const root of roots) {
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
      const code = isJsonObject(error) && typeof error.code === 'string' ? error.code : 'UNKNOWN';
      warnings.push(`Cannot scan root ${root}: ${code}.`);
      continue;
    }

    const rootManifest = entries.find(
      (entry) => entry.isFile() && entry.name.toLocaleLowerCase('en-US') === 'manifest.json',
    );
    if (rootManifest) {
      manifests.push({ path: join(root, rootManifest.name), scanRoot: root });
      continue;
    }

    const nested = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(async (entry) => {
          const packageRoot = join(root, entry.name);
          const packageManifests = await findManifestPaths(packageRoot, 1);
          return packageManifests.map((manifest) => ({ ...manifest, scanRoot: root }));
        }),
    );
    manifests.push(...nested.flat());
  }

  const unique = new Map<string, ManifestPath>();
  for (const manifest of manifests) {
    const key = resolve(manifest.path).toLocaleLowerCase('en-US');
    if (!unique.has(key)) unique.set(key, manifest);
  }
  return {
    manifests: [...unique.values()].sort((left, right) => left.path.localeCompare(right.path)),
    warnings,
  };
}

async function findImmediateFile(root: string, expectedName: string): Promise<string | null> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const entry = entries.find(
      (candidate) =>
        candidate.isFile() && candidate.name.toLocaleLowerCase('en-US') === expectedName,
    );
    return entry ? join(root, entry.name) : null;
  } catch {
    return null;
  }
}

async function findFilesNamed(root: string, expectedName: string, depth = 0): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLocaleLowerCase('en-US') === expectedName)
    .map((entry) => join(root, entry.name));
  if (depth >= MAX_AIRCRAFT_CFG_DEPTH) return files;

  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => findFilesNamed(join(root, entry.name), expectedName, depth + 1)),
  );
  return [...files, ...nested.flat()];
}

function parseLayout(value: unknown, sha256Value: string): LayoutSummary {
  if (!isJsonObject(value) || !Array.isArray(value.content)) {
    return {
      status: 'unreadable',
      contentEntryCount: 0,
      archiveEntryCount: 0,
      paths: [],
      sha256: sha256Value,
    };
  }

  const paths = new Set<string>();
  let archiveEntryCount = 0;
  for (const entry of value.content) {
    if (!isJsonObject(entry) || typeof entry.path !== 'string') continue;
    const entryPath = normalizePath(entry.path);
    if (/\.fsarchive$/iu.test(entryPath)) archiveEntryCount += 1;
    const parts = entryPath.split('/').filter(Boolean);
    if (
      parts.length >= 3 &&
      parts[0]?.toLocaleLowerCase('en-US') === 'simobjects' &&
      ['airplanes', 'helicopters'].includes(parts[1]?.toLocaleLowerCase('en-US') ?? '')
    ) {
      paths.add(parts.slice(0, 3).join('/'));
    }
  }

  return {
    status: 'available',
    contentEntryCount: value.content.length,
    archiveEntryCount,
    paths: [...paths].sort((left, right) => left.localeCompare(right)),
    sha256: sha256Value,
  };
}

function inferRootKind(root: string): OfficialAircraftPackage['source']['rootKind'] {
  const normalized = normalizePath(root).toLocaleLowerCase('en-US');
  if (normalized.endsWith('/minimalcache')) return 'minimalcache';
  if (normalized.includes('/packages/official2024')) return 'official_packages';
  if (normalized.endsWith('/packages')) return 'packages';
  return 'other';
}

function relativePackagePath(root: string, packageRoot: string): string {
  const value = relative(root, packageRoot);
  return normalizePath(value.length > 0 ? value : '.');
}

async function collectAircraftCfg(
  packageRoot: string,
  hasArchivedContent: boolean,
): Promise<AircraftCfgResult> {
  const paths = [...new Set(await findFilesNamed(packageRoot, 'aircraft.cfg'))].sort(
    (left, right) => left.localeCompare(right),
  );
  if (paths.length === 0) {
    return {
      status: hasArchivedContent ? 'archived_not_extracted' : 'not_found',
      paths: [],
      variants: [],
      hashes: [],
    };
  }

  const variants: AircraftCfgVariant[] = [];
  const hashes: Array<{ path: string; sha256: string }> = [];
  let readable = false;
  for (const path of paths) {
    const result = await readTextFile(path);
    const relativePath = normalizePath(relative(packageRoot, path));
    if (result.status === 'available') {
      readable = true;
      hashes.push({ path: relativePath, sha256: result.sha256 });
      variants.push(...parseAircraftCfg(result.text).variants);
    }
  }

  return {
    status: readable ? 'available' : 'unreadable',
    paths: paths.map((path) => normalizePath(relative(packageRoot, path))),
    variants,
    hashes,
  };
}

async function readAircraftPackage(
  manifestPath: ManifestPath,
  partnerAllowlist: ReadonlySet<string> | readonly string[],
  warnings: string[],
): Promise<OfficialAircraftPackage | null> {
  const manifestFile = await readTextFile(manifestPath.path);
  if (manifestFile.status !== 'available') {
    warnings.push(`Cannot read manifest ${manifestPath.path}.`);
    return null;
  }
  let parsedManifest: unknown;
  try {
    parsedManifest = JSON.parse(manifestFile.text) as unknown;
  } catch {
    warnings.push(`Cannot parse manifest ${manifestPath.path}.`);
    return null;
  }
  const manifest = parseManifest(parsedManifest);
  if (!manifest) {
    warnings.push(`Manifest ${manifestPath.path} is not a JSON object.`);
    return null;
  }
  if (normalizeName(manifest.contentType) !== AIRCRAFT_CONTENT_TYPE) return null;

  const packageRoot = dirname(manifestPath.path);
  const packageName = basename(packageRoot);
  const classification = classifyAircraftPackage(
    { packageName, creator: manifest.creator },
    partnerAllowlist,
  );
  const layoutPath = await findImmediateFile(packageRoot, 'layout.json');
  let layout: LayoutSummary = {
    status: 'not_found',
    contentEntryCount: 0,
    archiveEntryCount: 0,
    paths: [],
    sha256: null,
  };
  if (layoutPath) {
    const layoutFile = await readTextFile(layoutPath);
    if (layoutFile.status === 'available') {
      try {
        layout = parseLayout(JSON.parse(layoutFile.text) as unknown, layoutFile.sha256);
      } catch {
        layout = {
          status: 'unreadable',
          contentEntryCount: 0,
          archiveEntryCount: 0,
          paths: [],
          sha256: layoutFile.sha256,
        };
      }
    } else {
      layout = {
        status: 'unreadable',
        contentEntryCount: 0,
        archiveEntryCount: 0,
        paths: [],
        sha256: null,
      };
      warnings.push(`Cannot read layout ${layoutPath}.`);
    }
  }

  const aircraftCfg = await collectAircraftCfg(packageRoot, layout.archiveEntryCount > 0);
  const firstCfgPath = aircraftCfg.paths[0];
  const firstCfg = firstCfgPath ? await readTextFile(join(packageRoot, firstCfgPath)) : null;
  const cfgIdentity =
    firstCfg?.status === 'available'
      ? parseAircraftCfg(firstCfg.text).identity
      : {
          title: null,
          manufacturer: null,
          model: null,
          variant: null,
          icao: null,
          uiCreatedBy: null,
          uiTypeRole: null,
        };

  const versionFiles = await readdir(packageRoot, { withFileTypes: true })
    .then((entries) =>
      entries
        .filter((entry) => entry.isFile() && /^version-.*\.txt$/iu.test(entry.name))
        .map((entry) => join(packageRoot, entry.name))
        .sort((left, right) => left.localeCompare(right)),
    )
    .catch(() => [] as string[]);
  const metadataPaths = [
    manifestPath.path,
    ...(layoutPath ? [layoutPath] : []),
    ...versionFiles,
    ...aircraftCfg.paths.map((path) => join(packageRoot, path)),
  ];
  const fileHashes = new Map<string, string>();
  for (const path of [...new Set(metadataPaths)].sort((left, right) => left.localeCompare(right))) {
    const result = await readTextFile(path);
    if (result.status === 'available') {
      fileHashes.set(normalizePath(relative(packageRoot, path)), result.sha256);
    }
  }
  const fingerprintFiles = [...fileHashes.entries()].map(([path, sha256Value]) => ({
    path,
    sha256: sha256Value,
  }));

  const title = cfgIdentity.title ?? manifest.title;
  const manufacturer = cfgIdentity.manufacturer ?? manifest.manufacturer;
  const model = cfgIdentity.model;
  const variant = cfgIdentity.variant;
  const icao = cfgIdentity.icao;
  const packageRelativePath = relativePackagePath(manifestPath.scanRoot, packageRoot);
  const identitySha256 = jsonSha256({
    packageName,
    packageVersion: manifest.packageVersion,
    creator: manifest.creator,
    title,
    manufacturer,
    model,
    variant,
    icao,
    generation: classification.generation,
    packageRole: classification.packageRole,
    simObjectPaths: layout.paths,
    files: fingerprintFiles,
  });

  return {
    packageName,
    packageVersion: manifest.packageVersion,
    creator: manifest.creator,
    title,
    manufacturer,
    model,
    variant,
    icao,
    uiCreatedBy: cfgIdentity.uiCreatedBy,
    uiTypeRole: cfgIdentity.uiTypeRole,
    contentType: manifest.contentType,
    exportType: manifest.exportType,
    builder: manifest.builder,
    minimumGameVersion: manifest.minimumGameVersion,
    minimumCompatibilityVersion: manifest.minimumCompatibilityVersion,
    totalPackageSize: manifest.totalPackageSize,
    ingested: manifest.ingested,
    generation: classification.generation,
    packageRole: classification.packageRole,
    boundary: {
      status: classification.boundaryStatus,
      inScope: classification.inScope,
      reason: classification.reason,
    },
    autopilot: classification.autopilot,
    profileEligible: classification.profileEligible,
    source: {
      root: manifestPath.scanRoot,
      rootKind: inferRootKind(manifestPath.scanRoot),
      packageRoot,
      packageRelativePath,
    },
    simObjects: {
      layoutStatus: layout.status,
      contentEntryCount: layout.contentEntryCount,
      archiveEntryCount: layout.archiveEntryCount,
      paths: layout.paths,
    },
    aircraftCfg: {
      status: aircraftCfg.status,
      paths: aircraftCfg.paths,
      variants: aircraftCfg.variants,
    },
    fingerprints: {
      identitySha256,
      files: fingerprintFiles,
    },
  };
}

function buildSummary(packages: OfficialAircraftPackage[]): OfficialAircraftCatalog['summary'] {
  const count = (predicate: (item: OfficialAircraftPackage) => boolean) =>
    packages.filter(predicate).length;
  return {
    totalPackages: packages.length,
    inScopePackages: count((item) => item.boundary.inScope),
    profileEligiblePackages: count((item) => item.profileEligible),
    officialPackages: count((item) => item.boundary.status === 'official'),
    allowedPartnerPackages: count((item) => item.boundary.status === 'official_partner_allowed'),
    partnerCandidates: count((item) => item.boundary.status === 'official_partner_candidate'),
    autopilotUnsupportedPackages: count(
      (item) =>
        item.boundary.inScope &&
        item.packageRole === 'flyable' &&
        item.autopilot.status === 'unsupported',
    ),
    autopilotUnknownPackages: count(
      (item) =>
        item.boundary.inScope &&
        item.packageRole === 'flyable' &&
        item.autopilot.status === 'unknown',
    ),
    legacyPackages: count((item) => item.boundary.status === 'out_of_scope_legacy'),
    thirdPartyPackages: count((item) => item.boundary.status === 'third_party'),
    passivePackages: count((item) => item.packageRole === 'passive'),
    liveryPackages: count((item) => item.packageRole === 'livery'),
  };
}

export async function collectOfficialAircraftCatalog(options: {
  roots: readonly string[];
  generatedAt?: string;
  partnerAllowlist?: readonly string[];
}): Promise<OfficialAircraftCatalog> {
  const roots = [...new Set(options.roots.map((root) => resolve(root)))].sort((left, right) =>
    left.localeCompare(right),
  );
  const partnerAllowlist = options.partnerAllowlist ?? defaultOfficialPartnerPackageAllowlist;
  const discovered = await discoverManifestPaths(roots);
  const warnings = [...discovered.warnings];
  const packages = (
    await Promise.all(
      discovered.manifests.map((manifest) =>
        readAircraftPackage(manifest, partnerAllowlist, warnings),
      ),
    )
  )
    .filter((item): item is OfficialAircraftPackage => item !== null)
    .sort((left, right) => {
      const packageCompare = left.packageName.localeCompare(right.packageName);
      if (packageCompare !== 0) return packageCompare;
      return left.source.packageRoot.localeCompare(right.source.packageRoot);
    });

  const uniquePackages = new Map<string, OfficialAircraftPackage>();
  for (const item of packages) {
    const key = [item.packageName, item.packageVersion ?? '', item.creator ?? '']
      .join('\u0000')
      .toLocaleLowerCase('en-US');
    if (!uniquePackages.has(key)) uniquePackages.set(key, item);
  }
  const finalPackages = [...uniquePackages.values()];
  const uniqueWarnings = [...new Set(warnings)].sort((left, right) => left.localeCompare(right));

  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    simulator: {
      product: 'Microsoft Flight Simulator 2024',
      gameVersion: null,
    },
    policy: {
      directOfficialCreators: [...directOfficialCreators],
      officialPartnerPackageAllowlist: [...partnerAllowlist]
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .sort((left, right) => left.localeCompare(right)),
      notes: [
        'Official partner packages are included in this catalog for static candidate collection; executable control still requires explicit package-level allowlisting and runtime verification.',
        'Package metadata and layout discovery do not prove autopilot capability; that requires runtime inspection and controlled testing.',
        'Explicit first-party no-autopilot evidence excludes only the affected packages from profileEligible; all other in-scope flyable packages remain autopilot-unknown until per-aircraft evidence is available.',
        'Aircraft packages stored only as .fsarchive are recorded without pretending that aircraft.cfg was read.',
      ],
    },
    collection: {
      roots,
      discoveredManifestCount: discovered.manifests.length,
      discoveredAircraftPackageCount: packages.length,
      warnings: uniqueWarnings,
    },
    summary: buildSummary(finalPackages),
    packages: finalPackages,
  };
}
