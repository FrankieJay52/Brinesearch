\set ON_ERROR_STOP on
\pset pager off
begin read only;
set local statement_timeout='2min';

do $gate$
declare
  v_oh_count integer;
  v_scope_count integer;
begin
  if public.brinesearch_issue97_cutover_active() then
    raise exception 'Issue #97 Ohio dark plan blocked by cutover';
  end if;
  if exists(select 1 from public.brinesearch_road_graph_builds where status='staging') then
    raise exception 'Issue #97 Ohio dark plan blocked by staging graph';
  end if;
  select count(*)::integer into v_oh_count
  from public.brinesearch_road_graph_counties
  where active and state_code='OH';
  if v_oh_count<>19 then
    raise exception 'Issue #97 Ohio dark plan expected 19 registered Ohio counties, found %',v_oh_count;
  end if;
  select count(*)::integer into v_scope_count
  from public.brinesearch_road_source_dataset_counties scope
  join public.brinesearch_road_source_datasets dataset on dataset.id=scope.dataset_id
  where scope.active and scope.ingest_enabled and scope.required_for_graph and dataset.active
    and scope.state_code='OH';
  if v_scope_count<>38 then
    raise exception 'Issue #97 Ohio dark plan expected 38 required Ohio scopes, found %',v_scope_count;
  end if;
  if exists(
    select 1
    from public.brinesearch_road_source_dataset_counties scope
    join public.brinesearch_road_source_datasets dataset on dataset.id=scope.dataset_id
    where scope.active and scope.ingest_enabled and scope.required_for_graph and dataset.active
      and scope.state_code='OH'
      and not private_verification.brinesearch_issue97_dataset_scope_current(
        scope.dataset_id,scope.state_code,scope.county_code
      )
  ) then
    raise exception 'Issue #97 Ohio dark plan blocked by stale required Ohio source scope';
  end if;
end
$gate$;

select c.state_code,c.county_code
from public.brinesearch_road_graph_counties c
where c.active and c.state_code='OH'
  and not exists(
    select 1
    from public.brinesearch_road_graph_builds b
    where b.state_code=c.state_code and b.county_code=c.county_code
      and b.status in ('active','validated')
      and private_verification.brinesearch_issue97_graph_build_release_current(b.id)
  )
order by case when c.county_code='NOB' then 0 else 1 end,c.county_code;
commit;
