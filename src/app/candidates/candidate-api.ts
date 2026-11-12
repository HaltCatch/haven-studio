import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { EditingBatch } from '@haven/schema/editing';
import type {
  CandidateReceipt,
  CandidateSnapshot,
  CandidateValidation,
  CreateCandidateRequest,
} from './candidate-contracts';

/** Cold HTTP requests. Callers retain operation IDs and own review, cancellation and retries.
 * Unsubscribing cancels observation/transport; a server write may already have committed.
 * No method accepts a candidate into an open editor, saves a draft, or grants host capability.
 */
@Injectable({ providedIn: 'root' })
export class CandidateApi {
  readonly #http = inject(HttpClient);
  readonly #base = '/api/v1/candidates';

  create(modelId: string, request: CreateCandidateRequest): Observable<CandidateReceipt> {
    return this.#http.post<CandidateReceipt>(
      `/api/v1/models/${encodeURIComponent(modelId)}/candidates`,
      request,
    );
  }
  read(id: string): Observable<CandidateSnapshot> {
    return this.#http.get<CandidateSnapshot>(this.path(id), { cache: 'no-store' });
  }
  commands(id: string, revision: number, batch: EditingBatch): Observable<CandidateReceipt> {
    return this.#http.post<CandidateReceipt>(`${this.path(id)}/commands`, batch, {
      headers: this.match(revision),
    });
  }
  validate(id: string, revision: number): Observable<CandidateValidation> {
    return this.#http.post<CandidateValidation>(`${this.path(id)}/validate`, null, {
      headers: this.match(revision),
    });
  }
  discard(id: string, revision: number, operationId: string): Observable<CandidateReceipt> {
    return this.#http.post<CandidateReceipt>(
      `${this.path(id)}/discard`,
      { operationId },
      { headers: this.match(revision) },
    );
  }
  operation(id: string, operationId: string): Observable<CandidateReceipt> {
    return this.#http.get<CandidateReceipt>(`${this.path(id)}/operations`, {
      params: { operationId },
      cache: 'no-store',
    });
  }
  private path(id: string): string {
    return `${this.#base}/${encodeURIComponent(id)}`;
  }
  private match(revision: number): Record<string, string> {
    return { 'If-Match': `"candidate-${revision}"` };
  }
}
