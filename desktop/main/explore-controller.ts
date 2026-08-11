import type {
  ExploreRequest,
  ExploreResponse,
  ExploreResult,
} from '../../shared/explore-contracts.js';
import type { ExploreService } from '../../src/explore/service.js';
import type { MsfsExploreContext } from '../../src/msfs/explore-context.js';
import { localizeDesktopText } from '../../shared/desktop-locale.js';

const movementThresholdMeters = 10_000;

type LastSuccess = {
  conversationFingerprint: string;
  msfsFingerprint: string | null;
  result: ExploreResult;
};

const compact = (value: string) => value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();

export const conversationFingerprint = (request: ExploreRequest) =>
  request.recentConversation
    .map((message) => `${message.id}:${message.role}:${compact(message.text)}`)
    .join('|');

const distanceMeters = (
  first: MsfsExploreContext['position'],
  second: MsfsExploreContext['position'],
) => {
  if (!first || !second) return 0;
  const radius = 6_371_000;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitude = radians(second.latitude - first.latitude);
  const longitude = radians(second.longitude - first.longitude);
  const a =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(longitude / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const humanPlace = (context: MsfsExploreContext) =>
  [context.place?.country, context.place?.region, context.place?.city, context.place?.locality]
    .filter((value): value is string => Boolean(value))
    .map(compact)
    .join('|');

const routePlace = (context: MsfsExploreContext) =>
  [context.route?.originIcao, context.route?.destinationIcao]
    .filter((value): value is string => Boolean(value))
    .map(compact)
    .join('|');

const msfsFingerprint = (context: MsfsExploreContext | undefined) =>
  context ? `${humanPlace(context)}#${routePlace(context)}` : null;

const hasSignificantMsfsChange = (
  previous: MsfsExploreContext | undefined,
  current: MsfsExploreContext | undefined,
) => {
  if (!previous || !current) return false;
  if (humanPlace(previous) !== humanPlace(current) || routePlace(previous) !== routePlace(current))
    return true;
  return distanceMeters(previous.position, current.position) >= movementThresholdMeters;
};

export type ExploreControllerDependencies = {
  createService(): Promise<ExploreService | null>;
  getMsfsContext(signal: AbortSignal): Promise<MsfsExploreContext | undefined>;
  present(result: ExploreResult): Promise<boolean>;
};

export class ExploreController {
  private active: AbortController | null = null;
  private last: (LastSuccess & { msfs: MsfsExploreContext | undefined }) | null = null;

  constructor(private readonly dependencies: ExploreControllerDependencies) {}

  cancel(): void {
    this.active?.abort();
  }

  private refreshCachedMsfsContext(
    conversation: string,
    contextPromise: Promise<MsfsExploreContext | undefined>,
  ): void {
    void contextPromise
      .then((msfs) => {
        if (!this.last || this.last.conversationFingerprint !== conversation) return;
        if (hasSignificantMsfsChange(this.last.msfs, msfs)) {
          this.last = null;
          return;
        }
        this.last = {
          ...this.last,
          msfs,
          msfsFingerprint: msfsFingerprint(msfs),
        };
      })
      .catch(() => undefined);
  }

  async execute(request: ExploreRequest): Promise<ExploreResponse> {
    if (this.active) {
      return {
        ok: false,
        code: 'busy',
        message: localizeDesktopText(
          request.locale,
          'Exploration is already in progress.',
          '探索正在进行中。',
        ),
      };
    }
    const controller = new AbortController();
    this.active = controller;
    try {
      const conversation = conversationFingerprint(request);
      const msfsPromise = this.dependencies.getMsfsContext(controller.signal);
      const recentConversation = request.recentConversation.length
        ? request.recentConversation.map(({ role, text }) => ({ role, text }))
        : undefined;

      if (
        request.recentConversation.length &&
        this.last?.conversationFingerprint === conversation
      ) {
        this.refreshCachedMsfsContext(conversation, msfsPromise);
        await this.dependencies.present(this.last.result);
        return { ok: true, result: this.last.result, reused: true };
      }

      const msfs = await msfsPromise.catch(() => undefined);
      if (!recentConversation && !msfs) {
        return {
          ok: false,
          code: 'no_context',
          message: localizeDesktopText(
            request.locale,
            'There is no conversation or flight context to explore yet.',
            '当前没有可用于探索的对话或飞行上下文。',
          ),
        };
      }
      if (request.recentConversation.length)
        this.refreshCachedMsfsContext(conversation, msfsPromise);
      const service = await this.dependencies.createService();
      if (!service) {
        return {
          ok: false,
          code: 'configuration',
          message: localizeDesktopText(
            request.locale,
            'The exploration planner is not configured. Add a DeepSeek API key in Settings.',
            '探索规划服务尚未配置，请在设置中填写 DeepSeek API Key。',
          ),
        };
      }
      const result = await service.explore(
        {
          ...(recentConversation ? { recentConversation } : {}),
          ...(msfs ? { msfs } : {}),
          preferences: request.preferences,
          locale: request.locale,
        },
        controller.signal,
      );
      this.last = {
        conversationFingerprint: conversation,
        msfsFingerprint: msfsFingerprint(msfs),
        msfs,
        result,
      };
      await this.dependencies.present(result);
      return { ok: true, result, reused: false };
    } catch (error) {
      if (controller.signal.aborted) {
        return {
          ok: false,
          code: 'cancelled',
          message: localizeDesktopText(request.locale, 'Exploration cancelled.', '探索已取消。'),
        };
      }
      return {
        ok: false,
        code: 'planner_failed',
        message:
          error instanceof Error && error.message.includes('Planner')
            ? localizeDesktopText(
                request.locale,
                'The exploration topics could not be generated.',
                '本次无法生成探索主题。',
              )
            : localizeDesktopText(
                request.locale,
                'Exploration is temporarily unavailable. Try again later.',
                '本次探索暂时不可用，请稍后重试。',
              ),
      };
    } finally {
      if (this.active === controller) this.active = null;
    }
  }
}
