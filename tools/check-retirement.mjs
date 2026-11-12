import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = (directory) =>
  !existsSync(directory)
    ? []
    : readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? files(resolve(directory, entry.name))
          : [resolve(directory, entry.name)],
      );
const legacy = [
  'src/app/editor',
  'src/app/examples',
  'src/app/display',
  'public/examples',
  'test-support',
];
const failures = legacy.flatMap((path) => files(resolve(root, path)));
for (const name of [
  'candidate-panel.ts',
  'candidate-panel.html',
  'candidate-panel.scss',
  'candidate-panel.spec.ts',
  'candidate-editor.spec.ts',
]) {
  const path = resolve(root, 'src/app/candidates', name);
  if (existsSync(path)) failures.push(path);
}
const permitted = new Set(['src/app/app.ts', 'src/app/retired-workspace.ts']);
for (const path of files(resolve(root, 'src/app')).filter(
  (path) => path.endsWith('.ts') && !path.endsWith('.spec.ts'),
)) {
  const name = relative(root, path).replaceAll('\\', '/');
  if (/@Component\s*\(/.test(readFileSync(path, 'utf8')) && !permitted.has(name))
    failures.push(path);
}
const routes = readFileSync(resolve(root, 'src/app/app.routes.ts'), 'utf8');
if (routes.includes('canDeactivate') || /\.\/editor\/|\.\/display\/|path:\s*['"]view/.test(routes))
  failures.push('legacy route');
if (failures.length)
  throw new Error(
    'Design gate is closed. Legacy product UI must stay retired:\n' + failures.join('\n'),
  );
console.log(
  'Retirement boundary passed: no legacy product pages; new implementation remains gated.',
);
