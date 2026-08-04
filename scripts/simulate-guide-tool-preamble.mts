import { initializeLogger, llm } from '@livekit/agents';
import { loadConfig, loadSearchConfig } from '../src/config/schema.js';
import { createGuideAgent } from '../src/agent/guide-agent.js';
import type { GuideLocale } from '../src/conversation/guide-instructions.js';
import { createDeepSeekLLM } from '../src/providers/llm/deepseek.js';
import { SearchService } from '../src/search/service.js';
import { createSearchWebTool } from '../src/tools/search-web.js';

type SimulationCase = {
  name: string;
  locale: GuideLocale;
  query: string;
  expectsTool: boolean;
};

type SimulationReport = {
  name: string;
  locale: GuideLocale;
  query: string;
  firstResponseText: string;
  firstResponseHasToolCall: boolean;
  preambleDetected: boolean;
  toolCalls: Array<{
    name: string;
    query?: string;
    status: string;
    sourceCount?: number;
  }>;
  finalResponseText: string;
};

initializeLogger({ pretty: false, level: 'silent' });

const simulationCases: readonly SimulationCase[] = [
  {
    name: '中文联网问题',
    locale: 'zh-CN',
    query: '请联网查一下长沙的历史文化和著名景点，然后用两句话介绍。',
    expectsTool: true,
  },
  {
    name: 'English web question',
    locale: 'en-US',
    query: "Please check the web and briefly introduce Changsha's history and culture.",
    expectsTool: true,
  },
  {
    name: '中文普通问题',
    locale: 'zh-CN',
    query: '请用一句话解释什么是 VOR 导航。',
    expectsTool: false,
  },
  {
    name: 'English ordinary question',
    locale: 'en-US',
    query: 'In one sentence, what is a VOR navigation aid?',
    expectsTool: false,
  },
];

function instructionText(instructions: string | { value?: unknown }): string {
  if (typeof instructions === 'string') return instructions;
  return typeof instructions.value === 'string' ? instructions.value : String(instructions);
}

function truncate(value: string, maximumLength = 320): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= maximumLength
    ? normalized
    : `${normalized.slice(0, maximumLength - 1)}…`;
}

async function collectResponse(
  model: ReturnType<typeof createDeepSeekLLM>,
  chatCtx: llm.ChatContext,
  toolCtx: llm.ToolContext,
): Promise<llm.CollectedResponse> {
  return model.chat({ chatCtx, toolCtx, toolChoice: 'auto' }).collect();
}

async function executeToolCalls(
  response: llm.CollectedResponse,
  chatCtx: llm.ChatContext,
  toolCtx: llm.ToolContext,
  report: SimulationReport,
): Promise<void> {
  const calls = response.toolCalls.map((call) =>
    llm.FunctionCall.create({
      callId: call.callId,
      name: call.name,
      args: call.args,
    }),
  );
  const outputs: llm.FunctionCallOutput[] = [];

  for (const call of response.toolCalls) {
    const tool = toolCtx.getFunctionTool(call.name);
    if (!tool) throw new Error(`模拟发现未注册工具：${call.name}`);

    const args = JSON.parse(call.args) as { query?: unknown };
    const result = await tool.execute(args, {
      ctx: undefined as never,
      toolCallId: call.callId,
      abortSignal: AbortSignal.timeout(30_000),
    });
    const resultRecord =
      result && typeof result === 'object'
        ? (result as { status?: unknown; sources?: unknown })
        : {};
    report.toolCalls.push({
      name: call.name,
      ...(typeof args.query === 'string' ? { query: args.query } : {}),
      status: typeof resultRecord.status === 'string' ? resultRecord.status : 'unknown',
      ...(Array.isArray(resultRecord.sources) ? { sourceCount: resultRecord.sources.length } : {}),
    });
    outputs.push(
      llm.FunctionCallOutput.create({
        callId: call.callId,
        name: call.name,
        output: JSON.stringify(result),
        isError: false,
      }),
    );
  }

  if (response.text) {
    chatCtx.addMessage({ role: 'assistant', content: response.text });
  }
  chatCtx.insert([...calls, ...outputs]);
}

async function runCase(
  model: ReturnType<typeof createDeepSeekLLM>,
  searchService: SearchService,
  simulationCase: SimulationCase,
): Promise<SimulationReport> {
  const searchTool = createSearchWebTool(searchService, simulationCase.locale);
  const agent = createGuideAgent([searchTool], simulationCase.locale);
  const chatCtx = llm.ChatContext.empty();
  chatCtx.addMessage({
    role: 'system',
    content: instructionText(agent.instructions),
  });
  chatCtx.addMessage({ role: 'user', content: simulationCase.query });

  const report: SimulationReport = {
    name: simulationCase.name,
    locale: simulationCase.locale,
    query: simulationCase.query,
    firstResponseText: '',
    firstResponseHasToolCall: false,
    preambleDetected: false,
    toolCalls: [],
    finalResponseText: '',
  };

  let response = await collectResponse(model, chatCtx, agent.toolCtx);
  report.firstResponseText = truncate(response.text);
  report.firstResponseHasToolCall = response.toolCalls.length > 0;
  report.preambleDetected = response.text.length > 0 && response.toolCalls.length > 0;

  for (let step = 0; step < 3 && response.toolCalls.length > 0; step += 1) {
    await executeToolCalls(response, chatCtx, agent.toolCtx, report);
    response = await collectResponse(model, chatCtx, agent.toolCtx);
  }
  report.finalResponseText = truncate(response.text);

  if (simulationCase.expectsTool && !report.firstResponseHasToolCall) {
    throw new Error(`模拟用例“${simulationCase.name}”没有触发工具调用。`);
  }
  if (!simulationCase.expectsTool && report.firstResponseHasToolCall) {
    throw new Error(`模拟用例“${simulationCase.name}”意外触发了工具调用。`);
  }
  return report;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const agentModel = createDeepSeekLLM(config.llm);
  const searchService = new SearchService(loadSearchConfig());
  const reports: SimulationReport[] = [];

  for (const simulationCase of simulationCases) {
    reports.push(await runCase(agentModel, searchService, simulationCase));
  }

  console.log(
    JSON.stringify(
      {
        model: config.llm.model,
        provider: config.search.provider,
        reports,
        preambleCount: reports.filter((report) => report.preambleDetected).length,
        toolCaseCount: reports.filter((report) => report.firstResponseHasToolCall).length,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '导游工具话术模拟失败。');
  process.exitCode = 1;
});
