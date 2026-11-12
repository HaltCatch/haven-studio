import { applyEditingBatch } from '@haven/runtime/editing';
import type { EditingOptions, EditingResult } from '@haven/runtime/editing';
import type { HavenDocument } from '@haven/schema';
import type { EditingExpectation } from '@haven/schema/editing';
import { StudioError } from '../../core/errors';
import { DocumentHistory } from '../document-edit';

type CommitGuard = (next: HavenDocument) => boolean;
const permit: CommitGuard = () => true;
export const sessionFailure = (code: string): EditingResult => ({
  ok: false,
  diagnostics: [{ code, path: '/expected', message: code }],
});

/** Local owner of the current document. Revisions never rewind with undo/redo. */
export class DocumentSession {
  readonly #history: DocumentHistory;
  #revision = 0;
  constructor(
    document: HavenDocument,
    readonly id: string = crypto.randomUUID(),
  ) {
    this.#history = new DocumentHistory(document);
  }
  get document(): HavenDocument {
    return this.#history.current;
  }
  get editRevision(): number {
    return this.#revision;
  }
  get expected(): EditingExpectation {
    return { documentId: this.document.id, sessionId: this.id, editRevision: this.#revision };
  }
  get canUndo(): boolean {
    return this.#history.canUndo;
  }
  get canRedo(): boolean {
    return this.#history.canRedo;
  }
  replace(next: HavenDocument, guard: CommitGuard = permit): boolean {
    if (next.id !== this.document.id) throw new StudioError('error.documentId');
    const revision = this.#revision;
    if (!guard(next) || revision !== this.#revision) return false;
    const before = JSON.stringify(this.document);
    const changed = JSON.stringify(next) !== before;
    if (changed) this.checkRevision();
    this.#history.push(next);
    if (changed) this.#revision++;
    return true;
  }
  apply(input: unknown, guard: CommitGuard = permit, options: EditingOptions = {}): EditingResult {
    const revision = this.#revision;
    const result = applyEditingBatch(
      { document: this.document, sessionId: this.id, editRevision: revision },
      input,
      options,
    );
    if (!result.ok) return result;
    if (!guard(result.document)) return sessionFailure('editing.pending');
    // A host callback may synchronously cause another edit; never commit over its new baseline.
    if (revision !== this.#revision) return sessionFailure('editing.conflict');
    if (!result.changes.length) return { ...result, document: this.document };
    this.#history.push(result.document);
    this.#revision = result.editRevision;
    return result;
  }
  undo(guard: CommitGuard = permit): boolean {
    return this.navigate('undo', this.#history.undoTarget, guard);
  }
  redo(guard: CommitGuard = permit): boolean {
    return this.navigate('redo', this.#history.redoTarget, guard);
  }
  private navigate(
    direction: 'undo' | 'redo',
    target: HavenDocument | undefined,
    guard: CommitGuard,
  ): boolean {
    if (!target) return false;
    const revision = this.#revision;
    if (!guard(target) || revision !== this.#revision) return false;
    this.checkRevision();
    this.#history[direction]();
    this.#revision++;
    return true;
  }
  private checkRevision(): void {
    if (this.#revision >= Number.MAX_SAFE_INTEGER) throw new StudioError('error.conflict');
  }
}
