import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import { validateDocument } from '@haven/schema';

// Explicit operator command; never called by app startup, image build, or CI.
const base = (process.env['HAVEN_API_BASE'] ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const token = process.env['HAVEN_API_TOKEN'];
const origin = process.env['HAVEN_API_ORIGIN'];
const document = JSON.parse(
  await readFile(
    new URL('../public/examples/components-v1.document.json', import.meta.url),
    'utf8',
  ),
);
const validation = validateDocument(document);
if (!validation.valid)
  throw new Error(`Invalid example: ${JSON.stringify(validation.diagnostics)}`);
const headers = {
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(origin ? { Origin: origin } : {}),
};
const request = (path, options = {}) =>
  globalThis.fetch(`${base}${path}`, {
    redirect: 'error',
    signal: globalThis.AbortSignal.timeout(15_000),
    ...options,
    headers,
  });
const path = `/models/${encodeURIComponent(document.id)}`;
const existing = await request(`${path}/draft`);
if (existing.ok) {
  console.log(
    `Example ${document.id} already exists; existing edits and publication are preserved.`,
  );
} else {
  if (existing.status !== 404) throw new Error(`Cannot inspect example (HTTP ${existing.status})`);
  const created = await request('/models', { method: 'POST', body: JSON.stringify(document) });
  if (!created.ok) throw new Error(`Cannot create example (HTTP ${created.status})`);
  const draft = await created.json();
  const published = await request(`${path}/publish`, {
    method: 'POST',
    body: JSON.stringify({
      draftRevision: draft.draftRevision,
      expectedPublishedRevision: 0,
      idempotencyKey: randomUUID(),
    }),
  });
  if (!published.ok)
    throw new Error(
      `Example draft exists but publication failed (HTTP ${published.status}); inspect it in Studio.`,
    );
  const result = await published.json();
  console.log(`Created ${document.id}, published version ${result.version}.`);
}
