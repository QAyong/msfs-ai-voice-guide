import {
  explorePlanSchema,
  type ExplorePlanner,
  type ExplorePlannerInput,
} from '../../explore/planner.js';

export type DeepSeekExploreConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

const systemPrompt = `You are an exploration planner for a flight guide. Return JSON only.
Choose 2 or 3 themes worth exploring. Conversation is primary; MSFS context is optional enhancement.
Return {topics:[{id,title,reason,encyclopediaQuery,videoQuery,alternateNames}],suggestedPrompts:[string,string,string]}.
Each suggested prompt is a complete natural user question. Never return URLs, IDs, authors, dates, thumbnails, or claims that a source exists.`;

const withoutTrailingSlash = (value: string) => value.replace(/\/+$/u, '');

export class DeepSeekExplorePlanner implements ExplorePlanner {
  constructor(private readonly config: DeepSeekExploreConfig) {}

  async plan(input: ExplorePlannerInput, signal?: AbortSignal) {
    const response = await fetch(`${withoutTrailingSlash(this.config.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(input) },
        ],
      }),
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) throw new Error(`Explore Planner HTTP ${response.status}`);
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('Explore Planner returned no JSON content');
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('Explore Planner returned invalid JSON');
    }
    const result = explorePlanSchema.safeParse(parsed);
    if (!result.success) throw new Error('Explore Planner response did not match schema');
    const serialized = JSON.stringify(result.data).toLowerCase();
    if (/(https?:|\burl\b|videoid|pageid)/u.test(serialized)) {
      throw new Error('Explore Planner returned forbidden resource metadata');
    }
    return result.data;
  }
}
