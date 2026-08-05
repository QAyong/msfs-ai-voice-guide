import { z } from 'zod';
import {
  explorePlanSchema,
  type ExplorePlanner,
  type ExplorePlannerInput,
} from '../../explore/planner.js';
import { runWithProviderTimeout } from '../../explore/provider-timeout.js';

export type DeepSeekExploreConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

type ExploreTopicDraft = {
  id: string;
  title: string;
  reason: string;
};

const topicDraftSchema = z.object({
  topics: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(120),
        title: z.string().trim().min(1).max(80),
        reason: z.string().trim().min(1).max(180),
      }),
    )
    .min(3)
    .max(5),
});

const encyclopediaQuerySchema = z.object({
  topics: z
    .array(
      z.object({
        topicId: z.string().trim().min(1).max(120),
        encyclopediaQuery: z.string().trim().min(1).max(120),
        encyclopediaFallbackQueries: z.array(z.string().trim().min(1).max(120)).max(3).default([]),
        alternateNames: z.array(z.string().trim().min(1).max(80)).max(4).default([]),
      }),
    )
    .min(3)
    .max(5),
});

const videoQuerySchema = z.object({
  topics: z
    .array(
      z.object({
        topicId: z.string().trim().min(1).max(120),
        videoQuery: z.string().trim().min(1).max(160),
      }),
    )
    .min(3)
    .max(5),
});

const suggestedPromptsSchema = z.object({
  suggestedPrompts: z.array(z.string().trim().min(2).max(160)).min(3).max(6),
});

const browsingIntroductionSchema = z.object({
  introduction: z.string().trim().min(1).max(100),
});

const topicSystemPrompt = `You are the topic planner for a flight guide. Return JSON only.
Based on the conversation and optional flight context, choose 3 to 5 concrete encyclopedia entities worth exploring.
Return exactly {topics:[{id,title,reason}]}.
Each topic must be a different concrete entity, not an abstract theme such as city history or city attractions.
For a city, choose distinct entities such as the city itself, a landmark, a museum, a river, or a historical site when relevant.
Use concise Chinese when the locale is zh-CN. Do not return URLs, search queries, video queries, aliases, or resource metadata.`;

const encyclopediaSystemPrompt = `You generate encyclopedia lookup queries for an existing exploration plan. Return JSON only.
Do not change, add, or remove topics. Return exactly {topics:[{topicId,encyclopediaQuery,encyclopediaFallbackQueries,alternateNames}]}.
encyclopediaQuery must be the concrete canonical encyclopedia entry name.
Fallback queries and alternate names must refer to the same entity, not a new topic.
Never return URLs, summaries, reasons, video queries, or resource metadata.`;

const videoSystemPrompt = `You generate video search queries for an existing exploration plan. Return JSON only.
Do not change, add, or remove topics. Return exactly {topics:[{topicId,videoQuery}]}.
Each videoQuery should be a concise natural-language search query useful on video platforms.
Use the requested locale. Never return URLs, video IDs, reasons, encyclopedia queries, or resource metadata.`;

const suggestedPromptsSystemPrompt = `You generate follow-up questions for an exploration panel. Return JSON only.
Return exactly {suggestedPrompts:[string,string,string]}.
Use the conversation and selected topics. Each question must be a complete natural user question.
Do not return URLs, answers, search queries, IDs, or resource metadata.`;

const browsingIntroductionSystemPrompt = `你是“晓晓”，一位亲切、自然、会陪用户探索世界的飞行导游。
请根据 recentConversation 和 topics，写一段主动推荐式的导游介绍，介绍下方即将展示的探索内容。
只返回 JSON：{"introduction":"..."}。
introduction 必须是一整段自然文字，控制在 100 个中文字符以内。
优先承接用户刚才提到的兴趣；没有明确兴趣时，从本次探索主题自然开场。
简要介绍主题是什么、有什么看点，并自然引导用户查看下方内容。
语气亲切、主动、有陪伴感；不要使用“如果你想”“如果你感兴趣”等条件式开头。
不要写列表、编号、浏览路线、网址、数据或主题之外的具体事实。`;

const withoutTrailingSlash = (value: string) => value.replace(/\/+$/u, '');

const parseJson = (content: string) => {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error('Explore Planner returned invalid JSON');
  }
};

const assertNoResourceMetadata = (value: unknown) => {
  const serialized = JSON.stringify(value).toLowerCase();
  if (/(https?:|\burl\b|videoid|pageid)/u.test(serialized)) {
    throw new Error('Explore Planner returned forbidden resource metadata');
  }
};

type JsonRole = 'topics' | 'encyclopedia' | 'video' | 'suggested-prompts' | 'browsing-introduction';

export class DeepSeekExplorePlanner implements ExplorePlanner {
  constructor(private readonly config: DeepSeekExploreConfig) {}

  private async requestJson<T>(
    role: JsonRole,
    systemPrompt: string,
    input: unknown,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
    maxTokens = 1_536,
  ): Promise<T> {
    let repairInstruction: string | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(input) },
      ];
      if (repairInstruction) messages.push({ role: 'user', content: repairInstruction });

      const response = await fetch(
        `${withoutTrailingSlash(this.config.baseUrl)}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.config.model,
            // Exploration planning is structured extraction, so do not spend
            // the request budget on chain-of-thought reasoning.
            thinking: { type: 'disabled' },
            temperature: 0.1,
            max_tokens: maxTokens,
            response_format: { type: 'json_object' },
            messages,
          }),
          ...(signal ? { signal } : {}),
        },
      );
      if (!response.ok) throw new Error(`Explore ${role} Planner HTTP ${response.status}`);
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error(`Explore ${role} Planner returned no JSON`);

      try {
        const parsed = schema.parse(parseJson(content));
        assertNoResourceMetadata(parsed);
        return parsed;
      } catch (error) {
        if (attempt === 1) throw error;
        repairInstruction = `Your previous ${role} JSON failed the contract. Regenerate it from scratch. Return JSON only and follow the exact requested shape.`;
      }
    }
    throw new Error(`Explore ${role} Planner failed to produce valid JSON`);
  }

  async plan(input: ExplorePlannerInput, signal?: AbortSignal) {
    const topicDraft = await this.requestJson(
      'topics',
      topicSystemPrompt,
      input,
      topicDraftSchema,
      signal,
    );

    const sharedQueryInput = {
      locale: input.locale,
      recentConversation: input.recentConversation ?? [],
      ...(input.msfs ? { msfs: input.msfs } : {}),
      topics: topicDraft.topics,
    };

    const introductionInput = {
      recentConversation: input.recentConversation ?? [],
      topics: topicDraft.topics,
    };

    // The four post-topic roles are independent and run concurrently.
    const [encyclopediaQueries, videoQueries, suggestedPrompts, browsingIntroduction] =
      await Promise.all([
        this.requestJson(
          'encyclopedia',
          encyclopediaSystemPrompt,
          sharedQueryInput,
          encyclopediaQuerySchema,
          signal,
        ),
        this.requestJson('video', videoSystemPrompt, sharedQueryInput, videoQuerySchema, signal),
        this.requestJson(
          'suggested-prompts',
          suggestedPromptsSystemPrompt,
          sharedQueryInput,
          suggestedPromptsSchema,
          signal,
          768,
        ),
        runWithProviderTimeout(6_000, signal, (introductionSignal) =>
          this.requestJson(
            'browsing-introduction',
            browsingIntroductionSystemPrompt,
            introductionInput,
            browsingIntroductionSchema,
            introductionSignal,
            512,
          ),
        ).catch((error: unknown) => {
          if (signal?.aborted) throw error;
          return { introduction: '' };
        }),
      ]);

    const encyclopediaByTopic = new Map(
      encyclopediaQueries.topics.map((topic) => [topic.topicId, topic]),
    );
    const videoByTopic = new Map(videoQueries.topics.map((topic) => [topic.topicId, topic]));
    const topicIds = new Set(topicDraft.topics.map((topic) => topic.id));
    if (
      encyclopediaByTopic.size !== topicIds.size ||
      videoByTopic.size !== topicIds.size ||
      [...topicIds].some((id) => !encyclopediaByTopic.has(id) || !videoByTopic.has(id))
    ) {
      throw new Error('Explore Planner query roles returned mismatched topic IDs');
    }

    return explorePlanSchema.parse({
      topics: topicDraft.topics.map((topic: ExploreTopicDraft) => ({
        ...topic,
        ...encyclopediaByTopic.get(topic.id),
        ...videoByTopic.get(topic.id),
      })),
      suggestedPrompts: suggestedPrompts.suggestedPrompts.slice(0, 3),
      introduction: browsingIntroduction.introduction,
    });
  }
}
