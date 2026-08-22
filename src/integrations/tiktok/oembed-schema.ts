/**
 * Zod schema for TikTok's oEmbed response (`07` §10's "Zod at every boundary" rule 2,
 * `docs/evidence/tiktok/01-oembed-field-inventory.md`, VERIFIED). L0-F4-T1.
 *
 * Deliberately **not** `.strict()`: TikTok adding a field must not break us (`07` §10). Only the
 * fields `oembedSourceAdapter` actually reads are required; every other field in the inventory
 * (`html`, `provider_name`, `width`/`height`, ...) is not modelled at all, since nothing here
 * consumes it.
 *
 * `title` (the caption) is allowed to be an **empty string** — that is a distinct, legal shape
 * (`NO_CAPTION`, decided one layer up in `ContentExtractor`, not here): a schema that rejected
 * `""` would make an empty caption indistinguishable from a malformed payload.
 */
import { z } from 'zod';

export const TikTokOEmbedSchema = z.object({
  title: z.string(),
  author_name: z.string().nullable().default(null),
  author_unique_id: z.string().nullable().default(null),
  embed_product_id: z.string(),
  thumbnail_url: z.string().nullable().default(null),
});

export type TikTokOEmbedPayload = z.infer<typeof TikTokOEmbedSchema>;

/**
 * The one honest failure shape oEmbed ever returns (`docs/evidence/tiktok/04-error-cases.md`,
 * VERIFIED): `{"message":"Something went wrong","code":400}` for every one of private / deleted /
 * region-locked / never-existed / malformed-but-well-formed-id. Used only to recognise the shape
 * for logging; the adapter maps *any* non-2xx or any body that fails `TikTokOEmbedSchema` to
 * `POST_UNAVAILABLE` regardless of whether it matches this schema too, per the evidence file's
 * ruling that oEmbed cannot distinguish the cause.
 */
export const TikTokOEmbedErrorSchema = z.object({
  message: z.string(),
  code: z.number(),
});
