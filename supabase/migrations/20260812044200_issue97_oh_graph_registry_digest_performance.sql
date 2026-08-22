-- GitHub #97 — Ohio graph registry-digest performance hardening.
--
-- Guernsey proved that the registry node digest was executing as a 47k-node
-- sequential scan against every temporary source segment because
-- tmp_issue97_segments had only a geometry GiST index while the exact digest
-- predicate uses geography ST_DWithin(...,1 metre).
--
-- Read-only proof before this migration:
--   * exact current GUE scope = 3,648 segments / 2,079 identities;
--   * unchanged node-digest plan without temp geography index cost ~4.31B;
--   * adding a geography GiST index to the SAME temporary segment table changed
--     the SAME exact 1-metre query to an indexed plan and ~290 ms execution;
--   * the entire unchanged registry digest then completed in ~6.8 seconds.
--
-- This patch is intentionally Ohio-only. It changes no topology, source scope,
-- registry digest formula, tolerance, junction rule, name rule, mapping rule, or
-- no-guess behavior. It only adds the missing temp geography index + ANALYZE for
-- Ohio graph rebuilds.

do $issue97_patch_oh_graph_registry_digest_performance$
declare
  v_definition text;
  v_old text:=E'  create index tmp_issue97_segments_geom_idx on tmp_issue97_segments using gist(geom);\n  create index tmp_issue97_segments_identity_idx on tmp_issue97_segments(identity_id);';
  v_new text:=E'  create index tmp_issue97_segments_geom_idx on tmp_issue97_segments using gist(geom);\n  create index tmp_issue97_segments_identity_idx on tmp_issue97_segments(identity_id);\n  if v_state=''OH'' then\n    create index tmp_issue97_segments_geog_idx\n      on tmp_issue97_segments using gist((geom::extensions.geography));\n    analyze tmp_issue97_segments;\n  end if;';
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition like '%create index tmp_issue97_segments_geog_idx%'
     and v_definition like '%analyze tmp_issue97_segments%'
  then
    null;
  else
    v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
      pg_catalog.replace(v_definition,v_old,'')
    ))/pg_catalog.length(v_old);
    if v_count<>1 then
      raise exception 'Issue #97 Ohio registry digest performance patch target changed: %',v_count;
    end if;
    v_definition:=pg_catalog.replace(v_definition,v_old,v_new);
    execute v_definition;
  end if;
end
$issue97_patch_oh_graph_registry_digest_performance$;

do $issue97_verify_oh_graph_registry_digest_performance$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition not like '%if v_state=''OH'' then%create index tmp_issue97_segments_geog_idx%'
     or v_definition not like '%on tmp_issue97_segments using gist((geom::extensions.geography))%'
     or v_definition not like '%analyze tmp_issue97_segments%'
     or v_definition not like '%extensions.st_dwithin(n.geom::extensions.geography,s.geom::extensions.geography,1)%'
  then
    raise exception 'Issue #97 Ohio graph registry-digest performance contract did not install cleanly';
  end if;
end
$issue97_verify_oh_graph_registry_digest_performance$;
