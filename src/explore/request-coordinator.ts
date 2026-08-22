export type ExploreRequestKind = 'encyclopedia' | 'narration';

/**
 * Keeps the two Explore menu actions mutually exclusive for one desktop
 * session. The coordinator owns cancellation so both flows cannot race over
 * the same MSFS context read.
 */
export class ExploreRequestCoordinator {
  private active: { controller: AbortController; kind: ExploreRequestKind } | null = null;

  tryBegin(kind: ExploreRequestKind): AbortController | null {
    if (this.active) return null;
    const controller = new AbortController();
    this.active = { controller, kind };
    return controller;
  }

  finish(controller: AbortController): void {
    if (this.active?.controller === controller) this.active = null;
  }

  cancel(kind?: ExploreRequestKind): boolean {
    if (!this.active || (kind && this.active.kind !== kind)) return false;
    this.active.controller.abort();
    return true;
  }

  get activeKind(): ExploreRequestKind | null {
    return this.active?.kind ?? null;
  }
}
