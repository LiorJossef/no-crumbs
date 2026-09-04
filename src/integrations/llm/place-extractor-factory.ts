/**
 * Selects the `PlaceExtractor` adapter by config — hosted models only (Anthropic, Gemini), chosen
 * by env, never a code fork or an `if (NODE_ENV === ...)` scattered through extraction logic.
 * Mirrors how `PlaceResolver` already splits Overture/Nominatim behind one port, routed on config
 * (`06` §11 D2b) — one factory, at the composition root, is the only place that branches.
 *
 * This file is the composition root's concern (it reads `process.env`), so it lives in
 * `integrations/`, never `domain/` — same reasoning as every other adapter in this directory.
 */
import type { PlaceExtractor } from '@/domain/ports';

import { anthropicPlaceExtractor } from './anthropic.place-extractor';
import { geminiPlaceExtractor } from './gemini.place-extractor';

export type LlmProvider = 'anthropic' | 'gemini';

export interface PlaceExtractorEnv {
  readonly LLM_PROVIDER?: string;
  readonly ANTHROPIC_API_KEY?: string;
  readonly ANTHROPIC_MODEL?: string;
  readonly GEMINI_API_KEY?: string;
  readonly GEMINI_MODEL?: string;
  /** The second Gemini model, tried once when the primary's retries are spent on a transient
   *  status (`gemini.place-extractor.ts`'s `GEMINI_FALLBACK_MODEL_DEFAULT`). Env-driven for the
   *  same reason `GEMINI_MODEL` is: an overloaded serving pool is an operational problem, and the
   *  answer to it should be a variable change rather than a deploy. */
  readonly GEMINI_FALLBACK_MODEL?: string;
}

function parseProvider(raw: string | undefined): LlmProvider {
  if (raw === 'gemini') return 'gemini';
  if (raw === 'anthropic' || raw === undefined || raw === '') return 'anthropic';
  throw new Error(`Unknown LLM_PROVIDER "${raw}". Expected "anthropic" or "gemini".`);
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

  if (provider === 'gemini') {
    if (env.GEMINI_API_KEY === undefined || env.GEMINI_API_KEY === '') {
      throw new Error('GEMINI_API_KEY is required when LLM_PROVIDER=gemini.');
    }
    return geminiPlaceExtractor({
      apiKey: env.GEMINI_API_KEY,
      ...(env.GEMINI_MODEL !== undefined ? { model: env.GEMINI_MODEL } : {}),
      ...(env.GEMINI_FALLBACK_MODEL !== undefined ? { fallbackModel: env.GEMINI_FALLBACK_MODEL } : {}),
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
