/**
 * The caption `ContentExtractor` (`07` §10; `domain/ports.ts`). L0-F4-T1.
 *
 * V1's only extractor: pulls the verbatim oEmbed `title` off a `RawSource` into the
 * `ContentPart[]` shape `PlaceExtractor` (L0-F4-T2, not yet built) will consume. Deliberately
 * thin — `RawSource.texts` already carries the caption verbatim (`oembed-source-adapter.ts`), so
 * this file's only job is the port's contract: `supports`/`extract`, plus the one domain decision
 * that belongs at this seam rather than the vendor adapter's — an empty caption is `NO_CAPTION`
 * (`07` §9), not a zero-length `ContentPart`, because `runImport` (`domain/import/pipeline.ts`)
 * treats "no parts produced" as that error already; this extractor's job is to not manufacture a
 * part that carries nothing.
 */
import { noCaption } from '@/domain/errors';
import type { ContentExtractor } from '@/domain/ports';
import type { ContentPart, RawSource } from '@/domain/types';

export const captionContentExtractor: ContentExtractor = {
  id: 'caption',

  supports(raw: RawSource): boolean {
    return raw.texts.some((t) => t.kind === 'caption' && t.text.trim().length > 0);
  },

  async extract(raw: RawSource): Promise<readonly ContentPart[]> {
    const caption = raw.texts.find((t) => t.kind === 'caption');
    if (caption === undefined || caption.text.trim().length === 0) {
      // `supports` should have kept this from being called on an empty caption, but a defensive
      // throw here (rather than returning `[]`) keeps `NO_CAPTION`'s origin at one call site
      // regardless of whether a future caller skips the `supports` check.
      throw noCaption();
    }
    return [{ kind: 'caption', text: caption.text, origin: 'tiktok-oembed-title' }];
  },
};
