-- V18 driver RPC execution budget repair.
--
-- Direct anonymous REST probes proved that the existing reviewed status and
-- exact-route-choice functions reached their 2500 ms and 4 s function-local
-- statement timeouts while evaluating the existing release-current graph
-- predicate. This changes only their bounded execution budgets. It does not
-- alter either function body, route/graph/pad/direction data, Google output,
-- grants, or authority semantics.

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:v18:driver-rpc-execution-budget')
);

alter function public.brinesearch_v18_driver_pad_status(uuid)
  set statement_timeout='12s';

alter function public.brinesearch_v18_driver_route_choices(uuid)
  set statement_timeout='12s';

do $assert$
declare
  v_status pg_catalog.pg_proc%rowtype;
  v_choices pg_catalog.pg_proc%rowtype;
  v_status_definition text;
  v_choices_definition text;
begin
  select proc.* into strict v_status
  from pg_catalog.pg_proc proc
  where proc.oid='public.brinesearch_v18_driver_pad_status(uuid)'::pg_catalog.regprocedure;
  select proc.* into strict v_choices
  from pg_catalog.pg_proc proc
  where proc.oid='public.brinesearch_v18_driver_route_choices(uuid)'::pg_catalog.regprocedure;

  v_status_definition:=pg_catalog.regexp_replace(
    pg_catalog.lower(pg_catalog.pg_get_functiondef(v_status.oid)),'\s+','','g'
  );
  v_choices_definition:=pg_catalog.regexp_replace(
    pg_catalog.lower(pg_catalog.pg_get_functiondef(v_choices.oid)),'\s+','','g'
  );

  if not v_status.prosecdef or v_status.provolatile<>'s'
     or not (v_status.proconfig @> array[
       'search_path=""','statement_timeout=12s','lock_timeout=500ms'
     ])
     or not v_choices.prosecdef or v_choices.provolatile<>'s'
     or not (v_choices.proconfig @> array[
       'search_path=""','statement_timeout=12s','lock_timeout=500ms'
     ]) then
    raise exception 'V18 driver RPC execution hardening assertion failed';
  end if;

  if pg_catalog.strpos(v_status_definition,'brinesearch_driver_directions_public')=0
     or pg_catalog.strpos(v_status_definition,'brinesearch_v18_exact_route_projection')=0
     or pg_catalog.strpos(v_status_definition,'route_status=''route_ready''')=0
     or pg_catalog.strpos(v_choices_definition,'route_status<>''route_ready''')=0
     or pg_catalog.strpos(v_choices_definition,'stage<>''ready''')=0
     or pg_catalog.strpos(v_choices_definition,'brinesearch_issue97_graph_build_release_current')=0
     or pg_catalog.strpos(v_choices_definition,'brinesearch_v18_exact_route_projection')=0
     or pg_catalog.strpos(v_choices_definition,'gps_verified')=0 then
    raise exception 'V18 driver RPC authority definition assertion failed';
  end if;

  if pg_catalog.strpos(v_choices_definition,'written_directions')>0
     or pg_catalog.strpos(v_choices_definition,'owner_notes')>0
     or pg_catalog.strpos(v_choices_definition,'google_route')>0 then
    raise exception 'V18 driver route choice isolation assertion failed';
  end if;

  if pg_catalog.has_function_privilege(
       'public','public.brinesearch_v18_driver_pad_status(uuid)','execute'
     )
     or pg_catalog.has_function_privilege(
       'public','public.brinesearch_v18_driver_route_choices(uuid)','execute'
     )
     or not pg_catalog.has_function_privilege(
       'anon','public.brinesearch_v18_driver_pad_status(uuid)','execute'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated','public.brinesearch_v18_driver_pad_status(uuid)','execute'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.brinesearch_v18_driver_pad_status(uuid)','execute'
     )
     or not pg_catalog.has_function_privilege(
       'anon','public.brinesearch_v18_driver_route_choices(uuid)','execute'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated','public.brinesearch_v18_driver_route_choices(uuid)','execute'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.brinesearch_v18_driver_route_choices(uuid)','execute'
     ) then
    raise exception 'V18 driver RPC execute grant assertion failed';
  end if;
end
$assert$;

comment on function public.brinesearch_v18_driver_pad_status(uuid) is
  'V18 anonymous-safe driver status. Exact route/graph/Google authority remains fail-closed; reviewed public written directions are display fallback only. Twelve-second bounded execution budget covers cold exact graph-currentness checks.';

comment on function public.brinesearch_v18_driver_route_choices(uuid) is
  'Fail-closed V18 driver route variants. Returns only independently route-ready exact projections on active release-current graphs with a verified driver entrance; selection changes display only. Twelve-second bounded execution budget covers cold exact graph-currentness checks.';
