# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A brake parts catalog for around 7 franchisees of Jumbo Pneus. A user identifies a
vehicle (licence plate, or a brand/model/engine cascade) and gets the compatible
brake pads and discs with specs, filters and a detail drawer.

Next.js 16 App Router, React 19, Drizzle ORM over SQLite (`better-sqlite3`),
TanStack Query. Package manager is pnpm.

## Commands

```sh
pnpm dev                  # Next dev server on :3000
pnpm dev:mock             # fixture server (:4000) + Next together
pnpm build                # production build, also the fastest full typecheck
pnpm lint                 # eslint

pnpm db:generate          # generate a migration from lib/db/schema.ts
pnpm db:migrate           # apply pending migrations
npx drizzle-kit studio    # browse the database

pnpm warm:vehicles              # refresh vehicles whose cache nears TTL expiry
pnpm warm:vehicles 15901 32251  # explicit K-Types

pnpm index:braking              # acquire catalog for known vehicles
pnpm index:braking --dry-run    # print the plan and the estimated billed calls
pnpm index:braking 15901        # explicit K-Types
pnpm index:braking --details 200  # pass 2, OEM refs, one billed call per article
pnpm catalog:report             # coverage, amortisation, latency, cost report
```

There is no test suite. Verification in this repo means: `npx tsc --noEmit`,
`pnpm build`, then exercising the real API routes with `curl` against a running
dev server and counting billed calls in `logs/app-<date>.log`
(`grep '"action":"rapidapi_call"'`).

Anything that calls RapidAPI costs money. Prefer `--dry-run`, reuse the vehicles
already in the database, and check the cost tables in README.md before running a
script that fans out.

## Two identifier spaces, and the trap between them

This is the single most important thing to understand before touching vehicle code.

- **K-Type** is the TecDoc vehicle type number. It is exactly the `vehicleId` that
  every RapidAPI endpoint expects. Verified: 15901 is PEUGEOT 307 (3A/C) 1.6 16V,
  32251 is FIAT PUNTO EVO 1.3 D Multijet.
- **carId** is Preference's internal portal id (101412, 199512). It lives in a
  different space and is meaningless to TecDoc.

The original bug in this project was passing a `carId` to TecDoc endpoints, which
returned nothing usable. `lib/etf/plate-client.ts` therefore **refuses to fall
back to `carId`** when the K-Type is missing, and fails loudly instead. Keep that
behaviour.

## Request flow

Plate search:

```
POST /api/vehicle/by-plate
  -> lib/etf/plate-client.ts        GET app-etf /api/external/by-plate (Bearer)
                                    returns kType + brand + model labels
  -> lib/vehicle/ktype-resolver.ts  brand label -> manufacturerId
                                    model label -> candidate modelIds
                                    engine-types of a candidate must CONTAIN the
                                    K-Type, otherwise try the next candidate
                                    result: a full ApiEngineType
  -> cached permanently in api_cache under plate_<PLATE>
```

The client then posts to `/api/vehicle/sync`, which runs `lib/vehicle/sync-service.ts`
against RapidAPI, exactly as the manual cascade does. `by-plate` only identifies;
it never fetches parts.

Cascade search: `/api/vehicle/manufacturers`, `/models`, `/engine-types`, each
wrapped in `getWithCache` under `manufacturers`, `models_<id>`, `engine_types_<id>`.
Cached with no expiry, so the cascade is effectively free after first use.

Reads: `/api/parts?vehicleId&categoryId` and `/api/parts/[articleId]` serve from
SQLite. The article detail route also enriches from `article-complete-details`,
behind a permanent compressed cache.

## Two data layers coexist on purpose

**Legacy read path, what the UI actually reads today**: `articles`,
`article_specifications`, `suppliers`, `vehicles`. `articles` has a composite key
`(articleId, vehicleId, categoryId)`, so one reference is duplicated per vehicle.

**New acquisition layer, not yet read by the UI**: the `td_*` tables, filled by
`pnpm index:braking`. Four natures of data are separated by design:

```
REFERENCE     td_supplier, td_article, td_criteria, td_oem, td_wva
APPLICABILITY td_vehicle, td_fitment
OFFER         supplier_offer          (prices and stock, still empty)
EQUIVALENCE   equivalence_edge, equivalence_cluster
TRACKING      index_job               (billed calls per vehicle/category)
```

`td_article` is keyed on `articleId` alone, so a reference is stored once and its
criteria are shared by every vehicle it fits. Do not reintroduce per-vehicle
duplication.

The cutover to `td_*` has not happened. Keep both layers working; the app must
never be left broken between steps.

## TecDoc facts that cost real debugging

- **`productId` is not `categoryId`.** `productId` is the TecDoc generic article
  (402 for brake pad kits, 82 for discs on the vehicles indexed so far);
  `categoryId` is a navigation node (100030, 100032). The criteria endpoint needs
  the generic article. Passing the category returns `{"articles": null}` and, for
  a long time, an empty `catch {}` hid it. Read the real `productId` from
  `articles.product_id` or `td_article.product_id`.
- **Criteria belong to the reference, not the vehicle.** Verified on 869
  observations: indexing a sibling engine of the same model processed 879 criteria
  rows and produced only the 10 belonging to the 2 genuinely new references. The
  indexer relies on this to skip criteria calls for references already known,
  which drops a sibling vehicle from 11 billed calls to 3.
- **RapidAPI returns no prices.** An article carries only `articleId`, `articleNo`,
  `supplierName`, `supplierId`, `articleProductName`, `productId`, media fields and
  `s3image`. Prices and stock can only come from the wholesaler portals.
- TecDoc returns around 500 articles per category; `ALLOWED_SUPPLIER_IDS_PROD`
  narrows that to roughly 15 to 60. Each brand in that list costs one criteria
  call per category and per vehicle, so the list is the most direct cost lever.
- `Engine_Types_by_Model` can return duplicate rows for the same `vehicleId`.

## Caching, and why the numbers matter

`api_cache` (key, valueJson, updatedAt) is the single cache table.
`lib/vehicle/api-cache.ts` exposes two helpers:

- `getWithCache` for referentials and small payloads, no expiry.
- `getWithCompressedCache` for large immutable payloads. An
  `article-complete-details` response is around 274 KB and gzips about 10 times
  smaller. Entries are prefixed `gz:`; plain JSON written by `getWithCache`
  remains readable.

`sync-service.ts` has symmetric guards: neither articles nor criteria are re-bought
when already present. `syncVehicle(..., { force: true })` bypasses them, which is
what `warm:vehicles` uses.

Never cache fabricated data. A previous version of the detail route invented OEM
references (`<REF>-OEM1`) and compatible vehicles when TecDoc did not answer; that
was removed precisely because a permanent cache would have frozen it. Prefer an
empty field, which the drawer hides on its own.

## The join key between TecDoc and the portals

TecDoc and the wholesaler portals share no identifier. `lib/catalog/normalize.ts`
builds the `(brandKey, articleNoKey)` pair that bridges them, which is why
`supplier_offer` is keyed on it rather than on `articleId`. The rules were salvaged
from the neighbouring `app-etf` project: legal entity suffixes, parenthesised group
names, separator stripping, and the warehouse code Preference appends to BOSCH OE
references (`0986479382PH01WHCO0000` becomes `0986479382`). A missed normalisation
does not crash anything, it silently produces a part with no price.

## Related repository

`../app-etf` is a colleague's project, deployed at `https://etf.jumbopneus.shop`,
and it is the source of truth for plate identification. Only two endpoints are
public: `/api/external/by-plate` and `/api/external/search`, both Bearer-token
gated with a `shell` kind token created from its `/admin/tokens` page.

The deployed build and the local checkout have diverged in both directions, so do
not treat that source as the API contract. Confirm shapes against the live
endpoint. Its scrapers (`lib/suppliers/exadis` for the K-Type, `lib/suppliers/preference`
for prices) are the material to salvage when wiring prices into `supplier_offer`.

## Known gaps

- **No authentication anywhere.** Net purchase prices are reachable by anyone who
  loads the URL. This is the main blocker before the franchisees use it.
- The Preference session cookie and plate-bearing logs are in the git history of
  this private repository. The Preference password needs rotating.
- `/api/admin/sync-winpro-csv` parses a CSV, counts lines, writes nothing, and
  returns success.
- `article_criteria_facets` is populated but never read; `FacetPanel` derives
  filters from the specs of the loaded parts, which measured at 0.22 ms for 62
  parts, roughly a hundred times faster than a round trip.
- `lib/vehicle/plate-resolver.ts` still holds a mock vehicle pool and a
  `resolvePlateToVehicle` that nothing calls. Some of those mock ids (178952) are
  not valid K-Types.

## Where the work stands, and what comes next

Decided and done, committed on `main`:

- Plate identification rewired onto app-etf, which returns the K-Type. The old
  path sent Preference's `carId` to TecDoc and got nothing usable.
- `productId` fix, which unlocked criteria and therefore the filter panel. Before
  it, every article had zero specs.
- Cost work: permanent compressed cache on article details and media, removal of
  `suppliers/list` on every sync, symmetric guards on articles and criteria,
  nightly warm-up. A repeat click on a part went from two billed calls to zero.
- The `td_*` acquisition layer plus `pnpm index:braking` and
  `pnpm catalog:report`. Six vehicles indexed for 47 billed calls, 163
  references, 1564 criteria rows, served at 0.03 ms p50.

Agreed strategy: own the catalog rather than rent it. RapidAPI is an acquisition
channel paid once per vehicle; the portals supply what TecDoc lacks, prices and
stock. Scope is braking only for now, pads and discs.

The immediate next step, already agreed with the user: **wire prices into
`supplier_offer`**. Port the Preference scraper from `../app-etf`, fill the table,
then measure in `catalog:report` how many `td_article` rows match an offer on
`(brandKey, articleNoKey)`. That match rate is the open risk of the whole
approach, which is why it comes before widening the catalog.

After that, in order: widen the corpus to around twenty varied vehicles for a
defensible amortisation figure, cut the UI over to the `td_*` tables and drop the
legacy ones, then build equivalence clusters with a union-find over
`equivalence_edge`. WVA edges are already collected for free; OEM edges need the
opt-in details pass.

Measured facts worth not rediscovering: the Preference portal exposes 11 physical
fields against TecDoc's 40 criteria names, so scraping alone cannot reach the
current level of detail. A sibling engine of an already indexed model costs 3
billed calls instead of about 10. Deriving facets client-side costs 0.22 ms for
62 parts, roughly a hundred times less than a round trip to the server.

## Style rules from .agents/skills/developer-standards

- Code identifiers, docstrings and in-code API documentation in English. Inline
  comments may be French.
- Keep docstrings short. State what is not obvious from the signature and stop.
- No numbered lists in comments or documentation.
- No emojis, and no generated-looking separators (long dashes, rows of equals
  signs, hyphens or underscores).
- Be analytical rather than agreeable. If an approach is over-engineered or rests
  on a misunderstanding, say so and propose the simpler path; but do not
  manufacture debate when the reasoning is already sound.

The `td_*` modules, `lib/etf`, `lib/catalog` and the scripts follow these rules.
Older files, including the legacy half of `lib/db/schema.ts` and the salvaged
scrapers, still carry French docstrings. Leave them; match the rule in new code
rather than the surrounding drift.
