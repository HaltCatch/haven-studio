import {
  insertScopeProperty as insertRuntimeScopeProperty,
  sameDataScope as sameRuntimeDataScope,
} from '@haven/runtime/editing';
import type { DataSchema, HavenDocument } from '@haven/schema';
import { withStudioEditing } from './editing-errors';

export function sameDataScope(document: HavenDocument, left: string, right: string): boolean {
  return withStudioEditing(() => sameRuntimeDataScope(document, left, right));
}

export function insertScopeProperty(
  document: HavenDocument,
  parentId: string,
  name: string,
  field: DataSchema,
): DataSchema {
  return withStudioEditing(() => insertRuntimeScopeProperty(document, parentId, name, field));
}
