import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import { HavenMultiselectField, HavenTemporalField } from '@haven/ui/form';
import { HavenRenderer } from '@haven/ui/renderer';
import type { HavenDocument } from '@haven/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import english from '@haven/ui/i18n/locales/en-US.json';
import { addNode, newDocument } from '../document/document-edit';

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
afterEach(() => TestBed.resetTestingModule());

describe('temporal and multiple choice integration', () => {
  it('creates array item schemas for multiselect while temporal fields use local strings', () => {
    let document = addNode(newDocument('fields'), 'root', 'field.multiselect', 'choices');
    for (const kind of ['date', 'time', 'datetime'])
      document = addNode(document, 'root', `field.${kind}`, kind);
    expect(document.dataSchema.properties!['choices']).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
    expect(document.ui.children![0]!.props!['options']).toEqual([]);
    for (const kind of ['date', 'time', 'datetime'])
      expect(document.dataSchema.properties![kind]).toEqual({ type: 'string' });
  });

  it('preserves zero and stale values during selection, and clears only on an explicit action', async () => {
    const fixture = TestBed.createComponent(HavenMultiselectField);
    fixture.componentRef.setInput('label', 'Choices');
    fixture.componentRef.setInput('options', [
      { value: 0, label: 'Zero' },
      { value: '0', label: 'String zero' },
      { value: 1, label: 'Disabled', disabled: true },
    ]);
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const harness = await loader.getHarness(MatSelectHarness);
    await harness.clickOptions({ text: 'Zero' });
    await harness.clickOptions({ text: 'String zero' });
    await harness.close();
    expect(fixture.componentInstance.value()).toEqual([0, '0']);
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-haven-glass]')).toBeNull();
    fixture.componentRef.setInput('options', [{ value: 2, label: 'Two' }]);
    await harness.clickOptions({ text: 'Two' });
    await harness.close();
    expect(fixture.componentInstance.value()).toEqual([0, '0', 2]);
    const clear = await loader.getHarness(
      MatButtonHarness.with({ selector: '[aria-label="Clear selection: Choices"]' }),
    );
    fixture.componentRef.setInput('readonly', true);
    expect(await harness.isDisabled()).toBe(true);
    expect(await clear.isDisabled()).toBe(true);
    fixture.componentRef.setInput('readonly', false);
    await fixture.whenStable();
    await clear.click();
    expect(fixture.componentInstance.value()).toEqual([]);
    await expect.poll(() => harness.isOpen()).toBe(false);
  });

  it('stores local calendar strings and clears to null without converting to Date or UTC', async () => {
    const fixture = TestBed.createComponent(HavenTemporalField);
    fixture.componentRef.setInput('label', 'Local value');
    for (const [kind, value] of [
      ['date', '2024-02-29'],
      ['time', '23:59:42'],
      ['datetime', '2026-03-08T02:30'],
    ] as const) {
      fixture.componentRef.setInput('kind', kind);
      await fixture.whenStable();
      const input = (fixture.nativeElement as HTMLElement).querySelector('input')!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      expect(fixture.componentInstance.value()).toBe(value);
      input.value = '';
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      expect(fixture.componentInstance.value()).toBeNull();
    }
    fixture.componentRef.setInput('readonly', true);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('input')!.readOnly).toBe(true);
    fixture.componentRef.setInput('disabled', true);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('input')!.disabled).toBe(true);
  });

  it('validates required arrays and revalidates changed options without losing selected values', async () => {
    const document: HavenDocument = {
      ...newDocument('multi-renderer'),
      dataSchema: {
        type: 'object',
        properties: { choices: { type: 'array', items: { type: 'number' } } },
      },
      ui: {
        id: 'root',
        kind: 'form',
        version: 1,
        children: [
          {
            id: 'choices',
            kind: 'field.multiselect',
            version: 1,
            bind: '/choices',
            props: { label: 'Choices', options: [{ value: 0, label: 'Zero' }] },
            rules: { required: { op: 'eq', left: { literal: true }, right: { literal: true } } },
          },
        ],
      },
    };
    const fixture = TestBed.createComponent(HavenRenderer);
    fixture.componentRef.setInput('document', document);
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const harness = await loader.getHarness(MatSelectHarness);
    await fixture.whenStable();
    expect(fixture.componentInstance.fields()!().valid()).toBe(false);
    await harness.clickOptions({ text: 'Zero' });
    await harness.close();
    expect(fixture.componentInstance.value()['choices']).toEqual([0]);
    expect(fixture.componentInstance.fields()!().valid()).toBe(true);
    const changed = structuredClone(document);
    changed.ui.children![0]!.props!['options'] = [{ value: 2, label: 'Two' }];
    fixture.componentRef.setInput('document', changed);
    await fixture.whenStable();
    expect(fixture.componentInstance.value()['choices']).toEqual([0]);
    expect(fixture.componentInstance.fields()!().valid()).toBe(false);
    const clear = await loader.getHarness(
      MatButtonHarness.with({ selector: '[aria-label="Clear selection: Choices"]' }),
    );
    await clear.click();
    expect(fixture.componentInstance.value()['choices']).toEqual([]);
    expect(fixture.componentInstance.fields()!().valid()).toBe(false);
  });
});
