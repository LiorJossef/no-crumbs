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
          {
            // Same four forms per layer as the ui/integrations zones below: alias, alias
            // subtree, relative escape, relative subtree at any depth.
            group: [
              '@/app', '@/app/**', '../**/app', '../**/app/**',
              '@/ui', '@/ui/**', '../**/ui', '../**/ui/**',
              '@/integrations', '@/integrations/**', '../**/integrations', '../**/integrations/**',
            ],
            message: 'domain/ must not depend on an outer layer.',
          },
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

/**
 * Path-group note. `no-restricted-imports` matches `group` entries with gitignore
 * semantics, so `x/**` covers every depth below `x` and `../ ** /x` covers a relative
 * escape from any folder depth. The earlier `'../x/*'`, `'../../x/*'` enumerations let a
 * bare `@/integrations` and a `../../../integrations/*` from a deeper folder through;
 * each group below therefore names four forms: the alias, the alias subtree, the relative
 * escape, and the relative subtree.
 */
const uiZone = {
  files: ['src/ui/**/*.ts', 'src/ui/**/*.tsx'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@/integrations', '@/integrations/**', '../**/integrations', '../**/integrations/**'],
            message: 'ui/ talks to domain types, never to an adapter. Adapters are injected in app/.',
          },
          {
            // app/_lib holds the service-role client, the LLM key path, the rate limiter and the
            // composition root. ESLint is the fast signal; `server-only` (07 §10) is the real
            // mechanism — it fails the build if one of these modules reaches a client bundle.
            group: ['@/app/_lib', '@/app/_lib/**', '../**/app/_lib', '../**/app/_lib/**'],
            message: 'app/_lib is server-only (service-role client, secrets, rate limiter, composition root). ui/ may import a Server Action from app/actions/*, and nothing else from app/.',
          },
        ],
      },
    ],
  },
};

const integrationsZone = {
  // `.tsx` included deliberately: an adapter has no reason to contain JSX, and if one ever
  // does the guard must still apply. Symmetric with the domain and ui zones.
  files: ['src/integrations/**/*.ts', 'src/integrations/**/*.tsx'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [
              '@/app', '@/app/**', '../**/app', '../**/app/**',
              '@/ui', '@/ui/**', '../**/ui', '../**/ui/**',
            ],
            message: 'An adapter implements a domain port. It knows nothing about app/ or ui/.',
          },
        ],
      },
    ],
  },
};

export default tseslint.config(
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts', 'docs/evidence/**', 'supabase/.temp/**', 'supabase/.branches/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...next,
  layerZones,
  uiZone,
  integrationsZone,
);
