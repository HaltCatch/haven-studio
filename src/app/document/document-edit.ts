import {
  flattenTree as flattenRuntimeTree,
  insertNode,
  isContainer,
  moveNode as moveRuntimeNode,
  removeNode as removeRuntimeNode,
  replaceDataSchema as replaceRuntimeDataSchema,
  setProperty as setRuntimeProperty,
  setRequired as setRuntimeRequired,
  updateNode as updateRuntimeNode,
} from '@haven/runtime/editing';
import type { TreeEntry } from '@haven/runtime/editing';
import { createNode } from './node-factory';
import { withStudioEditing } from './editing-errors';
import { StudioError } from '../core/errors';
import { validateDocument } from '@haven/schema';
import type { DataSchema, HavenDocument, JsonValue, UiNode } from '@haven/schema';

export type { TreeEntry } from '@haven/runtime/editing';
export function flattenTree(root: UiNode): TreeEntry[] {
  return withStudioEditing(() => flattenRuntimeTree(root));
}
export function updateNode(
  document: HavenDocument,
  id: string,
  update: (node: UiNode) => UiNode,
): HavenDocument {
  return withStudioEditing(() => updateRuntimeNode(document, id, update));
}
export function newDocument(id: string, title = 'Untitled page'): HavenDocument {
  return {
    schemaVersion: '1.0',
    id,
    title,
    dataSchema: { type: 'object', properties: {} },
    ui: { id: 'root', kind: 'form', version: 1, children: [] },
    theme: { preset: 'material', mode: 'dark', density: 'comfortable' },
    actions: {},
    resources: {},
  };
}
export function addNode(
  document: HavenDocument,
  parentId: string,
  kind: string,
  id: string,
): HavenDocument {
  // Retain the existing error precedence before invoking Studio's creation defaults.
  const entries = flattenTree(document.ui);
  if (entries.some((entry) => entry.node.id === id)) throw new StudioError('error.duplicateNode');
  const parent = entries.find((entry) => entry.node.id === parentId)?.node;
  if (!parent) throw new StudioError('error.moveTarget');
  if (!isContainer(parent)) throw new StudioError('error.notContainer');
  const { node, schema, resources } = createNode(kind, id);
  return withStudioEditing(() =>
    insertNode(document, parentId, null, node, {
      ...(schema ? { schema } : {}),
      ...(resources ? { resources } : {}),
    }),
  );
}
export function removeNode(document: HavenDocument, id: string): HavenDocument {
  return withStudioEditing(() => removeRuntimeNode(document, id));
}
export function moveNode(
  document: HavenDocument,
  id: string,
  parentId: string,
  index: number,
): HavenDocument {
  return withStudioEditing(() => moveRuntimeNode(document, id, parentId, index));
}
export function setProperty(
  document: HavenDocument,
  id: string,
  name: string,
  value: JsonValue,
): HavenDocument {
  return withStudioEditing(() => setRuntimeProperty(document, id, name, value));
}
export function setRequired(document: HavenDocument, id: string, required: boolean): HavenDocument {
  return withStudioEditing(() => setRuntimeRequired(document, id, required));
}
export function replaceDataSchema(document: HavenDocument, dataSchema: DataSchema): HavenDocument {
  return withStudioEditing(() => replaceRuntimeDataSchema(document, dataSchema));
}

/** Bounded immutable undo history. External refreshes reset the history explicitly. */
export class DocumentHistory {
  #past: HavenDocument[] = [];
  #future: HavenDocument[] = [];
  constructor(
    public current: HavenDocument,
    private readonly budgetBytes = 8 * 1024 * 1024,
  ) {}
  get canUndo(): boolean {
    return this.#past.length > 0;
  }
  get canRedo(): boolean {
    return this.#future.length > 0;
  }
  get undoTarget(): HavenDocument | undefined {
    return this.#past.at(-1);
  }
  get redoTarget(): HavenDocument | undefined {
    return this.#future.at(-1);
  }
  push(next: HavenDocument): void {
    if (!validateDocument(next).structural) throw new StudioError('error.documentStructure');
    if (JSON.stringify(next) === JSON.stringify(this.current)) return;
    this.#past.push(this.current);
    this.current = next;
    this.#future = [];
    let size = new TextEncoder().encode(JSON.stringify(this.#past)).byteLength;
    while (this.#past.length && (this.#past.length > 50 || size > this.budgetBytes)) {
      this.#past.shift();
      size = new TextEncoder().encode(JSON.stringify(this.#past)).byteLength;
    }
  }
  undo(): HavenDocument {
    const previous = this.#past.pop();
    if (previous) {
      this.#future.push(this.current);
      this.current = previous;
    }
    return this.current;
  }
  redo(): HavenDocument {
    const next = this.#future.pop();
    if (next) {
      this.#past.push(this.current);
      this.current = next;
    }
    return this.current;
  }
}
