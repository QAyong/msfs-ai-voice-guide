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
  it('keeps valid source metadata and removes duplicate URLs', () => {
    const source = {
      title: '苏黎世湖',
      siteName: 'Wikipedia',
      url: 'https://zh.wikipedia.org/wiki/苏黎世湖',
      summary: '湖泊资料',
      content: '不应发送给桌面端的长正文',
    };
    const message = extractGuideSources(
      createEvent({ status: 'ok', requestId: 'request-1', sources: [source, { ...source }] }),
    );

    expect(message).toEqual({
      type: 'guide.sources',
      query: '苏黎世湖',
      requestId: 'request-1',
      sources: [
        {
          rank: 1,
          title: '苏黎世湖',
          siteName: 'Wikipedia',
          url: new URL(source.url).toString(),
          openMode: 'in_app',
          summary: '湖泊资料',
        },
      ],
    });
    expect(JSON.stringify(message)).not.toContain('长正文');
  });

  it('cleans each source independently and keeps HTTP sources in the app', () => {
    expect(
      extractGuideSources(
        createEvent({
          status: 'ok',
          sources: [
            { title: '', siteName: '', url: 'http://example.com/article', summary: '有效摘要' },
            { title: '坏协议', siteName: 'bad', url: 'javascript:alert(1)', summary: '坏项' },
            { title: '缺少地址', siteName: 'bad', summary: '坏项' },
          ],
        }),
      ),
    ).toMatchObject({
      sources: [
        {
          rank: 1,
          title: 'example.com',
          siteName: 'example.com',
          url: 'http://example.com/article',
          openMode: 'in_app',
        },
      ],
    });
  });

  it('does not publish unsuccessful search output', () => {
    expect(extractGuideSources(createEvent({ status: 'no_results', sources: [] }))).toBeNull();
  });
});
