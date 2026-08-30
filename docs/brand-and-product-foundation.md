# Product & Brand Foundation — the MVP

> Owner: Product Lead + UX. Date: **2026-08-20**. Status: **decided in session with the owner**,
> except §3 (the name), which is deliberately open with a deadline.
>
> Scope: lean and MVP-sized. This document decides positioning, user, personality, visual direction,
> navigation and the main flow — and nothing else. It does **not** contain a design system, a logo
> system, an illustration style, a marketing site, or a component inventory. Those are not MVP.
>
> Inputs: [`mvp-plan.md`](mvp-plan.md) (the four levels, the MVP boundary),
> [`00-project-charter.md`](00-project-charter.md) §6 (quality bar),
> [`product-specification.md`](product-specification.md) §2 (user profiles),
> [`ux-architecture.md`](ux-architecture.md) (IA, flow states, copy deck — ratified and pruned here).

---

## 1. Positioning

> **Turn the places you discover on social media into a map you can actually use.**

The long form, for the spec and the deck:

*For people who find restaurants, cafés and bars on social media and then can't find them again,
**[name]** turns a pasted link into a pin on their own private map. Retrieval takes seconds instead
of scrolling. Unlike a saves folder, it is organised by **where**, not by **when**.*

The last clause is the product in six words and is the answer to "what is this, in one sentence".

**The boundary, stated as a product fact rather than hidden.** The positioning says *social media*;
the MVP reads **TikTok**. That is a deliberate consequence of `04`'s VERIFIED access mechanism, and
it is honest in the product rather than in a footnote: a pasted Instagram or YouTube link is
**recognised by name** and answered with the manual-add path, never with a failure. The positioning
is written for the product, not for the current adapter count — and D2b's global resolution is what
makes "a map you can actually use" true anywhere in the world rather than in one city.

## 2. The user

**One profile, two retrieval questions.** The person saves places they find while scrolling — some in
the city they live in, some banked for a trip they have not taken yet.

| | Everyday | Trips |
|---|---|---|
| The question | "What did I save around here?" | "What do I already have in this city?" |
| Served by the MVP | **Partly** — city-level retrieval works; *near me* is L2 | **Fully** — map, list and global resolution, no location permission needed |

**The consequence, and it is a schedule decision, not a note:** because the everyday half of our own
primary user depends on it, **near-me is promoted to the first L2 item**, ahead of pre-loading more
cities. Recorded in `mvp-plan.md` §8.

Anti-users are unchanged and still testable: `product-specification.md` §2.1 — this recommends
nothing, has no social graph, and is not an itinerary planner.

## 3. The name — **DECIDED 2026-08-30: No Crumbs**

**Owner decision.** The product is called **No Crumbs**. §3 is closed; what follows records the
reasoning so it is not re-derived, and the constraints the name brings with it.

**Three meanings stack, and the third is the product.** *Left no crumbs* is current praise meaning
executed flawlessly. *Crumbs* are food, which is what this map holds. And **a crumb trail is how you
find your way back** — which is exactly what the product does with a place you saw once, in a video.

**The negation resolves on two layers, and this is load-bearing.** *No crumbs* means none are left,
while the trail idea needs them to exist. Both readings survive only because they never meet: **the
negation is the copy, the trail is the mark.** The words always mean *that place was flawless* — a
judgement about somewhere the user went. The trail appears only as a shape: the loading animation, the
empty state, the icon. Meaning 3 is never spoken in the product's voice.

**What the research established, and it changed the brief.** The category is saturated: at least
**thirty-four shipping products** turn a social link into a pin on a personal map — Plotline, Stasht,
Postcard, GeoTok, MunchMap, iCrave, Triply, Rezz, Drawer, SpotFetch, Mapstr, Mapbite, Beli, Rex,
Recco, SpotSavor, Keepza, Spots, Pin Drop, TokSpot, North, Truffle, Nomblr, Pocket Places, Placelist,
Eats, To Eat List, Eaterly, Eatlist, Eater, SaveThatPlace, Step, The Infatuation and Crumbs among
them. Between them they have taken the roots `map*`, `spot*`, `plot*`, `save`/`stash`, `pin*`, `geo*`
and `*tok`. **Three of this section's own four candidates died on that** — *Mapt*, *Pinned* and
*Spots* are all built from taken roots, and *Spots* and *Pin Drop* ship today as personal-map products
under those exact names. A descriptive name in this category now guarantees a collision.

**The cost of this name, priced rather than hidden: category legibility.** A negation that reads
food-adjacent makes a first-time hearer guess a recipe app or a cleaning product before a map. Every
introduction pays it. That is why the landing subhead must stay literal and must never be traded for a
cleverer line.

**Dating risk, honestly.** *Ate and left no crumbs* peaked around 2023–24, so it is familiar rather
than fresh — it ages like *slay*, not like *rizz*. What dates is copy leaning on the slang reading,
which `voice-and-vocabulary.md` §1 already bans. Stripped of the slang it is two short common words,
food-adjacent, spellable and sayable, with a mark that carries meaning 3 without dating at all.

**Still unverified, and owed before public use rather than before a submission:** trademark and
domain. Domain-availability research was inconclusive and one round of it was wrong — a name with no
DNS record is not necessarily unregistered, and `whois` disproved several such claims. Nothing short is
free, and every competitor in this category runs a workaround domain, so the domain must not drive any
naming decision.

**Where the name may and may not appear:** [`voice-and-vocabulary.md`](voice-and-vocabulary.md) §2
holds the complete list. Six permitted surfaces; banned in every failure string, every toast, every
empty state, anything describing a place, and never as a verb.

### 3.1 The mark — a mascot, and it overrides §5

**Owner ruling, 2026-08-30**, recorded rather than left to be discovered as a contradiction: the
identity is **mascot-led**, a soft-cornered crumb character in the register of the reference artist the
owner supplied. §5 scopes the MVP as *warm minimal* and explicitly excludes an illustration style, and
Charter §4 keeps illustration systems off the current sprint. **This ruling overrides both**, for the
mark only.

Three constraints keep it from eating the design system:

1. **The silhouette is the system.** The same closed path is the mascot at 168px, the pin at 30px and
   the favicon at 16px. An illustrator may change the face, shading, feet and palette. **If they change
   the outline, the pin is lost** and the product is back to the teardrop all thirty-four competitors
   draw.
2. **Face on chrome, silhouette on data.** The character appears on the app icon, splash, sign-in and
   link preview. On the map it is a pin in a category colour with no face — thirty-one smiling faces
   over a city is a toy, and a pin with eyes cannot carry a category colour.
3. **The crumb is a shape, not a colour.** Toast-gold is the obvious brand colour and is **refused**:
   it sits a few degrees from the café category amber, and on this map colour means *what a place is*.
   Mint stays the only brand colour; gold belongs to the mascot alone; the two never share a surface.

**Typography:** the wordmark is set in **Archivo** 900, tight tracking, sentence or upper case, at
normal width. A wordmark is a drawn asset, not a typeface in the product, so §5's *Manrope only*
ruling for UI survives intact. **Do not apply a `font-stretch` axis** — Archivo is variable-width and
an expanded setting visibly distorts the letterforms.

Moods, style constructions and the motion set are in
[`no-crumbs-design-system.html`](no-crumbs-design-system.html) → The Mascot. Eight moods, each bound to
a real product state; the neutral one belongs to *no places found*, because a sad mascot turns the
product's modal outcome into a small failure several times a week.

## 4. Personality and tone

**Modern, sleek, effortless, with a sense of discovery. Clean and confident — never cold or
corporate.**

Four rules that make that operable rather than decorative:

1. **State, don't perform.** The product reports what happened and stops. Confidence reads as brevity,
   not as enthusiasm. *"3 places found"* — not *"Great news! We found 3 amazing places!"*
2. **Concrete over technical, always.** This is where "not corporate" is actually won. The banned list
   in `ux-architecture` §12 stands verbatim: no *metadata, LLM, AI, model, geocode, extraction,
   pipeline, parse, API, payload, confidence score, job, worker*, no *"oops"*, no *"something went
   wrong"*.
3. **Effortless means the product carries the work.** We never ask the user for something we could
   get ourselves — which is the same rule that killed manual caption entry in Charter §2, expressed as
   a voice.
4. **Discovery is the user's, not ours.** They found the place; we kept it. Copy never congratulates
   itself on the find, and never editorialises about the place ("a hidden gem" is not ours to say).

**The failure state is the tone test, not the success state.** At LEVEL B the modal outcome is *no
places in this post* (~73%), so the voice is judged on how that screen reads. It must be matter-of-fact
and offer the next move — never apologetic, never cute, never blaming the post. `ux-architecture` §12.4
holds those strings and is ratified as written.

## 5. Visual direction

> **Map palette amended 2026-08-30.** "Warm minimal" still governs the product UI, and the map is
> still light-only. The *basemap* is no longer warm paper: the owner ruled the beige direction out
> and asked for a materially richer, Mapbox-like map, so the basemap now runs CARTO Voyager under a
> Mapbox-Standard "Day" palette with zoom-tiered, family-coloured POI labels (`06` §2.2). The
> product's own tokens, pins and chrome are unchanged.

**Warm minimal, light only, dark-ready in architecture — first tokens signed off 2026-08-21
(L1-F1-T2), superseding the placeholder values below from the initial component-stack decision.**

| Element | Decision |
|---|---|
| Surfaces | Warm near-white `#FAF9F6`, cards pure white `#FFFFFF` on a hairline border (`#E7E3DC`) — warmth is what keeps *clean* from reading *cold*. No default card shadow; elevation is reserved for surfaces that actually float (the desktop form panel's backdrop-blur, not a resting card) |
| Text | Near-black ink `#1B1B1A`; §11.6's contrast intent is a constraint on the palette, not a check afterwards |
| Accent | **Mint**, not the originally-planned clay/amber — a full ramp (`mint-100` pale wash through `mint-900` deep), plus a dedicated `ink-on-mint` foreground so a mint surface never carries white text. Used for the primary action, the pin (`mint-700`, selected `mint-900`), the focus ring, the kicker label, and inline link emphasis — still **one** accent family, just not the one first proposed |
| Map | **Upstream Protomaps light style with a palette swap.** Authoring our own fork stays L2 (D9b) — unaffected by the mint decision until that fork happens |
| Dark mode | **Architecture only, and currently stale.** `.dark` still carries the earlier light-blue "Pale Sky" exploration's values, not reworked against the mint ramp — it is **not safe to enable** until it gets its own pass. Tokens stay semantic roles so that pass is a value swap, not a refactor; there is still no toggle and no dark map in the MVP |
| Typography | **Manrope only, retiring the display+text pairing.** One family, two roles by weight/tracking: `--font-heading` for headlines (extrabold, tight tracking, tight leading) and `--font-sans` for everything else (body, labels, buttons). The earlier "second display face in exactly three placements" rule is retired — Manrope's own weight range does that job, and a headline may now appear on any screen that needs one (the sign-in hero is the first case, not a fourth-placement exception) |
| Forms | Fields and buttons share the page's one radius (`--radius`, ~1rem — see Radius below): `h-12` mobile / `h-13` desktop, hairline `border-border`, `bg-card`. Labels are 11px bold uppercase with wide tracking; placeholder text is muted-foreground at normal weight, entered text is foreground at medium weight — the two are never the same visual weight |
| CTA styling | Primary buttons are solid mint-400 with `ink-on-mint` text, bold, same shared radius, and the primary action's label carries a trailing `→` (`Sign in →`, `Create account →`) — not a decorative icon, part of the label. Secondary/toggle actions are plain text, muted by default, with the actionable word set in bold `mint-700` inline rather than styled as a second button |
| Radius | **One shared radius, not a multiplier scale.** `--radius-sm` (0.75rem), `--radius` (1rem), `--radius-xl` (1.5rem) are each an explicit value now; the old `calc(base × 0.6…2.6)` scale is retired because it produced a rounder result than intended the moment the base moved. Fields, buttons and cards read `--radius` |
| Composition | **Mobile:** full-bleed atmosphere (a soft mint-tinted radial-gradient wash over the base surface, never a hard color block), top-aligned editorial hero — mark, uppercase kicker, extrabold headline, muted subhead — with the form pinned to the thumb zone at the bottom via flex, not fixed/absolute positioning. **Desktop (`lg+`):** a genuine two-panel split, not the mobile layout stretched — a vertically-centered editorial column on the left, a fixed-width (`clamp(360px,32vw,460px)`) frosted glass form panel on the right behind a single hairline border. Established on the sign-in screen; other full-screen surfaces follow this pattern rather than inventing their own |
| Discipline | **Every colour is a token.** A hard-coded colour anywhere is a review failure — this is what keeps the dark-mode repass and the L2 map fork cheap |
| Component stack | **shadcn/ui + Tailwind CSS + Lucide icons + Manrope**, decided 2026-08-20 — before the name and the token values, because shadcn's copy-in-source components are the *reason* this was safe to fix early: restyling since has been a token/class change, exactly as intended, not a rewrite. **No UI primitive is hand-rolled** while a shadcn equivalent exists. **Motion** (the successor to Framer Motion) is the animation library, used only for subtle interaction/state-transition motion — not for the five choreographed motion moments, which stay `ux-architecture`'s call and L2-scoped |

**Amends the first change-log entry's "nothing resembling a design system or component inventory" line below:** that ruling kept a *designed* system (tokens, logo, bespoke components) out of the MVP; it did not anticipate needing a placeholder-quality UI before the tokens exist. A component *library* selection is not a design system — the visual direction above still governs whenever it's decided, applied on top of shadcn's primitives.

**Note on the sign-in screen's copy tone:** `ux-architecture.md` §1's surface table describes S2 as "Single screen, no marketing." The approved composition's editorial hero (kicker + headline + subhead) reads warmer than that phrase suggests, though it stays functional copy about the product's own state ("Your places are waiting"), not promotional copy. Flagged here rather than silently reconciled — `ux-architecture.md`'s copy deck is owned separately and this document does not amend it.

## 6. Navigation and screens — eight surfaces

The IA principle is ratified as written in `ux-architecture` §1.1 and is the strongest structural
decision in the product: **the map is the application shell, not a page inside it.** One persistent
destination (`/map`), one primary action (add a link). Everything else is a layer over the map or a
full-screen task that returns to it.

**Corrected 2026-08-29:** "no tab bar" is reversed. The owner ruled for a bottom bar with paged
destinations and it shipped (`src/components/nav/bottom-nav.tsx`); the shell principle above is
unaffected, because `/map` is still the resting destination and the bar is chrome over it.

| # | Route | Surface | Layer |
|---|---|---|---|
| S1 | `/` | Minimal sign-in landing — one line of what this is, one CTA. **Pruned from a marketing page** | full |
| S2 | `/signin` | Auth, email + password (D8) | full |
| S3 | `/map` | **Map home** — the product. Full-bleed map, pins, collapsed sheet, Add action | shell |
| S4 | `/map` + sheet | **Saved places list** — search over saved places. Not a page: the sheet at full height | layer |
| S5 | `/place/[id]` | **Place detail** — what it is, and which post made you save it | layer |
| S6 | `/import` | **Add a link** — the flagship entry | layer |
| S7 | `/import/[id]` | **Review & confirm** — the disambiguation surface | full |
| S8 | `＋` → `Add a place` | **Add a place you know** — manual add + delete. Never cut: CRUD evidence *and* the no-places recovery. **Shipped 2026-08-30 as a sheet, not the `/add-place` route this row planned** | layer |
| — | — | **First run** — the state of S3 at zero saved places, not a route | state |

**Pruned from `ux-architecture` §1.2:** the account screen (S9) becomes a **popover** — sign out,
delete my data, location-permission state — and S1 loses its marketing content. Two fewer screens to
design and keep consistent, with nothing lost that the MVP needs.

**Also out, and named so nobody re-proposes them:** settings pages, onboarding carousel,
notifications, activity log, import history. A finished import has no artifact of its own — its
output is pins.

**Corrected 2026-08-30:** three names left that list by owner ruling and are now shipped —
**collections** and **sharing a collection by invite** (`ux-collections.md`, migrations `0024`–`0026`)
and **`/profile`**, which also holds sign-out. The refusals that still bind are the rest of the list,
plus Charter §1's: no public profiles, no follower graph, no discovery feed.

## 7. The main mobile flow

Ratified from `ux-architecture` §2, unchanged in spine: **paste → accepted → reading → finding →
matching → review → confirm → pins land** (F0→F8).

| Stage | What the user sees |
|---|---|
| Paste | One field, in the thumb zone. The only instruction in the product: *"Copy the link in TikTok — Share → Copy link."* |
| Accepted | Instant acknowledgement, before any work completes — this is what makes the wait feel effortless |
| Progress | **A three-stage rail driven by real streamed events** — *Reading the TikTok… · Finding the places… · Matching locations…* No percentage, because we do not have one. Reassurance ladder **cut from four messages to two** |
| Review | Every candidate confirmed by a human. **Never bypassed, never simplified** — Charter §3 invariant 2 |
| Pins land | Post-confirm camera flight to the new pins — the signature moment, and nearly free with MapLibre |

Two properties of this flow are load-bearing and must not be traded for polish:

1. **Each stage is a real event**, not a timed animation. **Not true yet, 2026-08-30:** the streaming
   route (`L0-F6`) does not exist and `/api/imports/probe` is still request/response, so today's rail
   is driven client-side. This stays the bar the rail is held to, not a description of it.
2. **Nothing reaches the map without confirmation**, and the no-places screen is a *designed
   destination* of this flow, not an error branch off it.

## 8. What this changes elsewhere

1. `mvp-plan.md` — §6 step 1 carries the name, the tokens and the eight surfaces; §8 promotes
   **near-me to the first L2 item** (ahead of more cities), because it serves the everyday half of the
   primary user.
2. `product-specification.md` — §1/§2 take the positioning line and the single merged user profile;
   its own accuracy bar in §7.1 is unaffected.
3. `ux-architecture.md` — §1.2's surface inventory is pruned from ten to eight here; its flow states,
   copy deck and accessibility intent are ratified as written and are **not** re-litigated.
4. Nothing in this document changes the decision ledger. No new external service, no new dependency,
   no schema impact.

## Change log

| Date | Change |
|---|---|
| 2026-08-20 | Created in session with the owner. Decided: the positioning line and its long form; **one merged user profile** with two retrieval questions, which promoted **near-me to the first L2 item** because the everyday half of our own primary user depends on it; the personality (modern, sleek, effortless, discovery — clean and confident, not cold or corporate) with four operable rules and the ruling that **the failure screen, not the success screen, is the tone test** at a ~73% no-places rate; the visual direction as **warm minimal, light only, dark-ready in architecture** (semantic token roles, no dark values, no toggle, no dark map — and every colour a token, which is what keeps both the dark theme and the L2 map fork cheap); **display + text typography restricted to three placements**; the surface set **pruned from ten to eight** (account → popover, landing → minimal sign-in); and the flagship flow ratified with a **three-stage rail on real streamed events** and the reassurance ladder cut from four messages to two. Two things were deliberately not decided: the **name**, which is open with its brief, its rejected directions, its live shortlist and a deadline (L1 step 1, the first surface with a header — it does not block L0), and anything resembling a design system, logo or component inventory, which Charter §4 keeps out of the MVP. One honesty item recorded rather than smoothed: the positioning says *social media* while the MVP reads *TikTok*, so the platform boundary is carried **in the product** as a recognised redirect to manual add rather than as a footnote |
| 2026-08-20 | Owner decision, same day: **the component stack** (shadcn/ui + Tailwind + Lucide + Manrope, Motion for subtle interaction only) is fixed now, ahead of the name/tokens, precisely so no UI from here on is a hand-rolled primitive or a bare unstyled placeholder — shadcn's copy-in-source model keeps restyling cheap once §5's tokens land. This narrows, not reverses, the earlier "no component inventory" ruling: a library choice isn't a designed system §5 still owns |
| 2026-08-21 | Owner approved the sign-in screen's design exploration, superseding §5's placeholder values (**not** an append — the table above was rewritten, not extended). **Mint replaces clay/amber** as the one accent family; **typography drops the two-face display/text pairing for Manrope alone** at two weights/roles, retiring the "three placements" rule along with it; **radius becomes one explicit value per size** instead of a multiplier scale off a single base, after the owner rejected the first exploration's radius ("not a fan of the border radius!"); and a **mobile/desktop composition pattern** (full-bleed atmosphere + top hero + thumb-zone form on mobile, genuine two-panel editorial/frosted-form split on desktop) is recorded as the reusable pattern for future full-screen surfaces, not a one-off. Dark mode's values are now explicitly flagged stale rather than silently left inconsistent — they still reflect the rejected light-blue exploration and need their own pass before enabling. One tension noted, not resolved here: the approved hero copy reads warmer than `ux-architecture.md` §1's "no marketing" description of S2 |
| 2026-08-30 | **The name closes: No Crumbs**, and §3 is rewritten from an open brief into a decision, with the three meanings, the two-layer resolution of the negation, the saturated-category research that killed three of its own four candidates, and the priced cost (category legibility). **§3.1 is new and overrides §5 and Charter §4 for the mark only:** the identity is mascot-led, on the owner's ruling, with three constraints that keep it contained — the silhouette is the system, face on chrome and silhouette on data, and the crumb is a shape rather than a colour so that mint remains the only brand colour and category colour keeps meaning what a place is. Archivo enters for the wordmark alone, at normal width, which leaves §5's *Manrope only* UI ruling intact. Two companion documents are created: [`voice-and-vocabulary.md`](voice-and-vocabulary.md), which governs every string and closes a drift between the copy deck and the shipped code in favour of the code, and [`facelift-plan.md`](facelift-plan.md), which is the plan of record for the five-stage visual rebuild |
