\set ON_ERROR_STOP on
\pset pager off
\timing on

\ir 15-verify-county-light.sql

begin read only;
set local statement_timeout='2min';
with latest as (
  select b.* from public.brinesearch_road_graph_builds b
  where b.state_code=pg_catalog.upper(:'issue97_state')
    and b.county_code=pg_catalog.upper(:'issue97_county')
    and b.status='validated' and b.activated_at is null
  order by b.completed_at desc nulls last,b.started_at desc,b.id desc limit 1
)
select count(*)=1
  and pg_catalog.bool_and(private_verification.brinesearch_issue97_graph_build_release_current(id))
  and pg_catalog.bool_and(details->>'release_generation_key'='issue97-release-20260814-r1')
  and pg_catalog.bool_and(details->>'release_builder_md5'='7abd11f432c3e7b475b10d0817f5e8fc')
  and pg_catalog.bool_and(details->>'release_supplemental_mapper_md5'='4dd8a572b153d795163cf38a41ea9d1f')
  and pg_catalog.bool_and(coalesce(details->>'release_source_content_digest','')~'^[0-9a-f]{32}$')
  as release_pass
from latest
\gset issue97_release_verify_
\if :issue97_release_verify_release_pass
\else
  do $fail$ begin raise exception 'Issue #97 validated graph lacks the approved release-generation receipt'; end $fail$;
\endif
commit;
