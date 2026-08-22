-- GitHub #97 — route-level readiness must follow current #97 occurrence geometry,
-- not the older brinesearch_pad_roads publication ledger.
--
-- BAKOS proved the mismatch: its exact authoritative occurrence identities,
-- canonical mappings, exact transition, and both occurrence-geometry receipts are
-- resolved, yet the top-level route receipt still reported exact_geometry_count=0
-- because it counted only legacy #69 brinesearch_pad_roads rows.
--
-- This patch keeps #69 publication intact. It changes only the #97 route-readiness
-- receipt so its exact-geometry gate uses the newer authoritative occurrence
-- geometry receipts, while requiring each geometry receipt to match the same
-- resolved identity/canonical road and the exact transition receipt digests.
-- Geometry + transition receipt digests also become route-receipt dependencies.

do $issue97_patch_route_receipt_authoritative_geometry$
declare
  v_definition text;
  v_old_geometry text:=$old$
    select count(*) into v_geometry
    from private_verification.brinesearch_route_occurrence_receipts_issue97 rr
    join public.brinesearch_pad_roads pr
      on pr.pad_id=v_route.pad_id and pr.route_group='primary' and pr.route_variant_index=0
      and pr.step_order=rr.occurrence_index and pr.road_id=rr.canonical_road_id
    join public.brinesearch_roads road on road.id=pr.road_id
    where rr.route_prep_id=p_route_prep_id and rr.resolution_status='resolved'
      and pr.route_revision=v_route.structured_route_revision
      and pr.start_point is not null and pr.end_point is not null and pr.step_geometry is not null
      and pr.geometry_source='road_manager_clip_issue69' and pr.geometry_status='snapped_intersections'
      and pr.road_geometry_digest=pg_catalog.md5(road.centerline_geojson::text)
      and road.centerline_geojson is not null;
$old$;
  v_new_geometry text:=$new$
    select count(*) into v_geometry
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
    join private_verification.brinesearch_route_occurrence_receipts_issue97 rr
      on rr.route_prep_step_id=g.route_prep_step_id
      and rr.route_prep_id=g.route_prep_id
      and rr.occurrence_index=g.occurrence_index
    where g.route_prep_id=p_route_prep_id
      and g.status='resolved' and rr.resolution_status='resolved'
      and g.identity_id=rr.identity_id and g.road_id=rr.canonical_road_id
      and g.route_group=v_route.route_group and g.variant_index=v_route.variant_index
      and (
        (g.occurrence_index=1 and g.occurrence_role='origin_anchor'
          and g.step_geometry is null and g.geometry_miles=0
          and (v_occurrences=1 or exists(
            select 1 from private_verification.brinesearch_route_transition_receipts_issue97 t
            where t.route_prep_id=p_route_prep_id and t.boundary_index=1
              and t.status='resolved' and t.receipt_digest=g.end_transition_digest
          )))
        or
        (g.occurrence_index>1 and g.occurrence_role='traveled'
          and g.step_geometry is not null and g.geometry_miles>0
          and exists(
            select 1 from private_verification.brinesearch_route_transition_receipts_issue97 t
            where t.route_prep_id=p_route_prep_id
              and t.boundary_index=g.occurrence_index-1
              and t.status='resolved' and t.receipt_digest=g.start_transition_digest
          )
          and (g.occurrence_index=v_occurrences or exists(
            select 1 from private_verification.brinesearch_route_transition_receipts_issue97 t
            where t.route_prep_id=p_route_prep_id
              and t.boundary_index=g.occurrence_index
              and t.status='resolved' and t.receipt_digest=g.end_transition_digest
          )))
      );
$new$;
  v_old_dependency text:=$olddep$
    coalesce((select pg_catalog.string_agg(receipt_digest,',' order by occurrence_index)
      from private_verification.brinesearch_route_occurrence_receipts_issue97
      where route_prep_id=p_route_prep_id),''),coalesce(v_manifest,'')
$olddep$;
  v_new_dependency text:=$newdep$
    coalesce((select pg_catalog.string_agg(receipt_digest,',' order by occurrence_index)
      from private_verification.brinesearch_route_occurrence_receipts_issue97
      where route_prep_id=p_route_prep_id),''),
    coalesce((select pg_catalog.string_agg(receipt_digest,',' order by boundary_index)
      from private_verification.brinesearch_route_transition_receipts_issue97
      where route_prep_id=p_route_prep_id),''),
    coalesce((select pg_catalog.string_agg(receipt_digest,',' order by occurrence_index)
      from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97
      where route_prep_id=p_route_prep_id),''),
    coalesce(v_manifest,'')
$newdep$;
  v_geometry_count integer;
  v_dependency_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_route_receipt(uuid)'::pg_catalog.regprocedure
  ) into v_definition;
  v_geometry_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old_geometry,'')))/pg_catalog.length(v_old_geometry);
  v_dependency_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old_dependency,'')))/pg_catalog.length(v_old_dependency);
  if v_geometry_count<>1 or v_dependency_count<>1 then
    raise exception 'Issue #97 route receipt authoritative geometry patch drifted: geometry %, dependency %',v_geometry_count,v_dependency_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old_geometry,v_new_geometry);
  v_definition:=pg_catalog.replace(v_definition,v_old_dependency,v_new_dependency);
  execute v_definition;
end
$issue97_patch_route_receipt_authoritative_geometry$;

do $issue97_verify_route_receipt_authoritative_geometry$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_route_receipt(uuid)'::pg_catalog.regprocedure
  ) into v_definition;
  if v_definition not like '%brinesearch_route_occurrence_geometry_receipts_issue97 g%'
     or v_definition not like '%g.identity_id=rr.identity_id and g.road_id=rr.canonical_road_id%'
     or v_definition not like '%t.receipt_digest=g.start_transition_digest%'
     or v_definition not like '%t.receipt_digest=g.end_transition_digest%'
     or v_definition not like '%string_agg(receipt_digest,'','' order by boundary_index)%'
     or v_definition like '%join public.brinesearch_pad_roads pr%'
  then
    raise exception 'Issue #97 authoritative route receipt geometry gate did not install cleanly';
  end if;
end
$issue97_verify_route_receipt_authoritative_geometry$;
