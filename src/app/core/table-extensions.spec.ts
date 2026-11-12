import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { HavenLocalization } from '@haven/ui';
import { provideHavenTransloco } from '@haven/ui/i18n';
import { HavenThemeDirective } from '@haven/ui/theme';
import { HavenRenderer, provideHavenRendererHost } from '@haven/ui/renderer';
import {
  HavenTable,
  createHavenTableCellRenderers,
  provideHavenTableCellRenderers,
} from '@haven/ui/table';
import type { HavenTableCellContext, HavenTableCellRenderers } from '@haven/ui/table';
import type { HavenDocument, HavenTheme, JsonObject, TableColumn } from '@haven/schema';
import english from '@haven/ui/i18n/locales/en-US.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

@Component({
  selector: 'haven-test-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span>{{ label() }}</span>`,
})
class BadgeCell {
  static destroyed = 0;
  readonly context = input.required<HavenTableCellContext>();
  readonly localization = inject(HavenLocalization);
  readonly label = computed(() => {
    const context = this.context();
    return `${context.params['prefix']} ${typeof context.value === 'number' ? this.localization.number(context.value) : ''} ${context.locale} ${context.theme?.mode ?? 'none'}`;
  });
  constructor() {
    inject(DestroyRef).onDestroy(() => BadgeCell.destroyed++);
  }
}
@Component({
  selector: 'haven-test-alternate-cell',
  template: `<strong>Alternate {{ context().value }}</strong>`,
})
class AlternateCell {
  readonly context = input.required<HavenTableCellContext>();
}
@Component({ template: '<span>Missing input</span>' })
class MissingContextCell {}
const registry = () =>
  createHavenTableCellRenderers([
    ['sample.badge', BadgeCell],
    ['sample.alternate', AlternateCell],
  ]);
const columns: TableColumn[] = [
  {
    id: 'amount',
    header: 'Amount',
    path: '/amount',
    type: 'number',
    renderer: 'sample.badge',
    rendererParams: { prefix: 'Value', nested: { safe: true } },
  },
];
@Component({
  imports: [HavenTable, HavenThemeDirective],
  template: `<div [havenTheme]="theme()">
    <haven-table [rows]="rows()" [columns]="columns()" [cellRenderers]="overrides()" /><haven-table
      [rows]="rows()"
      [columns]="columns()"
    />
  </div>`,
})
class DirectHost {
  readonly rows = signal<JsonObject[]>([{ id: 0, amount: 10, nested: { note: 'source' } }]);
  readonly columns = signal(columns);
  readonly overrides = signal<HavenTableCellRenderers | undefined>(undefined);
  readonly theme = signal<HavenTheme>({
    preset: 'liquid-glass',
    mode: 'light',
    density: 'comfortable',
  });
}
@Component({
  imports: [HavenRenderer],
  template: '<haven-renderer [document]="document" [value]="value" />',
})
class ModelHost {
  readonly document: HavenDocument = {
    schemaVersion: '1.0',
    id: 'cell-model',
    title: 'Custom cells',
    dataSchema: {
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'number' }, amount: { type: 'number' } },
          },
        },
      },
    },
    ui: {
      id: 'root',
      kind: 'table',
      version: 1,
      bind: '/rows',
      props: { columns: columns as unknown as JsonObject[], rowKey: '/id' },
    },
    theme: { preset: 'liquid-glass', mode: 'light', density: 'comfortable' },
    actions: {},
    resources: {},
  };
  readonly value = { rows: [{ id: 0, amount: 42 }] };
}
beforeEach(() => {
  BadgeCell.destroyed = 0;
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US', 'sv-SE'], prodMode: true },
      }),
      provideHavenTransloco(),
      provideHavenTableCellRenderers(registry()),
      provideHavenRendererHost({ tableCellRenderers: registry() }),
    ],
  });
  const service = TestBed.inject(TranslocoService);
  service.setTranslation({ haven: english }, 'en-US');
  service.setTranslation({ haven: english }, 'sv-SE');
});
afterEach(() => TestBed.resetTestingModule());

describe('packaged custom table cell renderers', () => {
  it('renders host-registered Angular components from both direct components and the JSON renderer host', async () => {
    const direct = TestBed.createComponent(DirectHost);
    await direct.whenStable();
    expect(direct.debugElement.queryAll(By.directive(BadgeCell))).toHaveLength(2);
    const context = direct.debugElement
      .query(By.directive(BadgeCell))
      .componentInstance.context() as HavenTableCellContext;
    expect(context.rowKey).toBe(0);
    expect(context.columnId).toBe('amount');
    expect(context.value).toBe(10);
    expect(context.params['prefix']).toBe('Value');
    const driven = TestBed.createComponent(ModelHost);
    await driven.whenStable();
    expect(
      driven.debugElement.query(By.directive(BadgeCell)).componentInstance.context().value,
    ).toBe(42);
  });
  it('updates cell inputs for data/params/locale/theme without replacing stable cell component instances', async () => {
    const fixture = TestBed.createComponent(DirectHost);
    await fixture.whenStable();
    const before = fixture.debugElement
      .queryAll(By.directive(BadgeCell))
      .map((entry) => entry.componentInstance);
    fixture.componentInstance.rows.set([{ id: 0, amount: 25, nested: { note: 'changed' } }]);
    fixture.componentInstance.columns.set([
      { ...columns[0]!, rendererParams: { prefix: 'Updated' } },
    ]);
    fixture.componentInstance.theme.update((theme) => ({ ...theme, mode: 'dark' }));
    TestBed.inject(TranslocoService).setActiveLang('sv-SE');
    await fixture.whenStable();
    const after = fixture.debugElement
      .queryAll(By.directive(BadgeCell))
      .map((entry) => entry.componentInstance);
    expect(after).toEqual(before);
    expect(after[0].context().value).toBe(25);
    expect(after[0].context().locale).toBe('sv-SE');
    expect(after[0].context().theme.mode).toBe('dark');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Updated 25 sv-SE dark');
    expect(BadgeCell.destroyed).toBe(0);
  });
  it('isolates deep immutable row/parameter snapshots across tables and never freezes caller data', async () => {
    const fixture = TestBed.createComponent(DirectHost);
    await fixture.whenStable();
    const contexts = fixture.debugElement
      .queryAll(By.directive(BadgeCell))
      .map((entry) => entry.componentInstance.context() as HavenTableCellContext);
    expect(contexts[0]!.row).not.toBe(contexts[1]!.row);
    expect(Object.isFrozen(contexts[0]!.row)).toBe(true);
    expect(Object.isFrozen(contexts[0]!.row['nested'])).toBe(true);
    expect(Object.isFrozen(contexts[0]!.params['nested'])).toBe(true);
    expect(
      () => ((contexts[0]!.row['nested'] as unknown as JsonObject)['note'] = 'mutated'),
    ).toThrow();
    expect(
      () => ((contexts[0]!.params['nested'] as unknown as JsonObject)['safe'] = false),
    ).toThrow();
    expect(fixture.componentInstance.rows()[0]!['nested']).toEqual({ note: 'source' });
    expect(Object.isFrozen(fixture.componentInstance.rows()[0])).toBe(false);
  });
  it('keeps DI fallback for undefined input, isolates overrides, and reports an unregistered renderer instead of falling back', async () => {
    const fixture = TestBed.createComponent(DirectHost);
    await fixture.whenStable();
    fixture.componentInstance.overrides.set(
      createHavenTableCellRenderers([['sample.badge', AlternateCell]]),
    );
    await fixture.whenStable();
    expect(fixture.debugElement.queryAll(By.directive(AlternateCell))).toHaveLength(1);
    expect(fixture.debugElement.queryAll(By.directive(BadgeCell))).toHaveLength(1);
    expect(BadgeCell.destroyed).toBe(1);
    fixture.componentInstance.overrides.set(createHavenTableCellRenderers([]));
    await fixture.whenStable();
    const tables = fixture.debugElement.queryAll(By.directive(HavenTable));
    expect(tables[0]!.componentInstance.issue()).toMatchObject({
      code: 'renderer',
      renderer: 'sample.badge',
    });
    expect(
      (tables[0]!.nativeElement as HTMLElement).querySelector('[role="alert"]'),
    ).not.toBeNull();
    expect(tables[1]!.componentInstance.issue()).toBeNull();
    fixture.componentInstance.overrides.set(undefined);
    await fixture.whenStable();
    expect(fixture.debugElement.queryAll(By.directive(BadgeCell))).toHaveLength(2);
  });
  it('rejects duplicate or invalid registrations before mounting components', () => {
    expect(() =>
      createHavenTableCellRenderers([
        ['same', BadgeCell],
        ['same', AlternateCell],
      ]),
    ).toThrow(/Duplicate/);
    expect(() =>
      createHavenTableCellRenderers([['https://example.invalid/cell', BadgeCell]]),
    ).toThrow(/Invalid/);
    expect(() => createHavenTableCellRenderers([['missing', MissingContextCell]])).toThrow(
      /context input/,
    );
    expect((registry() as unknown as { set?: unknown }).set).toBeUndefined();
  });
});
