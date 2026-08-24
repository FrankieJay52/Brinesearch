-- GitHub #97 — general shared-route continuation context.
--
-- The original transition resolver handled the common A -> B -> A concurrency
-- shape. A plain A -> B transition can also be exact when the already-resolved
-- right-hand identity has one verified shared section and the next route context
-- lies strictly outside one end of that section on one unique authoritative
-- component. Work backward so a later resolved transition may become context
-- for the preceding boundary. At the final boundary, valid pad GPS may be used
-- only as a point projected onto the already-resolved right identity; it never
-- selects a road. Names, route-number-only matching, nearest-road selection and
-- closest-anchor guessing remain forbidden.

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);

do $issue97_shared_route_right_context$
declare
  v_definition text;
  v_old text:=$old$  return pg_catalog.jsonb_build_object(
    'route_prep_id',p_route_prep_id,'road_occurrences',v_count,'transitions',v_count-1,
    'resolved',(select count(*) from private_verification.brinesearch_route_transition_receipts_issue97$old$;
  v_new text:=$new$  -- General shared-route continuation: resolve any remaining A -> B shared
  -- boundary only when the exact right-hand identity has one source-backed
  -- shared section and the next route context lies strictly outside one end of
  -- that section on one unique component. Work backward so a resolved later
  -- boundary can become exact context for the preceding boundary. At the final
  -- boundary, valid pad GPS may be used only as a point projected onto the
  -- already-resolved right identity; it never selects a road.
  if v_count>=2 then
    for v_i in reverse v_count-1..1 loop
      if not exists(
        select 1
        from private_verification.brinesearch_route_transition_receipts_issue97 t
        where t.route_prep_id=p_route_prep_id and t.boundary_index=v_i
          and t.status='held' and t.hold_reason='shared_segment_requires_sequence_context'
      ) then
        continue;
      end if;

      select r.* into strict v_left
      from private_verification.brinesearch_route_occurrence_receipts_issue97 r
      where r.route_prep_id=p_route_prep_id and r.occurrence_index=v_i;
      select r.* into strict v_right
      from private_verification.brinesearch_route_occurrence_receipts_issue97 r
      where r.route_prep_id=p_route_prep_id and r.occurrence_index=v_i+1;

      v_next:=null;
      if v_i<v_count-1 then
        select t.coordinate into v_next
        from private_verification.brinesearch_route_transition_receipts_issue97 t
        where t.route_prep_id=p_route_prep_id and t.boundary_index=v_i+1
          and t.status='resolved';
      else
        select case
          when p.latitude is not null and p.longitude is not null
            and p.latitude between -90 and 90 and p.longitude between -180 and 180
          then extensions.st_setsrid(extensions.st_makepoint(p.longitude,p.latitude),4326)
        end into v_next
        from public.pads p where p.id=v_route.pad_id;
      end if;
      if v_next is null then continue; end if;

      select count(distinct j.id)::integer into v_shared_junctions
      from public.brinesearch_road_junctions j
      join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
        and private_verification.brinesearch_issue97_graph_build_sources_current(b.id)
      where j.verification_status='verified' and j.junction_type='shared_segment'
        and exists(select 1 from public.brinesearch_road_junction_memberships m
          where m.junction_id=j.id and m.identity_id=v_left.identity_id
            and m.road_id=v_left.canonical_road_id)
        and exists(select 1 from public.brinesearch_road_junction_memberships m
          where m.junction_id=j.id and m.identity_id=v_right.identity_id
            and m.road_id=v_right.canonical_road_id);
      if v_shared_junctions<>1 then continue; end if;

      select a.id as anchor_id,a.anchor_role,a.anchor_digest,a.geom,j.id as junction_id,
        j.graph_digest,b.id as build_id,b.source_revision_digest,j.stable_junction_key
      into v_shared_a
      from public.brinesearch_road_junction_anchors a
      join public.brinesearch_road_junctions j on j.id=a.junction_id
        and j.verification_status='verified' and j.junction_type='shared_segment'
      join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
        and private_verification.brinesearch_issue97_graph_build_sources_current(b.id)
      where a.anchor_role='shared_start'
        and exists(select 1 from public.brinesearch_road_junction_memberships m
          where m.junction_id=j.id and m.identity_id=v_left.identity_id
            and m.road_id=v_left.canonical_road_id)
        and exists(select 1 from public.brinesearch_road_junction_memberships m
          where m.junction_id=j.id and m.identity_id=v_right.identity_id
            and m.road_id=v_right.canonical_road_id)
      order by j.id limit 1;
      if v_shared_a.anchor_id is null then continue; end if;
      select a.id as anchor_id,a.anchor_role,a.anchor_digest,a.geom,j.id as junction_id,
        j.graph_digest,b.id as build_id,b.source_revision_digest,j.stable_junction_key
      into v_shared_b
      from public.brinesearch_road_junction_anchors a
      join public.brinesearch_road_junctions j on j.id=a.junction_id
      join public.brinesearch_road_graph_builds b on b.id=j.build_id
      where j.id=v_shared_a.junction_id and a.anchor_role='shared_end'
      limit 1;
      if v_shared_b.anchor_id is null then continue; end if;

      v_outer_geom:=private_verification.brinesearch_issue97_authoritative_identity_geometry(v_right.identity_id);
      if v_outer_geom is null or extensions.st_isempty(v_outer_geom) then continue; end if;
      select count(*)::integer into v_component_count
      from (
        select (d).geom
        from extensions.st_dump(extensions.st_linemerge(v_outer_geom)) d
      ) parts
      where extensions.geometrytype(parts.geom)='LINESTRING'
        and extensions.st_dwithin(parts.geom::extensions.geography,v_shared_a.geom::extensions.geography,1)
        and extensions.st_dwithin(parts.geom::extensions.geography,v_shared_b.geom::extensions.geography,1)
        and extensions.st_dwithin(parts.geom::extensions.geography,v_next::extensions.geography,
          case when v_i=v_count-1 then 50 else 1 end);
      if v_component_count<>1 then continue; end if;
      select parts.geom into v_line
      from (
        select (d).geom
        from extensions.st_dump(extensions.st_linemerge(v_outer_geom)) d
      ) parts
      where extensions.geometrytype(parts.geom)='LINESTRING'
        and extensions.st_dwithin(parts.geom::extensions.geography,v_shared_a.geom::extensions.geography,1)
        and extensions.st_dwithin(parts.geom::extensions.geography,v_shared_b.geom::extensions.geography,1)
        and extensions.st_dwithin(parts.geom::extensions.geography,v_next::extensions.geography,
          case when v_i=v_count-1 then 50 else 1 end);

      v_next_snap:=extensions.st_closestpoint(v_line,v_next);
      v_a_snap:=extensions.st_closestpoint(v_line,v_shared_a.geom);
      v_b_snap:=extensions.st_closestpoint(v_line,v_shared_b.geom);
      v_fn:=extensions.st_linelocatepoint(v_line,v_next_snap);
      v_fa:=extensions.st_linelocatepoint(v_line,v_a_snap);
      v_fb:=extensions.st_linelocatepoint(v_line,v_b_snap);
      if pg_catalog.abs(v_fa-v_fb)<1e-12 then continue; end if;
      if v_fn<least(v_fa,v_fb)-1e-9 then
        if v_fa<v_fb then v_entry:=v_shared_a; else v_entry:=v_shared_b; end if;
      elsif v_fn>greatest(v_fa,v_fb)+1e-9 then
        if v_fa>v_fb then v_entry:=v_shared_a; else v_entry:=v_shared_b; end if;
      else
        continue;
      end if;

      update private_verification.brinesearch_route_transition_receipts_issue97 set
        status='resolved',resolution_method='shared_segment_right_continuation_context',
        hold_reason=null,junction_id=v_entry.junction_id,anchor_id=v_entry.anchor_id,
        anchor_role=v_entry.anchor_role,coordinate=v_entry.geom,candidate_count=2,
        graph_build_id=v_entry.build_id,graph_digest=v_entry.graph_digest,
        source_revision_digest=v_entry.source_revision_digest,anchor_digest=v_entry.anchor_digest,
        resolved_at=now(),updated_at=now(),
        evidence=coalesce(evidence,'{}'::jsonb)||pg_catalog.jsonb_build_object(
          'shared_segment_sequence','A->B',
          'right_context_kind',case when v_i=v_count-1 then 'pad_gps' else 'next_resolved_transition' end,
          'right_context_fraction',v_fn,'shared_start_fraction',v_fa,'shared_end_fraction',v_fb,
          'right_context_outside_shared_interval',true,
          'selection_uses_exact_right_identity',true,'selection_uses_route_sequence',true,
          'selection_uses_name_similarity',false,'selection_uses_nearest_road',false,
          'selection_uses_route_number_alone',false
        ),
        receipt_digest=pg_catalog.md5(dependency_digest||
          '|resolved|shared_segment_right_continuation_context|'||v_entry.anchor_id::text)
      where route_prep_id=p_route_prep_id and boundary_index=v_i;
      perform private_verification.brinesearch_issue97_write_transition_history(p_route_prep_id,v_i);
    end loop;
  end if;

  return pg_catalog.jsonb_build_object(
    'route_prep_id',p_route_prep_id,'road_occurrences',v_count,'transitions',v_count-1,
    'resolved',(select count(*) from private_verification.brinesearch_route_transition_receipts_issue97$new$;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_transition_receipts(uuid)'::pg_catalog.regprocedure
  ) into strict v_definition;
  if pg_catalog.md5(v_definition)<>'8b37717bede32c6f20dc3dff347cabdb' then
    raise exception 'Issue #97 shared-route context expected transition definition 8b37717b; found %',
      pg_catalog.md5(v_definition);
  end if;
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
    pg_catalog.replace(v_definition,v_old,'')
  ))/pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 shared-route continuation insertion anchor changed: %',v_count;
  end if;
  execute pg_catalog.replace(v_definition,v_old,v_new);

  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_transition_receipts(uuid)'::pg_catalog.regprocedure
  ) into strict v_definition;
  if pg_catalog.md5(v_definition)<>'726a3f20e3da280b59c311f3cdb6b254'
     or v_definition not like '%shared_segment_right_continuation_context%'
     or v_definition not like '%right_context_outside_shared_interval%'
     or v_definition not like '%selection_uses_exact_right_identity%'
     or v_definition not like '%selection_uses_nearest_road'',false%' then
    raise exception 'Issue #97 shared-route right-context patch did not install exactly';
  end if;
end
$issue97_shared_route_right_context$;

comment on function private_verification.brinesearch_issue97_refresh_transition_receipts(uuid) is
  'Issue #97 exact transition resolver. Shared sections support A->B->A plus fail-closed generic A->B right-continuation context from exact route sequence and the already-resolved right identity; pad GPS can disambiguate only the final boundary on that exact identity. Names, route-number-only, nearest-road and closest-anchor guessing remain forbidden.';
