/**
 * Per-import extraction cost, logged against the ~$0.003/import estimate `09` §2.2 computed
 * (`07` §7.1: structured logging, scalar fields only, never a caption or a candidate name).
 *
 * Kept as one small, pure function so both adapters compute and log cost the same way — a hosted
 * call has a real per-token price; a local call has none, and that absence is the point (it is
 * why a local dev tier exists at all), so it is logged as an explicit zero-cost model rather than
 * omitted, which would look like a missing measurement instead of a documented one.
 */

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/** USD per 1M tokens, input/output. `09` §2.1's DOCUMENTED pricing for `claude-haiku-4-5`. */
export const ANTHROPIC_HAIKU_4_5_PRICE_PER_1M = { input: 1.0, output: 5.0 } as const;

export function costUsd(usage: TokenUsage, pricePer1M: { input: number; output: number }): number {
  return (usage.inputTokens / 1_000_000) * pricePer1M.input + (usage.outputTokens / 1_000_000) * pricePer1M.output;
}

/** Logs one extraction call's cost. `costModel` names how `costUsd` was derived — `'measured'` for
 *  a real hosted call's billed usage, `'zero-cost-local'` for the dev-tier adapter, which has no
 *  per-call price but still reports token counts so the two tiers are comparable. */
export function logExtractionCost(
  log: { event(name: string, fields: Record<string, string | number | boolean>): void },
  fields: {
    readonly extractorVersion: string;
    readonly promptVersion: string;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly costUsd: number;
    readonly costModel: 'measured' | 'zero-cost-local';
    readonly elapsedMs: number;
  },
): void {
  log.event('extraction.cost', {
    extractorVersion: fields.extractorVersion,
    promptVersion: fields.promptVersion,
    inputTokens: fields.inputTokens,
    outputTokens: fields.outputTokens,
    costUsd: fields.costUsd,
    costModel: fields.costModel,
    elapsedMs: fields.elapsedMs,
  });
}
