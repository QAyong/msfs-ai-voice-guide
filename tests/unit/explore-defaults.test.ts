import { describe, expect, it } from 'vitest';
import { defaultExploreVideoPlatforms } from '../../shared/explore-defaults.js';

describe('explore video defaults', () => {
  it('uses domestic platforms for Chinese locale', () => {
    expect(defaultExploreVideoPlatforms('zh-CN')).toEqual(['bilibili']);
  });

  it('uses YouTube for English locale', () => {
    expect(defaultExploreVideoPlatforms('en-US')).toEqual(['youtube']);
  });
});
