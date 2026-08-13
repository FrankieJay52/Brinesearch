-- GitHub #97 — bound WVDOT endpoint floating precision in graph decoration only.
--
-- Current WVDOT M-values carry a repeated -2.7168425731360912e-8 mile lower
-- endpoint and sub-1e-7-mile upper endpoint drift relative to rounded name-event
-- measures. Raw multiplication violates the nonnegative membership constraint,
-- while exact range containment drops valid aliases on the same exact identity.
--
-- This migration does not change source rows, geometry, identity, topology,
-- segment choice, grade evidence, or mapping. It normalizes only calculated
-- membership measures on explicit WV:WVDOT segments within [-1e-7,0), retains
-- the raw value, and applies the same bounded tolerance only to unscoped names
-- already joined to that exact identity.

create or replace function private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
  p_source_segment_key text,
  p_raw_measure numeric
)
returns numeric
language sql
immutable
set search_path=''
as $$
  select case
    when p_source_segment_key like 'WV:WVDOT:SEGMENT:%'
      and p_raw_measure<0::numeric
      and p_raw_measure>=(-0.0000001)::numeric
    then 0::numeric
    else p_raw_measure
  end
$$;

create or replace function private_verification.brinesearch_issue97_wvdot_name_measure_contains(
  p_source_segment_key text,
  p_source_measure numeric,
  p_from_measure numeric,
  p_to_measure numeric
)
returns boolean
language sql
immutable
set search_path=''
as $$
  select coalesce(p_source_measure is not null
    and p_source_measure>=least(p_from_measure,p_to_measure)-case
      when p_source_segment_key like 'WV:WVDOT:SEGMENT:%'
        and p_from_measure is not null and p_to_measure is not null
      then 0.0000001::numeric
      else 0::numeric end
  ,false)
    and p_source_measure<=greatest(p_from_measure,p_to_measure)+case
      when p_source_segment_key like 'WV:WVDOT:SEGMENT:%'
        and p_from_measure is not null and p_to_measure is not null
      then 0.0000001::numeric
      else 0::numeric end
$$;

revoke all on function private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(text,numeric)
from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_wvdot_name_measure_contains(text,numeric,numeric,numeric)
from public,anon,authenticated,service_role;

do $issue97_verify_wvdot_measure_helpers$
begin
  if private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
       'WV:WVDOT:SEGMENT:fixture',-0.000000027168425731360912
     ) is distinct from 0::numeric
     or private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
       'WV:WVDOT:SEGMENT:fixture',-0.0000001000001
     ) is distinct from (-0.0000001000001)::numeric
     or private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
       'OH:ODOT:SEGMENT:fixture',-0.000000027168425731360912
     ) is distinct from (-0.000000027168425731360912)::numeric
     or not private_verification.brinesearch_issue97_wvdot_name_measure_contains(
       'WV:WVDOT:SEGMENT:fixture',0.14300003076286521,0,0.143
     )
     or private_verification.brinesearch_issue97_wvdot_name_measure_contains(
       'WV:WVDOT:SEGMENT:fixture',0.1430001000001,0,0.143
     )
     or private_verification.brinesearch_issue97_wvdot_name_measure_contains(
       'PA:PENNDOT:SEGMENT:fixture',0.14300003,0,0.143
     )
     or not private_verification.brinesearch_issue97_wvdot_name_measure_contains(
       'WV:WVDOT:SEGMENT:fixture',0.143,null,0.143
     )
     or not private_verification.brinesearch_issue97_wvdot_name_measure_contains(
       'WV:WVDOT:SEGMENT:fixture',0.143,0.143,null
     )
     or private_verification.brinesearch_issue97_wvdot_name_measure_contains(
       'WV:WVDOT:SEGMENT:fixture',0.143,null,null
     ) is not false
  then
    raise exception 'Issue #97 WVDOT graph-measure bound is broader or narrower than 1e-7 mile';
  end if;
end
$issue97_verify_wvdot_measure_helpers$;

-- Replace the effective point-value materialization as one bounded region so raw
-- and normalized measures cannot diverge between source_measure and distance.
do $issue97_patch_wvdot_point_values$
declare
  v_definition text;
  v_start constant text:='create temporary table tmp_issue97_point_values on commit drop as';
  v_end constant text:='drop table if exists pg_temp.tmp_issue97_point_membership_names;';
  v_start_pos integer;
  v_end_rel integer;
  v_end_pos integer;
  v_new text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;
  v_start_pos:=pg_catalog.strpos(v_definition,v_start);
  v_end_rel:=pg_catalog.strpos(pg_catalog.substr(v_definition,v_start_pos),v_end);
  if v_start_pos<1 or v_end_rel<1 then
    raise exception 'Issue #97 WVDOT point-value patch anchors changed';
  end if;
  v_end_pos:=v_start_pos+v_end_rel-1;

  v_new:=$new$
  create temporary table tmp_issue97_point_values on commit drop as
  with issue97_point_values_base as (
    select p.candidate_key,i.identity_id,i.source_segment_keys,i.is_identity_terminus,
      p.geom as point_geom,p.has_at_grade,
      case when p.has_at_grade then 1::double precision else 0.03::double precision end as tol_m,
      extensions.st_expand(p.geom,0.00005) as point_expand
    from tmp_issue97_point_nodes p
    join tmp_issue97_point_identity i on i.candidate_key=p.candidate_key
  ), bbox_hits as (
    select b.candidate_key,b.identity_id,b.point_geom,b.tol_m,
      s.source_segment_key,s.geom as segment_geom,s.from_measure,s.to_measure
    from issue97_point_values_base b
    join tmp_issue97_segments s
      on s.identity_id=b.identity_id
     and s.geom OPERATOR(extensions.&&) b.point_expand
  ), survivors as (
    select h.*,extensions.st_length(h.segment_geom::extensions.geography) as length_m
    from bbox_hits h
    where extensions.st_dwithin(
      h.segment_geom::extensions.geography,h.point_geom::extensions.geography,h.tol_m
    )
  ), measured as (
    select s.*,
      case when extensions.geometrytype(extensions.st_linemerge(s.segment_geom))='LINESTRING'
        then extensions.st_linelocatepoint(
          extensions.st_linemerge(s.segment_geom),
          extensions.st_closestpoint(s.segment_geom,s.point_geom)
        ) else 0 end as fraction
    from survivors s
  ), ranked as (
    select m.*,pg_catalog.row_number() over (
      partition by m.candidate_key,m.identity_id
      order by m.from_measure nulls last,m.source_segment_key
    ) as rn
    from measured m
  ), chosen as (
    select * from ranked where rn=1
  )
  select b.candidate_key,b.identity_id,b.source_segment_keys,b.is_identity_terminus,
    c.source_segment_key as chosen_segment_key,c.fraction,
    case when c.from_measure is not null and c.to_measure is not null
      then c.from_measure+(c.to_measure-c.from_measure)*c.fraction end as raw_source_measure,
    private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
      c.source_segment_key,
      case when c.from_measure is not null and c.to_measure is not null
        then c.from_measure+(c.to_measure-c.from_measure)*c.fraction end
    ) as source_measure,
    case when c.from_measure is not null and c.to_measure is not null then
      private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
        c.source_segment_key,c.from_measure+(c.to_measure-c.from_measure)*c.fraction
      )*1609.344
      when sc.segment_count=1 then c.fraction*c.length_m else null end as distance_along_road_m,
    case when c.from_measure is not null and c.to_measure is not null then 'authoritative_linear_measure'
      when sc.segment_count=1 then 'single_source_feature_geometry' else 'ambiguous' end as measure_method
  from issue97_point_values_base b
  left join chosen c on c.candidate_key=b.candidate_key and c.identity_id=b.identity_id
  left join tmp_issue97_identity_segment_counts sc on sc.identity_id=b.identity_id;

  $new$;
  execute pg_catalog.substr(v_definition,1,v_start_pos-1)||v_new||
    pg_catalog.substr(v_definition,v_end_pos);
end
$issue97_patch_wvdot_point_values$;

do $issue97_patch_wvdot_point_names_and_provenance$
declare
  v_definition text;
  v_old_candidates text:=$old$
  with candidates as (
    select distinct candidate_key,identity_id,chosen_segment_key,source_measure
    from tmp_issue97_point_values
  ),
  $old$;
  v_new_candidates text:=$new$
  with candidates as (
    select distinct candidate_key,identity_id,chosen_segment_key,
      raw_source_measure,source_measure
    from tmp_issue97_point_values
  ),
  $new$;
  v_old_name text:=$old$
       or c.source_measure is not null
         and least(n.from_measure,n.to_measure)<=c.source_measure
         and greatest(n.from_measure,n.to_measure)>=c.source_measure
  $old$;
  v_new_name text:=$new$
       or private_verification.brinesearch_issue97_wvdot_name_measure_contains(
         c.chosen_segment_key,c.raw_source_measure,n.from_measure,n.to_measure
       )
  $new$;
  v_old_provenance text:=$old$
    pg_catalog.jsonb_build_object(
      'identity_terminus',v.is_identity_terminus,'measure_method',v.measure_method,
      'chosen_source_segment_key',v.chosen_segment_key
    ),pg_catalog.jsonb_build_object(
  $old$;
  v_new_provenance text:=$new$
    pg_catalog.jsonb_build_object(
      'identity_terminus',v.is_identity_terminus,'measure_method',v.measure_method,
      'chosen_source_segment_key',v.chosen_segment_key
    )||case when v.chosen_segment_key like 'WV:WVDOT:SEGMENT:%' then
      pg_catalog.jsonb_build_object(
        'raw_source_measure',v.raw_source_measure,
        'source_measure_normalized',v.raw_source_measure is distinct from v.source_measure,
        'endpoint_measure_normalization_bound_miles',0.0000001
      ) else '{}'::jsonb end,pg_catalog.jsonb_build_object(
  $new$;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
    pg_catalog.replace(v_definition,v_old_candidates,'')
  ))/pg_catalog.length(v_old_candidates);
  if v_count<>1 then
    raise exception 'Issue #97 WVDOT point-name candidate target changed: %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old_candidates,v_new_candidates);
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
    pg_catalog.replace(v_definition,v_old_name,'')
  ))/pg_catalog.length(v_old_name);
  if v_count<>1 then
    raise exception 'Issue #97 WVDOT point-name containment target changed: %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old_name,v_new_name);
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
    pg_catalog.replace(v_definition,v_old_provenance,'')
  ))/pg_catalog.length(v_old_provenance);
  if v_count<>1 then
    raise exception 'Issue #97 WVDOT point provenance target changed: %',v_count;
  end if;
  execute pg_catalog.replace(v_definition,v_old_provenance,v_new_provenance);
end
$issue97_patch_wvdot_point_names_and_provenance$;

-- Shared memberships repeat the measured-distance and unscoped-name paths.
do $issue97_patch_wvdot_shared_values$
declare
  v_definition text;
  v_start constant text:='create temporary table tmp_issue97_shared_values on commit drop as';
  v_end constant text:='insert into public.brinesearch_road_junction_memberships(';
  v_start_pos integer;
  v_end_rel integer;
  v_end_pos integer;
  v_new text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;
  v_start_pos:=pg_catalog.strpos(v_definition,v_start);
  v_end_rel:=pg_catalog.strpos(pg_catalog.substr(v_definition,v_start_pos),v_end);
  if v_start_pos<1 or v_end_rel<1 then
    raise exception 'Issue #97 WVDOT shared-value patch anchors changed';
  end if;
  v_end_pos:=v_start_pos+v_end_rel-1;

  v_new:=$new$
  create temporary table tmp_issue97_shared_values on commit drop as
  select s.geom_key,s.geom,s.identity_ids,member.identity_id,
    coalesce(member_segments.source_segment_keys,'{}'::text[]) as source_segment_keys,
    choice.source_segment_key as chosen_segment_key,choice.fraction,
    case when choice.from_measure is not null and choice.to_measure is not null
      then choice.from_measure+(choice.to_measure-choice.from_measure)*choice.fraction
      end as raw_source_measure,
    private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
      choice.source_segment_key,
      case when choice.from_measure is not null and choice.to_measure is not null
        then choice.from_measure+(choice.to_measure-choice.from_measure)*choice.fraction end
    ) as source_measure,
    case when choice.from_measure is not null and choice.to_measure is not null then
      private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
        choice.source_segment_key,
        choice.from_measure+(choice.to_measure-choice.from_measure)*choice.fraction
      )*1609.344
      when totals.segment_count=1 then choice.fraction*choice.length_m else null end
      as distance_along_road_m,
    case when choice.from_measure is not null and choice.to_measure is not null
      then 'authoritative_linear_measure'
      when totals.segment_count=1 then 'single_source_feature_geometry' else 'ambiguous' end
      as measure_method
  from tmp_issue97_shared s
  cross join lateral unnest(s.identity_ids) member(identity_id)
  left join lateral (
    select array_agg(distinct seg.source_segment_key order by seg.source_segment_key)
      as source_segment_keys
    from tmp_issue97_segments seg
    where seg.identity_id=member.identity_id
      and extensions.st_intersects(seg.geom,s.geom)
      and extensions.st_length(
        extensions.st_collectionextract(extensions.st_intersection(seg.geom,s.geom),2)
          ::extensions.geography
      )>0.02
  ) member_segments on true
  left join lateral (
    select seg.source_segment_key,seg.state_code,seg.from_measure,seg.to_measure,
      extensions.st_length(seg.geom::extensions.geography) as length_m,
      case when extensions.geometrytype(extensions.st_linemerge(seg.geom))='LINESTRING'
        then extensions.st_linelocatepoint(extensions.st_linemerge(seg.geom),
          extensions.st_closestpoint(
            seg.geom,extensions.st_startpoint(extensions.st_linemerge(s.geom))
          ))
        else 0 end as fraction
    from tmp_issue97_segments seg where seg.identity_id=member.identity_id
      and extensions.st_intersects(seg.geom,s.geom)
      and extensions.st_length(
        extensions.st_collectionextract(extensions.st_intersection(seg.geom,s.geom),2)
          ::extensions.geography
      )>0.02
    order by extensions.st_length(
        extensions.st_collectionextract(extensions.st_intersection(seg.geom,s.geom),2)
          ::extensions.geography
      ) desc,seg.from_measure nulls last,seg.source_segment_key limit 1
  ) choice on true
  left join lateral (
    select count(*)::integer as segment_count from tmp_issue97_segments seg
    where seg.identity_id=member.identity_id
  ) totals on true;

  $new$;
  execute pg_catalog.substr(v_definition,1,v_start_pos-1)||v_new||
    pg_catalog.substr(v_definition,v_end_pos);
end
$issue97_patch_wvdot_shared_values$;

do $issue97_patch_wvdot_shared_names_and_provenance$
declare
  v_definition text;
  v_old_name text:=$old$
          or v.source_measure is not null
            and least(n.from_measure,n.to_measure)<=v.source_measure
            and greatest(n.from_measure,n.to_measure)>=v.source_measure
  $old$;
  v_new_name text:=$new$
          or private_verification.brinesearch_issue97_wvdot_name_measure_contains(
            v.chosen_segment_key,v.raw_source_measure,n.from_measure,n.to_measure
          )
  $new$;
  v_old_provenance text:=$old$
      'shared_end',extensions.st_asgeojson(extensions.st_endpoint(extensions.st_linemerge(v.geom)),15)::jsonb,
      'measure_method',v.measure_method,'chosen_source_segment_key',v.chosen_segment_key
    ),pg_catalog.jsonb_build_object(
  $old$;
  v_new_provenance text:=$new$
      'shared_end',extensions.st_asgeojson(extensions.st_endpoint(extensions.st_linemerge(v.geom)),15)::jsonb,
      'measure_method',v.measure_method,'chosen_source_segment_key',v.chosen_segment_key
    )||case when v.chosen_segment_key like 'WV:WVDOT:SEGMENT:%' then
      pg_catalog.jsonb_build_object(
        'raw_source_measure',v.raw_source_measure,
        'source_measure_normalized',v.raw_source_measure is distinct from v.source_measure,
        'endpoint_measure_normalization_bound_miles',0.0000001
      ) else '{}'::jsonb end,pg_catalog.jsonb_build_object(
  $new$;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
    pg_catalog.replace(v_definition,v_old_name,'')
  ))/pg_catalog.length(v_old_name);
  if v_count<>2 then
    raise exception 'Issue #97 WVDOT shared-name containment targets changed: %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old_name,v_new_name);
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
    pg_catalog.replace(v_definition,v_old_provenance,'')
  ))/pg_catalog.length(v_old_provenance);
  if v_count<>1 then
    raise exception 'Issue #97 WVDOT shared provenance target changed: %',v_count;
  end if;
  execute pg_catalog.replace(v_definition,v_old_provenance,v_new_provenance);
end
$issue97_patch_wvdot_shared_names_and_provenance$;

-- Name-change memberships can also carry measured WVDOT endpoints.
do $issue97_patch_wvdot_name_change_measure$
declare
  v_definition text;
  v_old text:=$old$
    'name_change',n.source_measure,
    case when n.source_measure is not null then n.source_measure*1609.344 end,
    pg_catalog.jsonb_build_object(
      'left_name',n.left_name,'right_name',n.right_name,
      'left_measure',n.left_measure,'right_measure',n.right_measure,
      'measure_method',case when n.source_measure is null then 'ambiguous' else 'authoritative_linear_measure' end
    ),pg_catalog.jsonb_build_object(
  $old$;
  v_new text:=$new$
    'name_change',private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
      n.source_segment_keys[1],n.source_measure
    ),
    case when n.source_measure is not null then
      private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
        n.source_segment_keys[1],n.source_measure
      )*1609.344 end,
    pg_catalog.jsonb_build_object(
      'left_name',n.left_name,'right_name',n.right_name,
      'left_measure',n.left_measure,'right_measure',n.right_measure,
      'measure_method',case when n.source_measure is null then 'ambiguous' else 'authoritative_linear_measure' end
    )||case when n.source_segment_keys[1] like 'WV:WVDOT:SEGMENT:%' then
      pg_catalog.jsonb_build_object(
        'raw_source_measure',n.source_measure,
        'source_measure_normalized',n.source_measure is distinct from
          private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(
            n.source_segment_keys[1],n.source_measure
          ),
        'endpoint_measure_normalization_bound_miles',0.0000001
      ) else '{}'::jsonb end,pg_catalog.jsonb_build_object(
  $new$;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
    pg_catalog.replace(v_definition,v_old,'')
  ))/pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 WVDOT name-change measure target changed: %',v_count;
  end if;
  execute pg_catalog.replace(v_definition,v_old,v_new);
end
$issue97_patch_wvdot_name_change_measure$;

do $issue97_verify_wvdot_endpoint_measure_precision$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;
  if v_definition not like '%raw_source_measure%'
     or v_definition not like '%brinesearch_issue97_normalize_wvdot_membership_measure%'
     or v_definition not like '%brinesearch_issue97_wvdot_name_measure_contains%'
     or v_definition not like '%c.chosen_segment_key,c.raw_source_measure,n.from_measure,n.to_measure%'
     or v_definition not like '%v.chosen_segment_key,v.raw_source_measure,n.from_measure,n.to_measure%'
     or v_definition not like '%case when v.chosen_segment_key like ''WV:WVDOT:SEGMENT:%%'' then%'
     or v_definition not like '%case when n.source_segment_keys[1] like ''WV:WVDOT:SEGMENT:%%'' then%'
     or v_definition not like '%endpoint_measure_normalization_bound_miles%'
     or v_definition not like '%source_measure_normalized%'
     or v_definition like '%similarity(%'
     or v_definition like '%<->%'
  then
    raise exception 'Issue #97 WVDOT endpoint-measure contract did not install cleanly';
  end if;
end
$issue97_verify_wvdot_endpoint_measure_precision$;

comment on function private_verification.brinesearch_issue97_normalize_wvdot_membership_measure(text,numeric) is
  'Issue #97 graph-decoration-only WVDOT lower-end M-value normalization. Bound: 1e-7 mile; raw source data is unchanged.';
comment on function private_verification.brinesearch_issue97_wvdot_name_measure_contains(text,numeric,numeric,numeric) is
  'Issue #97 exact-identity WVDOT unscoped-name containment with a 1e-7-mile endpoint precision bound.';
