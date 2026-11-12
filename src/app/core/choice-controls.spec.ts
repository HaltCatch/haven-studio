import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatSelectHarness } from '@angular/material/select/testing';
import { MatRadioButtonHarness } from '@angular/material/radio/testing';
import { MatSlideToggleHarness } from '@angular/material/slide-toggle/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import { HavenRadioField, HavenSelectField, HavenSwitchField } from '@haven/ui/form';
import { HavenRenderer } from '@haven/ui/renderer';
import type { HavenDocument } from '@haven/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import english from '@haven/ui/i18n/locales/en-US.json';

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

describe('standalone choice controls with Material harnesses', () => {
  it('keeps display bindings out of form policies and revalidates option edits without replacing values', async () => {
    const fixture = TestBed.createComponent(HavenRenderer);
    const document: HavenDocument = {
      schemaVersion: '1.0',
      id: 'choices',
      title: 'Choices',
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
            props: { label: 'Choice', options: [{ value: 0, label: 'Zero' }] },
          },
          { id: 'output', kind: 'view.text', version: 1, bind: '/choice' },
        ],
      },
      theme: { preset: 'material', mode: 'light', density: 'comfortable' },
      actions: {},
      resources: {},
    };
    fixture.componentRef.setInput('document', document);
    const harness = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatSelectHarness);
    await harness.clickOptions({ text: 'Zero' });
    expect(fixture.componentInstance.value()['choice']).toBe(0);
    const changed = structuredClone(document);
    changed.ui.children![0]!.props!['options'] = [{ value: 1, label: 'One' }];
    fixture.componentRef.setInput('document', changed);
    await fixture.whenStable();
    expect(fixture.componentInstance.fields()!().valid()).toBe(false);
    expect(fixture.componentInstance.value()['choice']).toBe(0);
    const readonly = structuredClone(document);
    readonly.ui.children![0]!.props!['readonly'] = true;
    fixture.componentRef.setInput('document', readonly);
    expect(await harness.isDisabled()).toBe(true);
    expect(fixture.componentInstance.fields()!().valid()).toBe(true);
    expect(fixture.componentInstance.value()['choice']).toBe(0);
  });
  it('preserves numeric zero and stale values, supports clear and blocks readonly input', async () => {
    const fixture = TestBed.createComponent(HavenSelectField);
    fixture.componentRef.setInput('label', 'Choice');
    fixture.componentRef.setInput('options', [
      { value: 0, label: 'Zero' },
      { value: 1, label: 'Disabled', disabled: true },
    ]);
    const harness = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatSelectHarness);
    await harness.clickOptions({ text: 'Zero' });
    expect(fixture.componentInstance.value()).toBe(0);
    await harness.clickOptions({ text: 'Clear selection' });
    expect(fixture.componentInstance.value()).toBeNull();
    await harness.clickOptions({ text: 'Zero' });
    fixture.componentRef.setInput('options', [{ value: 2, label: 'Two' }]);
    expect(await harness.getValueText()).toBe('0');
    expect(fixture.componentInstance.value()).toBe(0);
    fixture.componentRef.setInput('readonly', true);
    expect(await harness.isDisabled()).toBe(true);
  });

  it('keeps radio values primitive and respects disabled choices and readonly groups', async () => {
    const fixture = TestBed.createComponent(HavenRadioField);
    fixture.componentRef.setInput('label', 'Radio');
    fixture.componentRef.setInput('options', [
      { value: 0, label: 'Zero' },
      { value: 1, label: 'Disabled', disabled: true },
    ]);
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const zero = await loader.getHarness(MatRadioButtonHarness.with({ label: 'Zero' }));
    const disabled = await loader.getHarness(MatRadioButtonHarness.with({ label: 'Disabled' }));
    await zero.check();
    expect(fixture.componentInstance.value()).toBe(0);
    expect(await disabled.isDisabled()).toBe(true);
    fixture.componentRef.setInput('readonly', true);
    expect(await zero.isDisabled()).toBe(true);
  });

  it('uses boolean switch values without legacy Y/N conversion', async () => {
    const fixture = TestBed.createComponent(HavenSwitchField);
    fixture.componentRef.setInput('label', 'Enabled');
    const harness =
      await TestbedHarnessEnvironment.loader(fixture).getHarness(MatSlideToggleHarness);
    await harness.check();
    expect(fixture.componentInstance.checked()).toBe(true);
    await harness.uncheck();
    expect(fixture.componentInstance.checked()).toBe(false);
    fixture.componentRef.setInput('readonly', true);
    expect(await harness.isDisabled()).toBe(true);
  });
});
