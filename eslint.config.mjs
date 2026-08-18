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
        ],
        patterns: [
          { group: ['next', 'next/*'], message: 'domain/ may not import next/*. Move this to app/.' },
          { group: ['@supabase/*'], message: 'Vendor SDKs die in integrations/. Depend on a port instead.' },
          { group: ['@anthropic-ai/*'], message: 'Vendor SDKs die in integrations/. Depend on a port instead.' },
          { group: ['maplibre-gl', '@vis.gl/*'], message: 'Map rendering is UI-local. Not a domain concern.' },
          { group: ['@/app/*', '@/ui/*', '@/integrations/*'], message: 'domain/ must not depend on an outer layer.' },
          { group: ['../app/*', '../ui/*', '../integrations/*', '../../app/*', '../../ui/*', '../../integrations/*'], message: 'domain/ must not depend on an outer layer.' },
        ],
      },
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
