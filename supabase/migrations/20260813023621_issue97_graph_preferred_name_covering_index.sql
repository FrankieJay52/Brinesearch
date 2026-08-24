-- GitHub #97 — preferred-name covering index for keyset path (Belmont).
--
-- Live path already uses tmp_issue97_segment_name_keys + join on
-- (identity_id, source_segment_key). The existing partial index
-- INCLUDE(name_type, road_name, from_measure, to_measure, valid_from, valid_to)
-- still forces heap fetches for id and normalized_name, which the
-- DISTINCT ON preferred-name query requires.
--
-- This adds a second partial covering index that includes those columns.
-- Semantics unchanged: same keyset, same validity, same
-- official > signed > other, then id ordering.

create index if not exists
  brinesearch_authoritative_names_preferred_cover_issue97_idx
  on public.brinesearch_authoritative_road_names (identity_id, source_segment_key)
  include (name_type, road_name, normalized_name, id, valid_from, valid_to)
  where active and source_segment_key is not null;

comment on index public.brinesearch_authoritative_names_preferred_cover_issue97_idx is
  'Issue #97 performance-only covering index for segment preferred-name keyset lookup; includes id+normalized_name to avoid heap fetches. No mapping or topology semantics.';

analyze public.brinesearch_authoritative_road_names;
