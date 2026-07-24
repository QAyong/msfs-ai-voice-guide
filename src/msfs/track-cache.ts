import { trackPointSchema, type TrackPoint } from './schemas.js';

export class MsfsTrackCache {
  private readonly points: TrackPoint[] = [];

  constructor(private readonly maximumPoints: number) {}

  add(value: TrackPoint): void {
    const point = trackPointSchema.parse(value);
    const previous = this.points.at(-1);
    if (
      previous &&
      previous.latitude === point.latitude &&
      previous.longitude === point.longitude &&
      previous.altitudeFeet === point.altitudeFeet
    ) {
      return;
    }
    this.points.push(point);
    if (this.points.length > this.maximumPoints) {
      this.points.splice(0, this.points.length - this.maximumPoints);
    }
  }

  list(limit = this.maximumPoints): TrackPoint[] {
    return this.points.slice(-Math.max(0, Math.min(limit, this.maximumPoints)));
  }

  clear(): void {
    this.points.length = 0;
  }

  get size(): number {
    return this.points.length;
  }
}
