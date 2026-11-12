import { documentFingerprint } from '@haven/runtime/editing';
import { defaultLimits, validateDocument } from '@haven/schema';
import type { Diagnostic, HavenDocument, ResourceBinding, ValidationResult } from '@haven/schema';
import { captureBoundedJson, captureDocument } from '@haven/schema/editing';
import type { EditingExpectation } from '@haven/schema/editing';
import { rendererCapabilities, validateRendererDocument } from '@haven/ui/renderer';
import type { CandidateSnapshot } from './candidate-contracts';

/** Trusted registrations available to this editor, never declarations supplied by a model. */
export interface CandidateHostGrants {
  actions?: readonly string[];
  resources?: Partial<Record<ResourceBinding['type'], readonly string[]>>;
  tableCellRenderers?: readonly string[];
  tableEditors?: readonly string[];
  tableFilters?: readonly string[];
  tableTooltips?: readonly string[];
  tableEdits?: readonly string[];
}

export interface CandidateReviewSource {
  document: HavenDocument;
  expected: EditingExpectation;
  draftRevision: number;
  capabilityFingerprint: string;
  supportedCapabilities?: readonly string[];
  host?: CandidateHostGrants;
}

/** Owned and deeply frozen at runtime. Invalid semantics remain visible for review. */
export interface AdmittedCandidate {
  readonly snapshot: CandidateSnapshot;
  readonly validation: ValidationResult;
}
export type CandidateReviewResult =
  { ok: true; review: AdmittedCandidate } | { ok: false; diagnostics: Diagnostic[] };

/** Opaque proof of a checked source. The owner must recheck it immediately before committing. */
export interface CandidateSourceGuard {
  readonly expected: EditingExpectation;
  readonly draftRevision: number;
}
export type CandidateSourceCheck =
  { ok: true; guard: CandidateSourceGuard } | { ok: false; diagnostics: Diagnostic[] };

const reviews = new WeakSet<AdmittedCandidate>();
const guards = new WeakMap<
  CandidateSourceGuard,
  { document: HavenDocument; serialized: string; context: string }
>();
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const revision = (value: unknown, minimum = 0): value is number =>
  Number.isSafeInteger(value) && (value as number) >= minimum;
const text = (value: unknown, maximum: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maximum;
const diagnostic = (code: string, path: string): Diagnostic => ({ code, path, message: code });
const failure = (code: string, path = ''): { ok: false; diagnostics: Diagnostic[] } => ({
  ok: false,
  diagnostics: [diagnostic(code, path)],
});
const sameExpected = (left: EditingExpectation, right: EditingExpectation): boolean =>
  left.documentId === right.documentId &&
  left.sessionId === right.sessionId &&
  left.editRevision === right.editRevision;
const expectation = (value: unknown): value is EditingExpectation =>
  record(value) &&
  Object.keys(value).length === 3 &&
  text(value['documentId'], 128) &&
  text(value['sessionId'], 160) &&
  revision(value['editRevision']);
const freeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

/** Snapshot transport has two documents; each still receives the ordinary document limits. */
export async function prepareCandidateReview(
  input: unknown,
  candidateId: string,
): Promise<CandidateReviewResult> {
  const captured = captureBoundedJson(input, {
    maxBytes: defaultLimits.maxBytes * 2 + 32_768,
    maxDepth: defaultLimits.maxDepth + 1,
    maxNodes: defaultLimits.maxNodes * 2 + 1,
  });
  if (!captured.ok) return { ok: false, diagnostics: [captured.diagnostic] };
  const value: unknown = JSON.parse(JSON.stringify(captured.value));
  if (
    !record(value) ||
    !/^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/.test(candidateId) ||
    value['candidateId'] !== candidateId ||
    !text(value['modelId'], 128) ||
    !revision(value['baseDraftRevision'], 1) ||
    !revision(value['currentDraftRevision'], value['baseDraftRevision'] as number) ||
    !revision(value['candidateRevision']) ||
    !expectation(value['source']) ||
    !expectation(value['editing']) ||
    !text(value['capabilityFingerprint'], 256) ||
    !text(value['sourceHash'], 128) ||
    !text(value['documentHash'], 128) ||
    !['open', 'discarded'].includes(value['status'] as string) ||
    !text(value['createdAt'], 64) ||
    !text(value['updatedAt'], 64) ||
    !Number.isFinite(Date.parse(value['createdAt'] as string)) ||
    !Number.isFinite(Date.parse(value['updatedAt'] as string)) ||
    Date.parse(value['updatedAt'] as string) < Date.parse(value['createdAt'] as string)
  )
    return failure('candidate.snapshot');
  const source = captureDocument(value['sourceDocument']);
  const document = captureDocument(value['document']);
  if (!source.ok) return { ok: false, diagnostics: source.validation.diagnostics };
  if (!document.ok) return { ok: false, diagnostics: document.validation.diagnostics };
  const snapshot = value as unknown as CandidateSnapshot;
  if (
    snapshot.modelId !== source.document.id ||
    snapshot.modelId !== document.document.id ||
    snapshot.source.documentId !== snapshot.modelId ||
    snapshot.editing.documentId !== snapshot.modelId ||
    snapshot.editing.sessionId !== `candidate:${candidateId}` ||
    snapshot.editing.editRevision !== snapshot.candidateRevision
  )
    return failure('candidate.identity');
  const [sourceHash, documentHash] = await Promise.all([
    documentFingerprint(source.document),
    documentFingerprint(document.document),
  ]);
  if (sourceHash !== snapshot.sourceHash) return failure('candidate.sourceHash', '/sourceHash');
  if (documentHash !== snapshot.documentHash)
    return failure('candidate.documentHash', '/documentHash');
  snapshot.sourceDocument = source.document;
  snapshot.document = document.document;
  const review = freeze({ snapshot, validation: validateRendererDocument(document.document) });
  reviews.add(review);
  return { ok: true, review };
}

function hostDiagnostics(document: HavenDocument, host: CandidateHostGrants = {}): Diagnostic[] {
  const result: Diagnostic[] = [];
  const require = (id: string, allowed: readonly string[] | undefined, path: string): void => {
    if (!allowed?.includes(id)) result.push(diagnostic('candidate.host', path));
  };
  const escape = (value: string): string => value.replaceAll('~', '~0').replaceAll('/', '~1');
  for (const [id, action] of Object.entries(document.actions))
    require(action.handler, host.actions, `/actions/${escape(id)}/handler`);
  for (const [id, resource] of Object.entries(document.resources))
    require(resource.adapter, host.resources?.[resource.type], `/resources/${escape(id)}/adapter`);
  const visit = (node: HavenDocument['ui'], path: string): void => {
    if (node.kind === 'table') {
      const editHandler = node.props?.['editHandler'];
      if (typeof editHandler === 'string')
        require(editHandler, host.tableEdits, `${path}/props/editHandler`);
      const columns = node.props?.['columns'];
      if (Array.isArray(columns))
        for (const [index, column] of columns.entries()) {
          if (!record(column)) continue;
          const base = `${path}/props/columns/${index}`;
          if (typeof column['renderer'] === 'string')
            require(column['renderer'], host.tableCellRenderers, `${base}/renderer`);
          if (record(column['editor']) && typeof column['editor']['id'] === 'string')
            require(column['editor']['id'], host.tableEditors, `${base}/editor/id`);
          if (record(column['filter']) && typeof column['filter']['id'] === 'string')
            require(column['filter']['id'], host.tableFilters, `${base}/filter/id`);
          if (record(column['tooltip']) && typeof column['tooltip']['provider'] === 'string')
            require(column['tooltip']['provider'], host.tableTooltips, `${base}/tooltip/provider`);
        }
    }
    node.children?.forEach((child, index) => visit(child, `${path}/children/${index}`));
  };
  visit(document.ui, '/ui');
  return result;
}

const sorted = (values: readonly string[] | undefined): string[] => [...(values ?? [])].sort();
function context(source: CandidateReviewSource): string {
  const host = source.host ?? {};
  return JSON.stringify([
    source.capabilityFingerprint,
    sorted(source.supportedCapabilities ?? rendererCapabilities),
    sorted(host.actions),
    ...(['query', 'options', 'upload', 'validation', 'tree'] as const).map((type) =>
      sorted(host.resources?.[type]),
    ),
    ...(
      ['tableCellRenderers', 'tableEditors', 'tableFilters', 'tableTooltips', 'tableEdits'] as const
    ).map((key) => sorted(host[key])),
  ]);
}

/** Checks the original browser source and the exact reviewed snapshot, never a "latest" receipt.
 * Server currentDraftRevision is the observation carried by this read, not a remote lock.
 * The owner fetches again when freshness is required and keeps saving/publishing separate.
 */
export async function checkCandidateSource(
  review: AdmittedCandidate,
  source: CandidateReviewSource,
): Promise<CandidateSourceCheck> {
  if (!reviews.has(review)) return failure('candidate.review');
  const snapshot = review.snapshot;
  if (snapshot.status !== 'open') return failure('candidate.closed', '/status');
  if (!review.validation.valid)
    return { ok: false, diagnostics: [...review.validation.diagnostics] };
  if (
    !sameExpected(snapshot.source, source.expected) ||
    source.document.id !== snapshot.modelId ||
    source.draftRevision !== snapshot.baseDraftRevision ||
    source.draftRevision !== snapshot.currentDraftRevision
  )
    return failure('candidate.source');
  if (source.capabilityFingerprint !== snapshot.capabilityFingerprint)
    return failure('candidate.capabilities', '/capabilityFingerprint');
  const validation = validateDocument(snapshot.document, {
    supportedCapabilities: source.supportedCapabilities ?? rendererCapabilities,
  });
  if (!validation.valid) return { ok: false, diagnostics: validation.diagnostics };
  const diagnostics = hostDiagnostics(snapshot.document, source.host);
  if (diagnostics.length) return { ok: false, diagnostics };
  const captured = captureDocument(source.document);
  if (!captured.ok) return { ok: false, diagnostics: captured.validation.diagnostics };
  // Capture all mutable caller state before asynchronous hashing; the final guard checks it again.
  const guard = freeze({ expected: { ...source.expected }, draftRevision: source.draftRevision });
  const retained = {
    document: source.document,
    serialized: JSON.stringify(captured.document),
    context: context(source),
  };
  if ((await documentFingerprint(captured.document)) !== snapshot.sourceHash)
    return failure('candidate.sourceHash', '/sourceHash');
  guards.set(guard, retained);
  return { ok: true, guard };
}

/** Synchronous final CAS guard; call with a fresh source immediately before DocumentSession.replace. */
export function candidateSourceCurrent(
  guard: CandidateSourceGuard,
  source: CandidateReviewSource,
): boolean {
  const retained = guards.get(guard);
  if (!retained) return false;
  try {
    return (
      source.document === retained.document &&
      sameExpected(guard.expected, source.expected) &&
      source.draftRevision === guard.draftRevision &&
      context(source) === retained.context &&
      JSON.stringify(source.document) === retained.serialized
    );
  } catch {
    return false;
  }
}
