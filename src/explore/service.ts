import {
  exploreResultSchema,
  type ExplorePreferences,
  type ExploreResult,
} from '../../shared/explore-contracts.js';
import type { MsfsExploreContext } from '../msfs/explore-context.js';
import { EncyclopediaService } from './encyclopedia/service.js';
import type { ExplorePlanner } from './planner.js';
import { VideoService } from './video/service.js';

export type ExploreServiceInput = {
  recentConversation?: Array<{ role: 'user' | 'assistant'; text: string }>;
  msfs?: MsfsExploreContext;
  preferences: ExplorePreferences;
  locale: 'zh-CN' | 'en-US';
};

export class ExploreService {
  constructor(
    private readonly planner: ExplorePlanner,
    private readonly encyclopedia: EncyclopediaService,
    private readonly video: VideoService,
  ) {}

  async explore(input: ExploreServiceInput, signal?: AbortSignal): Promise<ExploreResult> {
    if (!input.recentConversation?.length && !input.msfs) {
      throw new Error('Explore requires conversation or MSFS context');
    }
    const plan = await this.planner.plan(input, signal);
    const encyclopedia = await this.encyclopedia.find(
      input.preferences.encyclopedia,
      plan,
      input.locale,
      signal,
    );
    const video = await this.video.find(input.preferences, plan, input.locale, signal);
    const cardsByTopic = new Map(
      plan.topics.map((topic) => [topic.id, [] as ExploreResult['topics'][number]['cards']]),
    );
    for (const card of encyclopedia.cards) cardsByTopic.get(card.topicId)?.push(card);
    for (const card of video.cards) cardsByTopic.get(card.topicId)?.push(card);
    return exploreResultSchema.parse({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      topics: plan.topics.map((topic) => ({
        id: topic.id,
        title: topic.title,
        reason: topic.reason,
        cards: cardsByTopic.get(topic.id) ?? [],
      })),
      suggestedPrompts: plan.suggestedPrompts,
      unavailableProviders: [
        ...(encyclopedia.unavailable ? [input.preferences.encyclopedia] : []),
        ...video.unavailable,
      ],
    });
  }
}
