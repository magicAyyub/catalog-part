# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A brake parts catalog for around 7 franchisees of Jumbo Pneus. A user identifies a
vehicle (licence plate, or a brand/model/engine cascade) and gets the compatible
brake pads and discs with specs, filters and a detail page.

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

pnpm auth:user list             # accounts allowed into the catalog
pnpm auth:user create dupont --franchise "Lyon Est"   # prints a generated password once
pnpm auth:user disable dupont   # revoke, effective immediately

pnpm vehicles:harvest           # fill the local K-Type index from the cache, no billed call
pnpm night:run --dry-run        # nightly plan and estimated cost, nothing leaves
pnpm night:run                  # capped by NIGHT_MAX_API_CALLS, 60 by default

pnpm index:braking              # acquire catalog for known vehicles
pnpm index:braking --dry-run    # print the plan and the estimated billed calls
pnpm index:braking --details 200  # pass 2, OEM refs, one billed call per article
pnpm warm:vehicles              # refresh vehicles whose cache nears TTL expiry
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
- **carId** is a wholesaler portal's internal id (101412, 199512). It lives in a
  different space and is meaningless to TecDoc.

The original bug in this project was passing a `carId` to TecDoc endpoints, which
returned nothing usable. A missing K-Type must therefore **fail loudly rather
than fall back to `carId`**. Keep that behaviour through any refactor of the
provider chain. It is also why app-etf was dropped: its public route still
answers `vehicleId: kType ?? carId`.

## Request flow

Plate search:

```
POST /api/vehicle/by-plate
  -> lib/plate/identify.ts          provider chain, see below
  -> lib/vehicle/ktype-resolver.ts  td_vehicle lookup, no billed call
                                    on a miss only, walk the labels back:
                                    brand -> manufacturerId
                                    model -> candidate modelIds
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
SQLite. The article detail also enriches from `article-complete-details`, behind
a permanent compressed cache.

`lib/parts/article-detail.ts` holds that assembly, and both the API route and
the `/piece/[articleId]` page call it. The page renders on the server, so it
must go through this function rather than reaching upstream on its own;
otherwise a page view would carry a billed call the fetch never had. Measured on
article 64225: a full render, 20 criteria, 302 OEM references, 1203 compatible
vehicles and 6 images, at zero billed calls.

The catalog carries its own state in the URL, `vehicule`, `cat`, `f`, `c`,
`page` and `taille`, written with `replace` rather than `push` so a history
entry per filter click does not bury the way out. Leaving for a part detail is a
push, which is what makes browser back restore the exact screen. `localStorage`
still holds the vehicle labels, which the URL cannot carry; a link opened by
someone else degrades to the vehicle number rather than inventing a label.

Two things the move from a drawer to a page cost, and how they were paid back.
The drawer showed a skeleton because it fetched from the client; a server
rendered page has no loading state of its own, so without `loading.tsx` the
browser sat on the catalog with nothing moving, for seconds on an article whose
details are not cached. And the card link carries `prefetch={false}`, because a
page render can carry a billed call and prefetching ten visible cards would buy
articles nobody opens.

The order on the page is deliberate. A BOSCH pad kit carries 302 manufacturer
references and 1203 compatible engines; laid flat they pushed the
specifications, which is what someone at the counter actually reads, below the
fold. Specifications come first as a table, compatible vehicles next in two
columns of brands, OEM references last, grouped by manufacturer and folded into
a `details` element that costs no JavaScript.

## Plate identification, and its single point of failure

`lib/plate/identify.ts` has one provider, Exadis (`lib/suppliers/exadis/`). One
request, `searchVehiculeByImmatOrVin`, measured at 445 to 825 ms depending on
whether the session is already open. It yields the K-Type and, from the same
response, the brand and model labels. No extra request for the labels.

The decision after it answers:

```
K-Type already in td_vehicle   -> done, labels irrelevant, no billed call
K-Type new but labels readable -> TecDoc walk
K-Type new, labels unreadable  -> unconfirmed record, parts still correct
```

The third line is a degradation, not a failure. `resolveVehicleFromKType`
returns `confirmed: false` with `manufacturerId` and `modelId` at zero, and
`syncVehicle` buys parts on `engineType.vehicleId` alone, so only the displayed
vehicle label suffers.

Label positions in the Exadis string table were derived from real responses, not
guessed, on two vehicles whose tables differ in length: the plate is the anchor,
the brand sits three entries after it, the K-Type is the first nine digit group,
and the model label is the last entry. Only the K-Type is required; every label
goes through a plausibility check and an unreadable one is dropped rather than
propagated as a doubtful value.

**Why app-etf is gone.** It sat behind Exadis as a fallback until it was
removed. It read its own K-Type from Exadis too, through the same RPC #4, so it
fell with the source it was meant to cover; its `getCachedKType` is a
single-entry in-memory cache keyed on `cookies::plate`, not a store of plates
already seen; and its public route degrades a missing K-Type into a portal
`carId`, which our client rejected, turning the fallback into a 502 after
15 seconds. The only independence it had was a distinct Exadis account and
outbound IP, which covers revoked credentials and nothing else. A genuine second
pillar has to be independent of Exadis, which is what Distriauto or Oscaro would
be for. Do not reintroduce a provider that reaches Exadis to answer.

Their server presents its leaf certificate without the intermediate, so Node
fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. app-etf works around this by
switching `NODE_TLS_REJECT_UNAUTHORIZED` off, which disables verification for
every outbound request of the process. Here the missing intermediate is supplied
explicitly in `lib/suppliers/exadis/ca.ts` and passed per request through
`node:https`, so verification stays on everywhere. Do not replace that with the
blunt workaround.

Only the K-Type and its labels are taken from a supplier. No price, no stock, no
article. That is the project owner's rule, and here it holds by construction:
the code that would read a catalogue does not exist in this repository.

## The local K-Type index

RapidAPI has no endpoint answering "which vehicle is this K-Type". The only
source is `Engine_Types_by_Model`, and it returns the whole engine line-up of a
model, measured at 22 rows per call. The resolver used to read the one row it
wanted and drop the other 21, so the same call was worth one K-Type.

`lib/vehicle/vehicle-index.ts` banks the whole payload into `td_vehicle`, which
already had the right columns. `resolveVehicleFromKType` answers from there
first, at no billed call, and only falls back to the label walk on a miss. Every
payload the walk fetches is banked too, including when it does not contain the
K-Type being looked for, because it will answer some other plate later.

`pnpm vehicles:harvest` does the same over the `engine_types_*` entries already
sitting in `api_cache`. It reads the cache, never the API, so it costs nothing
and is safe to rerun.

Two measurements worth keeping. Banking took the index from 2 usable K-Types to
36 without a single billed call. And the label walk is ambiguous for 20 percent
of cached models, with a worst case of 26 candidate models for PEUGEOT ION,
which is where the avoided calls actually are; the other 80 percent match one
candidate and were already cheap.

A row whose `manufacturer_id` or `model_id` is null does not count as resolvable.
The indexer writes such placeholders for vehicles it meets without a legacy
record, and they cannot stand in for a resolution.

## Two data layers coexist on purpose

**Legacy read path, what the UI actually reads today**: `articles`,
`article_specifications`, `suppliers`, `vehicles`. `articles` has a composite key
`(articleId, vehicleId, categoryId)`, so one reference is duplicated per vehicle.

**New acquisition layer, not yet read by the UI**: the `td_*` tables, filled by
`pnpm index:braking`. Three natures of data are separated by design:

```
REFERENCE     td_supplier, td_article, td_criteria, td_oem, td_wva
APPLICABILITY td_vehicle, td_fitment
TRACKING      index_job               (billed calls per vehicle/category)
```

`td_article` is keyed on `articleId` alone, so a reference is stored once and its
criteria are shared by every vehicle it fits. Do not reintroduce per-vehicle
duplication.

`td_vehicle` now carries a second role beyond applicability: it is the K-Type
index the plate flow reads. It is therefore written by two paths, the indexer and
`rememberEngineTypes`, and the latter overwrites placeholder rows on conflict.

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
  `s3image`.
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
when already present. `syncVehicle(..., { force: true })` bypasses them.

Never cache fabricated data. A previous version of the detail route invented OEM
references (`<REF>-OEM1`) and compatible vehicles when TecDoc did not answer; that
was removed precisely because a permanent cache would have frozen it. Prefer an
empty field, which the detail page hides on its own.

## Nightly preparation

`pnpm night:run` is one command and one crontab line. It harvests the K-Type
index, indexes vehicles the index can name but whose parts were never bought,
renews caches nearing expiry, purges expired sessions, and writes a compacted
backup to `data/backups` with rotation.

Everything that spends money is capped by `NIGHT_MAX_API_CALLS`, measured at the
RapidAPI client through `billedCallCount()` rather than estimated. That counter
is the only place a billed call cannot be miscounted; an earlier version read
`index_job` totals for the refresh step, which `sync-service` never writes, and
silently overcounted. Prefer the counter for any new budgeted work.

The indexing step orders by cost: siblings of an already indexed model come
first, at about 3 billed calls instead of 10.

## Watching what the system does

`/logs` renders the structured logs as a chronological trace, with counters for
billed calls, plate lookups and index hits, filters by day, level and action, and
a 3 second live refresh. Built for sitting next to the catalog with a real plate
and watching each step.

The trace reads as requests rather than as lines. `lib/logs/request-context.ts`
holds an `AsyncLocalStorage` that `lib/logger.ts` reads on its own, so every line
written during one request carries the same `requestId` without a single call
site passing it. The routes under `app/api/` open that context in a thin wrapper
around their handler. This exists because nothing else could tie the lines
together: `rapidapi_call` carries only a path, never the plate that caused it, so
a billed call could not be attributed to the search that paid for it.

Grouping in `lib/logs/reader.ts` is deliberately strict. Only a shared
`requestId` puts two lines in one block; nothing is inferred from timing or
proximity, so a block always reflects something the logger actually recorded.
Lines written before the correlation id existed, and lines written by the
scripts, stand alone. The reader also folds runs of identical consecutive lines
into one, ignoring `count`, `failedAttempts` and `attempt`, which only carry a
running total. Folding counts occurrences, not lines, so two identical
`rapidapi_call` entries collapsed into one row still report two billed calls.
That distinction was a real bug, caught by exercising the reader rather than by
reading it.

Messages stay in English at the call sites, where they are effectively technical
identifiers and remain greppable in the files. `lib/logs/vocabulary.ts` maps them
to French for display, along with the tone of each action and the two or three
fields worth reading without unfolding. An unknown message falls back to its raw
form: showing English beats showing a label that might be wrong. Account ids are
resolved to account names before the entry leaves the reader, since a trace full
of UUIDs tells the reader nothing.

`.gitignore` must keep the leading slash on `/logs/`. Without it the rule also
swallowed `app/(app)/logs/` and `lib/logs/`, and the whole trace page sat
untracked for a while despite a commit that claimed otherwise.

Two doors, checked on the page and on `/api/logs` alike. Being signed in as a
franchisee is not enough: the trace shows plates and billed calls, so it also
asks for `LOGS_PASSWORD`, a shared secret held in `.env` rather than a role on
the accounts table, so who can read it never depends on a flag someone might set
by accident. Unlocking issues a short lived signed cookie, reusing the session
token machinery rather than a second crypto scheme. Five wrong tries lock the
account out for 15 minutes. With `LOGS_PASSWORD` unset the page stays closed to
everyone, which is the safe default.

## The join key between TecDoc and the portals

TecDoc identifiers mean nothing outside TecDoc. `lib/catalog/normalize.ts` builds
a `(brandKey, articleNoKey)` pair that identifies a reference by brand and part
number instead, and `td_article` carries it on every row. The rules were salvaged
from the neighbouring `app-etf` project: legal entity suffixes, parenthesised group
names, separator stripping, and the warehouse code one portal appends to BOSCH OE
references (`0986479382PH01WHCO0000` becomes `0986479382`).

Nothing consumes that pair today. It exists so a price source, whenever one is
decided, can be joined without touching the reference tables.

## Authentication, and the one mistake not to repeat

Closed by default, in two layers that answer different questions.

`proxy.ts` (Next 16's rename of the middleware convention) checks that the
session cookie is signed with `AUTH_SECRET` and unexpired. It touches no
database, so it runs on every request for free, and a route is reachable without
a session only if it is listed there. That is enough to redirect a browser to
`/login`. It is **not** enough to serve data.

The mistake worth remembering: a cookie whose session was closed by a sign-out,
or whose account was disabled since, still carries a valid signature until its
expiry. With only the proxy in place, `pnpm auth:user disable` and the logout
button both looked like they worked and changed nothing on the API. So every
route returning parts, prices or vehicle data calls `requireUser()` from
`lib/auth/guard.ts`, which asks the database. Protected pages live under
`app/(app)/`, whose layout does the same, which makes a new page protected by
where it sits rather than by someone remembering.

`users.passwordHash` is scrypt from `node:crypto`, carrying its own cost
parameters. `sessions.id` is the SHA-256 of the cookie token, never the token,
so the table cannot be replayed. Five consecutive failures lock an account for
15 minutes, tracked on the user row rather than in memory.

## Related repository

`../app-etf` is a colleague's project, deployed at `https://etf.jumbopneus.shop`.
Only two endpoints are public: `/api/external/by-plate` and
`/api/external/search`, both Bearer-token gated.

It used to be the source of truth for plate identification, then the fallback
behind the direct Exadis lookup. Nothing in this repository calls it any more,
for the reasons in the plate section. It stays a neighbour, not a dependency.

The deployed build and the local checkout have diverged in both directions, so do
not treat that source as the API contract. Its scraper code is useful as
reference material; the parts salvaged
here are the GWT request bodies, the string table decoding and the vehicle
parsing, nothing that touches a catalogue.

## Known gaps

- Coverage is the real limit today: 36 K-Types are resolvable without a billed
  call, but only 5 vehicles have their parts. A plate taken at random still costs
  a full acquisition. `pnpm night:run` exists to close this and has not yet been
  run with a real budget.
- One source of K-Type, Exadis, and now a single path to it. Removing app-etf
  cost no real redundancy, but it does mean an Exadis outage closes plate search
  until an independent provider exists. See the plate section.
- No price source. The owner ruled out supplier data, so any price would have to
  come from a rate sheet imported from a file. Nothing in the repo attempts it.
- A 401 from an API route leaves the loaded page showing stale data until a
  navigation; only the next server render redirects to `/login`. A TanStack Query
  error handler would close that window.
- Plate-bearing logs and a supplier session cookie are in the git history of this
  private repository. The Exadis and Preference passwords need rotating.
- The Exadis GWT request body embeds the account identity as captured: company
  name, address, account number, contact email, a person's name and a phone
  number. It is required verbatim for the request to deserialize on their side.
- `FacetPanel` derives filters from the specs of the loaded parts, measured at
  0.22 ms for 62 parts, roughly a hundred times faster than a round trip, which
  is why there is no server-side facet table.

## Where the work stands, and what comes next

Done and working locally, not committed at the time of writing:

- Per-account authentication, the blocker before franchisees could use it.
- Dead code removal: the supplier price scrapers, the fabricated-article fallback
  in the parts route, the server-side facet path, a mock plate resolver, and six
  tables no code read.
- The local K-Type index, plus `pnpm vehicles:harvest`.
- Direct Exadis plate lookup with label extraction, and the provider chain behind
  it. Plate identification went from 15 524 ms to 680 ms end to end, still at
  zero billed calls.
- `pnpm night:run` with a hard, measured budget.
- The `/logs` trace page, then its rewrite around per-request correlation.

Earlier, on `main`: the `productId` fix that unlocked criteria, the permanent
compressed caches, the symmetric sync guards, and the `td_*` acquisition layer
with `pnpm index:braking` and `pnpm catalog:report`.

Deployment target is a VPS, which the project owner is taking at OVH. The shared
hosting first handed over (`cluster100`) is PHP only and cannot run this. On a
VPS, SQLite stays: `SQLITE_PATH` points outside the deployment directory, the
nightly backup covers durability, and reads stay at 0.03 ms. A network database
would only be needed if the app ever moved to serverless.

Agreed strategy: own the catalog rather than rent it. RapidAPI is an acquisition
channel paid once per vehicle. Scope is braking only, pads and discs.

Next, in order: run the nightly job with a real budget to lift coverage, then
add an independent plate provider, then cut the UI over to the `td_*` tables and
drop the legacy ones.

That backlog now lives in the GitHub issues of this repository, grouped into
milestones, with a board linked from the Projects tab. Read the issues rather
than this paragraph for the current state, and put decisions taken while working
on a subject in a comment on its issue.

Measured facts worth not rediscovering: a sibling engine of an already indexed
model costs 3 billed calls instead of about 10. One `engine_types` call teaches
the index about 22 K-Types rather than one. The cascade is cached with no expiry,
so a brand or a model costs one billed call once and zero forever after.

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

The `td_*` modules, `lib/plate`, `lib/suppliers/exadis`, `lib/catalog` and the
scripts follow these rules. Older files, including the legacy half of
`lib/db/schema.ts`, still carry French docstrings. Leave them; match the rule in
new code rather than the surrounding drift.
