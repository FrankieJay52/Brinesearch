\set ON_ERROR_STOP on
\pset pager off
begin read only;
set local statement_timeout='2min';

do $gate$ begin
  if public.brinesearch_issue97_cutover_active() then raise exception 'Issue #97 release dark plan blocked by cutover'; end if;
  if exists(select 1 from public.brinesearch_road_graph_builds where status='staging') then raise exception 'Issue #97 release dark plan blocked by staging graph'; end if;
end $gate$;

select c.state_code,c.county_code
from public.brinesearch_road_graph_counties c
where c.active
  and not exists(select 1 from public.brinesearch_road_graph_builds b
    where b.state_code=c.state_code and b.county_code=c.county_code
      and b.status in ('active','validated')
      and private_verification.brinesearch_issue97_graph_build_release_current(b.id))
order by
  case
    when c.state_code='OH' and c.county_code='NOB' then 0
    when c.state_code='PA' and c.county_code='WAS' then 1
    when c.state_code='PA' then 2
    when c.state_code='WV' then 3
    when c.state_code='OH' then 4
    else 5
  end,c.county_code;
commit;
