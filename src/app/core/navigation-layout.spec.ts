import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TestKey } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatTabGroupHarness } from '@angular/material/tabs/testing';
import { MatStepperHarness } from '@angular/material/stepper/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { HavenTabs, HavenStepper, HavenPanel } from '@haven/ui/page';
import { provideHavenTransloco } from '@haven/ui/i18n';
import type { LocalizedText } from '@haven/schema';
import english from '@haven/ui/i18n/locales/en-US.json';
import chinese from '@haven/ui/i18n/locales/zh-CN.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

type Panel = { id: string; title: string | LocalizedText; disabled: boolean; valid: boolean };
const initialPanels = (): Panel[] => [
  {
    id: 'first',
    title: { default: 'First', translations: { 'zh-CN': '第一' } },
    disabled: false,
    valid: true,
  },
  { id: 'second', title: 'Second', disabled: false, valid: true },
  { id: 'third', title: 'Third', disabled: false, valid: true },
];
@Component({
  imports: [HavenTabs, HavenPanel],
  template: `<haven-tabs title="Panels" [(activeId)]="active">
    @for (panel of panels(); track panel.id) {
      <ng-template havenPanel [id]="panel.id" [title]="panel.title" [disabled]="panel.disabled">
        <input [attr.aria-label]="'Input ' + panel.id" />
      </ng-template>
    }
  </haven-tabs>`,
})
class TabsHost {
  readonly active = signal<string | null>('first');
  readonly panels = signal(initialPanels());
}
@Component({
  imports: [HavenStepper, HavenPanel],
  template: `<haven-stepper
    title="Steps"
    [(activeId)]="active"
    [linear]="linear()"
    (attempted)="attempts.push($event)"
  >
    @for (panel of panels(); track panel.id) {
      <ng-template
        havenPanel
        [id]="panel.id"
        [title]="panel.title"
        [disabled]="panel.disabled"
        [valid]="panel.valid"
      >
        <input [attr.aria-label]="'Input ' + panel.id" />
      </ng-template>
    }
  </haven-stepper>`,
})
class StepperHost {
  readonly active = signal<string | null>('first');
  readonly linear = signal(true);
  readonly panels = signal(initialPanels());
  readonly stepper = viewChild.required(HavenStepper);
  readonly attempts: string[] = [];
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
  const transloco = TestBed.inject(TranslocoService);
  transloco.setTranslation({ haven: english }, 'en-US');
  transloco.setTranslation({ haven: chinese }, 'zh-CN');
});
afterEach(() => TestBed.resetTestingModule());

describe('generic Material navigation layouts', () => {
  it('keeps visited tab input DOM/state, translates titles and prevents keyboard activation of disabled headers', async () => {
    const fixture = TestBed.createComponent(TabsHost);
    fixture.componentInstance.panels.update((panels) =>
      panels.map((panel) => ({ ...panel, disabled: panel.id === 'second' })),
    );
    const group = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatTabGroupHarness);
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '[aria-label="Input first"]',
    )!;
    input.value = 'Retained native value';
    const tabs = await group.getTabs();
    expect(await tabs[1]!.isDisabled()).toBe(true);
    const first = await tabs[0]!.host();
    await first.focus();
    await first.sendKeys(TestKey.RIGHT_ARROW);
    const disabled = await tabs[1]!.host();
    expect(await disabled.isFocused()).toBe(true);
    await disabled.sendKeys(TestKey.ENTER);
    await fixture.whenStable();
    expect(fixture.componentInstance.active()).toBe('first');
    expect(await tabs[1]!.isSelected()).toBe(false);
    await disabled.sendKeys(TestKey.RIGHT_ARROW);
    const third = await tabs[2]!.host();
    expect(await third.isFocused()).toBe(true);
    await third.sendKeys(TestKey.ENTER);
    await fixture.whenStable();
    expect(fixture.componentInstance.active()).toBe('third');
    expect(input.isConnected).toBe(true);
    await group.selectTab({ label: 'First' });
    expect((fixture.nativeElement as HTMLElement).querySelector('[aria-label="Input first"]')).toBe(
      input,
    );
    expect(input.value).toBe('Retained native value');
    TestBed.inject(TranslocoService).setActiveLang('zh-CN');
    expect(await (await group.getSelectedTab()).getLabel()).toBe('第一');
    expect(input.value).toBe('Retained native value');
  });

  it('uses stable tab IDs through reorder and clamps removed or disabled active tabs', async () => {
    const fixture = TestBed.createComponent(TabsHost);
    const group = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatTabGroupHarness);
    await group.selectTab({ label: 'Third' });
    fixture.componentInstance.panels.update((panels) => [...panels].reverse());
    await fixture.whenStable();
    expect(fixture.componentInstance.active()).toBe('third');
    expect(await (await group.getSelectedTab()).getLabel()).toBe('Third');
    fixture.componentInstance.panels.update((panels) =>
      panels.filter((panel) => panel.id !== 'third'),
    );
    await fixture.whenStable();
    expect(fixture.componentInstance.active()).toBe('second');
    fixture.componentInstance.panels.update((panels) =>
      panels.map((panel) => ({ ...panel, disabled: panel.id === 'second' })),
    );
    await fixture.whenStable();
    expect(fixture.componentInstance.active()).toBe('first');
    fixture.componentInstance.panels.set([]);
    await fixture.whenStable();
    expect(fixture.componentInstance.active()).toBeNull();
    expect(await group.getTabs()).toHaveLength(0);
  });

  it('guards linear navigation using host validity and retains step inputs when linear mode changes', async () => {
    const fixture = TestBed.createComponent(StepperHost);
    fixture.componentInstance.panels.update((panels) =>
      panels.map((panel) => ({ ...panel, valid: panel.id !== 'first' })),
    );
    const stepper = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatStepperHarness);
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '[aria-label="Input first"]',
    )!;
    input.value = 'Step value';
    await stepper.selectStep({ label: 'Second' });
    expect(fixture.componentInstance.active()).toBe('first');
    expect(fixture.componentInstance.attempts).toContain('first');
    fixture.componentInstance.panels.update((panels) =>
      panels.map((panel) => ({ ...panel, valid: true })),
    );
    await fixture.whenStable();
    await stepper.selectStep({ label: 'Second' });
    expect(fixture.componentInstance.active()).toBe('second');
    expect(input.isConnected).toBe(true);
    fixture.componentInstance.linear.set(false);
    await fixture.whenStable();
    await stepper.selectStep({ label: 'First' });
    expect((fixture.nativeElement as HTMLElement).querySelector('[aria-label="Input first"]')).toBe(
      input,
    );
    expect(input.value).toBe('Step value');
    fixture.componentInstance.panels.update((panels) =>
      panels.map((panel) => ({ ...panel, valid: false })),
    );
    await stepper.selectStep({ label: 'Third' });
    expect(fixture.componentInstance.active()).toBe('third');
    fixture.componentInstance.linear.set(true);
    await fixture.whenStable();
    expect(fixture.componentInstance.active()).toBe('first');
  });

  it('clamps removed steps and reports unsupported disabled-step configuration without discarding state', async () => {
    const fixture = TestBed.createComponent(StepperHost);
    const stepper = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatStepperHarness);
    await stepper.selectStep({ label: 'Third' });
    fixture.componentInstance.panels.update((panels) =>
      panels.filter((panel) => panel.id !== 'third'),
    );
    await fixture.whenStable();
    expect(fixture.componentInstance.active()).toBe('first');
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector<HTMLInputElement>('[aria-label="Input first"]')!;
    input.value = 'Not lost';
    fixture.componentInstance.panels.update((panels) =>
      panels.map((panel) => ({ ...panel, disabled: panel.id === 'second' })),
    );
    await fixture.whenStable();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      english['navigation.disabledStepsUnsupported'],
    );
    expect(root.querySelector('[inert]')).not.toBeNull();
    fixture.componentInstance.stepper().next();
    expect(fixture.componentInstance.active()).toBe('first');
    fixture.componentInstance.panels.update((panels) =>
      panels.map((panel) => ({ ...panel, disabled: false })),
    );
    await fixture.whenStable();
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(input.value).toBe('Not lost');
    expect(root.querySelector('[aria-label="Input first"]')).toBe(input);
    TestBed.inject(TranslocoService).setActiveLang('zh-CN');
    expect(await (await stepper.getSteps())[0]!.getLabel()).toContain('第一');
  });
});
