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
Choose 3 to 5 concrete encyclopedia entries worth exploring. Conversation is primary; MSFS context is optional enhancement. Use 5 for broad subjects such as a city, region, ethnic group, or historical topic; use 3 or 4 for a focused question.
Return {topics:[{id,title,reason,encyclopediaQuery,encyclopediaFallbackQueries,videoQuery,alternateNames}],suggestedPrompts:[string,string,string]}.
Each topic must represent a different concrete entity or encyclopedia entry. The topics must not be repeated versions of the same broad place.
Use a concrete entry name for title and encyclopediaQuery, not an abstract theme such as "city history" or "city attractions".
For example, for a city, use distinct entries such as the city itself, a landmark, a museum, a river, or a historical site when relevant; do not query the city entry for every topic.
encyclopediaFallbackQueries may contain up to 3 alternative spellings or official names for the same intended entry, ordered after encyclopediaQuery. They must not introduce another topic.
Never reuse an encyclopediaQuery across topics. If the context does not support enough distinct concrete entries, do not invent or repeat a generic entry; the response will be rejected and repaired by the caller.
Each suggested prompt is a complete natural user question. Never return URLs, IDs, authors, dates, thumbnails, or claims that a source exists.`;

const withoutTrailingSlash = (value: string) => value.replace(/\/+$/u, '');

const parsePlannerContent = (content: string) => {
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
};

export class DeepSeekExplorePlanner implements ExplorePlanner {
  constructor(private readonly config: DeepSeekExploreConfig) {}

  async plan(input: ExplorePlannerInput, signal?: AbortSignal) {
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
            temperature: 0.3,
            response_format: { type: 'json_object' },
            messages,
          }),
          ...(signal ? { signal } : {}),
        },
      );
      if (!response.ok) throw new Error(`Explore Planner HTTP ${response.status}`);
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('Explore Planner returned no JSON content');

      try {
        return parsePlannerContent(content);
      } catch (error) {
        if (attempt === 1) throw error;
        repairInstruction =
          'Your previous JSON failed the contract. Regenerate it from scratch. Return 3 to 5 topics, every topic must use a different concrete encyclopedia entry, and the final encyclopediaQuery values must be unique. Return JSON only.';
      }
    }
    throw new Error('Explore Planner failed to produce a valid plan');
  }
}
