import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import { HavenTemporalField } from '@haven/ui/form';
import { HavenRenderer } from '@haven/ui/renderer';
import type { HavenDocument } from '@haven/schema';
import english from '@haven/ui/i18n/locales/en-US.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

function document(): HavenDocument {
  return {
    schemaVersion: '1.0',
    id: 'first',
    title: 'Local dates',
    dataSchema: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } } },
    ui: {
      id: 'root',
      kind: 'form',
      version: 1,
      children: [
        { id: 'date', kind: 'field.date', version: 1, bind: '/a', props: { label: 'Date' } },
      ],
    },
    theme: { preset: 'liquid-glass', mode: 'light', density: 'comfortable' },
    actions: {},
    resources: {},
  };
}

describe('temporal input identity', () => {
  it('resets partial native state on same-value rebinding while preserving canonical data', async () => {
    const fixture = TestBed.createComponent(HavenRenderer);
    const model = document();
    fixture.componentRef.setInput('document', model);
    fixture.componentRef.setInput('value', { a: '2024-02-29', b: '2024-02-29' });
    await fixture.whenStable();
    const input = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    const control = fixture.debugElement.query(By.directive(HavenTemporalField))
      .componentInstance as HavenTemporalField;
    // JSDOM cannot edit individual native date segments; inject the browser badInput contract.
    control.onInput({ value: '', validity: { badInput: true } } as HTMLInputElement);
    await fixture.whenStable();
    expect(fixture.componentInstance.fields()!().valid()).toBe(false);
    expect(fixture.componentInstance.value()).toEqual({ a: '2024-02-29', b: '2024-02-29' });
    const rebound = structuredClone(model);
    rebound.ui.children![0]!.bind = '/b';
    fixture.componentRef.setInput('document', rebound);
    await fixture.whenStable();
    const next = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    expect(fixture.componentInstance.fields()!().valid()).toBe(true);
    expect(next).not.toBe(input);
    expect(next.value).toBe('2024-02-29');
    expect(fixture.componentInstance.value()).toEqual({ a: '2024-02-29', b: '2024-02-29' });
  });
  it('preserves the native input for label/theme edits but resets it when document identity changes', async () => {
    const fixture = TestBed.createComponent(HavenRenderer);
    const model = document();
    fixture.componentRef.setInput('document', model);
    fixture.componentRef.setInput('value', { a: '2024-02-29', b: '2024-02-29' });
    await fixture.whenStable();
    const input = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    const changed = structuredClone(model);
    changed.ui.children![0]!.props!['label'] = 'Renamed date';
    changed.theme.mode = 'dark';
    fixture.componentRef.setInput('document', changed);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('input')).toBe(input);
    expect(input.value).toBe('2024-02-29');
    fixture.componentRef.setInput('document', { ...changed, id: 'second' });
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('input')).not.toBe(input);
    expect(fixture.componentInstance.value()).toEqual({ a: '2024-02-29', b: '2024-02-29' });
  });
});
