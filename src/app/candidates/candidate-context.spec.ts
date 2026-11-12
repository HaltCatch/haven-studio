import { describe, expect, it } from 'vitest';
import type { HavenRendererHost } from '@haven/ui/renderer';
import { ActionRegistry } from '@haven/runtime';
import type { TreeDataAdapter } from '@haven/runtime';
import { createHavenTableEditors, createHavenTableFilters } from '@haven/ui/table';
import {
  candidateContextFingerprint,
  candidateContextKey,
  candidateHostContext,
} from './candidate-context';

describe('candidate trusted context', () => {
  it('uses actual registrations and the same Kit defaults as an ordinary renderer', () => {
    const context = candidateHostContext({});
    expect(context.tableEditors).toEqual([...createHavenTableEditors().keys()].sort());
    expect(context.tableFilters).toEqual([...createHavenTableFilters().keys()].sort());
    expect(context.actions).toEqual([]);
    expect(context.resources).toEqual({
      query: [],
      options: [],
      upload: [],
      validation: [],
      tree: [],
    });
  });

  it('preserves explicit empty map overrides rather than regranting default extensions', () => {
    const host: HavenRendererHost = { tableEditors: new Map(), tableFilters: new Map() };
    expect(candidateHostContext(host).tableEditors).toEqual([]);
    expect(candidateHostContext(host).tableFilters).toEqual([]);
  });

  it('does not infer action permission from a non-enumerable action registry', () => {
    const actions = new ActionRegistry();
    actions.register({ id: 'server.write', execute: async () => ({ status: 'success' }) });
    expect(candidateHostContext({ actions }).actions).toEqual([]);
  });

  it('creates deterministic fingerprints sensitive to real host revision or permission changes', async () => {
    const adapter: TreeDataAdapter = {
      children: async () => [],
      resolve: async () => ({ paths: [], unresolved: [] }),
    };
    const left: HavenRendererHost = {
      revision: 'host-v1',
      trees: new Map([
        ['second', adapter],
        ['first', adapter],
      ]),
    };
    const right: HavenRendererHost = {
      revision: 'host-v1',
      trees: new Map([
        ['first', adapter],
        ['second', adapter],
      ]),
    };
    const key = candidateContextKey(left);
    expect(candidateContextKey(right)).toBe(key);
    const fingerprint = await candidateContextFingerprint(key);
    expect(await candidateContextFingerprint(candidateContextKey(right))).toBe(fingerprint);
    expect(fingerprint.length).toBeLessThanOrEqual(256);
    expect(
      await candidateContextFingerprint(candidateContextKey({ ...right, revision: 'host-v2' })),
    ).not.toBe(fingerprint);
    expect(
      await candidateContextFingerprint(candidateContextKey({ revision: 'host-v1' })),
    ).not.toBe(fingerprint);
    expect(JSON.parse(key).protocolVersion).toBe('1.0');
  });
});
