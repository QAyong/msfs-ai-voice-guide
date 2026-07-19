import type { voice } from '@livekit/agents';
import { z } from 'zod';
import {
  guideSourceSchema,
  guideSourcesMessageSchema,
  type GuideSourcesMessage,
} from '../../shared/guide-events.js';

const searchResultSchema = z.object({
  status: z.literal('ok'),
  sources: z.array(
    guideSourceSchema.extend({
      content: z.string().optional(),
    }),
  ),
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
      const uniqueSources = Array.from(
        new Map(
          searchResult.data.sources.map((source) => [
            source.url,
            {
              title: source.title,
              siteName: source.siteName,
              url: source.url,
              ...(source.summary ? { summary: source.summary } : {}),
              ...(source.publishTime ? { publishTime: source.publishTime } : {}),
            },
          ]),
        ).values(),
      ).slice(0, 8);
      if (uniqueSources.length === 0) continue;

      return guideSourcesMessageSchema.parse({
        type: 'guide.sources',
        ...(args.success && args.data.query ? { query: args.data.query } : {}),
        sources: uniqueSources,
      });
    } catch {
      // Ignore malformed tool output; no source card is safer than fabricated metadata.
    }
  }
  return null;
}
