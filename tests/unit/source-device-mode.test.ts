import { describe, expect, it } from 'vitest';
import {
  getIpadDeviceMetrics,
  getSourceUserAgent,
  ipadScreenSize,
  ipadViewportWidth,
} from '../../desktop/main/source-device-mode.js';

describe('source preview device mode', () => {
  it('fits a 768px iPad viewport into the available source view', () => {
    expect(getIpadDeviceMetrics(384, 512)).toEqual({
      width: ipadViewportWidth,
      height: 1024,
      deviceScaleFactor: 2,
      mobile: true,
      scale: 0.5,
      screenWidth: ipadScreenSize.width,
      screenHeight: ipadScreenSize.height,
      positionX: 0,
      positionY: 0,
      screenOrientation: { type: 'portraitPrimary', angle: 0 },
    });
  });

  it('recalculates visible iPad height when the companion window is resized', () => {
    expect(getIpadDeviceMetrics(480, 600)).toMatchObject({
      width: 768,
      height: 960,
      scale: 0.625,
    });
  });

  it('uses distinct iPad and Windows browser identities', () => {
    expect(getSourceUserAgent('ipad', '140.0.0.0')).toContain('iPad');
    expect(getSourceUserAgent('desktop', '140.0.0.0')).toContain('Windows NT 10.0; Win64; x64');
    expect(getSourceUserAgent('desktop', '140.0.0.0')).toContain('Chrome/140.0.0.0');
  });
});
