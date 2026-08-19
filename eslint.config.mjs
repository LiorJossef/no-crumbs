import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import next from 'eslint-config-next';

/**
 * Layer enforcement (07 §10). The four layers are a checked property of the
 * repository, not a convention: `domain/` is pure TypeScript, and the outer
 * layers may not reach around the ports.
 */
const layerZones = {
  files: ['src/domain/**/*.ts', 'src/domain/**/*.tsx'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          { name: 'react', message: 'domain/ is pure TypeScript. No react.' },
          { name: 'react-dom', message: 'domain/ is pure TypeScript. No react-dom.' },
          { name: 'fs', message: 'domain/ performs no I/O. Put it behind a port.' },
          { name: 'http', message: 'domain/ performs no I/O. Put it behind a port.' },
          { name: 'https', message: 'domain/ performs no I/O. Put it behind a port.' },
          { name: 'net', message: 'domain/ performs no I/O. Put it behind a port.' },
          { name: 'dns', message: 'domain/ performs no I/O. Put it behind a port.' },
          { name: 'child_process', message: 'domain/ performs no I/O. Put it behind a port.' },
          { name: 'undici', message: 'domain/ performs no I/O. Put it behind a port.' },
          { name: 'axios', message: 'domain/ performs no I/O. Put it behind a port.' },
          { name: 'node-fetch', message: 'domain/ performs no I/O. Put it behind a port.' },
        ],
        patterns: [
          { group: ['next', 'next/*'], message: 'domain/ may not import next/*. Move this to app/.' },
          { group: ['node:*'], message: 'domain/ is runtime-agnostic and does no I/O. No node: builtins.' },
          { group: ['fs/*', 'undici/*', 'axios/*'], message: 'domain/ performs no I/O. Put it behind a port.' },
          { group: ['@supabase/*'], message: 'Vendor SDKs die in integrations/. Depend on a port instead.' },
          { group: ['@anthropic-ai/*'], message: 'Vendor SDKs die in integrations/. Depend on a port instead.' },
          { group: ['maplibre-gl', '@vis.gl/*'], message: 'Map rendering is UI-local. Not a domain concern.' },
          { group: ['@/app/*', '@/ui/*', '@/integrations/*'], message: 'domain/ must not depend on an outer layer.' },
          { group: ['../app/*', '../ui/*', '../integrations/*', '../../app/*', '../../ui/*', '../../integrations/*'], message: 'domain/ must not depend on an outer layer.' },
        ],
      },
    ],
    'no-restricted-globals': [
      'error',
      { name: 'fetch', message: 'domain/ performs no I/O. Take a port (SourceAdapter, PlaceResolver, ...) as an argument.' },
      { name: 'XMLHttpRequest', message: 'domain/ performs no I/O. Take a port as an argument.' },
      { name: 'WebSocket', message: 'domain/ performs no I/O. Take a port as an argument.' },
      { name: 'EventSource', message: 'domain/ performs no I/O. Take a port as an argument.' },
      { name: 'navigator', message: 'domain/ is runtime-agnostic. Browser globals belong to ui/.' },
    ],
  },
};

const uiZone = {
  files: ['src/ui/**/*.ts', 'src/ui/**/*.tsx'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          { group: ['@/integrations/*', '../integrations/*', '../../integrations/*'], message: 'ui/ talks to domain types, never to an adapter. Adapters are injected in app/.' },
        ],
      },
    ],
  },
};

const integrationsZone = {
  files: ['src/integrations/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          { group: ['@/app/*', '@/ui/*', '../app/*', '../ui/*', '../../app/*', '../../ui/*'], message: 'An adapter implements a domain port. It knows nothing about app/ or ui/.' },
        ],
      },
    ],
  },
};

export default tseslint.config(
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts', 'docs/evidence/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...next,
  layerZones,
  uiZone,
  integrationsZone,
);
