-- GitHub #97 — set-based materialization for point-junction membership names/aliases.
--
-- Belmont still times out at the point membership insert after adding selective
-- authoritative-name lookup indexes. This patch preserves the exact existing
-- name/measure/validity rules but evaluates them set-wise once for the current
-- tmp_issue97_point_values population, then joins the result into the insert.
--
-- Semantics are unchanged:
--   * verified Road Manager mapping remains required exactly as before;
--   * segment-scoped names outrank unscoped names exactly as before;
--   * official > signed > local > 911 > other precedence is unchanged;
--   * active valid_from/valid_to windows are unchanged;
--   * unscoped from_measure/to_measure containment is unchanged;
--   * aliases remain the full distinct valid name set;
--   * no fuzzy, nearest-road, name-only, or proximity identity proof is added.

do $issue97_patch_point_membership_names$
declare
  v_definition text;
  v_anchor text := $anchor$
  left join lateral (
    select count(*)::integer as segment_count from tmp_issue97_segments s
    where s.identity_id=i.identity_id
  ) totals on true;

  insert into public.brinesearch_road_junction_memberships(
  $anchor$;
  v_materialized_anchor text := $replacement$
  left join lateral (
    select count(*)::integer as segment_count from tmp_issue97_segments s
    where s.identity_id=i.identity_id
  ) totals on true;

  drop table if exists pg_temp.tmp_issue97_point_membership_names;
  create temporary table tmp_issue97_point_membership_names on commit drop as
  select
    v.candidate_key,
    v.identity_id,
    (array_agg(
      n.road_name
      order by
        (n.source_segment_key=v.chosen_segment_key) desc nulls last,
        case n.name_type
          when 'official' then 0
          when 'signed' then 1
          when 'local' then 2
          when '911' then 3
          else 4
        end,
        n.road_name,
        n.id
    ) filter (where n.id is not null))[1] as primary_name,
    coalesce(
      array_agg(distinct n.road_name order by n.road_name)
        filter (where n.road_name is not null),
      '{}'::text[]
    ) as aliases
  from tmp_issue97_point_values v
  left join public.brinesearch_authoritative_road_names n
    on n.identity_id=v.identity_id
   and n.active
   and (n.valid_from is null or n.valid_from<=now())
   and (n.valid_to is null or n.valid_to>now())
   and (
     n.source_segment_key=v.chosen_segment_key
     or (
       n.source_segment_key is null
       and (
         n.from_measure is null and n.to_measure is null
         or v.source_measure is not null
           and least(n.from_measure,n.to_measure)<=v.source_measure
           and greatest(n.from_measure,n.to_measure)>=v.source_measure
       )
     )
   )
  group by v.candidate_key,v.identity_id;
  create unique index tmp_issue97_point_membership_names_key_idx
    on tmp_issue97_point_membership_names(candidate_key,identity_id);
  analyze tmp_issue97_point_membership_names;

  insert into public.brinesearch_road_junction_memberships(
  $replacement$;
  v_old_names text := $oldnames$
  left join lateral (
    select n.road_name from public.brinesearch_authoritative_road_names n
    where n.identity_id=i.id and n.active
      and (n.valid_from is null or n.valid_from<=now()) and (n.valid_to is null or n.valid_to>now())
      and (n.source_segment_key=v.chosen_segment_key or (
        n.source_segment_key is null and (
          n.from_measure is null and n.to_measure is null
          or v.source_measure is not null
            and least(n.from_measure,n.to_measure)<=v.source_measure
            and greatest(n.from_measure,n.to_measure)>=v.source_measure
        )
      ))
    order by (n.source_segment_key=v.chosen_segment_key) desc nulls last,
      case n.name_type when 'official' then 0 when 'signed' then 1 when 'local' then 2
        when '911' then 3 else 4 end,n.road_name,n.id limit 1
  ) primary_name on true
  left join lateral (
    select array_agg(distinct n.road_name order by n.road_name) as aliases
    from public.brinesearch_authoritative_road_names n
    where n.identity_id=i.id and n.active
      and (n.valid_from is null or n.valid_from<=now()) and (n.valid_to is null or n.valid_to>now())
      and (n.source_segment_key=v.chosen_segment_key or (
        n.source_segment_key is null and (
          n.from_measure is null and n.to_measure is null
          or v.source_measure is not null
            and least(n.from_measure,n.to_measure)<=v.source_measure
            and greatest(n.from_measure,n.to_measure)>=v.source_measure
        )
      ))
  ) alias_names on true;
  $oldnames$;
  v_new_names text := $newnames$
  left join tmp_issue97_point_membership_names membership_names
    on membership_names.candidate_key=v.candidate_key
   and membership_names.identity_id=v.identity_id;
  $newnames$;
  v_old_select text := $oldsel$
    j.id,i.id,map.road_id,v.source_segment_keys,coalesce(primary_name.road_name,i.display_name),
    coalesce(alias_names.aliases,'{}'::text[]),
  $oldsel$;
  v_new_select text := $newsel$
    j.id,i.id,map.road_id,v.source_segment_keys,coalesce(membership_names.primary_name,i.display_name),
    coalesce(membership_names.aliases,'{}'::text[]),
  $newsel$;
  v_anchor_count integer;
  v_name_block_count integer;
  v_select_count integer;
  v_pos integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition like '%tmp_issue97_point_membership_names%' then
    return;
  end if;

  v_anchor_count := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition,v_anchor,''))
  ) / pg_catalog.length(v_anchor);
  if v_anchor_count<>1 then
    raise exception 'Issue #97 point-membership materialization anchor changed or not unique: %',v_anchor_count;
  end if;

  v_name_block_count := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition,v_old_names,''))
  ) / pg_catalog.length(v_old_names);
  if v_name_block_count<>2 then
    raise exception 'Issue #97 expected exactly two identical membership name lateral blocks before patch, found %',v_name_block_count;
  end if;

  v_select_count := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition,v_old_select,''))
  ) / pg_catalog.length(v_old_select);
  if v_select_count<>2 then
    raise exception 'Issue #97 expected exactly two point/shared membership select-name blocks before patch, found %',v_select_count;
  end if;

  -- Insert the set-based materialization only before the first (point) membership insert.
  v_definition := pg_catalog.replace(v_definition,v_anchor,v_materialized_anchor);

  -- Replace only the first name/alias lateral block (the point membership insert).
  v_pos := pg_catalog.position(v_old_names in v_definition);
  if v_pos<1 then raise exception 'Issue #97 first point membership name block disappeared'; end if;
  v_definition := pg_catalog.substr(v_definition,1,v_pos-1)
    ||v_new_names
    ||pg_catalog.substr(v_definition,v_pos+pg_catalog.length(v_old_names));

  -- Replace only the first SELECT-list reference pair, again leaving shared memberships untouched.
  v_pos := pg_catalog.position(v_old_select in v_definition);
  if v_pos<1 then raise exception 'Issue #97 first point membership select-name block disappeared'; end if;
  v_definition := pg_catalog.substr(v_definition,1,v_pos-1)
    ||v_new_select
    ||pg_catalog.substr(v_definition,v_pos+pg_catalog.length(v_old_select));

  execute v_definition;
end
$issue97_patch_point_membership_names$;

do $issue97_verify_point_membership_names$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition not like '%tmp_issue97_point_membership_names%'
     or v_definition not like '%membership_names.candidate_key=v.candidate_key%'
     or v_definition not like '%coalesce(membership_names.primary_name,i.display_name)%'
     or v_definition not like '%coalesce(membership_names.aliases,''{}''::text[])%'
     or v_definition not like '%case n.name_type%when ''official'' then 0%when ''signed'' then 1%when ''local'' then 2%when ''911'' then 3%'
     or v_definition not like '%least(n.from_measure,n.to_measure)<=v.source_measure%'
     or v_definition not like '%greatest(n.from_measure,n.to_measure)>=v.source_measure%'
  then
    raise exception 'Issue #97 point membership name materialization contract did not install cleanly';
  end if;
end
$issue97_verify_point_membership_names$;
