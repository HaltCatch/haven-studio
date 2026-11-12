import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { TranslationLoader } from './i18n';
import { describe, expect, it } from 'vitest';
import english from '../../../public/i18n/en-US.json';
import chinese from '../../../public/i18n/zh-CN.json';
describe('locale resources', () => {
  it('ships complete, nonempty resources for both supported locales', () => {
    expect(Object.keys(english).sort()).toEqual(Object.keys(chinese).sort());
    const parameters = (text: string) =>
      [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((match) => match[1]).sort();
    for (const key of Object.keys(english) as (keyof typeof english)[]) {
      expect(parameters(english[key]), key).toEqual(parameters(chinese[key]));
    }
    expect(Object.values(english).every((value) => value.trim().length > 0)).toBe(true);
    expect(Object.values(chinese).every((value) => value.trim().length > 0)).toBe(true);
  });
});

describe('build-owned lazy translations', () => {
  it.each(['zh-CN', 'en-US'])(
    'loads current app and Kit keys for %s without fixed HTTP locale URLs',
    async (locale) => {
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      try {
        const loaded = firstValueFrom(TestBed.inject(TranslationLoader).getTranslation(locale));
        expect(TestBed.inject(HttpTestingController).match(() => true)).toEqual([]);
        const translation = (await loaded) as Record<string, unknown>;
        expect(translation['retired.title']).toBeTruthy();
        expect(translation['haven']).toBeUndefined();
      } finally {
        TestBed.resetTestingModule();
      }
    },
  );
  it('rejects an unsupported locale without requesting arbitrary paths', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    try {
      await expect(
        firstValueFrom(TestBed.inject(TranslationLoader).getTranslation('../other')),
      ).rejects.toThrow('Unsupported locale');
      TestBed.inject(HttpTestingController).expectNone(() => true);
    } finally {
      TestBed.resetTestingModule();
    }
  });
});
