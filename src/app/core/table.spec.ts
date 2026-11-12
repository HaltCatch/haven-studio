import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import { HavenTable } from '@haven/ui/table';
import type { JsonObject, TableColumn } from '@haven/schema';
import english from '@haven/ui/i18n/locales/en-US.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US', 'sv-SE'], prodMode: true },
      }),
      provideHavenTransloco(),
    ],
  });
  const service = TestBed.inject(TranslocoService);
  service.setTranslation({ haven: english }, 'en-US');
  service.setTranslation(
    { haven: { ...english, 'table.true': 'Ja', 'table.false': 'Nej' } },
    'sv-SE',
  );
});
afterEach(() => TestBed.resetTestingModule());

const columns: TableColumn[] = [
  {
    id: 'name',
    header: { default: 'Name', translations: { 'sv-SE': 'Namn' } },
    path: '/name',
    type: 'text',
  },
  { id: 'score', header: 'Score', path: '/score', type: 'number' },
];
const rows: JsonObject[] = [
  { id: 0, name: 'First', score: 10, alternate: 1 },
  { id: '0', name: 'Second', score: 2, alternate: 20 },
  { id: 2, name: 'Third', score: 30, alternate: 3 },
  { id: 3, name: 'Fourth', score: null, alternate: 4 },
];
function cells(fixture: ComponentFixture<HavenTable>): string[][] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')).map(
    (row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim() ?? ''),
  );
}
async function createTable(pageSize = 2): Promise<ComponentFixture<HavenTable>> {
  const fixture = TestBed.createComponent(HavenTable);
  fixture.componentRef.setInput('rows', rows);
  fixture.componentRef.setInput('columns', columns);
  fixture.componentRef.setInput('pageSize', pageSize);
  fixture.componentRef.setInput('title', 'Local records');
  await fixture.whenStable();
  return fixture;
}

describe('packaged local table', () => {
  it('sorts numerically with stable zero keys and exposes native focusable sorting controls', async () => {
    const fixture = await createTable(4);
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const sort = await loader.getHarness(
      MatButtonHarness.with({ selector: 'thead th:nth-child(2) button' }),
    );
    const host = await sort.host();
    await host.focus();
    expect(await host.isFocused()).toBe(true);
    expect(await host.getAttribute('type')).toBe('button');
    await sort.click();
    expect(cells(fixture).map((row) => row[0])).toEqual(['Second', 'First', 'Third', 'Fourth']);
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('th:nth-child(2)')
        ?.getAttribute('aria-sort'),
    ).toBe('ascending');
    expect(fixture.componentInstance.table.getRowModel().rows.map((row) => row.id)).toEqual([
      'string:0',
      'number:0',
      'number:2',
      'number:3',
    ]);
    await sort.click();
    expect(cells(fixture).map((row) => row[0])).toEqual(['Third', 'First', 'Second', 'Fourth']);
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('th:nth-child(2)')
        ?.getAttribute('aria-sort'),
    ).toBe('descending');
  });
  it('resets paging after data replacement or page-size change and never shows stale out-of-range pages', async () => {
    const fixture = await createTable();
    const navigation = await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(
      MatButtonHarness.with({ selector: 'nav button' }),
    );
    expect(await navigation[0]!.isDisabled()).toBe(true);
    await navigation[1]!.click();
    expect(cells(fixture).map((row) => row[0])).toEqual(['Third', 'Fourth']);
    expect(await navigation[1]!.isDisabled()).toBe(true);
    fixture.componentRef.setInput('rows', [rows[0]!]);
    await fixture.whenStable();
    expect(cells(fixture)).toEqual([['First', '10']]);
    expect(fixture.componentInstance.pagination().pageIndex).toBe(0);
    fixture.componentRef.setInput('rows', rows);
    await fixture.whenStable();
    await navigation[1]!.click();
    fixture.componentRef.setInput('pageSize', 1);
    await fixture.whenStable();
    expect(cells(fixture)).toEqual([['First', '10']]);
    expect(fixture.componentInstance.pagination()).toEqual({ pageIndex: 0, pageSize: 1 });
  });
  it('rejects duplicate keys visibly instead of replacing identities with row positions', async () => {
    const fixture = await createTable();
    fixture.componentRef.setInput('rows', [rows[0]!, { ...rows[1]!, id: 0 }]);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('table')).toBeNull();
    fixture.componentRef.setInput('rows', rows);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeNull();
    expect(cells(fixture)).toHaveLength(2);
  });
  it('refreshes accessor caches on same-ID column changes and clears a disabled sort', async () => {
    const fixture = await createTable(4);
    const sort = await TestbedHarnessEnvironment.loader(fixture).getHarness(
      MatButtonHarness.with({ selector: 'thead th:nth-child(2) button' }),
    );
    await sort.click();
    fixture.componentRef.setInput('columns', [columns[0]!, { ...columns[1]!, path: '/alternate' }]);
    await fixture.whenStable();
    expect(cells(fixture)).toEqual([
      ['First', '1'],
      ['Third', '3'],
      ['Fourth', '4'],
      ['Second', '20'],
    ]);
    fixture.componentRef.setInput('columns', [
      columns[0]!,
      { ...columns[1]!, path: '/alternate', sortable: false },
    ]);
    await fixture.whenStable();
    expect(cells(fixture).map((row) => row[0])).toEqual(['First', 'Second', 'Third', 'Fourth']);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('th:nth-child(2) button'),
    ).toBeNull();
    expect(fixture.componentInstance.table.atoms.sorting.get()).toEqual([]);
  });
  it('reacts to locale changes for headers, numeric precision and collation while keeping the same data', async () => {
    const fixture = await createTable(4);
    const localeRows: JsonObject[] = [
      { id: 0, name: 'Ä', score: 0.00001 },
      { id: 1, name: 'Z', score: 1234.5 },
    ];
    fixture.componentRef.setInput('rows', localeRows);
    await fixture.whenStable();
    const sort = await TestbedHarnessEnvironment.loader(fixture).getHarness(
      MatButtonHarness.with({ selector: 'thead th:first-child button' }),
    );
    await sort.click();
    expect(cells(fixture).map((row) => row[0])).toEqual(['Ä', 'Z']);
    expect(cells(fixture)[0]![1]).toBe('0.00001');
    TestBed.inject(TranslocoService).setActiveLang('sv-SE');
    await fixture.whenStable();
    expect(cells(fixture).map((row) => row[0])).toEqual(['Z', 'Ä']);
    expect(cells(fixture)[1]![1]).toBe('0,00001');
    expect((fixture.nativeElement as HTMLElement).querySelector('th')?.textContent).toContain(
      'Namn',
    );
    expect(fixture.componentInstance.rows()).toBe(localeRows);
  });
});
