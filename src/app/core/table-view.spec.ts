import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import { HavenTable } from '@haven/ui/table';
import type { JsonObject, TableColumn, TableRowKey, TableView } from '@haven/schema';
import english from '@haven/ui/i18n/locales/en-US.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US'], prodMode: true },
      }),
      provideHavenTransloco(),
    ],
  });
  TestBed.inject(TranslocoService).setTranslation({ haven: english }, 'en-US');
});
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});
const columns: TableColumn[] = [
  { id: 'label', header: 'Label', path: '/label', type: 'text' },
  { id: 'amount', header: 'Amount', path: '/amount', type: 'number' },
  { id: 'active', header: 'Active', path: '/active', type: 'boolean' },
];
const rows: JsonObject[] = [
  { id: 0, other: 'first', label: 'Ten', amount: 10, active: true },
  { id: '0', other: 'second', label: 'Two', amount: 2, active: false },
  { id: 2, other: 'third', label: 'Thirty', amount: 30, active: true },
];
async function createTable(
  selection: readonly TableRowKey[] = [],
): Promise<ComponentFixture<HavenTable>> {
  const fixture = TestBed.createComponent(HavenTable);
  for (const [name, value] of Object.entries({
    rows,
    columns,
    selection,
    pageSize: 1,
    filterable: true,
    selectable: true,
    columnMenu: true,
  }))
    fixture.componentRef.setInput(name, value);
  await fixture.whenStable();
  return fixture;
}
const dom = (fixture: ComponentFixture<HavenTable>) => fixture.nativeElement as HTMLElement;

describe('packaged table filtering, selection and view controls', () => {
  it('keeps typed stable selections through pagination, sorting and filtering, and selects filtered loaded rows only', async () => {
    const fixture = await createTable([0]);
    const component = fixture.componentInstance;
    const emitted: TableRowKey[][] = [];
    component.selection.subscribe((value) => emitted.push([...value]));
    component.table.nextPage();
    await fixture.whenStable();
    component.table.getRow('string:0').toggleSelected(true);
    await fixture.whenStable();
    expect(component.selection()).toEqual([0, '0']);
    component.table.setSorting([{ id: 'amount', desc: true }]);
    await fixture.whenStable();
    expect(component.selection()).toEqual([0, '0']);
    component.table.setGlobalFilter('thir');
    await fixture.whenStable();
    expect(component.table.getFilteredRowModel().rows.map((row) => row.original['label'])).toEqual([
      'Thirty',
    ]);
    expect(component.pagination().pageIndex).toBe(0);
    component.table.toggleAllRowsSelected(true);
    await fixture.whenStable();
    expect(component.selection()).toEqual([0, '0', 2]);
    component.table.toggleAllRowsSelected(false);
    await fixture.whenStable();
    expect(component.selection()).toEqual([0, '0']);
    expect(emitted.at(-1)).toEqual([0, '0']);
    component.table.setGlobalFilter('');
    await fixture.whenStable();
    expect(component.table.getSelectedRowModel().rows).toHaveLength(2);
  });
  it('rejects invalid initial controlled keys and only prunes previously known keys after actual data removal', async () => {
    const fixture = await createTable(['missing']);
    const component = fixture.componentInstance;
    expect(component.selection()).toEqual(['missing']);
    expect(dom(fixture).querySelector('[role="alert"]')?.textContent).toContain('Selection');
    fixture.componentRef.setInput('selection', [0, '0']);
    await fixture.whenStable();
    expect(dom(fixture).querySelector('[role="alert"]')).toBeNull();
    fixture.componentRef.setInput('rows', rows.slice(1));
    await fixture.whenStable();
    expect(component.selection()).toEqual(['0']);
    fixture.componentRef.setInput('rowKey', '/other');
    await fixture.whenStable();
    expect(component.selection()).toEqual([]);
  });
  it('uses controlled view state for ordering, visibility, logical pinning and widths without mutating caller configuration', async () => {
    // jsdom has no layout. Supply available viewport space for this state/class assertion;
    // real sticky geometry, RTL and responsive pause/resume are covered by browser E2E.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.classList.contains('scroll') ? 1024 : 0;
    });
    const fixture = await createTable();
    const component = fixture.componentInstance;
    const original: TableView = {
      order: ['amount', 'label', 'active'],
      hidden: ['active'],
      pinned: { start: ['label'] },
      widths: { label: 240 },
    };
    const snapshot = structuredClone(original);
    fixture.componentRef.setInput('view', original);
    await fixture.whenStable();
    expect(component.visibleColumns().map((column) => column.id)).toEqual(['label', 'amount']);
    expect(component.table.getColumn('label')!.getSize()).toBe(240);
    expect(component.table.getColumn('label')!.getIsPinned()).toBe('start');
    expect(dom(fixture).querySelector('.scroll')?.getAttribute('data-pinning-paused')).toBeNull();
    expect(dom(fixture).querySelector('thead th:nth-child(2)')?.classList.contains('pinned')).toBe(
      true,
    );
    component.table.getColumn('amount')!.pin('end');
    await fixture.whenStable();
    expect(component.view().pinned?.end).toEqual(['amount']);
    component.table.getColumn('active')!.toggleVisibility(true);
    await fixture.whenStable();
    expect(component.visibleColumns().map((column) => column.id)).toEqual([
      'label',
      'active',
      'amount',
    ]);
    expect(original).toEqual(snapshot);
    fixture.componentRef.setInput('view', { hidden: ['label', 'amount', 'active'] });
    await fixture.whenStable();
    expect(dom(fixture).querySelector('[role="alert"]')).not.toBeNull();
  });
  it('disables filtering, selection, column settings, sorting and pagination through native controls', async () => {
    const fixture = await createTable();
    const component = fixture.componentInstance;
    const settings = Array.from(dom(fixture).querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Columns',
    );
    settings!.click();
    await fixture.whenStable();
    fixture.componentRef.setInput('disabled', true);
    await fixture.whenStable();
    const controls = Array.from(
      dom(fixture).querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>(
        'input, button',
      ),
    );
    expect(controls.length).toBeGreaterThan(10);
    expect(controls.every((control) => control.disabled)).toBe(true);
    expect(dom(fixture).querySelector('select')).toBeNull();
    expect(
      [...dom(fixture).querySelectorAll('[role="combobox"]')].every(
        (control) => control.getAttribute('aria-disabled') === 'true',
      ),
    ).toBe(true);
    controls.forEach((control) => control.click());
    await fixture.whenStable();
    expect(component.filter()).toBe('');
    expect(component.selection()).toEqual([]);
    expect(component.view()).toEqual({});
    expect(component.pagination().pageIndex).toBe(0);
  });
});
