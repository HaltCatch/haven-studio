import type { HavenDocument, ValidationResult } from '@haven/schema';
import type { EditingExpectation } from '@haven/schema/editing';

/** Application HTTP DTOs mirror haven-api/candidates; document/editing grammar stays in Kit. */
export interface CreateCandidateRequest {
  candidateId: string;
  operationId: string;
  baseDraftRevision: number;
  /** Browser source identity, including local changes not yet saved to the model API. */
  source: EditingExpectation;
  document: HavenDocument;
  /** Recorded context, never renderer support, host permission, or user authorization. */
  capabilityFingerprint: string;
}
export type CandidateStatus = 'open' | 'discarded';
export interface CandidateSnapshot {
  candidateId: string;
  modelId: string;
  baseDraftRevision: number;
  currentDraftRevision: number;
  source: EditingExpectation;
  sourceDocument: HavenDocument;
  sourceHash: string;
  capabilityFingerprint: string;
  document: HavenDocument;
  documentHash: string;
  candidateRevision: number;
  /** Candidate-owned command baseline, separate from the browser source identity. */
  editing: EditingExpectation;
  status: CandidateStatus;
  createdAt: string;
  updatedAt: string;
}
/** Immutable historical write metadata; this is not the candidate's current snapshot. */
export interface CandidateReceipt {
  candidateId: string;
  operationId: string;
  kind: 'create' | 'commands' | 'discard';
  candidateRevision: number;
  documentHash: string;
  status: CandidateStatus;
  changed: boolean;
  createdAt: string;
}
/** Shared semantic validation only; renderer and host checks belong to later review. */
export interface CandidateValidation {
  candidateId: string;
  candidateRevision: number;
  documentHash: string;
  validation: ValidationResult;
}
