-- GitHub #97 — registry node-digest prefilter for county graph rebuilds.
--
-- Belmont (and dense counties) can time out while computing v_registry_digest
-- because the active authoritative node table is evaluated with a repeated
-- geography ST_DWithin against the temporary segment set.
--
-- This patch is semantics-neutral:
--   * still requires the exact 1-metre geography test
--   * still digests only active nodes spatially related to the build segment set
--   * still uses the same source_node_key:source_digest ordered digest formula
--   * does not change topology, identity, mapping, or no-guess behavior
--
-- The geometry bounding-box expansion is only a conservative prefilter. The
-- exact geography ST_DWithin(..., 1) remains the authoritative inclusion test.

do $issue97_patch_graph_registry_node_digest_prefilter$
declare
  v_definition text;
  v_old text := $old$select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      n.source_node_key||':'||n.source_digest,',' order by n.source_node_key
    ),'')) as node_digest
    from public.brinesearch_authoritative_road_nodes n
    where n.active and exists(select 1 from tmp_issue97_segments s
      where extensions.st_dwithin(n.geom::extensions.geography,s.geom::extensions.geography,1))$old$;
  v_new text := $new$select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      c.source_node_key||':'||c.source_digest,',' order by c.source_node_key
    ),'')) as node_digest
    from (
      select distinct n.source_node_key,n.source_digest
      from public.brinesearch_authoritative_road_nodes n
      join tmp_issue97_segments s
        on n.geom OPERATOR(extensions.&&) extensions.st_expand(s.geom,0.00005)
      where n.active
        and extensions.st_dwithin(
          n.geom::extensions.geography,
          s.geom::extensions.geography,
          1
        )
    ) c$new$;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition like '%OPERATOR(extensions.&&) extensions.st_expand(s.geom,0.00005)%'
     and v_definition like '%select distinct n.source_node_key,n.source_digest%'
  then
    return;
  end if;

  v_count := (pg_catalog.length(v_definition)-pg_catalog.length(
    pg_catalog.replace(v_definition,v_old,'')
  ))/pg_catalog.length(v_old);

  if v_count <> 1 then
    raise exception 'Issue #97 graph registry node-digest prefilter target changed or not unique: %',v_count;
  end if;

  v_definition := pg_catalog.replace(v_definition,v_old,v_new);
  execute v_definition;
end
$issue97_patch_graph_registry_node_digest_prefilter$;

do $issue97_verify_graph_registry_node_digest_prefilter$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition not like '%OPERATOR(extensions.&&) extensions.st_expand(s.geom,0.00005)%'
     or v_definition not like '%select distinct n.source_node_key,n.source_digest%'
     or v_definition not like '%extensions.st_dwithin(%n.geom::extensions.geography%s.geom::extensions.geography%1%'
     or v_definition not like '%c.source_node_key||'':''||c.source_digest%'
  then
    raise exception 'Issue #97 graph registry node-digest prefilter contract did not install cleanly';
  end if;
end
$issue97_verify_graph_registry_node_digest_prefilter$;
