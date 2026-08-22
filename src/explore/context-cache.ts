import { randomUUID } from 'node:crypto';
import type { ExploreConversationMessage, ExploreRequest } from '../../shared/explore-contracts.js';
import type { MsfsExploreContext } from '../msfs/explore-context.js';

export const movementThresholdMeters = 10_000;

export type ExploreContextSnapshot = {
  contextId: string;
  capturedAt: string;
  recentConversation: ExploreConversationMessage[];
  msfs: MsfsExploreContext | undefined;
};

export type ExploreContextResolution = {
  snapshot: ExploreContextSnapshot;
  reused: boolean;
};

const compact = (value: string) => value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();

export const conversationFingerprint = (
  requestOrMessages:
    Pick<ExploreRequest, 'recentConversation'> | readonly ExploreConversationMessage[],
) => {
  const messages: readonly ExploreConversationMessage[] = Array.isArray(requestOrMessages)
    ? (requestOrMessages as readonly ExploreConversationMessage[])
    : (requestOrMessages as Pick<ExploreRequest, 'recentConversation'>).recentConversation;
  return messages
    .map((message) => `${message.id}:${message.role}:${compact(message.text)}`)
    .join('|');
};

const distanceMeters = (
  first: MsfsExploreContext['position'],
  second: MsfsExploreContext['position'],
) => {
  if (!first || !second) return 0;
  const radius = 6_371_000;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitude = radians(second.latitude - first.latitude);
  const longitude = radians(second.longitude - first.longitude);
  const a =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(longitude / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const stableJson = (value: unknown) => JSON.stringify(value);

const normalizeGamePois = (context: MsfsExploreContext) =>
  (context.gamePois ?? [])
    .map((poi) => ({
      name: compact(poi.name),
      type: poi.type ? compact(poi.type) : '',
      description: poi.description ? compact(poi.description) : '',
      distanceKm: poi.distanceKm === undefined ? null : Math.round(poi.distanceKm * 10) / 10,
      providerSource: poi.providerSource ? compact(poi.providerSource) : '',
    }))
    .sort((first, second) =>
      stableJson(first).localeCompare(stableJson(second), undefined, { sensitivity: 'base' }),
    );

const hasPlace = (context: MsfsExploreContext) => Boolean(context.place);
const hasRoute = (context: MsfsExploreContext) => Boolean(context.route);
const hasGamePois = (context: MsfsExploreContext) => Boolean(context.gamePois);
const hasPosition = (context: MsfsExploreContext) => Boolean(context.position);

/**
 * Determines whether a new MSFS read can reuse the semantic context identity.
 * Missing data is deliberately treated as a change: callers must never
 * silently reuse a previously captured place, route, or POI field.
 */
export const hasSignificantMsfsChange = (
  previous: MsfsExploreContext | undefined,
  current: MsfsExploreContext | undefined,
) => {
  if (!previous || !current) return previous !== current;

  if (hasPosition(previous) !== hasPosition(current)) return true;
  if (
    previous.position &&
    current.position &&
    distanceMeters(previous.position, current.position) >= movementThresholdMeters
  ) {
    return true;
  }

  if (hasPlace(previous) !== hasPlace(current)) return true;
  if (stableJson(previous.place ?? null) !== stableJson(current.place ?? null)) return true;

  if (hasRoute(previous) !== hasRoute(current)) return true;
  if (stableJson(previous.route ?? null) !== stableJson(current.route ?? null)) return true;

  if (hasGamePois(previous) !== hasGamePois(current)) return true;
  if (stableJson(normalizeGamePois(previous)) !== stableJson(normalizeGamePois(current))) {
    return true;
  }

  return false;
};

const currentCapturedAt = (msfs: MsfsExploreContext | undefined, fallback?: string) =>
  msfs?.capturedAt ?? fallback ?? new Date().toISOString();

export type ExploreContextCacheReader = (
  signal: AbortSignal,
) => Promise<MsfsExploreContext | undefined>;

export class ExploreContextCache {
  private last: { fingerprint: string; snapshot: ExploreContextSnapshot } | null = null;
  private tail: Promise<void> = Promise.resolve();

  clear(): void {
    this.last = null;
  }

  get(
    recentConversation: readonly ExploreConversationMessage[],
    readMsfsContext: ExploreContextCacheReader,
    signal: AbortSignal,
  ): Promise<ExploreContextResolution> {
    const operation = this.tail.then(() =>
      this.resolve(recentConversation, readMsfsContext, signal),
    );
    this.tail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async resolve(
    recentConversation: readonly ExploreConversationMessage[],
    readMsfsContext: ExploreContextCacheReader,
    signal: AbortSignal,
  ): Promise<ExploreContextResolution> {
    if (signal.aborted)
      throw new DOMException('The exploration request was cancelled.', 'AbortError');

    let msfs: MsfsExploreContext | undefined;
    try {
      msfs = await readMsfsContext(signal);
    } catch (error) {
      if (signal.aborted) throw error;
      msfs = undefined;
    }

    const fingerprint = conversationFingerprint(recentConversation);
    const previous = this.last;
    const sameConversation = previous?.fingerprint === fingerprint;
    const canReuse =
      previous !== null &&
      sameConversation &&
      !hasSignificantMsfsChange(previous.snapshot.msfs, msfs);

    if (canReuse && previous) {
      const snapshot: ExploreContextSnapshot = {
        ...previous.snapshot,
        capturedAt: currentCapturedAt(msfs, previous.snapshot.capturedAt),
        recentConversation: [...recentConversation],
        msfs,
      };
      this.last = { fingerprint, snapshot };
      return { snapshot, reused: true };
    }

    const snapshot: ExploreContextSnapshot = {
      contextId: randomUUID(),
      capturedAt: currentCapturedAt(msfs),
      recentConversation: [...recentConversation],
      msfs,
    };
    this.last = { fingerprint, snapshot };
    return { snapshot, reused: false };
  }
}
