import { describe, expect, it, vi } from 'vitest';
import { documentFingerprint } from '@haven/runtime/editing';
import { rendererCapabilities } from '@haven/ui/renderer';
import type { CandidateSnapshot } from './candidate-contracts';
import {
  candidateSourceCurrent,
  checkCandidateSource,
  prepareCandidateReview,
} from './candidate-review';
import type { AdmittedCandidate, CandidateReviewSource } from './candidate-review';
import { newDocument } from '../document/document-edit';
import { DocumentSession } from '../document/session/document-session';

const source = (): CandidateReviewSource => ({
  document: newDocument('page', 'Unsaved human title'),
  expected: { documentId: 'page', sessionId: 'browser-one', editRevision: 7 },
  draftRevision: 3,
  capabilityFingerprint: 'actual-host-context',
  supportedCapabilities: [...rendererCapabilities],
});
async function snapshot(current = source()): Promise<CandidateSnapshot> {
  const document = { ...structuredClone(current.document), title: 'Reviewed proposal' };
  return {
    candidateId: 'proposal-one',
    modelId: current.document.id,
    baseDraftRevision: current.draftRevision,
    currentDraftRevision: current.draftRevision,
    source: { ...current.expected },
    sourceDocument: structuredClone(current.document),
    sourceHash: await documentFingerprint(current.document),
    capabilityFingerprint: current.capabilityFingerprint,
    document,
    documentHash: await documentFingerprint(document),
    candidateRevision: 4,
    editing: { documentId: 'page', sessionId: 'candidate:proposal-one', editRevision: 4 },
    status: 'open',
    createdAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-10T00:01:00.000Z',
  };
}
async function prepare(value: CandidateSnapshot): Promise<AdmittedCandidate> {
  const result = await prepareCandidateReview(value, value.candidateId);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.review;
}

describe('candidate review admission', () => {
  it('owns and freezes the exact hashed proposal without freezing or changing the editor source', async () => {
    const current = source();
    const value = await snapshot(current);
    const review = await prepare(value);
    value.document.title = 'Later response mutation';
    expect(review.snapshot.document.title).toBe('Reviewed proposal');
    expect(Object.isFrozen(review.snapshot.document.ui.children)).toBe(true);
    expect(() => (review.snapshot.document.title = 'Mutation')).toThrow();
    expect(Object.isFrozen(current.document)).toBe(false);
    const checked = await checkCandidateSource(review, current);
    expect(checked.ok && candidateSourceCurrent(checked.guard, current)).toBe(true);
    expect(current.document.title).toBe('Unsaved human title');
  });

  it.each(['sourceHash', 'documentHash'] as const)('rejects a forged %s', async (key) => {
    const value = await snapshot();
    value[key] = 'haven-json-v1:sha256:' + '0'.repeat(64);
    const result = await prepareCandidateReview(value, value.candidateId);
    expect(!result.ok && result.diagnostics[0]?.code).toBe(`candidate.${key}`);
  });

  it.each([
    ['wrong requested identity', (value: CandidateSnapshot) => (value.candidateId = 'different')],
    ['model identity', (value: CandidateSnapshot) => (value.modelId = 'other')],
    ['source identity', (value: CandidateSnapshot) => (value.source.documentId = 'other')],
    ['candidate owner', (value: CandidateSnapshot) => (value.editing.sessionId = 'browser-one')],
    ['candidate revision', (value: CandidateSnapshot) => (value.editing.editRevision = 3)],
    ['unsafe revision', (value: CandidateSnapshot) => (value.candidateRevision = 2 ** 53)],
  ])('rejects inconsistent %s', async (_label, mutate) => {
    const value = await snapshot();
    mutate(value);
    expect((await prepareCandidateReview(value, 'proposal-one')).ok).toBe(false);
  });

  it('rejects non-JSON input without invoking getters', async () => {
    const getter = vi.fn(() => 'proposal-one');
    const input = Object.defineProperty({}, 'candidateId', { enumerable: true, get: getter });
    expect((await prepareCandidateReview(input, 'proposal-one')).ok).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });

  it('uses the shared canonical fingerprint when object key order differs', async () => {
    const current = source();
    const value = await snapshot(current);
    value.sourceDocument = Object.fromEntries(
      Object.entries(value.sourceDocument).reverse(),
    ) as unknown as CandidateSnapshot['document'];
    const review = await prepare(value);
    expect((await checkCandidateSource(review, current)).ok).toBe(true);
  });

  it('keeps unsupported proposals inspectable but prevents their acceptance', async () => {
    const current = source();
    const value = await snapshot(current);
    value.document.ui.kind = 'third-party.unavailable';
    value.documentHash = await documentFingerprint(value.document);
    const review = await prepare(value);
    expect(review.snapshot.document.ui.kind).toBe('third-party.unavailable');
    expect(review.validation.valid).toBe(false);
    const checked = await checkCandidateSource(review, current);
    expect(checked.ok).toBe(false);
    expect(!checked.ok && checked.diagnostics.length).toBeGreaterThan(0);
  });

  it('displays a discarded snapshot but never accepts it', async () => {
    const current = source();
    const value = await snapshot(current);
    value.status = 'discarded';
    const checked = await checkCandidateSource(await prepare(value), current);
    expect(!checked.ok && checked.diagnostics[0]?.code).toBe('candidate.closed');
  });

  it.each([
    ['switching session', (current: CandidateReviewSource) => (current.expected.sessionId = 'new')],
    ['ABA undo', (current: CandidateReviewSource) => (current.expected.editRevision += 2)],
    ['saved draft', (current: CandidateReviewSource) => (current.draftRevision += 1)],
    ['host context', (current: CandidateReviewSource) => (current.capabilityFingerprint = 'new')],
    ['source content', (current: CandidateReviewSource) => (current.document.title = 'New work')],
  ])('rejects changed %s before review is accepted', async (_label, mutate) => {
    const current = source();
    const review = await prepare(await snapshot(current));
    mutate(current);
    expect((await checkCandidateSource(review, current)).ok).toBe(false);
  });

  it('rejects an observed newer server draft even when local source has not changed', async () => {
    const current = source();
    const value = await snapshot(current);
    value.currentDraftRevision++;
    const checked = await checkCandidateSource(await prepare(value), current);
    expect(!checked.ok && checked.diagnostics[0]?.code).toBe('candidate.source');
  });

  it('requires actual renderer support in addition to the recorded context fingerprint', async () => {
    const current = source();
    const review = await prepare(await snapshot(current));
    current.supportedCapabilities = [];
    const checked = await checkCandidateSource(review, current);
    expect(
      !checked.ok && checked.diagnostics.some((item) => item.code === 'component.unsupported'),
    ).toBe(true);
  });

  it('requires separate explicit action and resource host registrations', async () => {
    const current = source();
    const value = await snapshot(current);
    value.document.actions = { write: { handler: 'app.write' } };
    value.document.resources = { remote: { adapter: 'app.tree', type: 'tree' } };
    value.documentHash = await documentFingerprint(value.document);
    const review = await prepare(value);
    const denied = await checkCandidateSource(review, current);
    expect(!denied.ok && denied.diagnostics.map((item) => item.path)).toEqual([
      '/actions/write/handler',
      '/resources/remote/adapter',
    ]);
    current.host = { actions: ['app.write'], resources: { tree: ['app.tree'] } };
    expect((await checkCandidateSource(review, current)).ok).toBe(true);
    current.host.resources = { query: ['app.tree'] };
    expect((await checkCandidateSource(review, current)).ok).toBe(false);
  });

  it('checks table plugin references as host capabilities instead of trusting column declarations', async () => {
    const current = source();
    const value = await snapshot(current);
    value.document.dataSchema.properties = {
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
        },
      },
    };
    value.document.ui.children = [
      {
        id: 'table',
        kind: 'table',
        version: 1,
        bind: '/rows',
        props: {
          rowKey: '/id',
          columns: [
            {
              id: 'name',
              header: 'Name',
              path: '/name',
              renderer: 'app.cell',
              editor: { id: 'text' },
              filter: { id: 'text' },
              tooltip: { provider: 'app.tooltip' },
            },
          ],
        },
      },
    ];
    value.documentHash = await documentFingerprint(value.document);
    const review = await prepare(value);
    expect(review.validation.valid).toBe(true);
    const denied = await checkCandidateSource(review, current);
    expect(!denied.ok && denied.diagnostics.map((item) => item.path)).toEqual([
      '/ui/children/0/props/columns/0/renderer',
      '/ui/children/0/props/columns/0/editor/id',
      '/ui/children/0/props/columns/0/filter/id',
      '/ui/children/0/props/columns/0/tooltip/provider',
    ]);
    current.host = {
      tableCellRenderers: ['app.cell'],
      tableEditors: ['text'],
      tableFilters: ['text'],
      tableTooltips: ['app.tooltip'],
    };
    const checked = await checkCandidateSource(review, current);
    if (!checked.ok) throw new Error(JSON.stringify(checked.diagnostics));
    current.host.tableTooltips = [];
    expect(candidateSourceCurrent(checked.guard, current)).toBe(false);
  });

  it('accepts two legal near-limit documents in an envelope without raising each document budget', async () => {
    const current = source();
    current.document.ui.props = { title: '' };
    const bytes = new TextEncoder().encode(JSON.stringify(current.document)).byteLength;
    current.document.ui.props['title'] = 'x'.repeat(1_048_576 - bytes);
    const value = await snapshot(current);
    const review = await prepare(value);
    expect(review.validation.valid).toBe(true);
    value.document.ui.props!['title'] += 'x'.repeat(1024);
    const oversized = await prepareCandidateReview(value, value.candidateId);
    expect(
      !oversized.ok && oversized.diagnostics.some((item) => item.code.startsWith('limit.')),
    ).toBe(true);
  });

  it('does not accept a hand-built review or a hand-built source guard', async () => {
    const current = source();
    const review = await prepare(await snapshot(current));
    expect((await checkCandidateSource({ ...review }, current)).ok).toBe(false);
    expect(candidateSourceCurrent({ expected: current.expected, draftRevision: 3 }, current)).toBe(
      false,
    );
  });

  it('rechecks source identity, in-place mutations and permission removal synchronously after hashing', async () => {
    const current = source();
    const checked = await checkCandidateSource(await prepare(await snapshot(current)), current);
    if (!checked.ok) throw new Error('Expected valid source');
    expect(
      candidateSourceCurrent(checked.guard, {
        ...current,
        document: structuredClone(current.document),
      }),
    ).toBe(false);
    current.document.title = 'Mutated after asynchronous check';
    expect(candidateSourceCurrent(checked.guard, current)).toBe(false);
    current.document.title = 'Unsaved human title';
    expect(candidateSourceCurrent(checked.guard, current)).toBe(true);
    current.supportedCapabilities = [];
    expect(candidateSourceCurrent(checked.guard, current)).toBe(false);
  });

  it('detects mutable owner state changing while the source hash is in flight', async () => {
    const current = source();
    const review = await prepare(await snapshot(current));
    const original = crypto.subtle.digest.bind(crypto.subtle);
    const digest = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
      current.expected.editRevision++;
      return original(...args);
    });
    try {
      const checked = await checkCandidateSource(review, current);
      expect(checked.ok && candidateSourceCurrent(checked.guard, current)).toBe(false);
    } finally {
      digest.mockRestore();
    }
  });

  it('admits the reviewed full snapshot as exactly one existing history step with monotonic undo', async () => {
    const session = new DocumentSession(newDocument('page'), 'browser-one');
    const current: CandidateReviewSource = {
      ...source(),
      document: session.document,
      expected: session.expected,
    };
    const value = await snapshot(current);
    value.document.ui.children = [
      { id: 'new-heading', kind: 'view.text', version: 1, props: { text: 'Generated layout' } },
    ];
    value.documentHash = await documentFingerprint(value.document);
    const review = await prepare(value);
    const checked = await checkCandidateSource(review, current);
    if (!checked.ok) throw new Error(JSON.stringify(checked.diagnostics));
    expect(
      session.replace(review.snapshot.document, () =>
        candidateSourceCurrent(checked.guard, {
          ...current,
          document: session.document,
          expected: session.expected,
        }),
      ),
    ).toBe(true);
    expect(session.document.ui.children?.[0]?.id).toBe('new-heading');
    expect(session.editRevision).toBe(1);
    expect(session.undo()).toBe(true);
    expect(session.document.ui.children).toEqual([]);
    expect(session.document.title).toBe('Untitled page');
    expect(session.canUndo).toBe(false);
    expect(session.editRevision).toBe(2);
  });
});
