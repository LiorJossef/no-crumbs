/**
 * Selects the `PlaceExtractor` adapter by config — the owner's constraint added 2026-08-22: a local
 * model in development (no per-run cost) and a stronger hosted model in production, chosen by env,
 * never a code fork or an `if (NODE_ENV === ...)` scattered through extraction logic. Mirrors how
 * `PlaceResolver` already splits Overture/Nominatim behind one port, routed on config (`06` §11
 * D2b) — one factory, at the composition root, is the only place that branches.
 *
 * This file is the composition root's concern (it reads `process.env`), so it lives in
 * `integrations/`, never `domain/` — same reasoning as every other adapter in this directory.
 */
import type { PlaceExtractor } from '@/domain/ports';

import { anthropicPlaceExtractor } from './anthropic.place-extractor';
import { ollamaPlaceExtractor } from './ollama.place-extractor';

export type LlmProvider = 'anthropic' | 'ollama';

export interface PlaceExtractorEnv {
  readonly LLM_PROVIDER?: string;
  readonly ANTHROPIC_API_KEY?: string;
  readonly ANTHROPIC_MODEL?: string;
  readonly OLLAMA_HOST?: string;
  readonly OLLAMA_MODEL?: string;
}

function parseProvider(raw: string | undefined): LlmProvider {
  if (raw === 'ollama') return 'ollama';
  if (raw === 'anthropic' || raw === undefined || raw === '') return 'anthropic';
  throw new Error(`Unknown LLM_PROVIDER "${raw}". Expected "anthropic" or "ollama".`);
}

/**
 * `env` is passed explicitly (not read implicitly from `process.env` inside this function) so a
 * test can compose a `PlaceExtractor` deterministically. The real composition root calls this with
 * `process.env` once, at startup.
 *
 * Default is `'anthropic'` — the production adapter — so an unset `LLM_PROVIDER` in a deploy
 * environment fails safe toward the adapter that is actually verified against the golden set
 * (`09` §8), rather than silently toward the unverified local one.
 */
export function createPlaceExtractor(env: PlaceExtractorEnv): PlaceExtractor {
  const provider = parseProvider(env.LLM_PROVIDER);

  if (provider === 'ollama') {
    return ollamaPlaceExtractor({
      model: env.OLLAMA_MODEL ?? 'llama3.2:3b',
      ...(env.OLLAMA_HOST !== undefined ? { host: env.OLLAMA_HOST } : {}),
    });
  }

  if (env.ANTHROPIC_API_KEY === undefined || env.ANTHROPIC_API_KEY === '') {
    throw new Error('ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic (the default).');
  }
  return anthropicPlaceExtractor({
    apiKey: env.ANTHROPIC_API_KEY,
    ...(env.ANTHROPIC_MODEL !== undefined ? { model: env.ANTHROPIC_MODEL } : {}),
  });
}
