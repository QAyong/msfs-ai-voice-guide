import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { StoredWindowState, WindowRectangle } from '../../shared/desktop-contracts.js';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isRectangle = (value: unknown): value is WindowRectangle => {
  if (!value || typeof value !== 'object') return false;
  const rectangle = value as Record<string, unknown>;
  return (
    isFiniteNumber(rectangle.x) &&
    isFiniteNumber(rectangle.y) &&
    isFiniteNumber(rectangle.width) &&
    isFiniteNumber(rectangle.height) &&
    rectangle.width > 0 &&
    rectangle.height > 0
  );
};

export function parseStoredWindowState(value: string): StoredWindowState {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return {};
    const candidate = parsed as Record<string, unknown>;
    const source = candidate.source as Record<string, unknown> | undefined;
    return {
      ...(isRectangle(candidate.assistant) ? { assistant: candidate.assistant } : {}),
      ...(isRectangle(candidate.expandedAssistant)
        ? { expandedAssistant: candidate.expandedAssistant }
        : {}),
      ...(source && isFiniteNumber(source.width) && isFiniteNumber(source.height)
        ? { source: { width: source.width, height: source.height } }
        : {}),
      ...(typeof candidate.collapsed === 'boolean' ? { collapsed: candidate.collapsed } : {}),
      ...(candidate.dockSide === 'left' || candidate.dockSide === 'right'
        ? { dockSide: candidate.dockSide }
        : {}),
    };
  } catch {
    return {};
  }
}

export function readStoredWindowState(path: string): StoredWindowState {
  try {
    return parseStoredWindowState(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

export function writeStoredWindowState(path: string, state: StoredWindowState): void {
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(state), 'utf8');
  renameSync(temporaryPath, path);
}
