\set ON_ERROR_STOP on
\pset pager off
\timing on

\ir 19-verify-county-release.sql

begin read only;
set local statement_timeout='2min';

do $gate$
declare
  v_build uuid;
  v_us40 uuid;
  v_i70 uuid;
  v_expected integer;
  v_observed integer;
  v_offset_pair integer;
begin
  if pg_catalog.upper(:'issue97_state')<>'OH' or pg_catalog.upper(:'issue97_county')<>'BEL' then
    raise exception 'Issue #97 Belmont concurrency canary must run only for OH/BEL';
  end if;
  select b.id into strict v_build
  from public.brinesearch_road_graph_builds b
  where b.state_code='OH' and b.county_code='BEL'
    and b.status='validated' and b.activated_at is null
    and private_verification.brinesearch_issue97_graph_build_release_current(b.id)
  order by b.completed_at desc nulls last,b.started_at desc,b.id desc limit 1;

  select id into strict v_us40
  from public.brinesearch_authoritative_road_identities
  where active and state_code='OH' and county_code='BEL'
    and source_identity_key='OH:ODOT:NLF:SBELUS00040**C';
  select id into strict v_i70
  from public.brinesearch_authoritative_road_identities
  where active and state_code='OH' and county_code='BEL'
    and source_identity_key='OH:ODOT:NLF:SBELIR00070**C';

  select count(*)::integer into v_expected
  from public.brinesearch_authoritative_road_segments secondary
  join public.brinesearch_authoritative_road_segments primary_seg
    on primary_seg.state_code='OH' and primary_seg.county_code='BEL' and primary_seg.active
   and primary_seg.source_segment_key='OH:ODOT:SEGMENT:'||(secondary.attributes->>'PRIMARY_OVERLAP_ID')
  where secondary.state_code='OH' and secondary.county_code='BEL' and secondary.active
    and secondary.identity_id=v_us40 and primary_seg.identity_id=v_i70
    and secondary.attributes->>'OVERLAP_INDICATOR'='S'
    and secondary.attributes->>'PRIMARY_IND'='N';

  with observed as (
    select distinct pair.value->>'secondary_source_record_id' as secondary_source_record_id,
      pair.value->>'primary_source_record_id' as primary_source_record_id
    from public.brinesearch_road_junctions j
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(j.source_provenance->'odot_authoritative_overlap_pairs','[]'::jsonb)
    ) pair(value)
    where j.build_id=v_build and j.junction_type='shared_segment'
      and j.verification_status='verified'
      and pair.value->>'secondary_identity_id'=v_us40::text
      and pair.value->>'primary_identity_id'=v_i70::text
      and pair.value->>'topology_geometry_source'='odot_primary_overlap'
      and pair.value->>'persistent_secondary_geometry_unchanged'='true'
  ) select count(*)::integer,
      count(*) filter(where secondary_source_record_id='2025_000000000270433'
        and primary_source_record_id='2025_000000000269543')::integer
    into v_observed,v_offset_pair from observed;

  if v_expected<>10 or v_observed<>10 or v_offset_pair<>1 then
    raise exception 'Issue #97 Belmont US-40/I-70 concurrency canary failed: expected %, observed %, offset fixture %',
      v_expected,v_observed,v_offset_pair;
  end if;
end
$gate$;

commit;
\echo 'Issue #97 Belmont concurrency canary PASS: all 10 US-40/I-70 source overlap pairs, including the offset pair, are verified shared pavement.'
