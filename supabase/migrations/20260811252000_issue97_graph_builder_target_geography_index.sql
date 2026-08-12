-- GitHub #97 — graph-builder target geography index hardening.
--
-- After moving trusted graph builds off the public security-barrier view, the
-- Harrison boundary-neighbor scan still timed out because its exact 1 m predicate
-- casts both geometries to geography while tmp_issue97_target_segments only had a
-- geometry GiST index. Add the matching temporary geography expression index and
-- ANALYZE the target set before boundary discovery. Topology semantics are unchanged.

do $issue97_patch_target_geog$
declare
  v_definition text;
  v_old text:='create index tmp_issue97_target_segments_geom_idx
    on tmp_issue97_target_segments using gist(geom);';
  v_new text:='create index tmp_issue97_target_segments_geom_idx
    on tmp_issue97_target_segments using gist(geom);
  create index tmp_issue97_target_segments_geog_idx
    on tmp_issue97_target_segments using gist((geom::extensions.geography));
  analyze tmp_issue97_target_segments;';
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 graph builder target-index block changed unexpectedly: % matches',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);
  execute v_definition;
end
$issue97_patch_target_geog$;

revoke all on function public.brinesearch_issue97_rebuild_county_graph(text,text)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_rebuild_county_graph(text,text)
to service_role;

comment on function public.brinesearch_issue97_rebuild_county_graph(text,text) is
  'Issue #97 authoritative county graph builder. Trusted source scans use the private normalized view plus geography GiST indexes on both persistent source rows and the temporary target county set; junction rules remain exact/fail-closed.';
