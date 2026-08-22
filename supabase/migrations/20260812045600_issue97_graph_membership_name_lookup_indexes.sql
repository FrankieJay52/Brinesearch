-- GitHub #97 — graph membership authoritative-name lookup indexes.
--
-- Belmont dark rebuild reaches point-junction membership insertion and times out
-- while repeatedly resolving the exact segment/measure-scoped primary name and
-- alias set for each membership. Existing indexes start with identity_id but do
-- not provide a selective/covering path for source_segment_key plus the existing
-- measure/validity predicates.
--
-- This patch is deliberately semantics-neutral. It changes no function body,
-- name precedence, measure-window rule, mapping requirement, topology rule, or
-- no-guess behavior. It only adds index paths for the exact queries already used
-- by brinesearch_issue97_rebuild_county_graph(text,text).

create index if not exists
  brinesearch_authoritative_names_identity_segment_active_issue97_idx
  on public.brinesearch_authoritative_road_names (identity_id, source_segment_key)
  include (name_type, road_name, from_measure, to_measure, valid_from, valid_to)
  where active;

create index if not exists
  brinesearch_authoritative_names_identity_unscoped_measure_issue97_idx
  on public.brinesearch_authoritative_road_names (identity_id, from_measure, to_measure)
  include (name_type, road_name, valid_from, valid_to)
  where active and source_segment_key is null;

comment on index public.brinesearch_authoritative_names_identity_segment_active_issue97_idx is
  'Issue #97 performance-only covering path for exact segment-scoped graph membership names and aliases.';

comment on index public.brinesearch_authoritative_names_identity_unscoped_measure_issue97_idx is
  'Issue #97 performance-only covering path for exact unscoped measure-window graph membership names and aliases.';
