/**
 * Zod schema for the slice of TikTok's `__UNIVERSAL_DATA_FOR_REHYDRATION__` payload that media
 * acquisition reads (`07` §10's "Zod at every boundary" rule 2). L0-TRANSCRIPT-T4.
 *
 * This is an **internal, undocumented** payload with no stability contract, unlike the oEmbed
 * response `oembed-schema.ts` models. It will move. So the schema is deliberately shallow — four
 * fields out of a ~430 KB document — and every optional field is optional because a missing one
 * must degrade to "no media", never to a throw and never to a guessed URL.
 *
 * `statusCode` is TikTok's own "is this post readable" flag inside the detail scope: non-zero on a
 * private, deleted or region-locked post. Modelled because a payload that parses but reports a
 * non-zero status is a *legitimate* no-media answer, not a shape change.
 */
import { z } from 'zod';

const VideoSchema = z.object({
  /** The signed, expiring CDN MP4. Absent on some payload variants; never assumed present. */
  playAddr: z.string().optional(),
  /** The alternate signed MP4 TikTok's own download button uses. Same CDN family, same expiry. */
  downloadAddr: z.string().optional(),
});

const ItemStructSchema = z.object({
  /** Checked against the requested `externalId` before any URL is returned — the payload is the
   *  only place that can tell us which post we were actually served. */
  id: z.string(),
  video: VideoSchema.optional(),
});

const VideoDetailSchema = z.object({
  statusCode: z.number().optional(),
  itemInfo: z.object({ itemStruct: ItemStructSchema }).optional(),
});

export const TikTokRehydrationSchema = z.object({
  __DEFAULT_SCOPE__: z.object({
    'webapp.video-detail': VideoDetailSchema,
  }),
});

export type TikTokRehydration = z.infer<typeof TikTokRehydrationSchema>;
