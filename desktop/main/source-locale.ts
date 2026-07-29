export type SourceLocale = 'en-US' | 'zh-CN';

export function sourceAcceptLanguage(locale: SourceLocale): string {
  return locale === 'en-US'
    ? 'en-US,en;q=0.9,zh-CN;q=0.5,zh;q=0.4'
    : 'zh-CN,zh;q=0.9,en-US;q=0.5,en;q=0.4';
}

export function withSourceAcceptLanguage(
  headers: Record<string, string>,
  locale: SourceLocale,
): Record<string, string> {
  const withoutExistingLanguage = Object.fromEntries(
    Object.entries(headers).filter(([name]) => name.toLowerCase() !== 'accept-language'),
  );
  return { ...withoutExistingLanguage, 'Accept-Language': sourceAcceptLanguage(locale) };
}
