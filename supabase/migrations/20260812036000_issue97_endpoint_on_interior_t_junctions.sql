-- GitHub #97 — exact authoritative endpoint-on-interior T-junction recovery.
--
-- Cologie exposed a real T-junction that the original graph missed: the final
-- Springdale Hill Rd source segment ends exactly on the interior of the official
-- Unionvale-Kenwood / CR-13 source segment. The original point-candidate builder
-- only grouped coincident stored vertices, so an endpoint landing on a different
-- segment interior could disappear even though ST_Touches=true.
--
-- Recover only the strong topology case:
--   * different authoritative road identities,
--   * an exact source endpoint intersects the other source line,
--   * the touched point is not also the other segment endpoint,
--   * the two source lines ST_Touch (not an interior/interior crossing).
-- Existing bridge/tunnel/z-level conflict checks still decide whether the candidate
-- is verified or held. Interior/interior crossings, including ordinary overpasses,
-- never enter this rule. No road name, fuzzy, or nearest-road evidence is used.
--
-- If the same coordinate/identity pair already exists as the weaker raw shared-
-- vertex candidate, prefer the stronger endpoint-on-interior proof. If the raw
-- candidate contains extra identities, preserve that broader candidate separately
-- so unrelated crossings remain held and never inherit the two-road T-junction proof.

do $issue97_patch_endpoint_on_interior$
declare
  v_definition text;
  v_cte_anchor text:= '), official_points as (';
  v_cte_insert text:= $cte$
), endpoint_hits as (
    select
      pg_catalog.round(extensions.st_x(ep.geom)::numeric,7) as lng,
      pg_catalog.round(extensions.st_y(ep.geom)::numeric,7) as lat,
      extensions.st_setsrid(extensions.st_makepoint(
        pg_catalog.round(extensions.st_x(ep.geom)::numeric,7),
        pg_catalog.round(extensions.st_y(ep.geom)::numeric,7)
      ),4326) as geom,
      a.identity_id as endpoint_identity_id,
      b.identity_id as interior_identity_id,
      a.source_segment_key as endpoint_segment_key,
      b.source_segment_key as interior_segment_key,
      ep.endpoint_role,
      least(a.state_code||':'||a.county_code,b.state_code||':'||b.county_code) as owner_scope,
      pg_catalog.jsonb_build_object(
        'source_method','exact_authoritative_endpoint_on_interior',
        'endpoint_identity_id',a.identity_id,
        'interior_identity_id',b.identity_id,
        'endpoint_segment_key',a.source_segment_key,
        'interior_segment_key',b.source_segment_key,
        'endpoint_role',ep.endpoint_role,
        'exact_point',pg_catalog.jsonb_build_array(
          extensions.st_x(ep.geom),extensions.st_y(ep.geom)
        ),
        'st_touches',true,
        'other_segment_interior',true,
        'name_used',false,
        'nearest_road_used',false
      ) as evidence
    from tmp_issue97_segments a
    cross join lateral (
      select 'start'::text as endpoint_role,extensions.st_startpoint(a.geom) as geom
      union all
      select 'end'::text,extensions.st_endpoint(a.geom)
    ) ep
    join tmp_issue97_segments b
      on a.identity_id<>b.identity_id
     and a.id<>b.id
     and ep.geom OPERATOR(extensions.&&) b.geom
     and extensions.st_intersects(ep.geom,b.geom)
     and extensions.st_touches(a.geom,b.geom)
     and not extensions.st_dwithin(
       ep.geom::extensions.geography,
       extensions.st_boundary(b.geom)::extensions.geography,
       0.03
     )
), endpoint_points as (
    select h.lng,h.lat,h.geom,
      array_agg(distinct ids.identity_id order by ids.identity_id) as identity_ids,
      '{}'::text[] as node_keys,min(h.owner_scope) as owner_scope,
      false as has_at_grade,
      'exact_authoritative_endpoint_on_interior'::text as source_method,
      0::integer as source_z_identity_count,
      null::numeric as source_z_span,
      pg_catalog.jsonb_agg(distinct h.evidence) as coordinate_evidence
    from endpoint_hits h
    cross join lateral unnest(array[h.endpoint_identity_id,h.interior_identity_id]) ids(identity_id)
    group by h.lng,h.lat,h.geom
    having count(distinct ids.identity_id)>=2
), official_points as (
$cte$;
  v_tail_anchor text:= $tail$
  from exact_points p where p.owner_scope=v_state||':'||v_county
    and not exists(
      select 1 from official_points a
      where a.lng=p.lng and a.lat=p.lat and a.identity_ids && p.identity_ids
        and 1=(select count(*) from official_points b
          where b.lng=p.lng and b.lat=p.lat and b.identity_ids && p.identity_ids)
    );
  create unique index tmp_issue97_point_candidates_key_idx
$tail$;
  v_tail_new text:= $tailnew$
  from exact_points p where p.owner_scope=v_state||':'||v_county
    and not exists(
      select 1 from official_points a
      where a.lng=p.lng and a.lat=p.lat and a.identity_ids && p.identity_ids
        and 1=(select count(*) from official_points b
          where b.lng=p.lng and b.lat=p.lat and b.identity_ids && p.identity_ids)
    )
    and not exists(
      select 1 from endpoint_points e
      where e.lng=p.lng and e.lat=p.lat
        and e.identity_ids @> p.identity_ids
        and p.identity_ids @> e.identity_ids
    )
  union all
  select 'point:endpoint-interior:'||p.lng::text||':'||p.lat::text||':'
      ||pg_catalog.md5(pg_catalog.array_to_string(p.identity_ids,',')),
    null::text,p.lng,p.lat,p.geom,p.identity_ids,p.node_keys,p.owner_scope,
    p.has_at_grade,p.source_method,false as official_conflict,
    p.source_z_identity_count,p.source_z_span,p.coordinate_evidence
  from endpoint_points p
  where p.owner_scope=v_state||':'||v_county
    and not exists(
      select 1 from official_points a
      where a.lng=p.lng and a.lat=p.lat and a.identity_ids && p.identity_ids
    );
  create unique index tmp_issue97_point_candidates_key_idx
$tailnew$;
  v_support_old text:= $support$
    (p.has_at_grade
      or count(distinct i.identity_id) filter(where i.endpoint_only)=count(distinct i.identity_id)
      or (
        count(distinct i.identity_id) filter(where i.is_identity_terminus)>=1
        and count(distinct i.identity_id) filter(where i.has_grade_evidence)
          =count(distinct i.identity_id)
      )
    ) as topology_supported
$support$;
  v_support_new text:= $supportnew$
    (p.has_at_grade
      or count(distinct i.identity_id) filter(where i.endpoint_only)=count(distinct i.identity_id)
      or (
        p.source_method='exact_authoritative_endpoint_on_interior'
        and count(distinct i.identity_id) filter(where i.is_identity_terminus)>=1
        and count(distinct i.identity_id) filter(where i.has_interior_touch)>=1
      )
      or (
        count(distinct i.identity_id) filter(where i.is_identity_terminus)>=1
        and count(distinct i.identity_id) filter(where i.has_grade_evidence)
          =count(distinct i.identity_id)
      )
    ) as topology_supported
$supportnew$;
  v_cte_count integer;
  v_tail_count integer;
  v_support_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  v_cte_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_cte_anchor,'')))
    /pg_catalog.length(v_cte_anchor);
  v_tail_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_tail_anchor,'')))
    /pg_catalog.length(v_tail_anchor);
  v_support_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_support_old,'')))
    /pg_catalog.length(v_support_old);
  if v_cte_count<>1 or v_tail_count<>1 or v_support_count<>1 then
    raise exception 'Issue #97 endpoint/interior graph patch changed unexpectedly: cte=% tail=% support=%',
      v_cte_count,v_tail_count,v_support_count;
  end if;

  v_definition:=pg_catalog.replace(v_definition,v_cte_anchor,v_cte_insert);
  v_definition:=pg_catalog.replace(v_definition,v_tail_anchor,v_tail_new);
  v_definition:=pg_catalog.replace(v_definition,v_support_old,v_support_new);
  execute v_definition;
end
$issue97_patch_endpoint_on_interior$;

revoke all on function public.brinesearch_issue97_rebuild_county_graph(text,text)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_rebuild_county_graph(text,text)
to service_role;

comment on function public.brinesearch_issue97_rebuild_county_graph(text,text) is
  'Issue #97 authoritative county graph builder. In addition to exact shared vertices and official at-grade nodes, exact authoritative road endpoints that ST_Touch another road interior are T-junction candidates. Strong endpoint-on-interior proof replaces only the identical weaker raw-vertex identity set; broader/raw crossing candidates remain separate. Existing grade-conflict checks still fail closed; interior/interior crossings, road names, fuzzy matching, and nearest-road matching never prove a junction.';
