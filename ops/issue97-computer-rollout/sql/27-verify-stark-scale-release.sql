\set ON_ERROR_STOP on
\pset pager off
\timing on

\ir 19-verify-county-release.sql

begin read only;
set local statement_timeout='2min';

select pg_catalog.upper(:'issue97_state')='OH'
  and pg_catalog.upper(:'issue97_county')='STA' as scope_ok
\gset issue97_sta_
\if :issue97_sta_scope_ok
\else
  do $scope$
  begin
    raise exception 'Issue #97 Stark scale canary must run only for OH/STA';
  end
  $scope$;
\endif

do $gate$
declare
  v_build uuid;
  v_expected integer;
  v_shared integer;
  v_memberships integer;
begin
  select b.id,b.shared_segment_count,b.membership_count
    into strict v_build,v_shared,v_memberships
  from public.brinesearch_road_graph_builds b
  where b.state_code='OH' and b.county_code='STA'
    and b.status='validated' and b.activated_at is null
    and private_verification.brinesearch_issue97_graph_build_release_current(b.id)
  order by b.completed_at desc nulls last,b.started_at desc,b.id desc limit 1;

  select count(distinct secondary.source_record_id||':'||(secondary.attributes->>'PRIMARY_OVERLAP_ID'))::integer
  into v_expected
  from public.brinesearch_authoritative_road_segments secondary
  join public.brinesearch_authoritative_road_identities identity
    on identity.id=secondary.identity_id and identity.active
  where secondary.state_code='OH' and secondary.county_code='STA' and secondary.active
    and secondary.drivable_status in ('drivable','non_drivable')
    and secondary.public_access_status in ('public','private','access')
    and identity.drivable_status in ('drivable','non_drivable')
    and identity.public_access_status in ('public','private','access')
    and secondary.attributes->>'OVERLAP_INDICATOR'='S'
    and secondary.attributes->>'PRIMARY_IND'='N'
    and secondary.attributes->>'OVERLAP_INVERSE_IND' in ('N','Y')
    and nullif(secondary.attributes->>'PRIMARY_OVERLAP_ID','') is not null;

  if v_expected<>623 or v_shared<=0 or v_memberships<=0 then
    raise exception 'Issue #97 Stark scale canary failed: expected overlap pairs %, shared %, memberships %',
      v_expected,v_shared,v_memberships;
  end if;
end
$gate$;

commit;
\echo 'Issue #97 Stark scale canary PASS: 623 eligible ODOT overlap pairs survived a full release-current dark graph build.'
