export type DesktopLocale = 'en-US' | 'zh-CN';

export const localizeDesktopText = (
  locale: DesktopLocale,
  english: string,
  chinese: string,
): string => (locale === 'en-US' ? english : chinese);
