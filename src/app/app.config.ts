import { provideTransloco } from '@jsverse/transloco';
import { initialLocale, StudioI18n, TranslationLoader } from './core/i18n';
import {
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    provideTransloco({
      config: {
        availableLangs: ['zh-CN', 'en-US'],
        defaultLang: initialLocale(),
        fallbackLang: 'en-US',
        missingHandler: { useFallbackTranslation: true, allowEmpty: true },
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslationLoader,
    }),
    provideAppInitializer(() => inject(StudioI18n).ready()),
    provideRouter(routes),
  ],
};
