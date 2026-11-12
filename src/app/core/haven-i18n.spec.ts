import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { of, firstValueFrom } from 'rxjs';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { HavenLocalization } from '@haven/ui';
import { provideHavenTransloco } from '@haven/ui/i18n';
import english from '@haven/ui/i18n/locales/en-US.json';
import chinese from '@haven/ui/i18n/locales/zh-CN.json';

class TestLoader {
  getTranslation(language: string) {
    const partialChinese: Record<string, string> = { ...chinese };
    delete partialChinese['validation.required'];
    return of({ haven: language === 'zh-CN' ? partialChinese : english });
  }
}
afterEach(() => TestBed.resetTestingModule());
describe('shared Transloco integration', () => {
  it('uses the framework fallback and active language for controls and isolated model captions', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideTransloco({
          config: {
            defaultLang: 'zh-CN',
            availableLangs: ['zh-CN', 'en-US'],
            fallbackLang: 'en-US',
            reRenderOnLangChange: true,
            prodMode: true,
            missingHandler: { useFallbackTranslation: true },
          },
          loader: TestLoader,
        }),
        provideHavenTransloco(),
      ],
    });
    const transloco = TestBed.inject(TranslocoService);
    await firstValueFrom(transloco.load('zh-CN'));
    const locale = TestBed.inject(HavenLocalization);
    expect(locale.error({ kind: 'required' })).toBe('This field is required');
    expect(locale.error({ kind: 'min' })).toBe('数值过小');
    const caption = { default: 'Default', translations: { 'zh-CN': '名称', 'en-US': 'Name' } };
    expect(locale.text(caption)).toBe('名称');
    transloco.setActiveLang('en-US');
    expect(locale.text(caption)).toBe('Name');
    expect(locale.error({ kind: 'min' })).toBe('The value is too small');
    expect(locale.text({ default: 'Other preview', translations: {} })).toBe('Other preview');
    expect(locale.text(caption)).toBe('Name');
    expect(locale.number(1234.5)).toBe('1,234.5');
    expect(Object.keys(english).sort()).toEqual(Object.keys(chinese).sort());
  });
});
