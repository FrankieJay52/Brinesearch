-- GitHub #97 — optimize name-change preferred-name materialization by joining
-- only the exact (identity_id, source_segment_key) pairs present in the county
-- graph segment set. Semantics are unchanged: segment-scoped names only,
-- active validity window, official > signed > other, then id.

do $issue97_patch_name_change_preferred_name_keyset$
declare
  v_definition text;
  v_start constant text := 'drop table if exists pg_temp.tmp_issue97_segment_preferred_names;';
  v_end constant text := 'create temporary table tmp_issue97_name_changes on commit drop as';
  v_start_pos integer;
  v_end_rel integer;
  v_end_pos integer;
  v_new text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition like '%tmp_issue97_segment_name_keys%' then
    return;
  end if;

  if (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_start,'')))
      / pg_catalog.length(v_start) <> 1 then
    raise exception 'Issue #97 preferred-name start anchor changed or not unique';
  end if;

  v_start_pos := pg_catalog.strpos(v_definition,v_start);
  if v_start_pos<1 then
    raise exception 'Issue #97 preferred-name start anchor missing';
  end if;

  v_end_rel := pg_catalog.strpos(pg_catalog.substr(v_definition,v_start_pos),v_end);
  if v_end_rel<1 then
    raise exception 'Issue #97 preferred-name end anchor missing';
  end if;
  v_end_pos := v_start_pos+v_end_rel-2;

  v_new := $new$
  -- Issue #97 performance: restrict the persistent name lookup to exact segment
  -- keys used by this graph generation. This preserves the current segment-scoped
  -- name contract while allowing the persistent identity/segment index to drive.
  drop table if exists pg_temp.tmp_issue97_segment_name_keys;
  create temporary table tmp_issue97_segment_name_keys on commit drop as
  select distinct identity_id,source_segment_key
  from tmp_issue97_segments
  where source_segment_key is not null;
  create unique index tmp_issue97_segment_name_keys_idx
    on tmp_issue97_segment_name_keys(identity_id,source_segment_key);
  analyze tmp_issue97_segment_name_keys;

  drop table if exists pg_temp.tmp_issue97_segment_preferred_names;
  create temporary table tmp_issue97_segment_preferred_names on commit drop as
  select distinct on (k.identity_id,k.source_segment_key)
    k.identity_id,
    k.source_segment_key,
    n.id as name_event_id,
    n.road_name,
    n.normalized_name
  from tmp_issue97_segment_name_keys k
  join public.brinesearch_authoritative_road_names n
    on n.identity_id=k.identity_id
   and n.source_segment_key=k.source_segment_key
  where n.active
    and (n.valid_from is null or n.valid_from<=now())
    and (n.valid_to is null or n.valid_to>now())
  order by k.identity_id,k.source_segment_key,
    case n.name_type when 'official' then 0 when 'signed' then 1 else 2 end,
    n.id;
  create unique index tmp_issue97_segment_preferred_names_key_idx
    on tmp_issue97_segment_preferred_names(identity_id,source_segment_key);
  analyze tmp_issue97_segment_preferred_names;

  $new$;

  v_definition := pg_catalog.substr(v_definition,1,v_start_pos-1)
    ||v_new
    ||pg_catalog.substr(v_definition,v_end_pos+1);
  execute v_definition;
end
$issue97_patch_name_change_preferred_name_keyset$;

do $issue97_verify_name_change_preferred_name_keyset$
declare
  v_definition text;
  v_start_pos integer;
  v_end_rel integer;
  v_region text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  v_start_pos := pg_catalog.strpos(v_definition,'drop table if exists pg_temp.tmp_issue97_segment_name_keys');
  if v_start_pos<1 then
    raise exception 'Issue #97 preferred-name keyset region missing';
  end if;
  v_end_rel := pg_catalog.strpos(pg_catalog.substr(v_definition,v_start_pos),'create temporary table tmp_issue97_name_changes on commit drop as');
  if v_end_rel<1 then
    raise exception 'Issue #97 preferred-name keyset downstream boundary missing';
  end if;
  v_region := pg_catalog.substr(v_definition,v_start_pos,v_end_rel-1);

  if v_region not like '%select distinct identity_id,source_segment_key%'
     or v_region not like '%join public.brinesearch_authoritative_road_names n%'
     or v_region not like '%n.identity_id=k.identity_id%'
     or v_region not like '%n.source_segment_key=k.source_segment_key%'
     or v_region not like '%when ''official'' then 0 when ''signed'' then 1 else 2 end%'
     or v_region not like '%n.valid_from is null or n.valid_from<=now()%'
     or v_region not like '%n.valid_to is null or n.valid_to>now()%'
     or v_region like '%n.identity_id in (select distinct identity_id from tmp_issue97_segments)%'
  then
    raise exception 'Issue #97 preferred-name exact keyset contract did not install cleanly';
  end if;
end
$issue97_verify_name_change_preferred_name_keyset$;