-- GitHub #97 — keep exact OGRIP endpoint corroboration index-driven.
--
-- The independently corroborated ODOT source-vertex rule joins candidate points
-- to current Ohio OGRIP LBRS start/end points at an exact 0.03 m tolerance.
-- Direct ST_StartPoint/ST_EndPoint geography expressions otherwise force a very
-- large point/centerline comparison on counties such as Stark. These partial
-- expression indexes change no topology predicate, coordinate, tolerance,
-- mapping, graph row, activation state, route data or global cutover state.

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);

create index if not exists brinesearch_supp_centerline_oh_active_start_geog_issue97_idx
on public.brinesearch_authoritative_supplemental_centerlines
using gist((
  extensions.st_startpoint(extensions.st_linemerge(geom))::extensions.geography
))
where active and state_code='OH';

create index if not exists brinesearch_supp_centerline_oh_active_end_geog_issue97_idx
on public.brinesearch_authoritative_supplemental_centerlines
using gist((
  extensions.st_endpoint(extensions.st_linemerge(geom))::extensions.geography
))
where active and state_code='OH';

analyze public.brinesearch_authoritative_supplemental_centerlines;

do $issue97_verify_ogrip_endpoint_indexes$
declare
  v_start text;
  v_end text;
begin
  select pg_catalog.pg_get_indexdef(
    'public.brinesearch_supp_centerline_oh_active_start_geog_issue97_idx'::pg_catalog.regclass
  ) into strict v_start;
  select pg_catalog.pg_get_indexdef(
    'public.brinesearch_supp_centerline_oh_active_end_geog_issue97_idx'::pg_catalog.regclass
  ) into strict v_end;

  if v_start not like '%USING gist ((extensions.st_startpoint(extensions.st_linemerge(geom))::extensions.geography))%'
     or v_start not like '%WHERE (active AND (state_code = ''OH''::text))%'
     or v_end not like '%USING gist ((extensions.st_endpoint(extensions.st_linemerge(geom))::extensions.geography))%'
     or v_end not like '%WHERE (active AND (state_code = ''OH''::text))%' then
    raise exception 'Issue #97 OGRIP endpoint geography indexes do not match the exact corroboration expressions';
  end if;
end
$issue97_verify_ogrip_endpoint_indexes$;
