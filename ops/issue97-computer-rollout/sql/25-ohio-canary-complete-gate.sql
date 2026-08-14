\set ON_ERROR_STOP on
\pset pager off
begin read only;
set local statement_timeout='2min';

do $gate$
declare
  v_nob integer;
begin
  if public.brinesearch_issue97_cutover_active() then
    raise exception 'Issue #97 Ohio post-canary gate requires cutover OFF';
  end if;
  if exists(select 1 from public.brinesearch_road_graph_builds where status='staging') then
    raise exception 'Issue #97 Ohio post-canary gate refuses staging graph';
  end if;
  select count(*)::integer into v_nob
  from public.brinesearch_road_graph_builds b
  where b.state_code='OH' and b.county_code='NOB'
    and b.status='validated' and b.activated_at is null
    and private_verification.brinesearch_issue97_graph_build_release_current(b.id);
  if v_nob<>1 then
    raise exception 'Issue #97 Ohio batch requires exactly one validated inactive release-current OH/NOB canary; found %',v_nob;
  end if;
end
$gate$;
commit;
