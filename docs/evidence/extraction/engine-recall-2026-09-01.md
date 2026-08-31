# The engine's recall, measured against its input rather than against the world

Date: **2026-09-01** · **VERIFIED, n=16 posts** · No spend (fixtures) · Harness: `/tmp/recall.mjs`, reproducible from the committed fixtures

## The number this project has been quoting, and what it actually measures

**27%** has anchored every conversation about this engine for two weeks: *"the caption names a
resolvable venue in roughly 27% of genuine recommendation posts."* Read the sentence carefully —
**it is a measurement of captions, not of the engine.** It says how often creators write a venue
name down. It says nothing about whether we find the ones they do write.

That second question had never been asked. Here it is.

## Engine recall against extractable content: 10 of 10

Ground truth is E7's hand-labelled `venuesInCaption`, with the classes the prompt **deliberately
refuses** removed — because refusing them is the specified behaviour, and two of them are fixed
defects rather than misses.

| post | venue in the caption | extracted? |
|---|---|---|
| `@muchmorethanmatcha` | Cafe Fiori | **yes** |
| `@travel.by.ann` | Nomena Roasters | **yes** |
| `@exploringlondon` | La Nonna, MBER London, The Life Goddess, The Laughing Yak, Sycamore Restaurant, Tokii London, Kiaans Tooting, Jones Family Kitchen | **all eight** |

**10 extractable venues. 10 extracted. 100%.**

### What was refused, and why each is correct rather than a miss

| post | in E7's raw list | why refusing it is right |
|---|---|---|
| `@zachmargs` | `Tel Aviv` ×5 | a **city**, not a venue. The prompt rejects bare place names by design |
| `@joiceglobal` | `Tel Aviv` | same |
| `@nom_life` | three hashtag spellings of one market | hashtag-only evidence. This is the `#tsukijifishmarket`-at-0.95-confidence defect from `RICH-EXT-1` §4 — **refusing it is the fix**, and it returning `[]` here is that fix holding on the specimen that demonstrated it |
| `@marielleisrael` | `aroma` | a **chain**, reached via hashtag, marked WEAK by E7 itself |

Counting those four as recall would mean grading the engine down for doing exactly what it was
built to do — and for one of them, for a defect that was deliberately closed.

## So there are two honest numbers, and they answer different questions

| question | answer | what bounds it |
|---|---|---|
| *"How often does pasting a link give me a place?"* | **27%** | what creators write in captions |
| *"Does the engine find what the caption contains?"* | **100%**, with **0** wrong options offered | the engine |

The first is a **product** number and it is bounded by the input. The second is the **engine**
number. This project has been quoting the first as though it graded the second, and that conflation
made the engine look worse than the evidence supports — including in my own assessment earlier today.

## What this does and does not license

**It does not make the product good enough.** A user pasting five links still gets one place, and
that is the number that decides whether the map is worth opening. Everything about widening the
input — transcripts at **40% → 80%** on posts that have one — stands unchanged and is still the only
lever that moves the product number.

**It does mean the extraction stage is not where the remaining work is.** On the input it is given,
it finds everything there is to find, refuses four classes of thing it should refuse, offers zero
wrong options, and holds ≥87% precision at 95% confidence on a corpus it was not fitted to.
