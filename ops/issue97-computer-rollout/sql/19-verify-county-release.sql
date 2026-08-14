\set ON_ERROR_STOP on
\pset pager off
\timing on

-- Historical predecessor consumed by 20260814163050; not an executable gate:
-- release_builder_md5'='7abd11f432c3e7b475b10d0817f5e8fc
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
  and pg_catalog.bool_and(details->>'release_builder_md5'='793ed8985252b00d52f46da497484029')
  and pg_catalog.bool_and(details->>'release_supplemental_mapper_md5'='4dd8a572b153d795163cf38a41ea9d1f')
  and pg_catalog.bool_and(coalesce(details->>'release_source_content_digest','')~'^[0-9a-f]{32}$')
  as release_pass
from latest
\gset issue97_release_verify_
\if :issue97_release_verify_release_pass
\else
  do $fail$ begin raise exception 'Issue #97 validated graph lacks the approved release-generation receipt'; end $fail$;
\endif

-- Ohio shared/concurrent-pavement completeness is a source relationship gate,
-- not a sample fixture. Every eligible current ODOT secondary-overlap segment in
-- the county must appear in the just-built graph as a VERIFIED shared section
-- carrying the exact PRIMARY_OVERLAP_ID pair in immutable junction provenance.
-- This covers all route-number combinations/aliases in every Ohio county, not
-- only pinned examples such as US-40/I-70.
with latest as (
  select b.id
  from public.brinesearch_road_graph_builds b
  where b.state_code=pg_catalog.upper(:'issue97_state')
    and b.county_code=pg_catalog.upper(:'issue97_county')
    and b.status='validated' and b.activated_at is null
  order by b.completed_at desc nulls last,b.started_at desc,b.id desc limit 1
), expected as (
  select distinct
    secondary.source_record_id as secondary_source_record_id,
    secondary.attributes->>'PRIMARY_OVERLAP_ID' as primary_source_record_id
  from public.brinesearch_authoritative_road_segments secondary
  join public.brinesearch_authoritative_road_identities identity
    on identity.id=secondary.identity_id and identity.active
  where pg_catalog.upper(:'issue97_state')='OH'
    and secondary.state_code='OH'
    and secondary.county_code=pg_catalog.upper(:'issue97_county')
    and secondary.active
    and secondary.drivable_status in ('drivable','non_drivable')
    and secondary.public_access_status in ('public','private','access')
    and identity.drivable_status in ('drivable','non_drivable')
    and identity.public_access_status in ('public','private','access')
    and secondary.attributes->>'OVERLAP_INDICATOR'='S'
    and secondary.attributes->>'PRIMARY_IND'='N'
    and secondary.attributes->>'OVERLAP_INVERSE_IND' in ('N','Y')
    and nullif(secondary.attributes->>'PRIMARY_OVERLAP_ID','') is not null
), observed as (
  select distinct
    pair.value->>'secondary_source_record_id' as secondary_source_record_id,
    pair.value->>'primary_source_record_id' as primary_source_record_id
  from latest
  join public.brinesearch_road_junctions junction on junction.build_id=latest.id
  cross join lateral pg_catalog.jsonb_array_elements(
    coalesce(junction.source_provenance->'odot_authoritative_overlap_pairs','[]'::jsonb)
  ) pair(value)
  where junction.junction_type='shared_segment'
    and junction.verification_status='verified'
    and pair.value->>'topology_geometry_source'='odot_primary_overlap'
    and pair.value->>'persistent_secondary_geometry_unchanged'='true'
), missing as (
  select * from expected except select * from observed
), extra as (
  select * from observed except select * from expected
)
select case when pg_catalog.upper(:'issue97_state')<>'OH' then true
  else not exists(select 1 from missing) and not exists(select 1 from extra)
end as odot_overlap_pass,
case when pg_catalog.upper(:'issue97_state')<>'OH' then 0
  else (select count(*) from expected)
end as odot_overlap_expected,
case when pg_catalog.upper(:'issue97_state')<>'OH' then 0
  else (select count(*) from observed)
end as odot_overlap_observed
\gset issue97_release_overlap_
\if :issue97_release_overlap_odot_overlap_pass
\else
  do $fail$ begin
    raise exception 'Issue #97 Ohio graph does not exactly represent every eligible authoritative ODOT secondary-to-primary shared-pavement pair';
  end $fail$;
\endif
\echo 'Issue #97 authoritative ODOT shared-pavement pairs: expected=' :issue97_release_overlap_odot_overlap_expected ' observed=' :issue97_release_overlap_odot_overlap_observed

commit;
