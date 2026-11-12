import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { TranslocoLoader } from '@jsverse/transloco';
import { defer, firstValueFrom, map, throwError } from 'rxjs';

export const supportedLocales = ['zh-CN', 'en-US'] as const;
export type StudioLocale = (typeof supportedLocales)[number];
export function initialLocale(): StudioLocale {
  try {
    const value = localStorage.getItem('haven.locale');
    if (value === 'en-US' || value === 'zh-CN') return value;
  } catch {
    /* Storage is optional, including private browsing. */
  }
  return navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US';
}
@Injectable({ providedIn: 'root' })
export class TranslationLoader implements TranslocoLoader {
  getTranslation(language: string) {
    // Literal imports give each language a build-owned content hash while retaining lazy loading.
    const resources =
      language === 'zh-CN'
        ? () => import('../../../public/i18n/zh-CN.json')
        : language === 'en-US'
          ? () => import('../../../public/i18n/en-US.json')
          : undefined;
    if (!resources) return throwError(() => new Error('Unsupported locale'));
    return defer(resources).pipe(map((app) => app.default));
  }
}
@Injectable({ providedIn: 'root' })
export class StudioI18n {
  readonly #service = inject(TranslocoService);
  readonly #document = inject(DOCUMENT);
  readonly locale = this.#service.activeLang;
  #loadSequence = 0;
  async ready(): Promise<void> {
    await this.setLocale(this.locale());
  }
  async setLocale(locale: string): Promise<void> {
    if (!supportedLocales.includes(locale as StudioLocale)) return;
    const sequence = ++this.#loadSequence;
    await firstValueFrom(this.#service.load(locale));
    if (sequence !== this.#loadSequence) return;
    this.#service.setActiveLang(locale);
    this.#document.documentElement.lang = locale;
    const localeInfo = new Intl.Locale(locale) as Intl.Locale & {
      getTextInfo?: () => { direction: 'ltr' | 'rtl' };
    };
    this.#document.documentElement.dir = localeInfo.getTextInfo?.().direction ?? 'ltr';
    try {
      localStorage.setItem('haven.locale', locale);
    } catch {
      /* Do not prevent language switching when persistence is unavailable. */
    }
  }
  text(key: string, params?: Record<string, unknown>): string {
    this.locale();
    return this.#service.translate<string>(key, params);
  }
  textOr(key: string, fallback: string): string {
    this.locale();
    const catalog = this.#service.getTranslation(this.locale());
    return Object.hasOwn(catalog, key) ? this.#service.translate<string>(key) : fallback;
  }
  number(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(this.locale(), options).format(value);
  }
  timestamp(value: string): string {
    return this.date(new Date(value), { dateStyle: 'medium', timeStyle: 'short' });
  }
  date(value: Date | number, options?: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(this.locale(), options).format(value);
  }
}
