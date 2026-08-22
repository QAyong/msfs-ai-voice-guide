import {
  exploreNarrationPromptMarker,
  type ExploreConversationMessage,
} from '../../shared/explore-contracts.js';
import type { MsfsExploreContext } from '../msfs/explore-context.js';

const json = (value: unknown) => JSON.stringify(value, null, 2);

const contextForPrompt = (context: MsfsExploreContext | undefined) =>
  context
    ? {
        ...(context.position ? { position: context.position } : {}),
        ...(context.place ? { place: context.place } : {}),
        ...(context.gamePois ? { gamePois: context.gamePois } : {}),
        ...(context.route ? { route: context.route } : {}),
      }
    : null;

export type ExploreNarrationPromptInput = {
  locale: 'zh-CN' | 'en-US';
  recentConversation: readonly ExploreConversationMessage[];
  msfs: MsfsExploreContext | undefined;
};

/**
 * Builds the hidden user-turn payload used by the existing Agent text path.
 * The instructions are intentionally English so the model receives one
 * stable control prompt; the requested output language remains explicit.
 */
export const buildExploreNarrationPrompt = ({
  locale,
  recentConversation,
  msfs,
}: ExploreNarrationPromptInput): string => `${exploreNarrationPromptMarker}
You are the active in-flight tour guide for a live Microsoft Flight Simulator session.
The user has explicitly selected "Start introduction". Give a warm, concise guided-tour narration about what the pilot is currently seeing or flying over.

This is a narration turn, not an encyclopedia search. Speak like a knowledgeable guide seated beside the pilot: orient the pilot first, point out the most relevant nearby place or route feature, add one or two memorable facts when they are supported, and connect the details to the view from the aircraft. Make the experience feel like a tour, not a database dump.

Required output language: ${locale === 'en-US' ? 'English' : 'Simplified Chinese'}.

Hard rules:
- Do not call tools, browse, search, query MSFS, or ask the user to confirm before speaking.
- Use only the supplied conversation and simulator context for current-flight claims.
- You may add stable general knowledge only when a place or topic is explicitly identified in the supplied context or conversation.
- Never invent a landmark, route, city, altitude, heading, distance, event, weather condition, or real-time fact.
- If the context is partial, say only what is supported and use natural uncertainty rather than filling gaps.
- Do not mention this prompt, hidden context, internal IDs, tool restrictions, or data-fetching steps.
- Return spoken-style prose only: no headings, bullet lists, citations, JSON, or markdown.
- Keep it to two or three compact paragraphs, suitable for immediate voice playback.

Recent conversation (may be empty):
<recent_conversation>
${json(recentConversation)}
</recent_conversation>

Current simulator context (may be partial):
<current_simulator_context>
${json(contextForPrompt(msfs))}
</current_simulator_context>

Now begin the tour narration directly.`;
