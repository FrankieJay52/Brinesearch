# Issue #97 — PA/WAS builder performance checkpoint

## State

This checkpoint is **repository-only**. Do not apply the migration or rerun the
35-county dark batch until the exact checkpoint is independently reviewed and
the rollout preflight/static audits are updated for the resulting builder MD5.

Production was left unchanged:

- PA/WAS graph builds: 0
- staging graph builds: 0
- active graph-builder sessions: 0
- global cutover: OFF
- WV/OHI remains active/current
- OH/BEL, OH/JEF and OH/NOB remain active/current and frozen
- current builder MD5 before this migration: `c5d54a4d839df79eff99f4dfd4b0b780`

## Confirmed root cause

The PA/WAS build reached the former 15-minute **whole-function** timeout. The
membership-digest statement was where the timer expired, not proof that the
digest itself consumed 15 minutes.

Bounded rollback/read-only production probes showed:

| Phase | PA/WAS evidence |
| --- | --- |
| target source materialization | 15,884 segments; about 1.4 s |
| adjacent boundary source selection | 147 segments; about 14.6 s |
| vertex materialization | about 159,195 vertices; about 5.3 s |
| shared-segment pair intersection | 19,110 intersecting pairs / 345 positive overlap pieces; about 1.3 s |
| membership digest control | largest existing graph, 10,844 memberships; about 1.4 s |
| PennDOT at-grade phase without a matching temp geography index | exceeded the bounded 30 s probe |
| same at-grade phase with only temp geography GiST + ANALYZE | 6,277 scoped nodes, 10,617 eligible rows, 946 qualified nodes; about 2.5 s |

The builder created a geometry GiST index on `tmp_issue97_segments`, but its
PennDOT at-grade and later point-membership joins use exact
`ST_DWithin(geography, geography, ...)`. Without a matching expression index,
PostgreSQL could not use an index for those joins.

## Proposed forward-only change

Migration:

`20260814074500_issue97_graph_builder_temp_geography_index.sql`

The migration performs an exact, MD5-pinned replacement in the current builder:

```sql
create index tmp_issue97_segments_geog_idx
  on tmp_issue97_segments using gist((geom::extensions.geography));
analyze tmp_issue97_segments;
```

No topology predicate, tolerance, source rule, identity rule, graph digest input,
hold rule, activation state, cutover state or route data changes.

Expected builder MD5 after application:

`06c4b57ff9056b96137b9aaf4f4b856d`

## Required completion before production application

1. Update both exact builder-MD5 gates in
   `ops/issue97-computer-rollout/sql/00-preflight.sql`.
2. Extend preflight to require exactly the temp geography index and
   `ANALYZE tmp_issue97_segments`.
3. Update the static computer-rollout audit to require the new MD5/index/analyze
   contract.
4. Run the complete project build/security/browser/preview checks.
5. Have Grok audit the exact completed checkpoint read-only.
6. ChatGPT independently reconcile that audit against current GitHub and current
   production.
7. Apply the migration only through the controlled production migration path.
8. Recheck builder MD5, graph/release state and production health.
9. Rerun the single serial `build-pending-dark` command from the PC/direct
   `PGSERVICE` lane. Do not retry automatically after any error.

## Safety

The migration advisory-locks every active county graph lane, validates the exact
old function MD5 and exact replacement anchor, preserves owner/ACL/security
metadata, and verifies that graph rows, graph counts, build state and global
cutover remain unchanged.
