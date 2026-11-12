import { describe, expect, it } from 'vitest';
import { coreManifests, validateDocument } from '@haven/schema';
import { rendererCapabilities, validateRendererDocument } from '@haven/ui/renderer';
import {
  DocumentHistory,
  addNode,
  newDocument,
  moveNode,
  removeNode,
  setProperty,
} from './document-edit';
import { canCreateNode, createNode } from './node-factory';

const palette = coreManifests.filter(
  (item) => rendererCapabilities.includes(`${item.kind}@${item.version}`) && item.kind !== 'form',
);
describe('typed Studio creation contracts', () => {
  it.each(palette.map((item) => item.kind))(
    'creates, edits, undoes and reloads valid %s nodes',
    (kind) => {
      expect(canCreateNode(kind)).toBe(true);
      const initial = newDocument('factory');
      const added = addNode(initial, 'root', kind, 'sample');
      expect(validateDocument(added).diagnostics).toEqual([]);
      expect(validateRendererDocument(added).diagnostics).toEqual([]);
      const history = new DocumentHistory(initial);
      history.push(added);
      const manifest = coreManifests.find((item) => item.kind === kind)!;
      const textProperty = Object.entries(manifest.properties).find(
        ([, property]) => property.localizable,
      )?.[0];
      const edited = textProperty ? setProperty(added, 'sample', textProperty, 'Changed') : added;
      history.push(edited);
      if (textProperty) expect(history.undo()).toEqual(added);
      expect(history.undo()).toEqual(initial);
      history.redo();
      if (textProperty) history.redo();
      const reloaded = JSON.parse(JSON.stringify(history.current));
      expect(reloaded).toEqual(edited);
      expect(validateRendererDocument(reloaded).diagnostics).toEqual([]);
    },
  );
  it('does not expose catalog-only kinds or overwrite existing data and resource declarations', () => {
    expect(canCreateNode('unknown.component')).toBe(false);
    expect(() => createNode('unknown.component', 'unsupported')).toThrow();
    const model = newDocument('collision');
    model.dataSchema.properties!['kept'] = { type: 'number' };
    expect(() => addNode(model, 'root', 'field.text', 'kept')).toThrow('error.bindingCollision');
    model.resources['upload-file'] = { type: 'upload', adapter: 'host.existing' };
    expect(() => addNode(model, 'root', 'field.file', 'file')).toThrow('error.resourceCollision');
    expect(model.dataSchema.properties!['kept']).toEqual({ type: 'number' });
    expect(model.resources['upload-file']).toEqual({ type: 'upload', adapter: 'host.existing' });
  });
  it.each(['layout.tabs', 'layout.stepper', 'layout.card', 'layout.accordion'])(
    'uses manifest container capability for %s while preserving root and cycle guards',
    (kind) => {
      let model = addNode(newDocument('containers'), 'root', kind, 'group');
      model = addNode(model, 'group', 'layout.section', 'panel');
      model = addNode(model, 'root', 'field.text', 'input');
      const moved = moveNode(model, 'input', 'panel', 0);
      expect(validateDocument(moved).diagnostics).toEqual([]);
      expect(() => moveNode(model, 'group', 'panel', 0)).toThrow('error.moveCycle');
      expect(() => moveNode(model, 'root', 'group', 0)).toThrow();
      expect(() => removeNode(model, 'root')).toThrow('error.rootRemoval');
      expect(() => addNode(model, 'input', 'field.text', 'bad')).toThrow('error.notContainer');
      expect(() => addNode(model, 'missing', 'field.text', 'bad')).toThrow('error.moveTarget');
    },
  );
  it('declares upload ports without pretending Studio provides storage or embedding URLs', () => {
    const model = addNode(newDocument('assets'), 'root', 'field.image', 'cover');
    expect(model.resources).toEqual({
      'upload-cover': { type: 'upload', adapter: 'uploads.default' },
    });
    expect(model.dataSchema.properties!['cover']).toMatchObject({
      type: 'array',
      maxItems: 1,
      items: { type: 'object' },
    });
    expect(JSON.stringify(model)).not.toMatch(/https?:|token|password/);
  });
});

it('creates next-version files and rich text with schema-owned limits and no invented image storage', () => {
  const files = createNode('field.files', 'attachments');
  expect(files.schema).toMatchObject({ type: 'array', maxItems: 10, items: { type: 'object' } });
  expect(files.node.props).toMatchObject({ concurrency: 2, resource: 'upload-attachments' });
  expect(files.resources).toEqual({
    'upload-attachments': { type: 'upload', adapter: 'uploads.default' },
  });
  const rich = createNode('field.rich-text', 'body');
  expect(rich.schema).toEqual({ type: 'string' });
  expect(rich.node.bind).toBe('/body');
  expect(rich.node.props?.['upload']).toBeUndefined();
  expect(rich.resources).toBeUndefined();
});
