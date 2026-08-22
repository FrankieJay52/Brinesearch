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
  v_start_expr text;
  v_start_pred text;
  v_start_method text;
  v_start_table oid;
  v_start_valid boolean;
  v_start_ready boolean;
  v_end_expr text;
  v_end_pred text;
  v_end_method text;
  v_end_table oid;
  v_end_valid boolean;
  v_end_ready boolean;
begin
  select pg_catalog.pg_get_expr(i.indexprs,i.indrelid),
         pg_catalog.pg_get_expr(i.indpred,i.indrelid),
         am.amname,
         i.indrelid,
         i.indisvalid,
         i.indisready
  into strict v_start_expr,v_start_pred,v_start_method,v_start_table,
       v_start_valid,v_start_ready
  from pg_catalog.pg_index i
  join pg_catalog.pg_class idx on idx.oid=i.indexrelid
  join pg_catalog.pg_am am on am.oid=idx.relam
  where idx.oid='public.brinesearch_supp_centerline_oh_active_start_geog_issue97_idx'
    ::pg_catalog.regclass;

  select pg_catalog.pg_get_expr(i.indexprs,i.indrelid),
         pg_catalog.pg_get_expr(i.indpred,i.indrelid),
         am.amname,
         i.indrelid,
         i.indisvalid,
         i.indisready
  into strict v_end_expr,v_end_pred,v_end_method,v_end_table,
       v_end_valid,v_end_ready
  from pg_catalog.pg_index i
  join pg_catalog.pg_class idx on idx.oid=i.indexrelid
  join pg_catalog.pg_am am on am.oid=idx.relam
  where idx.oid='public.brinesearch_supp_centerline_oh_active_end_geog_issue97_idx'
    ::pg_catalog.regclass;

  if v_start_method<>'gist'
     or v_start_table<>'public.brinesearch_authoritative_supplemental_centerlines'::pg_catalog.regclass
     or v_start_expr<>'(st_startpoint(st_linemerge(geom)))::geography'
     or v_start_pred<>'(active AND (state_code = ''OH''::text))'
     or not v_start_valid
     or not v_start_ready
     or v_end_method<>'gist'
     or v_end_table<>'public.brinesearch_authoritative_supplemental_centerlines'::pg_catalog.regclass
     or v_end_expr<>'(st_endpoint(st_linemerge(geom)))::geography'
     or v_end_pred<>'(active AND (state_code = ''OH''::text))'
     or not v_end_valid
     or not v_end_ready then
    raise exception 'Issue #97 OGRIP endpoint geography indexes do not match the exact corroboration expressions';
  end if;
end
$issue97_verify_ogrip_endpoint_indexes$;
