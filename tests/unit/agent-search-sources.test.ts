import { llm, voice } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import { extractGuideSources } from '../../src/agent/search-source-events.js';

const createEvent = (output: unknown): voice.FunctionToolsExecutedEvent => ({
  type: 'function_tools_executed',
  createdAt: Date.now(),
  functionCalls: [
    new llm.FunctionCall({
      callId: 'call-1',
      name: 'searchWeb',
      args: JSON.stringify({ query: '苏黎世湖' }),
    }),
  ],
  functionCallOutputs: [
    new llm.FunctionCallOutput({
      callId: 'call-1',
      output: JSON.stringify(output),
      isError: false,
    }),
  ],
});

describe('agent search source events', () => {
  it('keeps valid HTTPS source metadata and removes duplicate URLs', () => {
    const source = {
      title: '苏黎世湖',
      siteName: 'Wikipedia',
      url: 'https://zh.wikipedia.org/wiki/苏黎世湖',
      summary: '湖泊资料',
      content: '不应发送给桌面端的长正文',
    };
    const message = extractGuideSources(
      createEvent({ status: 'ok', sources: [source, { ...source }] }),
    );

    expect(message).toEqual({
      type: 'guide.sources',
      query: '苏黎世湖',
      sources: [
        {
          title: '苏黎世湖',
          siteName: 'Wikipedia',
          url: source.url,
          summary: '湖泊资料',
        },
      ],
    });
    expect(JSON.stringify(message)).not.toContain('长正文');
  });

  it('does not publish invalid, insecure, or unsuccessful search output', () => {
    expect(
      extractGuideSources(
        createEvent({
          status: 'ok',
          sources: [{ title: '不安全', siteName: 'example', url: 'http://example.com' }],
        }),
      ),
    ).toBeNull();
    expect(extractGuideSources(createEvent({ status: 'no_results', sources: [] }))).toBeNull();
  });
});
