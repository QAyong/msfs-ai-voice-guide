import { describe, expect, it } from 'vitest';
import { aboutInfoSchema, aboutOpenLinkRequestSchema } from '../../shared/about-info.js';

describe('about info links', () => {
  it('accepts community links alongside tutorials', () => {
    const info = aboutInfoSchema.parse({
      schemaVersion: 1,
      productName: '晓晓飞行导游',
      version: '1.0',
      supportChannels: [],
      links: [
        {
          id: 'community',
          label: '加入 QQ 群',
          description: '群号 587441734',
          labelEn: 'Join QQ Group',
          descriptionEn: 'QQ Group 587441734',
          url: 'https://qm.qq.com/q/akr8v7IOP0',
          hostname: 'qm.qq.com',
        },
        {
          id: 'tutorial',
          label: '使用教程',
          labelEn: 'User Guide',
          descriptionEn: 'Application setup and usage instructions',
          url: 'https://my.feishu.cn/wiki/Q3DuwRSi3iYA72k79necSfkynWc',
          hostname: 'my.feishu.cn',
        },
      ],
    });

    expect(info.links.map((link) => link.id)).toEqual(['community', 'tutorial']);
    expect(aboutOpenLinkRequestSchema.parse({ id: 'community' })).toEqual({ id: 'community' });
  });
});
