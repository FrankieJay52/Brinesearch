# Issue #97 Gates 2 + 3 checkpoint — 2026-09-03

Repository: `FrankieJay52/Brinesearch`
Branch: `fix/issue97-gates-2-3-county-terminal-access`
Base main observed during this work: `46a4710a33aa713843749038886aac55ab08e489`

## Scope kept

Only Gate 2 / Gate 3 resolver investigation and evidence. No UI changes, no provider verification work, no publishing/cutover, no coordinate promotion, and no production/Supabase writes were performed.

## Completed

### Gate 2 — county + physical-road scoping

Implemented a forward migration draft:

`supabase/migrations/20260903202000_issue97_gate2_county_physical_road_uniqueness.sql`

The draft:

- derives the pad state and county from the route's pad;
- resolves county through the active `brinesearch_road_graph_counties` registry using state + normalized county name;
- fails closed for missing, blank, or non-unique county scope;
- removes only out-of-scope unresolved occurrence candidates;
- evaluates physical-road uniqueness only through currently verified canonical road mappings;
- refuses normalized-name, fuzzy, nearest-road, provider-geometry, or GPS-based grouping;
- directly resolves only when both the physical canonical road and the authoritative identity representation are unique;
- leaves same-physical-road/multiple-authoritative-identity cases for the existing graph-path solver instead of selecting an identity arbitrarily.

Read-only impact/evidence SQL is saved at:

`ops/issue97-gates-2-3/sql/01-gates2-3-impact-readonly.sql`

### Gate 3 — terminal private access

The current terminal-access classifier already excludes generic terminal `Pad` / `Lease Road` placeholders from the authoritative graph-path solver while retaining the terminal step as held evidence.

A deeper dependency check found that simply ignoring that held terminal step in `refresh_route_receipt` would not be a safe two-predicate change. Existing `route_ready` consumers require all occurrence counts, canonical mappings, exact geometry, and Google-currentness counts to match the full route occurrence count.

Existing V18 named-approach releases (for example BANJO) already model the safe equivalent as an exact public-road core plus `google_to_saved_gps_unapproved`, while explicitly not claiming full route readiness. Therefore this branch does **not** weaken generic `route_ready` semantics yet.

Gate 3 evidence is saved at:

`ops/issue97-gates-2-3/evidence/gate3-route-ready-contract.md`

### Preflight / evidence

Saved current resolver and contract findings under:

`ops/issue97-gates-2-3/evidence/`

including the current resolver/function checkpoints and Gate 3 downstream-count analysis.

## Validation status

A branch-only static verification workflow was added:

`.github/workflows/issue97-gates2-3-static-verify.yml`

Latest run observed:

- run id: `33803088946`
- result: **FAILURE**

The failure has not yet been diagnosed/fixed. Do not treat this branch as PR-ready or merge-ready.

## Production state

- `main` was not changed by this work.
- No Supabase migration was applied.
- No production data was written.
- No public route was published.
- No cutover/release state changed.
- No GPS or pad coordinates changed.

## Resume point

1. Inspect GitHub Actions run `33803088946` logs and fix the static verification failure.
2. Recheck Gate 2 migration SQL for parser/patch-anchor correctness against the current resolver definition.
3. Run read-only impact SQL against the intended database environment before any install decision.
4. For Gate 3, decide whether the requirement should be expressed through the existing named/core destination contract rather than redefining generic `route_ready`. Do not weaken the full-route safety contract without explicit evidence and matching consumer changes.
