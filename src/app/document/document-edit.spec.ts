import { describe, expect, it } from 'vitest';
import {
  DocumentHistory,
  addNode,
  flattenTree,
  moveNode,
  newDocument,
  removeNode,
  setProperty,
} from './document-edit';
describe('document editing', () => {
  it('retains input schema when a shared view is deleted', () => {
    const original = newDocument('sample');
    const withField = addNode(original, 'root', 'field.text', 'title');
    const removed = removeNode(withField, 'title');
    expect(original.ui.children).toEqual([]);
    expect(removed.ui.children).toEqual([]);
    expect(removed.dataSchema.properties?.['title']).toEqual({ type: 'string' });
  });
  it('moves across containers and rejects cycles without mutating the source', () => {
    let document = addNode(newDocument('sample'), 'root', 'layout.stack', 'group');
    document = addNode(document, 'root', 'field.text', 'title');
    const moved = moveNode(document, 'title', 'group', 0);
    expect(flattenTree(moved.ui).find((item) => item.node.id === 'title')?.parentId).toBe('group');
    expect(flattenTree(document.ui).find((item) => item.node.id === 'title')?.parentId).toBe(
      'root',
    );
    expect(() => moveNode(moved, 'group', 'title', 0)).toThrow();
    expect(() => moveNode(moved, 'group', 'group', 0)).toThrow();
  });
  it('undoes property edits and discards the redo branch after a new edit', () => {
    const document = addNode(newDocument('sample'), 'root', 'field.text', 'title');
    const history = new DocumentHistory(document);
    history.push(setProperty(document, 'title', 'label', 'First'));
    expect(history.undo()).toEqual(document);
    expect(history.canRedo).toBe(true);
    history.push(setProperty(document, 'title', 'label', 'Second'));
    expect(history.canRedo).toBe(false);
    expect(history.current.ui.children?.[0]?.props?.['label']).toBe('Second');
  });
});
