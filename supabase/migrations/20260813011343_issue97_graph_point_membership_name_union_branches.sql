-- GitHub #97 — split point-membership name evidence into two index-friendly branches.
--
-- Belmont times out while building tmp_issue97_point_membership_names because
-- one join combines exact segment-scoped names with unscoped measure-valid names
-- through an OR predicate. This patch preserves the exact live name contract but
-- evaluates those evidence classes separately, then aggregates the same result.
--
-- Semantics remain unchanged:
--   * exact source_segment_key evidence outranks unscoped evidence;
--   * official > signed > local > 911 > other precedence is unchanged;
--   * road_name then id remain the deterministic tie-breakers;
--   * active valid_from/valid_to windows are unchanged;
--   * unscoped from_measure/to_measure containment is unchanged;
--   * aliases remain the full DISTINCT ordered valid name set;
--   * only tmp_issue97_point_membership_names construction changes.

do $issue97_patch_point_membership_name_union_branches$
declare
  v_definition text;
  v_old text := $old$
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
  $old$;
  v_new text := $new$
  drop table if exists pg_temp.tmp_issue97_point_membership_names;
  create temporary table tmp_issue97_point_membership_names on commit drop as
  with candidates as (
    select distinct candidate_key,identity_id,chosen_segment_key,source_measure
    from tmp_issue97_point_values
  ),
  issue97_point_name_exact_segment as (
    select c.candidate_key,c.identity_id,n.id as name_id,n.road_name,n.name_type,
      0::integer as segment_rank,
      case n.name_type
        when 'official' then 0
        when 'signed' then 1
        when 'local' then 2
        when '911' then 3
        else 4
      end as type_rank
    from candidates c
    join public.brinesearch_authoritative_road_names n
      on n.identity_id=c.identity_id
     and n.source_segment_key=c.chosen_segment_key
     and n.active
     and (n.valid_from is null or n.valid_from<=now())
     and (n.valid_to is null or n.valid_to>now())
  ),
  issue97_point_name_unscoped as (
    select c.candidate_key,c.identity_id,n.id as name_id,n.road_name,n.name_type,
      1::integer as segment_rank,
      case n.name_type
        when 'official' then 0
        when 'signed' then 1
        when 'local' then 2
        when '911' then 3
        else 4
      end as type_rank
    from candidates c
    join public.brinesearch_authoritative_road_names n
      on n.identity_id=c.identity_id
     and n.source_segment_key is null
     and n.active
     and (n.valid_from is null or n.valid_from<=now())
     and (n.valid_to is null or n.valid_to>now())
     and (
       n.from_measure is null and n.to_measure is null
       or c.source_measure is not null
         and least(n.from_measure,n.to_measure)<=c.source_measure
         and greatest(n.from_measure,n.to_measure)>=c.source_measure
     )
  ),
  valid_names as (
    select candidate_key,identity_id,name_id,road_name,name_type,segment_rank,type_rank
    from issue97_point_name_exact_segment
    union all
    select candidate_key,identity_id,name_id,road_name,name_type,segment_rank,type_rank
    from issue97_point_name_unscoped
  )
  select c.candidate_key,c.identity_id,
    (array_agg(v.road_name order by v.segment_rank,v.type_rank,v.road_name,v.name_id)
      filter (where v.name_id is not null))[1] as primary_name,
    coalesce(
      array_agg(distinct v.road_name order by v.road_name)
        filter (where v.road_name is not null),
      '{}'::text[]
    ) as aliases
  from candidates c
  left join valid_names v
    on v.candidate_key=c.candidate_key and v.identity_id=c.identity_id
  group by c.candidate_key,c.identity_id;
  $new$;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition like '%issue97_point_name_exact_segment%'
     and v_definition like '%issue97_point_name_unscoped%' then
    return;
  end if;

  v_count := (pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    / pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 point membership name materialization target changed or not unique: %',v_count;
  end if;

  v_definition := pg_catalog.replace(v_definition,v_old,v_new);
  execute v_definition;
end
$issue97_patch_point_membership_name_union_branches$;

do $issue97_verify_point_membership_name_union_branches$
declare
  v_definition text;
  v_shared_values_pos integer;
  v_shared_lateral_pos integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  v_shared_values_pos := pg_catalog.strpos(
    v_definition,'create temporary table tmp_issue97_shared_values on commit drop as'
  );
  v_shared_lateral_pos := pg_catalog.strpos(
    pg_catalog.substr(v_definition,v_shared_values_pos),
    'coalesce(primary_name.road_name,i.display_name)'
  );

  if v_definition not like '%issue97_point_name_exact_segment%'
     or v_definition not like '%issue97_point_name_unscoped%'
     or v_definition not like '%0::integer as segment_rank%'
     or v_definition not like '%1::integer as segment_rank%'
     or v_definition not like '%when ''official'' then 0%when ''signed'' then 1%when ''local'' then 2%when ''911'' then 3%'
     or v_definition not like '%n.valid_from is null or n.valid_from<=now()%'
     or v_definition not like '%n.valid_to is null or n.valid_to>now()%'
     or v_definition not like '%n.source_segment_key=c.chosen_segment_key%'
     or v_definition not like '%n.source_segment_key is null%'
     or v_definition not like '%least(n.from_measure,n.to_measure)<=c.source_measure%'
     or v_definition not like '%greatest(n.from_measure,n.to_measure)>=c.source_measure%'
     or v_definition not like '%array_agg(distinct v.road_name order by v.road_name)%'
     or v_shared_values_pos<1
     or v_shared_lateral_pos<1
  then
    raise exception 'Issue #97 point membership UNION-branch contract did not install cleanly';
  end if;
end
$issue97_verify_point_membership_name_union_branches$;
