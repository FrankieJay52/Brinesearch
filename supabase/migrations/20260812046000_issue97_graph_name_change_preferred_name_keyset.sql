-- GitHub #97 — optimize name-change preferred-name materialization by joining
-- only the exact (identity_id, source_segment_key) pairs present in the county
-- graph segment set. Semantics are unchanged: segment-scoped names only,
-- active validity window, official > signed > other, then id.

do $issue97_patch_name_change_preferred_name_keyset$
declare
  v_definition text;
  v_old text := $old$
  drop table if exists pg_temp.tmp_issue97_segment_preferred_names;
  create temporary table tmp_issue97_segment_preferred_names on commit drop as
  select distinct on (n.identity_id,n.source_segment_key)
    n.identity_id,
    n.source_segment_key,
    n.id as name_event_id,
    n.road_name,
    n.normalized_name
  from public.brinesearch_authoritative_road_names n
  where n.active
    and n.source_segment_key is not null
    and (n.valid_from is null or n.valid_from<=now())
    and (n.valid_to is null or n.valid_to>now())
    and n.identity_id in (select distinct identity_id from tmp_issue97_segments)
  order by n.identity_id,n.source_segment_key,
    case n.name_type when 'official' then 0 when 'signed' then 1 else 2 end,
    n.id;
  create unique index tmp_issue97_segment_preferred_names_key_idx
    on tmp_issue97_segment_preferred_names(identity_id,source_segment_key);
  analyze tmp_issue97_segment_preferred_names;
  $old$;
  v_new text := $new$
  -- Issue #97 performance: restrict name lookup to exact segment keys used by
  -- this graph generation so the persistent (identity_id,source_segment_key)
  -- index is usable without scanning every name row for each touched identity.
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
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition like '%tmp_issue97_segment_name_keys%' then
    return;
  end if;

  v_count := (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    / pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 preferred-name materialization target changed or not unique: %',v_count;
  end if;

  v_definition := pg_catalog.replace(v_definition,v_old,v_new);
  execute v_definition;
end
$issue97_patch_name_change_preferred_name_keyset$;

do $issue97_verify_name_change_preferred_name_keyset$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition not like '%tmp_issue97_segment_name_keys%'
     or v_definition not like '%join public.brinesearch_authoritative_road_names n%'
     or v_definition not like '%n.identity_id=k.identity_id%'
     or v_definition not like '%n.source_segment_key=k.source_segment_key%'
     or v_definition not like '%when ''official'' then 0 when ''signed'' then 1 else 2 end%'
     or v_definition not like '%n.valid_from is null or n.valid_from<=now()%'
     or v_definition not like '%n.valid_to is null or n.valid_to>now()%'
  then
    raise exception 'Issue #97 preferred-name exact keyset contract did not install cleanly';
  end if;
end
$issue97_verify_name_change_preferred_name_keyset$;