import { resolve } from 'node:path';
import { loadConfig } from '../src/config/schema.js';
import { MsfsCliClient } from '../src/msfs/cli-client.js';
import {
  MsfsGuideService,
  type AutopilotActionResult,
  type SetAutopilotInput,
} from '../src/msfs/guide-service.js';
import { resolveMsfsCliPath } from '../src/msfs/path.js';

if (!process.argv.includes('--live')) {
  throw new Error('真实自动驾驶测试会改变模拟器状态，请使用 --live 明确确认。');
}

const config = loadConfig();
const service = new MsfsGuideService(
  new MsfsCliClient({
    executablePath: resolveMsfsCliPath({
      ...(config.msfs.cliPath ? { configuredPath: config.msfs.cliPath } : {}),
      developmentPath: resolve(import.meta.dirname, '..', 'dev-runtime', 'msfs-cli', 'msfs.exe'),
      cwd: resolve(import.meta.dirname, '..'),
    }),
    timeoutMs: config.msfs.timeoutMs,
    maxConcurrency: config.msfs.maxConcurrency,
    role: 'ai',
    onDiagnostic: (event) => process.stderr.write(`${JSON.stringify(event)}\n`),
  }),
  {
    trackIntervalMs: config.msfs.trackIntervalMs,
    trackMaximumPoints: config.msfs.trackMaximumPoints,
  },
);

const normalizeHeading = (value: number): number => {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const print = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`);

const runCase = async (
  name: string,
  request: SetAutopilotInput,
): Promise<AutopilotActionResult> => {
  const result = await service.setAutopilot(request);
  print({ case: name, request, result });
  return result;
};

try {
  const readiness = await service.warmup();
  print({ phase: 'readiness', result: readiness });
  if (readiness.status !== 'ready') {
    process.exitCode = 1;
  } else {
    const [initialState, snapshot] = await Promise.all([
      service.getAutopilotStatus(),
      service.getFlightSnapshot(),
    ]);
    print({ phase: 'initial', autopilot: initialState, flight: snapshot });

    if (initialState.status !== 'ok' || snapshot.status !== 'ok') {
      process.exitCode = 1;
    } else {
      const targetHeading = Math.round(normalizeHeading(snapshot.motion.headingTrueDegrees));
      const targetAltitude = Math.max(
        500,
        Math.round(snapshot.position.altitudeFeet / 100) * 100,
      );
      const targetSpeed = Math.max(60, Math.round(snapshot.motion.indicatedAirspeedKnots));
      const cases: Array<[string, SetAutopilotInput]> = [
        ['AP off', { ap: false }],
        ['FD on', { fd: true }],
        ['FD off', { fd: false }],
        ['AP on', { ap: true }],
        ['AP off', { ap: false }],
        ['FD off after AP', { fd: false }],
        ['HDG with current heading', {
          ap: true,
          lateralMode: 'HDG',
          targetHeadingDegrees: targetHeading,
        }],
        ['ALT with current altitude', {
          ap: true,
          verticalMode: 'ALT',
          targetAltitudeFeet: targetAltitude,
        }],
        ['VS positive', {
          ap: true,
          verticalMode: 'VS',
          targetVerticalSpeedFpm: 300,
        }],
        ['VS negative', {
          ap: true,
          verticalMode: 'VS',
          targetVerticalSpeedFpm: -300,
        }],
        ['FLC with current speed', {
          ap: true,
          verticalMode: 'FLC',
          targetSpeedKnots: targetSpeed,
        }],
        ['NAV', { ap: true, lateralMode: 'NAV' }],
        ['combined HDG and ALT', {
          ap: true,
          lateralMode: 'HDG',
          targetHeadingDegrees: targetHeading,
          verticalMode: 'ALT',
          targetAltitudeFeet: targetAltitude,
        }],
      ];

      let stopped = false;
      for (const [name, request] of cases) {
        if (stopped) break;
        const result = await runCase(name, request);
        if (result.status === 'partial' || result.status === 'unavailable') stopped = true;
      }

      if (!stopped) {
        const restored = await service.setAutopilot({
          ap: initialState.active.autopilot,
          fd: initialState.active.flightDirector,
        });
        print({ phase: 'restore-switches', result: restored });
        if (restored.status === 'partial' || restored.status === 'unavailable') {
          process.exitCode = 1;
        }
      } else {
        process.exitCode = 1;
      }
    }
  }
} finally {
  await service.close();
}
