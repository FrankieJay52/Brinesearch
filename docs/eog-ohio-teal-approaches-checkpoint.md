# EOG Ohio teal-line route displays — implementation checkpoint

## Scope

Repository implementation only for current-production EOG pads, using the same fail-closed presentation boundary as the Ascent catalogs.

## Exact starting state

- Base main SHA: `f72424c8537204b12001155306b1b459e2b02c60`
- Base tree: `7aeb1fe41d75af99d860e4c7a75d23a947f39da5`
- Branch: `feature/eog-ohio-teal-approaches`
- Production Supabase project: `wvxzqtoiwhrgovzddtvz`

## Read-only production scope recovered before implementation

- EOG records: 301
- EOG pads: 301
- State: Ohio for all 301
- Saved GPS pairs: 214
- Structured road sequences: 286
- Written directions: 296
- Oldest current row update: `2026-08-09 03:36:57.744175+00`
- Newest current row update: `2026-08-23 04:27:33.071652+00`

The first route-detail aggregate query failed read-only with SQLSTATE `42703` because `public.brinesearch_route_prep_steps.mileage` does not exist. No retry was made. One persisted-state check produced the counts above. No production mutation occurred.

## Non-negotiable display contract

- Exact pad UUID, legacy ID, current revision, company, name, county, destination source, and coordinate must bind every artifact row.
- A solid teal section requires exact stored road identity or an exact source-backed alias match.
- At the first identity mismatch, teal ends permanently for that pad.
- Any remaining routed approach is generic dashed and explicitly unapproved.
- A straight destination tether is never road geometry, never teal, and never included in mileage.
- A bounded candidate point on an already identified highway cannot assert an exact intersection or approved handoff.
- Any record without sufficient exact evidence is pin-only; geometry, measured directions, and route mileage are absent.
- No fuzzy, name-only, nearest-road identity selection, shortest-path substitution, fastest-path substitution, or invented approval.
- Display evidence does not create graph authority, approved-haul authority, route lock, public Google publication, or cutover.

## Authorized phase and stop point

Authorized: repository implementation, tests, branch commits, and a draft PR/checkpoint.

Not authorized: production write, migration, graph activation, route reconciliation write, approved-haul policy write, public Google publication, global cutover, merge, or deployment.
