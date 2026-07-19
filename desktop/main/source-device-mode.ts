import type { SourceDeviceMode } from '../../shared/source-preview.js';

export const ipadViewportWidth = 768;
export const ipadScreenSize = { width: 768, height: 1024 } as const;

export function getIpadDeviceMetrics(availableWidth: number, availableHeight: number) {
  const width = Math.max(1, availableWidth);
  const height = Math.max(1, availableHeight);
  const scale = width / ipadViewportWidth;
  return {
    width: ipadViewportWidth,
    height: Math.max(1, Math.round(height / scale)),
    deviceScaleFactor: 2,
    mobile: true,
    scale,
    screenWidth: ipadScreenSize.width,
    screenHeight: ipadScreenSize.height,
    positionX: 0,
    positionY: 0,
    screenOrientation: { type: 'portraitPrimary', angle: 0 },
  };
}

export function getSourceUserAgent(mode: SourceDeviceMode, chromeVersion: string): string {
  if (mode === 'ipad') {
    return 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  }
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
}
