import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestKey } from '@angular/cdk/testing';
import { MatAutocompleteHarness } from '@angular/material/autocomplete/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import { HavenRemoteSelectField, HavenRemoteMultiselectField } from '@haven/ui/form';
import { HavenRenderer } from '@haven/ui/renderer';
import { HavenThemeDirective } from '@haven/ui/theme';
import type { HavenDocument, HavenTheme } from '@haven/schema';
import type { Option, OptionsAdapter } from '@haven/runtime';
import english from '@haven/ui/i18n/locales/en-US.json';
import chinese from '@haven/ui/i18n/locales/zh-CN.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function adapter(overrides: Partial<OptionsAdapter> = {}): OptionsAdapter {
  return {
    search: async () => ({ items: [{ key: 0, label: 'Zero' }] }),
    resolve: async (keys) => keys.filter((key) => key === 0).map((key) => ({ key, label: 'Zero' })),
    ...overrides,
  };
}
beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { defaultLang: 'en-US', availableLangs: ['en-US', 'zh-CN'], prodMode: true },
      }),
      provideHavenTransloco(),
    ],
  });
  const service = TestBed.inject(TranslocoService);
  service.setTranslation({ haven: english }, 'en-US');
  service.setTranslation({ haven: chinese }, 'zh-CN');
});
afterEach(() => TestBed.resetTestingModule());

@Component({
  imports: [HavenRemoteSelectField, HavenThemeDirective],
  template: `<section id="first" [havenTheme]="first()">
      <haven-remote-select-field label="First" [adapter]="source" [debounceMs]="0" />
    </section>
    <section id="second" [havenTheme]="second()">
      <haven-remote-select-field label="Second" [adapter]="source" [debounceMs]="0" />
    </section>`,
})
class ThemedRemoteFields {
  readonly source = adapter();
  readonly first = signal<HavenTheme>({
    preset: 'liquid-glass',
    mode: 'light',
    density: 'comfortable',
    tokens: { primary: '#d12e44' },
  });
  readonly second = signal<HavenTheme>({
    preset: 'liquid-glass',
    mode: 'dark',
    density: 'comfortable',
    tokens: { primary: '#315dd1' },
  });
}

describe('packaged remote selection', () => {
  it('preserves numeric zero during resolve and ignores stale ignored-abort search responses', async () => {
    const selected = deferred<Option[]>(),
      old = deferred<{ items: Option[] }>(),
      current = deferred<{ items: Option[] }>();
    const signals: { text: string; signal: AbortSignal }[] = [];
    const source = adapter({
      resolve: () => selected.promise,
      search: ({ text, signal }) => {
        signals.push({ text, signal });
        return text === 'old'
          ? old.promise
          : text === 'new'
            ? current.promise
            : Promise.resolve({ items: [] });
      },
    });
    const fixture = TestBed.createComponent(HavenRemoteSelectField);
    fixture.componentRef.setInput('label', 'Remote value');
    fixture.componentRef.setInput('adapter', source);
    fixture.componentRef.setInput('debounceMs', 0);
    fixture.componentRef.setInput('value', 0);
    await fixture.whenStable();
    expect(fixture.componentInstance.resolutionState().pending).toBe(true);
    expect(fixture.componentInstance.resolutionState().ready).toBe(false);
    expect(fixture.componentInstance.value()).toBe(0);
    selected.resolve([{ key: 0, label: 'Saved zero' }]);
    await fixture.whenStable();
    await expect.poll(() => fixture.componentInstance.state().resolveReady).toBe(true);
    const harness =
      await TestbedHarnessEnvironment.loader(fixture).getHarness(MatAutocompleteHarness);
    // Material enterText appends to the current input; focus and clear the saved label first.
    await harness.focus();
    await harness.clear();
    await harness.enterText('old');
    await expect.poll(() => signals.some((request) => request.text === 'old')).toBe(true);
    await harness.clear();
    await harness.enterText('new');
    await expect
      .poll(() => signals.find((request) => request.text === 'old')?.signal.aborted)
      .toBe(true);
    await expect.poll(() => signals.some((request) => request.text === 'new')).toBe(true);
    current.resolve({ items: [{ key: 1, label: 'Newest' }] });
    await expect.poll(() => fixture.componentInstance.state().items[0]?.label).toBe('Newest');
    old.resolve({ items: [{ key: 2, label: 'Obsolete' }] });
    await fixture.whenStable();
    expect(fixture.componentInstance.state().items.map((option) => option.label)).toEqual([
      'Newest',
    ]);
    expect(fixture.componentInstance.value()).toBe(0);
    const labels = await Promise.all(
      (await harness.getOptions()).map((option) => option.getText()),
    );
    expect(labels).not.toContain('Obsolete');
  });
  it('retries opaque transport failures and appends cursor pages using Material option selection', async () => {
    const search = vi
      .fn<OptionsAdapter['search']>()
      .mockRejectedValueOnce(new Error('private transport details'))
      .mockResolvedValueOnce({ items: [{ key: 0, label: 'Zero' }], nextCursor: 'second' })
      .mockResolvedValueOnce({ items: [{ key: 1, label: 'One' }] });
    const fixture = TestBed.createComponent(HavenRemoteSelectField);
    fixture.componentRef.setInput('label', 'Remote value');
    fixture.componentRef.setInput('adapter', adapter({ search }));
    fixture.componentRef.setInput('debounceMs', 0);
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const harness = await loader.getHarness(MatAutocompleteHarness);
    await harness.focus();
    await expect.poll(() => fixture.componentInstance.state().searchError).toBe('adapter');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'private transport details',
    );
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Retry' }))).click();
    await expect.poll(() => fixture.componentInstance.state().nextCursor).toBe('second');
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Load more' }))).click();
    await expect.poll(() => fixture.componentInstance.state().items.length).toBe(2);
    expect(search.mock.calls.at(-1)![0].cursor).toBe('second');
    await harness.selectOption({ text: 'Zero' });
    expect(fixture.componentInstance.value()).toBe(0);
    fixture.componentRef.setInput('readonly', true);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('input')!.readOnly).toBe(true);
    expect(
      await (
        await loader.getHarness(
          MatButtonHarness.with({ selector: '[aria-label="Clear selection: Remote value"]' }),
        )
      ).isDisabled(),
    ).toBe(true);
  });
  it('retains unresolved multi-values, passes changed locale context and aborts work on destruction', async () => {
    const resolve = vi.fn<OptionsAdapter['resolve']>(async (keys, _signal, context) =>
      keys
        .filter((key) => key === 0)
        .map((key) => ({ key, label: context?.locale === 'zh-CN' ? '零' : 'Zero' })),
    );
    const pending = deferred<{ items: Option[] }>();
    let requestSignal: AbortSignal | undefined;
    const fixture = TestBed.createComponent(HavenRemoteMultiselectField);
    fixture.componentRef.setInput('label', 'Remote values');
    fixture.componentRef.setInput(
      'adapter',
      adapter({
        resolve,
        search: ({ signal }) => {
          requestSignal = signal;
          return pending.promise;
        },
      }),
    );
    fixture.componentRef.setInput('value', [0, 'missing']);
    fixture.componentRef.setInput('debounceMs', 0);
    await fixture.whenStable();
    await expect.poll(() => fixture.componentInstance.state().resolveReady).toBe(true);
    expect(fixture.componentInstance.value()).toEqual([0, 'missing']);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('missing');
    TestBed.inject(TranslocoService).setActiveLang('zh-CN');
    await expect.poll(() => fixture.componentInstance.state().resolved[0]?.label).toBe('零');
    expect(resolve.mock.calls.at(-1)![2]).toEqual({ locale: 'zh-CN' });
    const harness =
      await TestbedHarnessEnvironment.loader(fixture).getHarness(MatAutocompleteHarness);
    await harness.focus();
    await expect.poll(() => requestSignal).toBeDefined();
    fixture.destroy();
    expect(requestSignal!.aborted).toBe(true);
    pending.reject(new Error('late ignored error'));
    await Promise.resolve();
  });
  it('themes each autocomplete panel locally without mutating the global overlay container', async () => {
    const fixture = TestBed.createComponent(ThemedRemoteFields);
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const first = await loader.getHarness(
      MatAutocompleteHarness.with({ selector: '#first input' }),
    );
    const second = await loader.getHarness(
      MatAutocompleteHarness.with({ selector: '#second input' }),
    );
    const panelColor = async (harness: MatAutocompleteHarness) => {
      // Harness reads stabilize the Angular view after asynchronous adapter results.
      // The trigger's aria-controls identifies its own overlay, not another fixture's panel.
      if (!(await harness.isOpen())) return undefined;
      const id = await (await harness.host()).getAttribute('aria-controls');
      return id
        ? document.getElementById(id)?.style.getPropertyValue('--mat-sys-primary')
        : undefined;
    };
    await first.focus();
    await expect.poll(() => panelColor(first)).toBe('#d12e44');
    await (await first.host()).sendKeys(TestKey.ESCAPE);
    await second.focus();
    await expect.poll(() => panelColor(second)).toBe('#315dd1');
    expect(
      document
        .querySelector<HTMLElement>('.cdk-overlay-container')
        ?.style.getPropertyValue('--mat-sys-primary'),
    ).toBe('');
  });
  it('validates resolved saved keys independently of the search page and never clears missing values', async () => {
    const known = deferred<Option[]>();
    const source = adapter({ resolve: () => known.promise });
    const fixture = TestBed.createComponent(HavenRenderer);
    const model: HavenDocument = {
      schemaVersion: '1.0',
      id: 'remote',
      title: 'Remote field',
      dataSchema: { type: 'object', properties: { choice: { type: 'number' } } },
      ui: {
        id: 'root',
        kind: 'form',
        version: 1,
        children: [
          {
            id: 'choice',
            kind: 'field.select',
            version: 1,
            bind: '/choice',
            props: { label: 'Choice', resource: 'options' },
          },
        ],
      },
      theme: { preset: 'liquid-glass', mode: 'light', density: 'comfortable' },
      actions: {},
      resources: { options: { type: 'options', adapter: 'test-options' } },
    };
    fixture.componentRef.setInput('document', model);
    fixture.componentRef.setInput('host', { options: new Map([['test-options', source]]) });
    fixture.componentRef.setInput('value', { choice: 0 });
    await fixture.whenStable();
    expect(fixture.componentInstance.fields()!().valid()).toBe(false);
    expect(fixture.componentInstance.value()['choice']).toBe(0);
    known.resolve([{ key: 0, label: 'Known zero' }]);
    await expect.poll(() => fixture.componentInstance.fields()!().valid()).toBe(true);
    fixture.componentRef.setInput('host', {
      options: new Map([['test-options', adapter({ resolve: async () => [] })]]),
    });
    await fixture.whenStable();
    await expect.poll(() => fixture.componentInstance.fields()!().valid()).toBe(false);
    expect(fixture.componentInstance.value()['choice']).toBe(0);
    fixture.componentRef.setInput('host', {
      options: new Map([
        [
          'test-options',
          adapter({ resolve: async (keys) => keys.map((key) => ({ key, label: String(key) })) }),
        ],
      ]),
    });
    fixture.componentInstance.value.set({ choice: 'wrong-type' });
    await fixture.whenStable();
    expect(fixture.componentInstance.fields()!().valid()).toBe(false);
    fixture.componentRef.setInput('host', { options: new Map() });
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent,
    ).toContain('not configured');
  });
});
