import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { StudioI18n } from './core/i18n';

/** Retirement notice only. This is not the replacement product or an Agent prototype. */
@Component({
  selector: 'haven-retired-workspace',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<main>
    <h1>Haven Studio</h1>
    <h2>{{ i18n.text('retired.title') }}</h2>
    <p>{{ i18n.text('retired.message') }}</p>
    <nav [attr.aria-label]="i18n.text('app.language')">
      <button
        type="button"
        [attr.aria-pressed]="i18n.locale() === 'zh-CN'"
        (click)="i18n.setLocale('zh-CN')"
      >
        简体中文
      </button>
      <button
        type="button"
        [attr.aria-pressed]="i18n.locale() === 'en-US'"
        (click)="i18n.setLocale('en-US')"
      >
        English
      </button>
    </nav>
  </main>`,
  styles: `
    main {
      max-inline-size: 44rem;
      margin: 8vh auto;
      padding: var(--haven-gap-xl);
    }
    p {
      line-height: 1.7;
    }
    nav {
      display: flex;
      flex-wrap: wrap;
      gap: var(--haven-gap-md);
    }
    button {
      padding: var(--haven-gap-sm) var(--haven-gap-md);
      color: inherit;
      background: transparent;
      border: 1px solid currentColor;
      border-radius: var(--mat-sys-corner-small);
      cursor: pointer;
    }
    button[aria-pressed='true'] {
      color: var(--mat-sys-primary);
    }
  `,
})
export class RetiredWorkspace {
  readonly i18n = inject(StudioI18n);
}
