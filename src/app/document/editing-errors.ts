import { HavenEditingError } from '@haven/runtime/editing';
import type { HavenEditingErrorCode } from '@haven/runtime/editing';
import { StudioError } from '../core/errors';

const errorKeys = {
  'editing.duplicateNode': 'error.duplicateNode',
  'editing.moveTarget': 'error.moveTarget',
  'editing.notContainer': 'error.notContainer',
  'editing.moveCycle': 'error.moveCycle',
  'editing.moveScope': 'error.moveScope',
  'editing.rootRemoval': 'error.rootRemoval',
  'editing.editScope': 'error.editScope',
  'editing.bindingCollision': 'error.bindingCollision',
  'editing.resourceCollision': 'error.resourceCollision',
  'editing.position': 'error.moveTarget',
  'editing.missingNode': 'error.moveTarget',
  'editing.patchPath': 'error.documentStructure',
  'editing.patch': 'error.documentStructure',
} satisfies Record<HavenEditingErrorCode, string>;

/** Shared editing codes become existing localized Studio errors only at this boundary. */
export function withStudioEditing<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof HavenEditingError) throw new StudioError(errorKeys[error.code]);
    throw error;
  }
}
