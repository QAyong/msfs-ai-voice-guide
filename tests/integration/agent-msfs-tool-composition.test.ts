import type { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import { composeGuideTools } from '../../src/agent/guide-agent.js';
import type { MsfsGuideService } from '../../src/msfs/guide-service.js';
import { createMsfsGuideTools } from '../../src/tools/msfs-guide.js';
import { createSearchWebTool } from '../../src/tools/search-web.js';
import type { SearchService } from '../../src/search/service.js';
import { defaultDesktopToolSettings } from '../../shared/desktop-settings.js';

describe('default agent MSFS tool composition', () => {
  it('contains seven MSFS tools plus the existing searchWeb tool', () => {
    const msfsTools = createMsfsGuideTools({} as MsfsGuideService);
    const search = createSearchWebTool({} as SearchService);
    const tools = composeGuideTools(msfsTools, search) as llm.FunctionTool[];

    expect(tools).toHaveLength(8);
    expect(tools.map((tool) => tool.name)).toContain('searchWeb');
    expect(tools.filter((tool) => tool.name.startsWith('get'))).toHaveLength(7);
  });

  it('removes disabled tools from the Agent tool list', () => {
    const msfsTools = createMsfsGuideTools({} as MsfsGuideService, {
      ...defaultDesktopToolSettings,
      getRouteBrief: false,
      searchWeb: false,
    });
    const search = createSearchWebTool({} as SearchService);
    const tools = composeGuideTools(msfsTools, undefined) as llm.FunctionTool[];

    expect(tools.map((tool) => tool.name)).not.toContain('getRouteBrief');
    expect(tools.map((tool) => tool.name)).toHaveLength(6);
    expect(search.name).toBe('searchWeb');
  });
});
