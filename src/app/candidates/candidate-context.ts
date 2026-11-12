import type { HavenRendererHost } from '@haven/ui/renderer';
import { rendererCapabilities } from '@haven/ui/renderer';
import { createHavenTableEditors, createHavenTableFilters } from '@haven/ui/table';
import type { CandidateHostGrants } from './candidate-review';

const defaultEditors = createHavenTableEditors();
const defaultFilters = createHavenTableFilters();
const keys = (map: ReadonlyMap<string, unknown> | undefined): string[] =>
  [...(map?.keys() ?? [])].sort();

/** Mirrors this application's renderer host and ordinary Kit table defaults.
 * A host that uses global table provider overrides must pass those actual maps explicitly.
 * ActionRegistry has no enumeration API, so it grants no action IDs here. A later explicit
 * action catalog must supply authorizations instead of deriving them from candidate bindings.
 */
export function candidateHostContext(host: HavenRendererHost): CandidateHostGrants {
  return {
    actions: [],
    resources: {
      query: keys(host.tables),
      options: keys(host.options),
      upload: keys(host.uploads),
      validation: keys(host.validators),
      tree: keys(host.trees),
    },
    tableCellRenderers: keys(host.tableCellRenderers),
    tableEditors: keys(host.tableEditors ?? defaultEditors),
    tableFilters: keys(host.tableFilters ?? defaultFilters),
    tableTooltips: keys(host.tableTooltips),
    tableEdits: keys(host.tableEdits),
  };
}

/** Stable context identity is evidence of matching registrations, never authorization by itself. */
export function candidateContextKey(host: HavenRendererHost): string {
  return JSON.stringify({
    protocolVersion: '1.0',
    rendererCapabilities: [...rendererCapabilities].sort(),
    hostRevision: host.revision ?? null,
    registrations: candidateHostContext(host),
  });
}

export async function candidateContextFingerprint(key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return (
    'haven-studio-context-v1:sha256:' +
    [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
  );
}
