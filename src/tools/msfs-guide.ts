import { llm } from '@livekit/agents';
import { z } from 'zod';
import type { MsfsGuideService } from '../msfs/guide-service.js';

const noParameters = z.object({}).strict();

const nearbyParameters = z.object({
  type: z
    .enum(['airport', 'waypoint', 'ndb', 'vor'])
    .describe('要查询的航空设施类型：机场、航点、NDB 或 VOR。'),
  radiusNm: z
    .number()
    .min(1)
    .max(200)
    .default(50)
    .describe('搜索半径，单位为海里，允许 1 到 200。'),
  limit: z.number().int().min(1).max(25).default(10).describe('最多返回的设施数量。'),
});

const trackParameters = z.object({
  limit: z.number().int().min(2).max(120).default(30).describe('返回最近多少个低频轨迹点。'),
});

export function createMsfsGuideTools(service: MsfsGuideService): readonly llm.ToolContextEntry[] {
  return [
    llm.tool({
      name: 'getFlightSnapshot',
      description:
        '读取当前 MSFS 飞机的真实飞行快照，包括位置、高度、速度、姿态、航向、地面状态和飞机标识。只在需要当前模拟器状态时调用。',
      parameters: noParameters,
      execute: async (_args, { abortSignal }) => service.getFlightSnapshot(abortSignal),
    }),
    llm.tool({
      name: 'getLocationContext',
      description:
        '根据当前飞机位置获取国家、城市、自然地貌和游戏内 POI。结果来自外部 Geo Cloud，不能表述为 SimConnect 原生数据。',
      parameters: noParameters,
      execute: async (_args, { abortSignal }) => service.getLocationContext(abortSignal),
    }),
    llm.tool({
      name: 'getRouteBrief',
      description:
        '读取 MSFS 2024 EFB 当前航路概览，包括出发地、目的地、程序、巡航高度和航路点。EFB Planned Route 是唯一权威航路来源。',
      parameters: noParameters,
      execute: async (_args, { abortSignal }) => service.getRouteBrief(abortSignal),
    }),
    llm.tool({
      name: 'getNextWaypoint',
      description:
        '结合 EFB Planned Route 与受控 GPS 下一航点读取，回答当前下一航点及其在航路中的信息。无航路或桥接模块不可用时会返回明确状态。',
      parameters: noParameters,
      execute: async (_args, { abortSignal }) => service.getNextWaypoint(abortSignal),
    }),
    llm.tool({
      name: 'getNearbyFacilities',
      description:
        '从 MSFS 原生设施接口查询当前飞机附近的机场、航点、NDB 或 VOR。不得将普通网页 POI 当作航空设施结果。',
      parameters: nearbyParameters,
      execute: async ({ type, radiusNm, limit }, { abortSignal }) =>
        service.getNearbyFacilities(type, radiusNm, limit, abortSignal),
    }),
    llm.tool({
      name: 'getWeatherAndSimTime',
      description:
        '读取 MSFS 游戏内环境与模拟器时间，包括温度、风、气压、能见度和游戏内时刻。这不是实时网络天气。',
      parameters: noParameters,
      execute: async (_args, { abortSignal }) => service.getWeatherAndSimTime(abortSignal),
    }),
    llm.tool({
      name: 'getTrackHistory',
      description:
        '返回本次 Agent 会话内低频维护的有限飞行轨迹，用于回答刚才飞过哪里。不会读取上一会话或外部历史。',
      parameters: trackParameters,
      execute: async ({ limit }) => service.getTrackHistory(limit),
    }),
  ];
}
