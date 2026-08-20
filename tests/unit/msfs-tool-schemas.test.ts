import type { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { flightSnapshotResultSchema } from '../../src/msfs/guide-service.js';
import type { MsfsGuideService } from '../../src/msfs/guide-service.js';
import { createMsfsGuideTools } from '../../src/tools/msfs-guide.js';
import { defaultDesktopToolSettings } from '../../shared/desktop-settings.js';

const service = {} as MsfsGuideService;
const tools = createMsfsGuideTools(service) as llm.FunctionTool[];

describe('MSFS tool schemas', () => {
  it('exposes exactly seven high-level read-only tools', () => {
    expect(tools.map((tool) => tool.name)).toEqual([
      'getFlightSnapshot',
      'getLocationContext',
      'getRouteBrief',
      'getNextWaypoint',
      'getNearbyFacilities',
      'getWeatherAndSimTime',
      'getTrackHistory',
    ]);
    expect(tools.map((tool) => tool.name).join(' ')).not.toMatch(
      /executeCli|simvarGet|set|unsafe/iu,
    );
  });

  it('bounds nearby-facility type, radius and result count', () => {
    const tool = tools.find((entry) => entry.name === 'getNearbyFacilities');
    const parameters = tool?.parameters as z.ZodType;

    expect(parameters.safeParse({ type: 'airport', radiusNm: 50, limit: 10 }).success).toBe(true);
    expect(parameters.safeParse({ type: 'poi', radiusNm: 50, limit: 10 }).success).toBe(false);
    expect(parameters.safeParse({ type: 'airport', radiusNm: 500, limit: 10 }).success).toBe(false);
    expect(parameters.safeParse({ type: 'airport', radiusNm: 50, limit: 100 }).success).toBe(false);
  });

  it('keeps the autopilot write tool disabled by default and validates its high-level input', () => {
    const actionTools = createMsfsGuideTools(service, {
      ...defaultDesktopToolSettings,
      setAutopilot: true,
    }) as llm.FunctionTool[];
    const tool = actionTools.find((entry) => entry.name === 'setAutopilot');
    expect(tool).toBeDefined();
    const parameters = tool?.parameters as z.ZodType;

    expect(parameters.safeParse({ ap: true }).success).toBe(true);
    expect(
      parameters.safeParse({ verticalMode: 'VS', targetVerticalSpeedFpm: -500 }).success,
    ).toBe(true);
    expect(parameters.safeParse({}).success).toBe(false);
    expect(parameters.safeParse({ event: 'AP_MASTER' }).success).toBe(false);
  });

  it('rejects incomplete normalized flight snapshots', () => {
    expect(
      flightSnapshotResultSchema.safeParse({
        status: 'ok',
        source: 'native_simconnect',
        timestamp: new Date().toISOString(),
      }).success,
    ).toBe(false);
  });
});
