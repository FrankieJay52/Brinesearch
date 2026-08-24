-- GitHub #97 — source finalization performance indexes.
--
-- Production source refresh for PA local roads timed out while the finalizer
-- aggregated active source rows one identity at a time under the 2 minute
-- statement timeout. These partial indexes match the exact existing
-- dataset/state/county/identity predicates used by source finalization.
-- They change no source, identity, topology, or route-resolution semantics.

create index if not exists brinesearch_external_segments_scope_identity_active_issue97_idx
  on public.brinesearch_authoritative_external_road_segments
    (dataset_id,state_code,county_code,identity_id)
  where active;

create index if not exists brinesearch_source_geometry_holds_scope_identity_active_issue97_idx
  on private_verification.brinesearch_issue97_source_geometry_holds
    (dataset_id,state_code,county_code,identity_id)
  where active;

comment on index public.brinesearch_external_segments_scope_identity_active_issue97_idx is
  'Issue #97 performance-only index for exact source-finalization scope+identity aggregation; no mapping semantics.';
comment on index private_verification.brinesearch_source_geometry_holds_scope_identity_active_issue97_idx is
  'Issue #97 performance-only index for exact source-finalization geometry-hold scope+identity aggregation; no mapping semantics.';
