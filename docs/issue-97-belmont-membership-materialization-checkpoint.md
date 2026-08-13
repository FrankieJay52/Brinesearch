# Issue #97 — Belmont point-membership materialization checkpoint

Current PR #98 head at this checkpoint: `d3879fa853333ef1c0bfe910cc2a239b451bf290`.

## Work completed

- Rejected the earlier unsafe `name_type='primary'` materialization proposal.
- Preserved the live point-membership name contract: exact source-segment preference; official > signed > local > 911 > other precedence; active valid_from/valid_to windows; unscoped measure containment; full distinct aliases.
- Kept shared-section and name-change membership paths unchanged.
- Added `20260812045700_issue97_graph_point_membership_name_materialization.sql` and its regression audit.
- Wired `verify:graph-point-membership-name-materialization` into the build.
- Applied the production-dark migration successfully after correcting the dynamic-function patch syntax/anchors.

## Belmont retry result

`public.brinesearch_issue97_rebuild_county_graph('OH','BEL')` still fails closed on statement timeout.

The earlier correlated point-membership name laterals are no longer the failing statement. The new bottleneck is now the set-based temp-table build itself:

`create temporary table tmp_issue97_point_membership_names on commit drop as ...`

The expensive join retains the exact semantics but still presents the planner with a combined exact-segment OR unscoped-measure predicate over `brinesearch_authoritative_road_names`.

No new Belmont graph build persisted; the failed build transaction rolled back. Do not proceed to Jefferson.

## Next investigation

Profile/split the point-name materialization into index-friendly exact-segment and unscoped-name branches (for example UNION ALL before ranking/aggregation), without changing validity, measure, precedence, alias, mapping, topology, or no-guess semantics.

Cutover remains OFF. PR #98 remains Draft/unmerged.
