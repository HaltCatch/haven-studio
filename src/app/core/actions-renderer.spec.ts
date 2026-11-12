import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { provideHavenTransloco } from '@haven/ui/i18n';
import { HavenRenderer } from '@haven/ui/renderer';
import type { HavenActionOutcome, HavenActionTrace } from '@haven/ui/renderer';
import { ActionRegistry } from '@haven/runtime';
import type { ActionContext, ActionResult } from '@haven/runtime';
import type { HavenDocument, JsonObject } from '@haven/schema';
import english from '@haven/ui/i18n/locales/en-US.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function model(): HavenDocument {
  return {
    schemaVersion: '1.0',
    id: 'actions-first',
    title: 'Actions',
    dataSchema: { type: 'object', properties: { name: { type: 'string' } } },
    ui: {
      id: 'root',
      kind: 'form',
      version: 1,
      children: [
        {
          id: 'name',
          kind: 'field.text',
          version: 1,
          bind: '/name',
          props: { label: 'Name' },
          events: { change: ['work'] },
        },
        {
          id: 'run',
          kind: 'action.button',
          version: 1,
          props: { label: 'Run' },
          events: { click: ['work'] },
        },
      ],
    },
    actions: { work: { handler: 'test.work' } },
    resources: {},
    theme: { preset: 'liquid-glass', mode: 'light', density: 'comfortable' },
  };
}
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

async function renderer(document: HavenDocument, actions?: ActionRegistry) {
  const fixture = TestBed.createComponent(HavenRenderer);
  fixture.componentRef.setInput('document', document);
  fixture.componentRef.setInput('value', { name: 'Initial' });
  fixture.componentRef.setInput('host', { ...(actions ? { actions } : {}), revision: 'draft:1' });
  const outcomes: HavenActionOutcome[] = [],
    traces: HavenActionTrace[] = [];
  fixture.componentInstance.actionResult.subscribe((value) => outcomes.push(value));
  fixture.componentInstance.actionTrace.subscribe((value) => traces.push(value));
  await fixture.whenStable();
  return { fixture, outcomes, traces };
}
function change(element: HTMLElement, value: string): void {
  const input = element.querySelector('input')!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('renderer action host integration', () => {
  it('snapshots the updated native field and event, then awaits handlers and emits ordered traces', async () => {
    const document = model();
    document.ui.children![0]!.events!['change'] = ['work', 'after'];
    document.actions = {
      work: {
        handler: 'test.work',
        input: { root: { path: '/name' }, event: { scope: 'event', path: '/value' } },
      },
      after: {
        handler: 'test.after',
        input: { root: { path: '/name' }, event: { scope: 'event', path: '/value' } },
      },
    };
    const gate = deferred<ActionResult>();
    const calls: { input: JsonObject; context: ActionContext }[] = [];
    const actions = new ActionRegistry();
    actions.register({
      id: 'test.work',
      execute: async (input, context) => {
        calls.push({ input, context });
        return gate.promise;
      },
    });
    actions.register({
      id: 'test.after',
      execute: async (input, context) => {
        calls.push({ input, context });
        return { status: 'success' };
      },
    });
    const { fixture, outcomes, traces } = await renderer(document, actions);
    change(fixture.nativeElement as HTMLElement, 'Native value');
    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0]!.input).toEqual({ root: 'Native value', event: 'Native value' });
    expect(calls[0]!.context).toMatchObject({
      documentId: document.id,
      revision: 'draft:1',
      nodeId: 'name',
      data: { name: 'Native value' },
      event: { type: 'change', value: 'Native value' },
    });
    expect(Object.isFrozen(calls[0]!.context.data)).toBe(true);
    expect(Object.isFrozen(calls[0]!.context.event)).toBe(true);
    fixture.componentInstance.value.set({ name: 'Changed while pending' });
    await fixture.whenStable();
    expect(calls).toHaveLength(1);
    gate.resolve({ status: 'success' });
    await expect.poll(() => outcomes.length).toBe(1);
    expect(calls[1]!.input).toEqual({ root: 'Native value', event: 'Native value' });
    expect(calls[1]!.context.data).toEqual({ name: 'Native value' });
    expect(traces.map((entry) => `${entry.actionId}:${entry.stage}`)).toEqual([
      'work:start',
      'work:finish',
      'after:start',
      'after:finish',
    ]);
    expect(outcomes[0]).toEqual({ nodeId: 'name', event: 'change', result: { status: 'success' } });
  });

  it('disables the native action button while pending and restores it on completion', async () => {
    const gate = deferred<ActionResult>();
    const execute = vi.fn(async () => gate.promise);
    const actions = new ActionRegistry();
    actions.register({ id: 'test.work', execute });
    const { fixture, outcomes } = await renderer(model(), actions);
    const button = await TestbedHarnessEnvironment.loader(fixture).getHarness(
      MatButtonHarness.with({ text: 'Run' }),
    );
    await button.click();
    await expect.poll(() => execute.mock.calls.length).toBe(1);
    expect(await button.isDisabled()).toBe(true);
    (fixture.nativeElement as HTMLElement).querySelector('button')!.click();
    await fixture.whenStable();
    expect(execute).toHaveBeenCalledTimes(1);
    gate.resolve({ status: 'success' });
    await expect.poll(() => outcomes.length).toBe(1);
    expect(await button.isDisabled()).toBe(false);
  });

  it('replaces an older change invocation and suppresses its late completion', async () => {
    const first = deferred<ActionResult>(),
      second = deferred<ActionResult>();
    const contexts: ActionContext[] = [];
    const actions = new ActionRegistry();
    actions.register({
      id: 'test.work',
      execute: async (_input, context) => {
        contexts.push(context);
        return context.data['name'] === 'First edit' ? first.promise : second.promise;
      },
    });
    const { fixture, outcomes, traces } = await renderer(model(), actions);
    change(fixture.nativeElement as HTMLElement, 'First edit');
    await expect.poll(() => contexts.length).toBe(1);
    change(fixture.nativeElement as HTMLElement, 'Second edit');
    await expect.poll(() => contexts.length).toBe(2);
    expect(contexts[0]!.signal.aborted).toBe(true);
    expect(contexts[1]!.signal.aborted).toBe(false);
    second.resolve({ status: 'success', value: 'current' });
    await expect.poll(() => outcomes.length).toBe(1);
    const traceCount = traces.length;
    first.resolve({ status: 'error', code: 'old.failure', message: 'Old request finished late' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.result).toEqual({ status: 'success', value: 'current' });
    expect(traces).toHaveLength(traceCount);
    expect(fixture.componentInstance.actionDispatcher.failure()).toBeNull();
  });

  it('stops an errored sequence and presents a safe error without leaking host exception text', async () => {
    const document = model();
    document.ui.children![1]!.events!['click'] = ['work', 'after'];
    document.actions['after'] = { handler: 'test.after' };
    const later = vi.fn(async (): Promise<ActionResult> => ({ status: 'success' }));
    const actions = new ActionRegistry();
    actions.register({
      id: 'test.work',
      execute: async () => {
        throw new Error('private adapter connection details');
      },
    });
    actions.register({ id: 'test.after', execute: later });
    const { fixture, outcomes, traces } = await renderer(document, actions);
    const button = await TestbedHarnessEnvironment.loader(fixture).getHarness(
      MatButtonHarness.with({ text: 'Run' }),
    );
    await button.click();
    await expect.poll(() => outcomes.length).toBe(1);
    expect(outcomes[0]!.result).toMatchObject({ status: 'error', code: 'action.failed' });
    expect(later).not.toHaveBeenCalled();
    expect(traces.map((entry) => [entry.actionId, entry.stage, entry.status])).toEqual([
      ['work', 'start', undefined],
      ['work', 'finish', 'error'],
    ]);
    await fixture.whenStable();
    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('action.failed');
    expect(alert.textContent).not.toContain('private adapter connection details');
    expect(await button.isDisabled()).toBe(false);
  });

  it.each(['document', 'revision', 'destroy'] as const)(
    'cancels on %s ownership changes and suppresses late results and traces',
    async (reason) => {
      const gate = deferred<ActionResult>();
      let context: ActionContext | undefined;
      const actions = new ActionRegistry();
      actions.register({
        id: 'test.work',
        execute: async (_input, current) => {
          context = current;
          return gate.promise;
        },
      });
      const document = model();
      const { fixture, outcomes, traces } = await renderer(document, actions);
      await (
        await TestbedHarnessEnvironment.loader(fixture).getHarness(
          MatButtonHarness.with({ text: 'Run' }),
        )
      ).click();
      await expect.poll(() => context).toBeDefined();
      if (reason === 'destroy') fixture.destroy();
      else {
        if (reason === 'document')
          fixture.componentRef.setInput('document', { ...document, id: 'actions-second' });
        else fixture.componentRef.setInput('host', { actions, revision: 'published:2' });
        await fixture.whenStable();
      }
      expect(context!.signal.aborted).toBe(true);
      const traceCount = traces.length;
      gate.resolve({ status: 'success', value: 'late' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(outcomes).toEqual([]);
      expect(traces).toHaveLength(traceCount);
      if (reason !== 'destroy')
        expect(fixture.componentInstance.actionDispatcher.pending().size).toBe(0);
    },
  );

  it('reports an unconfigured action host only when an action is actually bound', async () => {
    const document = model();
    const { fixture, outcomes } = await renderer(document);
    const button = await TestbedHarnessEnvironment.loader(fixture).getHarness(
      MatButtonHarness.with({ text: 'Run' }),
    );
    await button.click();
    await expect.poll(() => outcomes.length).toBe(1);
    expect(outcomes[0]!.result).toMatchObject({ status: 'error', code: 'action.unconfigured' });
    expect(await button.isDisabled()).toBe(false);
    const unbound = structuredClone(document);
    unbound.ui.children![1]!.events = {};
    fixture.componentRef.setInput('document', unbound);
    await fixture.whenStable();
    await button.click();
    await fixture.whenStable();
    expect(outcomes).toHaveLength(1);
  });
});
