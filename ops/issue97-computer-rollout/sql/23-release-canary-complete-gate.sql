\set ON_ERROR_STOP on
\pset pager off

begin read only;
set local statement_timeout='2min';

with canaries(state_code,county_code) as (values ('OH','NOB'),('PA','WAS')),
checks as (
  select c.state_code,c.county_code,
    count(*) filter(where b.status in ('active','validated')
      and private_verification.brinesearch_issue97_graph_build_release_current(b.id))::integer as release_current_builds
  from canaries c
  left join public.brinesearch_road_graph_builds b
    on b.state_code=c.state_code and b.county_code=c.county_code
  group by c.state_code,c.county_code
)
select not public.brinesearch_issue97_cutover_active()
  and not exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
  and not exists(select 1 from checks where release_current_builds<>1)
  as canaries_complete
\gset issue97_

\if :issue97_canaries_complete
\else
  \echo 'NOB and PA/WAS must each have exactly one release-current active/validated canary before the remaining batch'
  do $issue97_canary_gate_failed$ begin
    raise exception 'Issue #97 release canary completion gate failed';
  end $issue97_canary_gate_failed$;
\endif

commit;
