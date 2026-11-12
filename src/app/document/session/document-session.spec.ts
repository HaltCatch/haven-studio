import { describe, expect, it } from 'vitest';
import type { EditingBatch, EditingCommand } from '@haven/schema/editing';
import { newDocument } from '../document-edit';
import { DocumentSession } from './document-session';

const rename = (title: string): EditingCommand => ({
  type: 'document.patch',
  patch: [{ op: 'replace', path: '/title', value: title }],
});
const batch = (session: DocumentSession, commands = [rename('Changed')]): EditingBatch => ({
  protocolVersion: '1.0',
  operationId: 'operation-1',
  expected: session.expected,
  commands,
});

describe('local document session', () => {
  it('keeps revisions monotonic across visual changes, batches, undo, redo and no-ops', () => {
    const session = new DocumentSession(newDocument('page'));
    session.replace({ ...session.document, title: 'Human' });
    expect(session.editRevision).toBe(1);
    session.undo();
    expect(session.editRevision).toBe(2);
    session.redo();
    expect(session.editRevision).toBe(3);
    session.redo();
    session.replace({ ...session.document });
    const result = session.apply(batch(session, [rename('Human')]));
    expect(result.ok && result.changes).toEqual([]);
    expect(session.editRevision).toBe(3);
  });

  it('commits a multi-command batch as one undo step and preserves translations', () => {
    const document = newDocument('page');
    document.ui.props = { title: { default: 'Original', translations: { 'zh-CN': '原始' } } };
    const session = new DocumentSession(document);
    const result = session.apply(
      batch(session, [
        {
          type: 'node.patch',
          nodeId: 'root',
          patch: [{ op: 'replace', path: '/props/title/translations/zh-CN', value: '新标题' }],
        },
        {
          type: 'node.patch',
          nodeId: 'root',
          patch: [{ op: 'add', path: '/props/gap', value: 'lg' }],
        },
      ]),
    );
    expect(result.ok).toBe(true);
    expect(session.document.ui.props?.['title']).toEqual({
      default: 'Original',
      translations: { 'zh-CN': '新标题' },
    });
    expect(session.document.ui.props?.['gap']).toBe('lg');
    expect(document.ui.props['title']).toEqual({
      default: 'Original',
      translations: { 'zh-CN': '原始' },
    });
    expect(session.editRevision).toBe(1);
    session.undo();
    expect(session.document).toEqual(document);
    expect(session.canUndo).toBe(false);
    expect(session.editRevision).toBe(2);
  });

  it('does not add history for a semantic no-op that only changes object key order', () => {
    const document = newDocument('page');
    document.ui.props = { gap: 'md', title: 'Heading' };
    const session = new DocumentSession(document);
    const result = session.apply(
      batch(session, [
        {
          type: 'node.patch',
          nodeId: 'root',
          patch: [{ op: 'replace', path: '/props', value: { title: 'Heading', gap: 'md' } }],
        },
      ]),
    );
    expect(result.ok && result.changes).toEqual([]);
    expect(session.document).toBe(document);
    expect(session.canUndo).toBe(false);
    expect(session.editRevision).toBe(0);
  });

  it('rejects stale work after an undo returns to identical content', () => {
    const session = new DocumentSession(newDocument('page'));
    const old = batch(session);
    session.replace({ ...session.document, title: 'Temporary' });
    session.undo();
    const result = session.apply(old);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics[0]?.code).toBe('editing.conflict');
    expect(session.document.title).toBe('Untitled page');
    expect(session.canRedo).toBe(true);
  });

  it('leaves the complete baseline and history untouched when any command fails', () => {
    const session = new DocumentSession(newDocument('page'));
    const result = session.apply(
      batch(session, [rename('Partial'), { type: 'node.remove', nodeId: 'root' }]),
    );
    expect(result.ok).toBe(false);
    expect(session.document.title).toBe('Untitled page');
    expect(session.editRevision).toBe(0);
    expect(session.canUndo).toBe(false);
  });

  it('checks a history target without navigating or destroying the redo chain on rejection', () => {
    const session = new DocumentSession(newDocument('page'));
    session.replace({ ...session.document, title: 'One' });
    session.replace({ ...session.document, title: 'Two' });
    session.undo();
    expect(session.undo(() => false)).toBe(false);
    expect(session.document.title).toBe('One');
    expect(session.editRevision).toBe(3);
    expect(session.redo()).toBe(true);
    expect(session.document.title).toBe('Two');
  });

  it('does not commit a batch denied by the current host guard', () => {
    const session = new DocumentSession(newDocument('page'));
    const result = session.apply(batch(session), () => false);
    expect(!result.ok && result.diagnostics[0]?.code).toBe('editing.pending');
    expect(session.editRevision).toBe(0);
    expect(session.canUndo).toBe(false);
  });

  it('rechecks the baseline after a reentrant host callback', () => {
    const session = new DocumentSession(newDocument('page'));
    const result = session.apply(batch(session), () => {
      session.replace({ ...session.document, title: 'New human work' });
      return true;
    });
    expect(!result.ok && result.diagnostics[0]?.code).toBe('editing.conflict');
    expect(session.document.title).toBe('New human work');
    expect(session.editRevision).toBe(1);
  });

  it('does not reuse a session identity when reopening the same document', () => {
    const original = new DocumentSession(newDocument('page'));
    const reopened = new DocumentSession(original.document);
    expect(reopened.id).not.toBe(original.id);
    expect(reopened.apply(batch(original)).ok).toBe(false);
  });

  it('rejects replacing the current document with another identity', () => {
    const session = new DocumentSession(newDocument('page'));
    expect(() => session.replace(newDocument('other'))).toThrow('error.documentId');
    expect(session.editRevision).toBe(0);
  });
});
