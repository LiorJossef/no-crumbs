import type { MetadataRoute } from 'next';

/**
 * Crawl policy: **nothing is crawlable except the two screens designed for a stranger.**
 *
 * Every other route is a personal location dataset or the machinery for building one — `/map`,
 * `/import`, `/collections/*`, `/api/*`. None of them serve anything without a session, so this
 * is not the control that protects them (auth and RLS are, and a robots file protects nothing
 * from anyone who does not choose to obey it). It is there for the two things it *can* do:
 * keep URLs that will only ever answer a redirect out of search results, and keep the invite
 * links under `/collections/join/[token]` out of an index in the world where one of them is ever
 * pasted somewhere a crawler can see it.
 *
 * Written as deny-by-default with two explicit allows rather than allow-by-default with a list of
 * disallows, for a reason worth stating: `robots.txt` is a public file, so an enumeration of the
 * private paths *publishes the shape of the private product* — including that a route named
 * `join` with a token in it exists. Deny-by-default names only the public surfaces, and a route
 * added tomorrow is closed rather than open until someone remembers this file.
 *
 * `/$` is the anchored form Google and Bing use to mean "the home page only, not everything under
 * it". A crawler that does not implement `$` reads it as a literal path, matches nothing, and
 * falls through to `Disallow: /` — the safe direction for this product.
 *
 * No `sitemap`: there is no sitemap route, and pointing at one that 404s is worse than silence.
 * No per-agent rules for the AI crawlers either — whether this product's public copy is training
 * data is the owner's call, not a default I should quietly take.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/$', '/sign-in'],
      disallow: '/',
    },
  };
}
