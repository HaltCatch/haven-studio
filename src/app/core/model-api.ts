import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { Diagnostic, HavenDocument } from '@haven/schema';
export interface ModelSummary {
  id: string;
  title: string;
  draftRevision: number;
  publicationRevision: number;
  publishedVersion: number | null;
  updatedAt: string;
}
export interface Draft {
  document: HavenDocument;
  draftRevision: number;
  updatedAt: string;
  diagnostics: Diagnostic[];
}
export interface Version {
  version: number;
  draftRevision: number;
  createdAt: string;
}
export interface Snapshot extends Version {
  document: HavenDocument;
  publicationRevision?: number;
}
export interface Publication {
  version: number;
  publicationRevision: number;
}
@Injectable({ providedIn: 'root' })
export class ModelApi {
  readonly #http = inject(HttpClient);
  readonly #base = '/api/v1/models';
  list() {
    return firstValueFrom(this.#http.get<ModelSummary[]>(this.#base));
  }
  create(document: HavenDocument) {
    return firstValueFrom(this.#http.post<Draft>(this.#base, document));
  }
  draft(id: string) {
    return firstValueFrom(this.#http.get<Draft>(`${this.#base}/${encodeURIComponent(id)}/draft`));
  }
  save(document: HavenDocument, revision: number) {
    return firstValueFrom(
      this.#http.put<Draft>(`${this.#base}/${encodeURIComponent(document.id)}/draft`, document, {
        headers: { 'If-Match': `"draft-${revision}"` },
      }),
    );
  }
  delete(id: string, draftRevision: number, publicationRevision: number) {
    return firstValueFrom(
      this.#http.delete<void>(`${this.#base}/${encodeURIComponent(id)}`, {
        headers: { 'If-Match': `"model-${draftRevision}-${publicationRevision}"` },
      }),
    );
  }
  versions(id: string) {
    return firstValueFrom(
      this.#http.get<Version[]>(`${this.#base}/${encodeURIComponent(id)}/versions`),
    );
  }
  version(id: string, version: number) {
    return firstValueFrom(
      this.#http.get<Snapshot>(`${this.#base}/${encodeURIComponent(id)}/versions/${version}`, {
        headers: { 'Cache-Control': 'no-cache' },
      }),
    );
  }
  published(id: string) {
    return firstValueFrom(
      this.#http.get<Snapshot & Publication>(`${this.#base}/${encodeURIComponent(id)}/published`),
    );
  }
  publish(
    id: string,
    draftRevision: number,
    expectedPublishedRevision: number,
    idempotencyKey: string,
  ) {
    return firstValueFrom(
      this.#http.post<Publication>(`${this.#base}/${encodeURIComponent(id)}/publish`, {
        draftRevision,
        expectedPublishedRevision,
        idempotencyKey,
      }),
    );
  }
  rollback(id: string, version: number, expectedPublishedRevision: number, idempotencyKey: string) {
    return firstValueFrom(
      this.#http.post<Publication>(`${this.#base}/${encodeURIComponent(id)}/rollback`, {
        version,
        expectedPublishedRevision,
        idempotencyKey,
      }),
    );
  }
}
