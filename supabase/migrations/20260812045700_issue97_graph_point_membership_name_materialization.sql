-- GitHub #97 — set-based materialization for point-junction membership names/aliases.
--
-- Belmont still times out at the point membership insert after selective
-- authoritative-name lookup indexes. This patch preserves the exact existing
-- name/measure/validity rules but evaluates names set-wise once for the current
-- tmp_issue97_point_values population, then joins that materialization into the
-- POINT membership insert only.
--
-- Semantics are unchanged:
--   * verified Road Manager mapping remains required exactly as before;
--   * segment-scoped names outrank unscoped names exactly as before;
--   * official > signed > local > 911 > other precedence is unchanged;
--   * active valid_from/valid_to windows are unchanged;
--   * unscoped from_measure/to_measure containment is unchanged;
--   * aliases remain the full distinct valid name set;
--   * shared-section and name-change membership paths are left untouched;
--   * no fuzzy, nearest-road, name-only, or proximity identity proof is added.

do $issue97_patch_point_membership_names$
declare
  v_definition text;
  v_point_values_pos integer;
  v_point_insert_rel integer;
  v_point_insert_pos integer;
  v_shared_values_rel integer;
  v_shared_values_pos integer;
  v_new_block text := $newblock$
  -- Issue #97 performance: set-based primary name + aliases for POINT memberships only.
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
    id,junction_id,identity_id,road_id,source_segment_keys,road_name_at_junction,
    aliases_at_junction,membership_role,source_measure,distance_along_road_m,
    approach_data,provenance
  )
  select private_verification.brinesearch_issue97_uuid('membership:'||j.id::text||':'||i.id::text),
    j.id,i.id,map.road_id,v.source_segment_keys,coalesce(membership_names.primary_name,i.display_name),
    coalesce(membership_names.aliases,'{}'::text[]),
    case when j.junction_type='ramp' and i.road_class='ramp' then 'ramp'
      when j.junction_type='continuation' then 'continuation'
      when j.junction_type='name_change' then 'name_change'
      when v.is_identity_terminus then 'terminus' else 'approach' end,
    v.source_measure,v.distance_along_road_m,
    pg_catalog.jsonb_build_object(
      'identity_terminus',v.is_identity_terminus,'measure_method',v.measure_method,
      'chosen_source_segment_key',v.chosen_segment_key
    ),pg_catalog.jsonb_build_object(
      'source_identity_key',i.source_identity_key,'source_digest',i.source_digest,
      'aliases_are_location_valid',true
    )
  from tmp_issue97_point_values v
  join tmp_issue97_point_nodes p on p.candidate_key=v.candidate_key
  join public.brinesearch_road_junctions j on j.build_id=v_build
    and j.id=private_verification.brinesearch_issue97_uuid(
      'build:'||v_build::text||':'||p.candidate_key
    )
  join public.brinesearch_authoritative_road_identities i on i.id=v.identity_id
  left join lateral (
    select m.road_id from public.brinesearch_road_identity_mappings m
    where m.identity_id=i.id and m.mapping_status='verified' order by m.updated_at desc,m.id limit 1
  ) map on true
  left join tmp_issue97_point_membership_names membership_names
    on membership_names.candidate_key=v.candidate_key
   and membership_names.identity_id=v.identity_id;

  $newblock$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition like '%tmp_issue97_point_membership_names%' then
    return;
  end if;

  -- Locate the point-membership region structurally. It must occur after the
  -- point-values temp table and end immediately before shared-values creation.
  v_point_values_pos := pg_catalog.position(
    'create temporary table tmp_issue97_point_values on commit drop as' in v_definition
  );
  if v_point_values_pos<1 then
    raise exception 'Issue #97 point-values anchor missing';
  end if;

  v_point_insert_rel := pg_catalog.position(
    'insert into public.brinesearch_road_junction_memberships('
    in pg_catalog.substr(v_definition,v_point_values_pos)
  );
  if v_point_insert_rel<1 then
    raise exception 'Issue #97 point membership insert missing after point-values anchor';
  end if;
  v_point_insert_pos := v_point_values_pos+v_point_insert_rel-1;

  v_shared_values_rel := pg_catalog.position(
    'create temporary table tmp_issue97_shared_values on commit drop as'
    in pg_catalog.substr(v_definition,v_point_insert_pos)
  );
  if v_shared_values_rel<1 then
    raise exception 'Issue #97 shared-values boundary missing after point membership insert';
  end if;
  v_shared_values_pos := v_point_insert_pos+v_shared_values_rel-1;

  if v_point_insert_pos<=v_point_values_pos or v_shared_values_pos<=v_point_insert_pos then
    raise exception 'Issue #97 point membership structural anchors are out of order';
  end if;

  -- Replace exactly the point-membership region; shared and name-change regions
  -- begin after v_shared_values_pos and are retained byte-for-byte.
  v_definition := pg_catalog.substr(v_definition,1,v_point_insert_pos-1)
    ||v_new_block
    ||pg_catalog.substr(v_definition,v_shared_values_pos);

  execute v_definition;
end
$issue97_patch_point_membership_names$;

do $issue97_verify_point_membership_names$
declare
  v_definition text;
  v_materialized_pos integer;
  v_shared_values_pos integer;
  v_shared_lateral_pos integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  v_materialized_pos := pg_catalog.position('tmp_issue97_point_membership_names' in v_definition);
  v_shared_values_pos := pg_catalog.position('create temporary table tmp_issue97_shared_values on commit drop as' in v_definition);
  v_shared_lateral_pos := pg_catalog.position(
    'coalesce(primary_name.road_name,i.display_name)'
    in pg_catalog.substr(v_definition,v_shared_values_pos)
  );

  if v_materialized_pos<1
     or v_shared_values_pos<1
     or v_materialized_pos>=v_shared_values_pos
     or v_definition not like '%membership_names.candidate_key=v.candidate_key%'
     or v_definition not like '%coalesce(membership_names.primary_name,i.display_name)%'
     or v_definition not like '%coalesce(membership_names.aliases,''{}''::text[])%'
     or v_definition not like '%case n.name_type%when ''official'' then 0%when ''signed'' then 1%when ''local'' then 2%when ''911'' then 3%'
     or v_definition not like '%least(n.from_measure,n.to_measure)<=v.source_measure%'
     or v_definition not like '%greatest(n.from_measure,n.to_measure)>=v.source_measure%'
     or v_shared_lateral_pos<1
  then
    raise exception 'Issue #97 point membership name materialization contract did not install cleanly';
  end if;
end
$issue97_verify_point_membership_names$;
