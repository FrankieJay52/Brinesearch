-- Close two Issue #97 receipt-ordering gaps without widening any API surface.
--
-- 1. Hash the exact numeric(12,6) mileage representation persisted in the
--    occurrence geometry receipt. In particular, an origin anchor is stored
--    as 0.000000, not the pre-coercion text value 0.
-- 2. Rebuild each scoped route receipt after the final Google refresh so its
--    cached Google manifest fields describe the receipt just written.

create or replace function private_verification.brinesearch_issue97_refresh_route_geometry(
  p_route_prep_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_route record;v_pad record;v_count integer:=0;v_i integer;v_occ record;v_road record;
  v_start_transition record;v_end_transition record;v_start extensions.geometry;v_end extensions.geometry;
  v_pad_point extensions.geometry;v_master extensions.geometry;v_clip jsonb;v_step_geom extensions.geometry;
  v_prev_geom extensions.geometry;v_turn_json jsonb;v_saved_maneuver text;v_saved_turn text;v_turn text;v_reverse text;
  v_delta numeric;v_turn_source text;v_hold text;v_role text;v_method text;v_miles numeric;v_stored_miles numeric(12,6);v_road_digest text;
  v_start_digest text;v_end_digest text;v_pad_digest text;v_dependency text;v_evidence jsonb;v_receipt text;
begin
  select p.* into strict v_route from public.brinesearch_route_prep p where p.id=p_route_prep_id;
  select pad.* into strict v_pad from public.pads pad where pad.id=v_route.pad_id;
  delete from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 where route_prep_id=p_route_prep_id;
  if not v_route.active then return pg_catalog.jsonb_build_object('status','stale'); end if;
  select count(*) into v_count from private_verification.brinesearch_route_occurrence_receipts_issue97 where route_prep_id=p_route_prep_id;
  if v_route.readiness_status<>'ready_for_road_matching' then
    return pg_catalog.jsonb_build_object('status','held','reason','route_prep_not_ready_for_road_matching');
  end if;
  if v_count<2 then return pg_catalog.jsonb_build_object('status','held','reason','single_or_empty_road_sequence_requires_explicit_endpoints'); end if;
  if exists(select 1 from private_verification.brinesearch_route_occurrence_receipts_issue97 r where r.route_prep_id=p_route_prep_id and (r.resolution_status<>'resolved' or r.canonical_road_id is null)) then
    return pg_catalog.jsonb_build_object('status','held','reason','authoritative_occurrence_identity_incomplete');
  end if;
  if (select count(*) from private_verification.brinesearch_route_transition_receipts_issue97 t where t.route_prep_id=p_route_prep_id and t.status='resolved')<>v_count-1 then
    return pg_catalog.jsonb_build_object('status','held','reason','exact_transition_receipts_incomplete');
  end if;
  if nullif(btrim(coalesce(v_route.highway_anchor_text,'')),'') is null then
    return pg_catalog.jsonb_build_object('status','held','reason','origin_highway_anchor_missing');
  end if;

  if v_pad.latitude between -90 and 90 and v_pad.longitude between -180 and 180 then
    v_pad_point:=extensions.st_setsrid(extensions.st_makepoint(v_pad.longitude,v_pad.latitude),4326);
    v_pad_digest:=md5(pg_catalog.concat_ws('|',v_pad.longitude::text,v_pad.latitude::text));
  else
    v_pad_point:=null;v_pad_digest:=null;
  end if;

  for v_i in 1..v_count loop
    select r.*,s.distance_miles,s.turn_direction into strict v_occ
    from private_verification.brinesearch_route_occurrence_receipts_issue97 r
    join public.brinesearch_route_prep_steps s on s.id=r.route_prep_step_id
    where r.route_prep_id=p_route_prep_id and r.occurrence_index=v_i;
    select road.* into strict v_road from public.brinesearch_roads road where road.id=v_occ.canonical_road_id;
    v_road_digest:=private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(v_occ.identity_id);
    v_start:=null;v_end:=null;v_step_geom:=null;v_miles:=null;v_stored_miles:=null;v_hold:=null;v_turn:=null;v_reverse:=null;
    v_delta:=null;v_turn_source:=null;v_start_digest:=null;v_end_digest:=null;v_method:=null;v_evidence:='{}'::jsonb;

    if v_i=1 then
      select * into strict v_end_transition from private_verification.brinesearch_route_transition_receipts_issue97 where route_prep_id=p_route_prep_id and boundary_index=1 and status='resolved';
      if v_occ.distance_miles is not null and v_occ.distance_miles>0 or nullif(btrim(coalesce(v_occ.turn_direction,'')),'') is not null then
        v_hold:='origin_occurrence_contains_travel_evidence_requires_explicit_start';
        v_role:='origin_anchor';v_start:=v_end_transition.coordinate;v_end:=v_end_transition.coordinate;
      else
        v_role:='origin_anchor';v_start:=v_end_transition.coordinate;v_end:=v_end_transition.coordinate;
        v_miles:=0;v_method:='origin_anchor_exact_first_transition';v_end_digest:=v_end_transition.receipt_digest;
      end if;
    else
      v_role:='traveled';
      select * into strict v_start_transition from private_verification.brinesearch_route_transition_receipts_issue97 where route_prep_id=p_route_prep_id and boundary_index=v_i-1 and status='resolved';
      v_start:=v_start_transition.coordinate;v_start_digest:=v_start_transition.receipt_digest;
      if v_i<v_count then
        select * into strict v_end_transition from private_verification.brinesearch_route_transition_receipts_issue97 where route_prep_id=p_route_prep_id and boundary_index=v_i and status='resolved';
        v_end:=v_end_transition.coordinate;v_end_digest:=v_end_transition.receipt_digest;
      else
        if v_pad_point is null then v_hold:='verified_pad_gps_missing_or_invalid';
        else
          v_master:=private_verification.brinesearch_issue97_authoritative_identity_geometry(v_occ.identity_id);
          if v_master is null or not extensions.st_dwithin(v_master::extensions.geography,v_pad_point::extensions.geography,1) then
            v_hold:='verified_pad_gps_not_on_final_authoritative_geometry';
          else v_end:=v_pad_point; end if;
        end if;
      end if;

      if v_hold is null then
        v_clip:=private_verification.brinesearch_issue97_clip_exact_authoritative_occurrence(v_occ.identity_id,v_occ.canonical_road_id,v_start,v_end);
        if not coalesce((v_clip->>'resolved')::boolean,false) then v_hold:='clip_'||coalesce(v_clip->>'reason','failed');
        else
          v_step_geom:=extensions.st_setsrid(extensions.st_geomfromgeojson((v_clip->'clipped_geometry')::text),4326);
          v_miles:=(v_clip->>'miles')::numeric;v_method:='issue69_equivalent_exact_component_clip';
        end if;
      end if;

      if v_hold is null then
        select d.maneuver_class into v_saved_maneuver from public.brinesearch_direction_step_intelligence d
        where d.pad_id=v_route.pad_id and d.step_order=v_occ.source_step_order limit 1;
        v_saved_turn:=private_verification.brinesearch_issue97_normalize_saved_turn(coalesce(v_occ.turn_direction,v_saved_maneuver));
        if v_i=2 then
          if v_saved_turn is null then v_hold:='origin_turn_direction_not_authoritative';
          else v_turn:=v_saved_turn;v_turn_source:='saved_direction_step_intelligence'; end if;
        else
          select step_geometry into v_prev_geom from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97
          where route_prep_id=p_route_prep_id and occurrence_index=v_i-1 and status='resolved' and occurrence_role='traveled';
          v_turn_json:=private_verification.brinesearch_issue97_geometry_turn(v_prev_geom,v_step_geom);
          if not coalesce((v_turn_json->>'resolved')::boolean,false) then
            if v_turn_json->>'reason'='turn_angle_ambiguous' and v_saved_turn is not null then
              v_turn:=v_saved_turn;
              v_delta:=nullif(v_turn_json->>'delta_degrees','')::numeric;
              v_turn_source:='saved_direction_exact_geometry_angle_ambiguous';
            else
              v_hold:='geometry_'||coalesce(v_turn_json->>'reason','turn_unresolved');
            end if;
          else
            v_turn:=v_turn_json->>'turn';v_delta=(v_turn_json->>'delta_degrees')::numeric;v_turn_source:='exact_adjacent_step_geometry';
            if v_saved_turn is not null and v_saved_turn<>v_turn then v_hold:='geometry_turn_conflicts_saved_direction'; end if;
          end if;
        end if;
        if v_hold is null then v_reverse:=private_verification.brinesearch_issue97_reverse_turn(v_turn); end if;
      end if;
    end if;

    v_dependency:=md5(pg_catalog.concat_ws('|',v_occ.receipt_digest,v_road_digest,coalesce(v_start_digest,''),coalesce(v_end_digest,''),coalesce(v_pad_digest,''),coalesce(v_method,''),coalesce(v_hold,''),coalesce(v_turn,''),coalesce(v_reverse,'')));
    v_evidence:=v_evidence||pg_catalog.jsonb_build_object('occurrence_role',v_role,'road_geometry_status',v_road.geometry_status,'saved_maneuver',v_saved_maneuver,'turn_source',v_turn_source,'clip_receipt',coalesce(v_clip,'{}'::jsonb),'pad_endpoint_tolerance_m',case when v_i=v_count then 1 else null end,'selection_uses_nearest_road',false,'selection_uses_name_similarity',false);
    v_stored_miles:=coalesce(v_miles,case when v_role='origin_anchor' and v_hold is null then 0 else null end)::numeric(12,6);
    v_receipt:=md5(pg_catalog.concat_ws('|',v_dependency,case when v_hold is null then 'resolved' else 'held' end,coalesce(v_hold,''),coalesce(v_stored_miles::text,''),coalesce(v_turn,''),coalesce(v_evidence::text,'{}')));

    insert into private_verification.brinesearch_route_occurrence_geometry_receipts_issue97(
      route_prep_step_id,route_prep_id,pad_id,route_group,variant_index,occurrence_index,source_step_order,occurrence_role,identity_id,road_id,status,geometry_method,hold_reason,start_coordinate,end_coordinate,step_geometry,geometry_miles,outbound_turn,inbound_turn,turn_source,turn_delta_degrees,road_geometry_digest,start_transition_digest,end_transition_digest,pad_coordinate_digest,dependency_digest,evidence,receipt_digest,resolved_at
    ) values(v_occ.route_prep_step_id,p_route_prep_id,v_route.pad_id,v_route.route_group,v_route.variant_index,v_i,v_occ.source_step_order,v_role,v_occ.identity_id,v_occ.canonical_road_id,case when v_hold is null then 'resolved' else 'held' end,v_method,v_hold,v_start,v_end,v_step_geom,v_stored_miles,v_turn,v_reverse,v_turn_source,v_delta,v_road_digest,v_start_digest,v_end_digest,v_pad_digest,v_dependency,v_evidence,v_receipt,case when v_hold is null then now() else null end);
    perform private_verification.brinesearch_issue97_write_geometry_history(v_occ.route_prep_step_id);
  end loop;

  return pg_catalog.jsonb_build_object('route_prep_id',p_route_prep_id,'occurrences',v_count,
    'resolved',(select count(*) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 where route_prep_id=p_route_prep_id and status='resolved'),
    'held',(select count(*) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 where route_prep_id=p_route_prep_id and status='held'),
    'holds_by_reason',coalesce((select jsonb_object_agg(hold_reason,cnt order by hold_reason) from (select hold_reason,count(*) cnt from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 where route_prep_id=p_route_prep_id and status='held' group by hold_reason) q),'{}'::jsonb));
end
$$;

alter function private_verification.brinesearch_issue97_refresh_route_geometry(uuid)
owner to postgres;
revoke all on function private_verification.brinesearch_issue97_refresh_route_geometry(uuid)
from public,anon,authenticated,service_role;
grant execute on function private_verification.brinesearch_issue97_refresh_route_geometry(uuid)
to postgres;
comment on function private_verification.brinesearch_issue97_refresh_route_geometry(uuid) is
  'Issue #97 occurrence geometry/turn materializer. Clear exact geometry maneuvers remain authoritative and conflicts fail closed. Only an exact contiguous geometry result held solely for turn_angle_ambiguous may use an explicit saved turn; missing geometry never falls back to text.';

create or replace function public.brinesearch_issue97_run_all_pad_routing_pipeline(
  p_pad_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_core jsonb;
  v_google jsonb;
  v_route record;
begin
  v_core:=public.brinesearch_issue97_run_all_pad_routing_pipeline_geometry_core(p_pad_id);
  v_google:=public.brinesearch_issue97_refresh_google_routes(p_pad_id);

  -- Google refreshes after geometry_core's receipt pass. Re-run the scoped
  -- final receipt projection so cached Google state cannot remain stale.
  for v_route in
    select route.id
    from public.brinesearch_route_prep route
    where route.active
      and (p_pad_id is null or route.pad_id=p_pad_id)
    order by route.pad_id,route.route_group,route.variant_index,route.id
  loop
    perform private_verification.brinesearch_issue97_refresh_route_receipt(v_route.id);
  end loop;

  return coalesce(v_core,'{}'::jsonb)||pg_catalog.jsonb_build_object(
    'google_routes',v_google,
    'pipeline_complete_through_google_manifest',true,
    'manual_map_editor','review_exception_qa_only'
  );
end
$$;

alter function public.brinesearch_issue97_run_all_pad_routing_pipeline(uuid)
owner to postgres;
revoke all on function public.brinesearch_issue97_run_all_pad_routing_pipeline(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.brinesearch_issue97_run_all_pad_routing_pipeline(uuid)
to postgres,service_role;
comment on function public.brinesearch_issue97_run_all_pad_routing_pipeline(uuid) is
  'Issue #97 complete service pipeline: route corpus reconciliation -> transition anchors -> occurrence geometry -> route receipts -> ready/held Google navigation manifests.';
