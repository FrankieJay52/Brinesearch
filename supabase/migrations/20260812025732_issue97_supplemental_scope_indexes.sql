-- GitHub #97 — supplemental source-scope verification indexes.
--
-- Large Ohio OGRIP counties finish with service-only mapped/held/ambiguous
-- accounting. Those checks were scanning the disposition table because only the
-- centerline primary key existed. Add exact scope/run/status indexes used by the
-- finalizer and verified-only name materializer. No matching semantics change.

create index if not exists brinesearch_supp_disposition_scope_run_issue97_idx
  on public.brinesearch_supplemental_centerline_dispositions(
    dataset_id,state_code,county_code,ingest_run_id,active,disposition
  );

create index if not exists brinesearch_supp_mapping_scope_status_issue97_idx
  on public.brinesearch_supplemental_centerline_identity_mappings(
    dataset_id,state_code,county_code,active,mapping_status,centerline_id
  );

comment on index public.brinesearch_supp_disposition_scope_run_issue97_idx is
  'Issue #97 restartable supplemental source finalization: indexed mapped/held/ambiguous accounting by exact dataset/state/county/run.';
comment on index public.brinesearch_supp_mapping_scope_status_issue97_idx is
  'Issue #97 supplemental exact-mapping lookup: indexed verified/held identity rows by exact source scope; no name or nearest-road matching.';
