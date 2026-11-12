import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HavenDocument } from '@haven/schema';
import type { EditingBatch } from '@haven/schema/editing';
import { CandidateApi } from './candidate-api';
import type {
  CandidateReceipt,
  CandidateSnapshot,
  CandidateValidation,
  CreateCandidateRequest,
} from './candidate-contracts';

const document: HavenDocument = {
  schemaVersion: '1.0',
  id: 'page',
  title: 'Unpublished human edits',
  dataSchema: { type: 'object', properties: {} },
  ui: { id: 'root', kind: 'form', version: 1, children: [] },
  theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
  actions: {},
  resources: {},
};
const source = { documentId: 'page', sessionId: 'browser-session', editRevision: 42 };
const editing = { documentId: 'page', sessionId: 'candidate:proposal', editRevision: 0 };
const batch: EditingBatch = {
  protocolVersion: '1.0',
  operationId: 'retained-operation',
  expected: editing,
  commands: [
    { type: 'document.patch', patch: [{ op: 'replace', path: '/title', value: 'Candidate' }] },
  ],
};
const receipt: CandidateReceipt = {
  candidateId: 'proposal',
  operationId: 'retained-operation',
  kind: 'commands',
  candidateRevision: 1,
  documentHash: 'candidate-hash',
  status: 'open',
  changed: true,
  createdAt: '2026-11-10T00:00:00Z',
};
const snapshot: CandidateSnapshot = {
  candidateId: 'proposal',
  modelId: 'page',
  baseDraftRevision: 3,
  currentDraftRevision: 4,
  source,
  sourceDocument: document,
  sourceHash: 'source-hash',
  capabilityFingerprint: 'declared-context',
  document: { ...document, title: 'Candidate' },
  documentHash: 'candidate-hash',
  candidateRevision: 1,
  editing: { ...editing, editRevision: 1 },
  status: 'open',
  createdAt: receipt.createdAt,
  updatedAt: receipt.createdAt,
};

describe('candidate HTTP transport boundary', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
  });
  const api = () => TestBed.inject(CandidateApi);
  const http = () => TestBed.inject(HttpTestingController);

  it('creates from the unsaved browser source with the caller operation ID and server baseline', async () => {
    const body: CreateCandidateRequest = {
      candidateId: 'proposal',
      operationId: 'create-operation',
      baseDraftRevision: 3,
      source,
      document,
      capabilityFingerprint: 'declared-context',
    };
    const work = firstValueFrom(api().create(document.id, body));
    const request = http().expectOne('/api/v1/models/page/candidates');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBe(body);
    expect(request.request.headers.has('If-Match')).toBe(false);
    const created: CandidateReceipt = {
      ...receipt,
      kind: 'create',
      operationId: body.operationId,
      candidateRevision: 0,
    };
    request.flush(created);
    expect(await work).toEqual(created);
    http().expectNone('/api/v1/candidates/proposal');
  });

  it('reads a fresh snapshot without conflating browser, server and candidate revisions', async () => {
    const work = firstValueFrom(api().read('proposal'));
    const request = http().expectOne('/api/v1/candidates/proposal');
    expect(request.request.cache).toBe('no-store');
    request.flush(snapshot);
    const result = await work;
    expect(result.source).toEqual(source);
    expect(result.editing).toEqual({ ...editing, editRevision: 1 });
    expect(result.baseDraftRevision).toBe(3);
    expect(result.currentDraftRevision).toBe(4);
    expect(result.candidateRevision).toBe(1);
  });

  it('sends the captured candidate batch unchanged with a zero-revision If-Match', async () => {
    const work = firstValueFrom(api().commands('proposal', 0, batch));
    const request = http().expectOne('/api/v1/candidates/proposal/commands');
    expect(request.request.headers.get('If-Match')).toBe('"candidate-0"');
    expect(request.request.body).toBe(batch);
    expect(request.request.body.expected).toEqual(editing);
    request.flush({ ...receipt, candidateRevision: 0, changed: false });
    expect(await work).toMatchObject({ candidateRevision: 0, changed: false });
    http().expectNone('/api/v1/candidates/proposal');
  });

  it('keeps validation evidence bound to the requested candidate version and hash', async () => {
    const work = firstValueFrom(api().validate('proposal', 1));
    const request = http().expectOne('/api/v1/candidates/proposal/validate');
    expect(request.request.headers.get('If-Match')).toBe('"candidate-1"');
    expect(request.request.body).toBeNull();
    const evidence: CandidateValidation = {
      candidateId: 'proposal',
      candidateRevision: 1,
      documentHash: 'candidate-hash',
      validation: {
        structural: true,
        valid: false,
        diagnostics: [{ code: 'binding.missing', path: '/ui', message: 'Missing binding' }],
        capabilities: ['form@1'],
      },
    };
    request.flush(evidence);
    expect(await work).toEqual(evidence);
  });

  it('discards with the same caller operation ID and does not pretend to accept or save the document', async () => {
    const work = firstValueFrom(api().discard('proposal', 1, 'discard-operation'));
    const request = http().expectOne('/api/v1/candidates/proposal/discard');
    expect(request.request.headers.get('If-Match')).toBe('"candidate-1"');
    expect(request.request.body).toEqual({ operationId: 'discard-operation' });
    request.flush({
      ...receipt,
      kind: 'discard',
      operationId: 'discard-operation',
      candidateRevision: 2,
      status: 'discarded',
    });
    expect(await work).toMatchObject({ candidateRevision: 2, status: 'discarded' });
    http().expectNone(
      (request) => request.url.includes('/draft') || request.url.includes('/publish'),
    );
  });

  it.each([409, 412, 422])(
    'passes %s errors and diagnostics through without retrying or replacing the expected baseline',
    async (status) => {
      const failure = firstValueFrom(api().commands('proposal', 0, batch)).catch(
        (error: unknown) => error,
      );
      const request = http().expectOne('/api/v1/candidates/proposal/commands');
      const error = {
        code: 'candidate.conflict',
        diagnostics: [{ code: 'editing.conflict', path: '/expected', message: 'Stale baseline' }],
        commandIndex: 1,
      };
      request.flush(error, { status, statusText: 'Rejected' });
      expect(await failure).toMatchObject({ status, error });
      http().expectNone(() => true);
      expect(batch.expected).toEqual(editing);
    },
  );

  it('leaves an uncertain write unresolved until the caller queries its original operation receipt', async () => {
    const failure = firstValueFrom(api().commands('proposal', 0, batch)).catch(
      (error: unknown) => error,
    );
    http().expectOne('/api/v1/candidates/proposal/commands').error(new ProgressEvent('error'));
    expect(await failure).toBeInstanceOf(HttpErrorResponse);
    http().expectNone(() => true);
    const lookup = firstValueFrom(api().operation('proposal', batch.operationId));
    const request = http().expectOne(
      (request) => request.url === '/api/v1/candidates/proposal/operations',
    );
    expect(request.request.params.get('operationId')).toBe(batch.operationId);
    expect(request.request.cache).toBe('no-store');
    request.flush(receipt);
    expect(await lookup).toEqual(receipt);
    http().expectNone('/api/v1/candidates/proposal');
  });

  it('encodes opaque operation identities as query parameters and keeps historical receipt metadata', async () => {
    const operationId = 'operation /?&+中文';
    const work = firstValueFrom(api().operation('proposal', operationId));
    const request = http().expectOne(
      (request) => request.url === '/api/v1/candidates/proposal/operations',
    );
    expect(request.request.params.get('operationId')).toBe(operationId);
    request.flush({ ...receipt, operationId, candidateRevision: 0 });
    expect(await work).toMatchObject({ operationId, candidateRevision: 0 });
  });

  it('does not turn a missing operation receipt into success or replay the write automatically', async () => {
    const failure = firstValueFrom(api().operation('proposal', 'unconfirmed')).catch(
      (error: unknown) => error,
    );
    http()
      .expectOne((request) => request.url.endsWith('/operations'))
      .flush({ code: 'candidate.operationMissing' }, { status: 404, statusText: 'Not found' });
    expect(await failure).toMatchObject({ status: 404 });
    http().expectNone(() => true);
  });

  it('lets the owner unsubscribe a read without starting a replacement request', () => {
    const subscription = api().read('proposal').subscribe();
    const request = http().expectOne('/api/v1/candidates/proposal');
    subscription.unsubscribe();
    expect(request.cancelled).toBe(true);
    http().expectNone(() => true);
  });
});
