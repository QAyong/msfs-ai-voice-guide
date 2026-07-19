import type { voice } from '@livekit/agents';
import { z } from 'zod';
import {
  guideSourcesMessageSchema,
  type GuideSource,
  type GuideSourcesMessage,
} from '../../shared/guide-events.js';

const searchResultSchema = z.object({
  status: z.literal('ok'),
  requestId: z.string().trim().min(1).optional(),
  sources: z.array(z.unknown()),
});

const rawSourceSchema = z.object({
  rank: z.number().int().nonnegative().optional(),
  title: z.string().optional(),
  siteName: z.string().optional(),
  url: z.string(),
  openMode: z.literal('in_app').optional(),
  summary: z.string().optional(),
  iconUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  publishTime: z.string().optional(),
});

const searchArgumentsSchema = z.object({ query: z.string().trim().min(1).optional() });

export function extractGuideSources(
  event: voice.FunctionToolsExecutedEvent,
): GuideSourcesMessage | null {
  for (const [index, call] of event.functionCalls.entries()) {
    if (call.name !== 'searchWeb') continue;
    const output = event.functionCallOutputs[index];
    if (!output || output.isError) continue;

    try {
      const searchResult = searchResultSchema.safeParse(JSON.parse(output.output));
      if (!searchResult.success) continue;
      const args = searchArgumentsSchema.safeParse(JSON.parse(call.args));
      const seenUrls = new Set<string>();
      const uniqueSources = searchResult.data.sources
        .map((source, sourceIndex) => normalizeGuideSource(source, sourceIndex))
        .filter((source): source is GuideSource => {
          if (!source || seenUrls.has(source.url)) return false;
          seenUrls.add(source.url);
          return true;
        })
        .sort((left, right) => left.rank - right.rank)
        .slice(0, 10);
      if (uniqueSources.length === 0) continue;

      return guideSourcesMessageSchema.parse({
        type: 'guide.sources',
        ...(args.success && args.data.query ? { query: args.data.query } : {}),
        ...(searchResult.data.requestId ? { requestId: searchResult.data.requestId } : {}),
        sources: uniqueSources,
      });
    } catch {
      // Ignore malformed tool output; no source card is safer than fabricated metadata.
    }
  }
  return null;
}

function normalizeGuideSource(value: unknown, index: number): GuideSource | null {
  const parsed = rawSourceSchema.safeParse(value);
  if (!parsed.success) return null;
  try {
    const url = new URL(parsed.data.url);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return null;
    const hostname = url.hostname;
    const title = cleanLabel(parsed.data.title) ?? hostname;
    const siteName = cleanLabel(parsed.data.siteName) ?? hostname;
    const candidate = {
      rank: parsed.data.rank ?? index + 1,
      title,
      siteName,
      url: url.toString(),
      openMode: 'in_app' as const,
      ...(cleanLabel(parsed.data.summary) ? { summary: cleanLabel(parsed.data.summary) } : {}),
      ...(safeWebUrl(parsed.data.iconUrl) ? { iconUrl: safeWebUrl(parsed.data.iconUrl) } : {}),
      ...(safeWebUrl(parsed.data.thumbnailUrl)
        ? { thumbnailUrl: safeWebUrl(parsed.data.thumbnailUrl) }
        : {}),
      ...(cleanLabel(parsed.data.publishTime)
        ? { publishTime: cleanLabel(parsed.data.publishTime) }
        : {}),
    };
    const validated = guideSourcesMessageSchema.shape.sources.element.safeParse(candidate);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

function cleanLabel(value: string | undefined): string | undefined {
  const cleaned = value
    ?.replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || undefined;
}

function safeWebUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
