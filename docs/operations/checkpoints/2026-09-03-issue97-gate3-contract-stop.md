# Issue #97 Gate 3 — fail-closed contract stop

Date: 2026-09-03

Repository base: `46a4710a33aa713843749038886aac55ab08e489`

Production writes: **0**

## Verdict

Do **not** patch generic `route_ready` to ignore a terminal private-access hold under the current contract.

The intended product concept already exists, but it is represented through the V18 named-approach/core-destination release contract rather than generic full-route `route_ready`.

## Why the single predicate change is insufficient

`private_verification.brinesearch_issue97_refresh_route_receipt(uuid)` does contain the expected identity blocker:

`v_held>0 or v_resolved<>v_occurrences`

But current `route_ready` subsequently requires all of the following against the total occurrence count:

- every occurrence identity resolved;
- every occurrence has a canonical road mapping;
- every occurrence has exact occurrence geometry;
- the private dark-Google currentness contract passes.

Current dark-Google currentness itself requires every occurrence receipt and every occurrence-geometry receipt to be resolved/current and expects the final exact geometry endpoint to reach the saved pad coordinate.

Therefore excluding one terminal hold from only `v_held` / `v_resolved` does not create a coherent route-ready receipt. Bypassing the later exact-geometry/currentness predicates would change the meaning of `route_ready` and its consumers.

## Downstream route-ready invariants

Current repository contracts repeatedly treat `route_ready` as an exact-full-route state. Examples include:

- V18 Driver directory/status contract;
- public saved-directions contract;
- public company-road overlay contract;
- Issue #97 Phase 1 release qualification/reporting.

These contracts require combinations equivalent to:

- `route_status='route_ready'`;
- `held_occurrence_count=0`;
- `resolved_occurrence_count=road_occurrence_count`;
- `canonical_mapping_count=road_occurrence_count`;
- `exact_geometry_count=road_occurrence_count`.

Changing generic route-ready semantics without changing those consumers would produce contradictory receipts. Changing all of those consumers would be broader than the requested two-predicate PR.

## Existing safe model: `google_to_saved_gps_unapproved`

The current named-approach release contract explicitly supports:

`google_to_saved_gps_unapproved`

with:

- exact approved ingress;
- exact approved public-road core geometry;
- exact approved handoff/core end;
- saved pad destination represented separately;
- no approved connector geometry from the public core to the saved destination;
- no prebuilt navigation link.

This mode is already active in current V18 contracts.

## BANJO is the concrete precedent

`20260827015800_issue97_banjo_oh519_named_core.sql` freezes BANJO with:

- source sequence `OH-9 → OH-519 → Lease Road`;
- 3 route occurrences;
- 2 resolved public-road occurrences;
- the terminal access occurrence unresolved;
- no full route transitions or occurrence-geometry receipts for the source route;
- base Driver route state still `held`;
- a separately reviewed exact OH-519 public core;
- `final_leg_mode='google_to_saved_gps_unapproved'`;
- evidence field `fullRouteReadinessClaimed=false`.

That migration explicitly calls its source snapshot `frozen_source_snapshot_not_full_route_readiness`.

This is direct current-repository evidence that an exact public core plus a saved destination is intentionally **not** equivalent to generic full-route `route_ready`.

## Safety conclusion

Gate 3 as originally phrased conflicts with the current route-ready contract.

The safe choices are:

1. leave generic `route_ready` semantics unchanged and continue using the named-approach/core-destination contract for exact public core + destination-only final movement; or
2. design a new explicit route state / release contract for public-core-ready semantics and update every consumer deliberately in a separate scoped change.

Neither option is the requested one-line Gate 3 predicate change.

Accordingly this branch will not weaken generic `route_ready`.

## Safety state

- authoritative GPS changes: 0
- authoritative direction changes: 0
- production database changes: 0
- private geometry inferred: 0
- provider geometry made canonical: 0
- routes published: 0
- navigation enabled: NO
