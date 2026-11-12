import { coreManifests, escapePointer } from '@haven/schema';
import type { DataSchema, HavenDocument, JsonObject, UiNode } from '@haven/schema';
import { StudioError } from '../core/errors';

type NodeDefaults = {
  props: JsonObject;
  schema?: DataSchema;
  resources?: HavenDocument['resources'];
};
type Factory = (id: string) => NodeDefaults;
const label = (english: string, chinese: string) => ({
  default: english,
  translations: { 'en-US': english, 'zh-CN': chinese },
});
const field =
  (schema: DataSchema, props: JsonObject = {}): Factory =>
  () => ({
    schema,
    props: { label: label('New field', '新字段'), ...props },
  });
const group: Factory = () => ({ props: { title: label('New group', '新分组') } });
const asset =
  (image: boolean, multiple = false): Factory =>
  (id) => ({
    schema: {
      type: 'array',
      maxItems: multiple ? 10 : 1,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          mediaType: { type: 'string' },
          size: { type: 'number' },
        },
      },
    },
    props: {
      label: label(
        image ? 'Image' : multiple ? 'Files' : 'File',
        image ? '图片' : multiple ? '多文件' : '文件',
      ),
      resource: `upload-${id}`,
      ...(image ? { accept: 'image/*' } : {}),
      ...(multiple ? { concurrency: 2 } : {}),
    },
    // This is a named port, never an embedded URL or credential. Studio has no upload host.
    resources: { [`upload-${id}`]: { type: 'upload', adapter: 'uploads.default' } },
  });

/** Explicit Studio creation support; adding a Kit manifest alone cannot silently extend the palette. */
const factories = {
  'form.repeat': () => ({
    schema: { type: 'array', items: { type: 'object', properties: {} } },
    props: { title: label('Repeated items', '重复项目') },
  }),
  'layout.stack': group,
  'layout.toolbar': () => ({ props: { label: label('Toolbar', '工具栏'), wrap: true } }),
  'layout.grid': group,
  'layout.section': group,
  'layout.tabs': group,
  'layout.stepper': group,
  'layout.card': group,
  'layout.accordion': () => ({ props: { ...group('').props, expandedIds: [], multi: false } }),
  'field.text': field({ type: 'string' }),
  'field.password': field({ type: 'string' }),
  'field.textarea': field({ type: 'string' }),
  'field.number': field({ type: 'number' }),
  'field.checkbox': field({ type: 'boolean' }),
  'field.switch': field({ type: 'boolean' }),
  'field.date': field({ type: 'string' }),
  'field.time': field({ type: 'string' }),
  'field.datetime': field({ type: 'string' }),
  'field.select': field({ type: 'string' }, { options: [] }),
  'field.radio': field({ type: 'string' }, { options: [] }),
  'field.multiselect': field({ type: 'array', items: { type: 'string' } }, { options: [] }),
  'field.multilingual': field(
    { type: 'object', properties: { 'en-US': { type: 'string' }, 'zh-CN': { type: 'string' } } },
    { locales: ['en-US', 'zh-CN'] },
  ),
  'field.tree-select': field({ type: 'string' }, { nodes: [] }),
  'field.tree-multiselect': field({ type: 'array', items: { type: 'string' } }, { nodes: [] }),
  'field.cascader': field({ type: 'string' }, { nodes: [] }),
  'field.file': asset(false),
  'field.files': asset(false, true),
  'field.rich-text': field({ type: 'string' }, { label: label('Rich text', '富文本') }),
  'field.image': asset(true),
  tree: () => ({ props: { title: label('Navigation', '导航'), nodes: [], filterable: true } }),
  'tree.editor': () => ({
    props: { title: label('Editable tree', '可编辑树'), nodes: [], filterable: true },
  }),
  'view.text': () => ({ props: { text: label('Description', '说明文字') } }),
  'view.badge': () => ({ props: { text: label('Status', '状态'), tone: 'neutral' } }),
  'view.progress': () => ({
    props: { label: label('Progress', '进度'), value: 0, mode: 'determinate', showValue: true },
  }),
  'view.alert': () => ({ props: { message: label('Information', '提示信息'), tone: 'info' } }),
  'view.divider': () => ({ props: { label: label('Divider', '分隔线') } }),
  'action.button': () => ({ props: { label: label('Button', '按钮') } }),
  table: () => ({
    schema: {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' } } },
    },
    props: {
      title: label('Table', '表格'),
      columns: [{ id: 'label', header: label('Label', '标签'), path: '/label', type: 'text' }],
      rowKey: '/id',
      pageSize: 10,
    },
  }),
} satisfies Record<string, Factory>;
export type CreatableKind = keyof typeof factories;
export function canCreateNode(kind: string): kind is CreatableKind {
  return Object.hasOwn(factories, kind) && coreManifests.some((manifest) => manifest.kind === kind);
}
export { isContainer } from '@haven/runtime/editing';
export function createNode(
  kind: string,
  id: string,
): { node: UiNode; schema?: DataSchema; resources?: HavenDocument['resources'] } {
  if (!canCreateNode(kind)) throw new StudioError('error.unsupportedCreation');
  const { props, schema, resources } = structuredClone((factories[kind] as Factory)(id));
  const manifest = coreManifests.find((item) => item.kind === kind)!;
  return {
    node: {
      id,
      kind,
      version: manifest.version,
      props,
      ...(schema ? { bind: `/${escapePointer(id)}` } : {}),
      ...(manifest.container ? { children: [] } : {}),
    },
    ...(schema ? { schema } : {}),
    ...(resources ? { resources } : {}),
  };
}
