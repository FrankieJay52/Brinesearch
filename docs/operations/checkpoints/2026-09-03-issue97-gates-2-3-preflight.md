# Issue #97 Gates 2 + 3 preflight

Date: 2026-09-03

Repository: `FrankieJay52/Brinesearch`

Starting `main`: `46a4710a33aa713843749038886aac55ab08e489`

Supabase production project named by the task: `wvxzqtoiwhrgovzddtvz`

Production mutation: **0**

## Scope

Only the following changes are in scope for the eventual PR:

1. Gate 2 — state + county narrowing before unresolved occurrence uniqueness, with uniqueness judged at physical-road level.
2. Gate 3 — prevent a structurally terminal private-access destination hold from blocking an otherwise identity-resolved public approach, without claiming private geometry or navigation authority.

Parser work, provider verification, waypoint generation, UI, coordinate promotion, publishing, navigation release, and production writes remain out of scope.

## Current resolver checkpoints

Current-main migrations and Issue #97 rollout guards establish the reviewed function checkpoints as:

- `private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)` md5: `0f139df2a01f68722958ff10f1dd6f49`
- `private_verification.brinesearch_issue97_refresh_route_receipt(uuid)` md5: `8283a543bf42f939296d32e5e5a92b4f`

The migration must fail closed if the installed isolated test database does not begin from these reviewed function bodies (or a separately explained newer equivalent).

## Gate 2 confirmed current behavior

The occurrence-candidate resolver still has one ordinary resolution door: an explicit authoritative source receipt with exactly one strong candidate.

The remaining flow is still:

- no candidates -> held;
- more than 50 candidates -> held as too broad;
- otherwise -> `requires_unique_authoritative_route_graph_path`.

Candidate collection is state-scoped for name/designation lookups and dataset-currentness scoped, but the final unresolved uniqueness decision does not scope the candidate set to the pad's county.

The candidate table already stores verified `canonical_road_id` mappings where present. A safe Gate 2 implementation therefore must not collapse identities by normalized name alone. The current design direction is stricter:

- state + county must resolve to exactly one active graph county;
- county-scoped candidate identities must not include an unmapped/ambiguous physical identity if the occurrence is to resolve;
- physical-road equivalence should be established by existing verified canonical road mappings or another existing authoritative equivalence relationship;
- all collapsed identity members must be retained in append-only evidence;
- selecting a representative identity for a multi-identity physical road must itself be justified rather than lexically/arbitrarily chosen.

The final point is still under review because downstream transition and geometry receipts are identity-specific.

## Gate 3 confirmed current behavior

The current route receipt contains the expected blocker:

`v_held>0 or v_resolved<>v_occurrences`

However, preflight found that this is **not the only total-occurrence assumption** in the current route-ready contract. The same function subsequently requires:

- `v_canonical = v_occurrences`;
- `v_geometry = v_occurrences`;
- `brinesearch_issue97_transition_google_dark_current(pad_id) = true`.

The private dark Google currentness dependency itself currently requires every occurrence receipt to be resolved and every occurrence geometry receipt to be resolved/current. It also requires the final exact geometry endpoint to reach the saved pad coordinate.

Therefore changing only the first held-count predicate would not safely make a terminal-private route `route_ready`; later predicates would still block it, and bypassing all of them without a separate contract would weaken the meaning of `route_ready`.

## Existing final-leg contract

Current main does contain the V18 named-approach final-leg mode:

`google_to_saved_gps_unapproved`

The named-approach release contract explicitly supports a saved-pad destination separated from an exact approved handoff/core endpoint. Existing V18 code describes this mode as directed named roads to a reviewed handoff followed by an unnamed/destination-only final movement.

This mode does **not** prove the private final movement and does not authorize canonical private geometry.

The next Gate 3 design step is therefore to determine whether the generic Issue #97 route receipt can safely express a public-core-ready state without contradicting the existing `route_ready` consumers, or whether the named-approach/core-destination contract is the only safe location for that semantics. If the latter is true, Gate 3 as originally phrased is blocked by current contract rather than being patched unsafely.

## Downstream contracts requiring attention before Gate 3

Current repository searches show `route_ready` is consumed by contracts that assume all route occurrences have exact geometry, including the Phase 1 release gate and V18 route/status projection checks. At minimum, no Gate 3 implementation may make these old invariants silently false.

## Baseline execution

`ops/issue97-gates-2-3/sql/00-baseline-and-function-contract-readonly.sql` has been added to capture:

- pad/GPS counts;
- occurrence resolved/held counts;
- hold-reason distribution;
- private-segment count;
- null county and Washington County state-scope checks;
- verified road mapping count;
- exact function metadata and definitions;
- requested Gate 2 candidate-pressure cases.

No baseline values are being claimed as remeasured until this SELECT-only script is executed against the intended baseline database.

## Safety state

- authoritative GPS changes: 0
- authoritative directions changes: 0
- production database changes: 0
- routes published: 0
- coordinates promoted: 0
- provider geometry made canonical: 0
- private geometry inferred: 0
- navigation enabled: NO
- merge: NO
- deploy: NO
