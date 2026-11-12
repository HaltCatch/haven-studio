import { HttpErrorResponse } from '@angular/common/http';
import type { StudioI18n } from './i18n';
export class StudioError extends Error {
  constructor(readonly key: string) {
    super(key);
  }
}
export function errorMessage(error: unknown, i18n: StudioI18n): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return i18n.text('error.network');
    if (error.status === 412) return i18n.text('error.conflict');
    if (error.status === 401) return i18n.text('error.auth');
    return i18n.text('error.http', { status: error.status });
  }
  if (error instanceof StudioError) return i18n.text(error.key);
  if (error instanceof SyntaxError) return i18n.text('error.invalidJson');
  return i18n.text('error.unknown');
}
