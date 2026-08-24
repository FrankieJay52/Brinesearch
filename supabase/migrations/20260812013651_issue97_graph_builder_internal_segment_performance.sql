-- GitHub #97 — authoritative graph-builder source-segment performance hardening.
--
-- Harrison County production rebuild timed out while discovering true boundary
-- neighbors through public.brinesearch_authoritative_road_segments. That public
-- view is intentionally security_barrier=true for browser/editor safety, so the
-- non-leakproof PostGIS ST_DWithin predicate cannot be pushed down to the indexed
-- OH/WV/PA source tables. The graph builder is service-only SECURITY DEFINER work;
-- give it a private, no-grant copy of the exact same normalized SELECT definition
-- without the security barrier, plus geography GiST indexes that match its 1 m
-- ST_DWithin boundary predicate. Public/browser reads remain on the barrier view.

create index if not exists brinesearch_odot_catalog_geog_issue97_idx
on public.brinesearch_odot_road_catalog
using gist ((geom::extensions.geography))
where geom is not null and source_active;

create index if not exists brinesearch_external_segments_geog_issue97_idx
on public.brinesearch_authoritative_external_road_segments
using gist ((geom::extensions.geography))
where geom is not null and active;

do $issue97_internal_view$
declare
  v_select text;
begin
  v_select:=pg_catalog.pg_get_viewdef('public.brinesearch_authoritative_road_segments'::pg_catalog.regclass,true);
  if nullif(pg_catalog.btrim(v_select),'') is null
     or pg_catalog.strpos(v_select,'brinesearch_odot_road_catalog')=0
     or pg_catalog.strpos(v_select,'brinesearch_authoritative_external_road_segments')=0 then
    raise exception 'Unable to derive the audited authoritative segment SELECT for the private builder view';
  end if;
  execute 'create or replace view private_verification.brinesearch_issue97_authoritative_road_segments_internal as '||v_select;
end
$issue97_internal_view$;

revoke all on private_verification.brinesearch_issue97_authoritative_road_segments_internal
from public,anon,authenticated,service_role;

do $issue97_patch_builder$
declare
  v_definition text;
  v_old_count integer;
  v_new_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;
  v_old_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(
    v_definition,'public.brinesearch_authoritative_road_segments',''
  )))/pg_catalog.length('public.brinesearch_authoritative_road_segments');
  if coalesce(v_old_count,0)<2 then
    raise exception 'Issue #97 graph builder no longer contains the expected normalized segment-view references';
  end if;
  v_definition:=pg_catalog.replace(
    v_definition,
    'public.brinesearch_authoritative_road_segments',
    'private_verification.brinesearch_issue97_authoritative_road_segments_internal'
  );
  execute v_definition;
  select (pg_catalog.length(pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ))-pg_catalog.length(pg_catalog.replace(pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ),'private_verification.brinesearch_issue97_authoritative_road_segments_internal','')))
    /pg_catalog.length('private_verification.brinesearch_issue97_authoritative_road_segments_internal')
  into v_new_count;
  if v_new_count<>v_old_count then
    raise exception 'Issue #97 graph builder internal segment-view rewrite count mismatch: % vs %',v_new_count,v_old_count;
  end if;
end
$issue97_patch_builder$;

revoke all on function public.brinesearch_issue97_rebuild_county_graph(text,text)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_rebuild_county_graph(text,text)
to service_role;

comment on view private_verification.brinesearch_issue97_authoritative_road_segments_internal is
  'Issue #97 service-only normalized source-segment view for graph builds. Same SELECT semantics as the public security-barrier view, but private/no-grant so PostGIS source indexes can be used by trusted batch topology work.';
comment on function public.brinesearch_issue97_rebuild_county_graph(text,text) is
  'Issue #97 authoritative county graph builder. Trusted batch source-segment scans use the private normalized view so exact spatial predicates can use underlying source indexes; browser reads remain on the public security-barrier view.';
