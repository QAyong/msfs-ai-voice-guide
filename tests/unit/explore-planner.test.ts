import { describe, expect, it } from 'vitest';
import { explorePlanSchema } from '../../src/explore/planner.js';

const topic = (overrides: Record<string, unknown> = {}) => ({
  id: 'changsha',
  title: '长沙市',
  reason: '了解城市概况。',
  encyclopediaQuery: '长沙',
  encyclopediaFallbackQueries: [],
  videoQuery: '长沙介绍',
  alternateNames: [],
  ...overrides,
});

const validPlan = {
  topics: [
    topic(),
    topic({
      id: 'yuelu-mountain',
      title: '岳麓山',
      encyclopediaQuery: '岳麓山',
      videoQuery: '岳麓山介绍',
    }),
    topic({
      id: 'orange-island',
      title: '橘子洲',
      encyclopediaQuery: '橘子洲',
      videoQuery: '橘子洲介绍',
    }),
  ],
  suggestedPrompts: ['长沙有什么历史？', '岳麓山值得看什么？', '长沙还有哪些地标？'],
};

describe('explore planner contract', () => {
  it('accepts concrete encyclopedia entries with distinct queries', () => {
    expect(explorePlanSchema.safeParse(validPlan).success).toBe(true);
  });

  it('accepts five unique entries for a broad exploration topic', () => {
    const result = explorePlanSchema.safeParse({
      ...validPlan,
      topics: [
        ...validPlan.topics,
        topic({ id: 'yuelu-academy', title: '岳麓书院', encyclopediaQuery: '岳麓书院' }),
        topic({ id: 'taiping-street', title: '太平街', encyclopediaQuery: '太平街' }),
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects repeated encyclopedia queries across topics', () => {
    const result = explorePlanSchema.safeParse({
      ...validPlan,
      topics: [topic(), topic({ id: 'city-history', title: '长沙历史' })],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.join('.') === 'topics.1.encyclopediaQuery'),
      ).toBe(true);
    }
  });

  it('rejects repeated topic ids after normalization', () => {
    const result = explorePlanSchema.safeParse({
      ...validPlan,
      topics: [topic(), topic({ title: '岳麓山', encyclopediaQuery: '岳麓山' })],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'topics.1.id')).toBe(
        true,
      );
    }
  });

  it('rejects repeated concrete entry titles', () => {
    const result = explorePlanSchema.safeParse({
      ...validPlan,
      topics: [
        topic(),
        topic({ id: 'city-overview', title: '长沙市', encyclopediaQuery: '长沙市概况' }),
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'topics.1.title')).toBe(
        true,
      );
    }
  });
});
