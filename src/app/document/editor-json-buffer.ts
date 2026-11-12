import { computed, signal } from '@angular/core';
import { defaultLimits, validateDocument } from '@haven/schema';
import type { HavenDocument } from '@haven/schema';
import { StudioError } from '../core/errors';

interface JsonBufferHost {
  document(): HavenDocument | undefined;
  apply(document: HavenDocument): boolean;
  confirmOverwrite(): boolean;
}
/** Explicit candidate buffer; source changes never overwrite unsubmitted text. */
export class EditorJsonBuffer {
  readonly text = signal('');
  readonly error = signal<unknown>(null);
  readonly #baseline = signal('');
  readonly dirty = computed(() => this.text() !== this.#baseline());
  readonly conflict = computed(() => this.dirty() && this.serialized() !== this.#baseline());
  constructor(private readonly host: JsonBufferHost) {}
  private serialized(): string {
    return JSON.stringify(this.host.document(), null, 2) ?? '';
  }
  reset(): void {
    const text = this.serialized();
    this.#baseline.set(text);
    this.text.set(text);
    this.error.set(null);
  }
  apply(): void {
    if (this.conflict() && !this.host.confirmOverwrite()) return;
    try {
      if (new TextEncoder().encode(this.text()).byteLength > defaultLimits.maxBytes)
        throw new StudioError('error.jsonSize');
      const candidate: unknown = JSON.parse(this.text());
      if (!validateDocument(candidate).structural) throw new StudioError('error.documentStructure');
      const document = candidate as HavenDocument;
      if (document.id !== this.host.document()?.id) throw new StudioError('error.documentId');
      this.error.set(null);
      if (this.host.apply(document)) this.reset();
    } catch (error) {
      this.error.set(error);
    }
  }
}
export function downloadModelJson(text: string, id: string | undefined): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = `${id ?? 'haven'}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
