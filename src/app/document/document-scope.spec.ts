import { describe, expect, it } from 'vitest';
import { validateDocument } from '@haven/schema';
import { addNode, flattenTree, moveNode, newDocument, removeNode } from './document-edit';

describe('repeat data scope editing', () => {
  it('creates valid empty repeats and inserts fields through layout layers into their item schema', () => {
    let model = addNode(newDocument('repeat'), 'root', 'form.repeat', 'rows');
    expect(model.ui.children![0]!.children).toEqual([]);
    model = addNode(model, 'rows', 'layout.section', 'section');
    model = addNode(model, 'section', 'field.text', 'title');
    expect(model.dataSchema.properties!['rows']!.items!.properties).toEqual({
      title: { type: 'string' },
    });
    expect(model.dataSchema.properties!['title']).toBeUndefined();
    expect(flattenTree(model.ui).find(({ node }) => node.id === 'title')!.node.bind).toBe('/title');
    expect(validateDocument(model).diagnostics).toEqual([]);
    expect(removeNode(model, 'title').dataSchema).toBe(model.dataSchema);
  });
  it('supports nested repeats, escaped bindings and root-owned resources without touching adjacent scopes', () => {
    let model = addNode(newDocument('nested'), 'root', 'form.repeat', 'rows');
    model.dataSchema.properties = { 'row/~': model.dataSchema.properties!['rows']! };
    model.ui.children![0]!.bind = '/row~1~0';
    model = addNode(model, 'rows', 'form.repeat', 'children');
    model = addNode(model, 'children', 'field.text', 'caption');
    model = addNode(model, 'children', 'field.file', 'asset');
    const children = model.dataSchema.properties!['row/~']!.items!.properties!['children']!;
    expect(children.items!.properties!['caption']).toEqual({ type: 'string' });
    expect(model.resources['upload-asset']).toEqual({ type: 'upload', adapter: 'uploads.default' });
    expect(model.dataSchema.properties!['row/~']!.items!.properties!['asset']).toBeUndefined();
    expect(validateDocument(model).diagnostics).toEqual([]);
  });
  it('checks property collisions only in the destination scope and retains the original document', () => {
    const model = addNode(newDocument('collision'), 'root', 'form.repeat', 'rows');
    model.dataSchema.properties!['title'] = { type: 'number' };
    const next = addNode(model, 'rows', 'field.text', 'title');
    expect(next.dataSchema.properties!['title']).toEqual({ type: 'number' });
    expect(model.dataSchema.properties!['rows']!.items!.properties).toEqual({});
    const removed = removeNode(next, 'title');
    expect(() => addNode(removed, 'rows', 'field.number', 'title')).toThrow(
      'error.bindingCollision',
    );
    expect(() => addNode(model, 'rows', 'field.text', '__proto__')).toThrow('error.editScope');
  });
  it('expands referenced object and array schemas only along the edited path, preserving definitions and other consumers', () => {
    const model = newDocument('references');
    model.dataSchema.$defs = {
      row: { type: 'object', properties: { kept: { type: 'string' } }, required: ['kept'] },
      rows: { type: 'array', minItems: 1, items: { $ref: '#/$defs/row' } },
      group: { type: 'object', properties: { rows: { $ref: '#/$defs/rows' } } },
    };
    model.dataSchema.properties = {
      first: { $ref: '#/$defs/group' },
      second: { $ref: '#/$defs/group' },
    };
    model.ui.children = [
      { id: 'repeat', kind: 'form.repeat', version: 1, bind: '/first/rows', children: [] },
    ];
    const next = addNode(model, 'repeat', 'field.number', 'amount');
    const array = next.dataSchema.properties!['first']!.properties!['rows']!;
    expect(array.minItems).toBe(1);
    expect(array.items!.required).toEqual(['kept']);
    expect(array.items!.properties).toEqual({
      kept: { type: 'string' },
      amount: { type: 'number' },
    });
    expect(next.dataSchema.$defs).toBe(model.dataSchema.$defs);
    expect(next.dataSchema.properties!['second']).toBe(model.dataSchema.properties!['second']);
    expect(model.dataSchema.properties!['first']).toEqual({ $ref: '#/$defs/group' });
    expect(validateDocument(next).diagnostics).toEqual([]);
  });
  it('retains root definitions when materializing a root reference draft', () => {
    const model = newDocument('root-reference');
    model.dataSchema = {
      $ref: '#/$defs/Root',
      $defs: {
        Root: { type: 'object', properties: { other: { $ref: '#/$defs/Item' } } },
        Item: { type: 'string' },
      },
    };
    // Kit currently rejects $ref siblings, but editing a draft must not orphan
    // existing references by dropping its definition registry.
    expect(validateDocument(model).diagnostics.map((issue) => issue.code)).toContain(
      'data.refSiblings',
    );
    const next = addNode(model, 'root', 'field.text', 'caption');
    expect(next.dataSchema.$defs).toBe(model.dataSchema.$defs);
    expect(next.dataSchema.properties!['other']).toEqual({ $ref: '#/$defs/Item' });
    expect(validateDocument(next).diagnostics).toEqual([]);
  });
  it.each([{ $ref: '#/$defs/missing' }, { $ref: '#/$defs/cycle' }, { type: 'string' as const }])(
    'rejects unusable repeat item schemas without altering the document: %j',
    (items) => {
      const model = newDocument('invalid');
      model.dataSchema.$defs = { cycle: { $ref: '#/$defs/cycle' } };
      model.dataSchema.properties = { rows: { type: 'array', items } };
      model.ui.children = [
        { id: 'repeat', kind: 'form.repeat', version: 1, bind: '/rows', children: [] },
      ];
      const before = structuredClone(model);
      expect(() => addNode(model, 'repeat', 'field.text', 'name')).toThrow('error.editScope');
      expect(model).toEqual(before);
    },
  );
  it('retains same-scope moves and rejects cross-scope field, repeat and unbound action moves', () => {
    let model = addNode(newDocument('moves'), 'root', 'form.repeat', 'rows');
    model = addNode(model, 'rows', 'layout.section', 'left');
    model = addNode(model, 'rows', 'layout.section', 'right');
    model = addNode(model, 'left', 'field.text', 'title');
    model = addNode(model, 'left', 'action.button', 'button');
    model = addNode(model, 'left', 'form.repeat', 'inner');
    const moved = moveNode(model, 'title', 'right', 0);
    expect(flattenTree(moved.ui).find(({ node }) => node.id === 'title')!.parentId).toBe('right');
    expect(moved.dataSchema).toBe(model.dataSchema);
    for (const id of ['title', 'button', 'left', 'inner'])
      expect(() => moveNode(model, id, 'root', 0)).toThrow('error.moveScope');
    expect(() => moveNode(model, 'title', 'inner', 0)).toThrow('error.moveScope');
    expect(validateDocument(moved).diagnostics).toEqual([]);
  });
  it('allows moving an entire repeat between root layouts while retaining its item bindings', () => {
    let model = addNode(newDocument('whole'), 'root', 'layout.section', 'group');
    model = addNode(model, 'root', 'form.repeat', 'rows');
    model = addNode(model, 'rows', 'field.number', 'amount');
    const moved = moveNode(model, 'rows', 'group', 0);
    expect(moved.dataSchema).toBe(model.dataSchema);
    expect(validateDocument(moved).diagnostics).toEqual([]);
  });
});
