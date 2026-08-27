-- BILINOVICH owner field correction: Blaze Road is not an inbound road.
--
-- This migration changes one reviewed display row only. It does not create
-- structured route steps or geometry, reconcile a route, release a graph or
-- destination, publish Google output, or enable cutover. The exact public-road
-- chain is restored from the immutable saved note and independently confirmed
-- Guernsey/ODOT/OGRIP topology. The private terminal connection stays held.

set transaction isolation level repeatable read;
set local statement_timeout='5min';
set local lock_timeout='5s';

do $lock_target$
begin
  perform 1 from public.pads pad
  where pad.id='59061829-1122-4aae-872d-cf5024310373'
  for update;
  if not found then raise exception 'BILINOVICH pad row is missing'; end if;

  perform 1 from public.pad_verification_status verification
  where verification.pad_id='59061829-1122-4aae-872d-cf5024310373'
  for update;
  if not found then raise exception 'BILINOVICH verification row is missing'; end if;

  perform 1 from public.brinesearch_driver_route_reference reference
  where reference.pad_id='59061829-1122-4aae-872d-cf5024310373'
  for update;
  if not found then raise exception 'BILINOVICH route-reference row is missing'; end if;
end
$lock_target$;

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:v18:directory-snapshot',18)
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:v18:company-road-overlay',18)
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
    'brinesearch:pad:59061829-1122-4aae-872d-cf5024310373:reviewed-directions',
    18
  )
);

create temporary table tmp_bilinovich_no_blaze_expected(
  pad_id uuid primary key,
  revision text not null,
  installed_at timestamptz not null,
  old_sequence text not null,
  old_clear text not null,
  old_method text not null,
  new_sequence text not null,
  new_clear text not null,
  new_method text not null
) on commit drop;

insert into tmp_bilinovich_no_blaze_expected values (
  '59061829-1122-4aae-872d-cf5024310373',
  '2026-08-27-bilinovich-no-blaze-reviewed-display-v1',
  pg_catalog.transaction_timestamp(),
  'I-70 W → Exit 193 → OH-513 N → US-22 E → McCoy Rd → Blaze Rd → Logan Rd → Turkle Rd / lease access → BILINOVICH',
  $old_clear$Road sequence reference:
I-70 W → Exit 193 → OH-513 N → US-22 E → McCoy Rd → Blaze Rd → Logan Rd → Turkle Rd / lease access → BILINOVICH

Step-by-step directions:
1. From Saint Clairsville, travel west on I-70.
2. Take Exit 193 toward OH-513. Ramp reference: 40.05399000, -81.32158450.
3. At the ramp/OH-513 junction, turn right/north onto OH-513: 40.05308330, -81.32532670.
4. At US-22, turn right/east: 40.12053090, -81.35869280.
5. Turn right/southeast from US-22 onto McCoy Road: 40.12330216, -81.35434374. Google-safe point inside McCoy: 40.12303995, -81.35382341.
6. At the McCoy/Blaze fork, turn right/south onto Blaze Road. Do not continue east toward McCoy/Merry. Physical turn: 40.112922973, -81.294912730. Google-safe after-turn point (37.7 meters inside Blaze): 40.112583770, -81.294937982.
7. Continue on Blaze to the Blaze/Penrose/Logan junction, then continue generally south onto Logan Road. Physical junction: 40.099937405, -81.298003204. Google-safe point inside Logan: 40.09955931, -81.29781917.
8. Continue on Logan to Turkle Road/pad access. Physical junction: 40.088758168, -81.300650392. Google-safe point inside Turkle: 40.08865270, -81.30095089.
9. At the saved lease-road approach, follow the saved lease access and posted site signs: 40.08863000, -81.30416400. This point is not a verified public-road entrance or approved lease geometry.
10. BILINOVICH pad/wellhead-area reference: 40.08738445, -81.30282620. This ODNR-derived pad-surface reference is not a verified public-road entrance.$old_clear$,
  'Owner-corrected exact-GPS reviewed display route 2026-08-26. Guernsey County Road Centerline layer 84 confirms McCoy Rd (CR-82), Blaze Rd (TR-964), Logan Rd (CR-964), and Turkle Rd (TR-693). ODNR WellPads ObjectID 792 and exact APIs 34-059-2-4567-00-00, 34-059-2-4568-00-00, and 34-059-2-4569-00-00 support the pad-surface reference. Physical junctions are owner reviewed; Google-safe points are shaping-only. Display guidance only; route, graph, destination, and Google authority remain held.',
  'US-22 E → McCoy Rd / CR-82 → Merry Rd / TR-967 → Penrose Rd / CR-694 → Logan Rd / CR-964 → Turkle Rd / TR-693 → trusted lease approach → BILINOVICH',
  $new_clear$Road sequence reference:
US-22 E → McCoy Rd / CR-82 → Merry Rd / TR-967 → Penrose Rd / CR-694 → Logan Rd / CR-964 → Turkle Rd / TR-693 → trusted lease approach → BILINOVICH

Reviewed road-core directions:
1. From US-22, turn onto McCoy Rd / CR-82 at 40.123302156, -81.354343744.
2. Continue about 4.48 miles on McCoy Rd.
3. Continue almost straight/slight right onto Merry Rd / TR-967 at 40.105411505, -81.279736209. Continue about 0.72 mile.
4. Turn right onto Penrose Rd / CR-694 at 40.095844622, -81.283646191. Continue about 0.90 mile to the T.
5. At 40.099937405, -81.298003204, turn left onto Logan Rd / CR-964. Do not take Blaze Rd, the right-hand branch.
6. Continue about 0.88 mile on Logan Rd.
7. Continue almost straight onto Turkle Rd / TR-693 at 40.088758168, -81.300650392.
8. Continue about 0.19 mile toward the saved BrineSearch lease-approach coordinate: 40.088630000, -81.304164000.
9. The nearest official Turkle centerline point is 40.088789769, -81.303990829, about 23.1 meters from the saved approach.
10. The ODNR-derived BILINOVICH pad-surface reference is 40.08738445, -81.30282620. It is not a verified public-road entrance.
11. The private connection from Turkle/the saved approach to the pad surface remains unverified. Use GPS destination and posted site signs; do not treat that terminal gap as approved route geometry.$new_clear$,
  'Owner field correction 2026-08-27: Blaze Road is excluded. Reviewed display road core is backed by the immutable saved McCoy-Merry-Penrose-Logan note and exact Guernsey County layer 84, ODOT 2025 Road Inventory, and OGRIP LBRS topology for SGUEUS00022**C, CGUECR00082**C, TGUETR00967**C, CGUECR00694**C, CGUECR00964**C, and TGUETR00693**C. The saved lease approach is 23.1 m off the official Turkle centerline and the pad-surface reference remains a destination reference only. Display guidance only; structured route, geometry, graph, destination, Google, and cutover authority remain held.'
);

create temporary table tmp_bilinovich_no_blaze_before on commit drop as
select
  pg_catalog.to_jsonb(pad) as pad_row,
  pg_catalog.to_jsonb(verification) as verification_row,
  pg_catalog.to_jsonb(reference) as reference_row,
  pg_catalog.to_jsonb(detail) as public_detail_row,
  public.brinesearch_v18_driver_pad_status(pad.id) as driver_status,
  public.brinesearch_v18_driver_pad_status_with_named_approaches(pad.id)
    as atomic_bundle,
  (select pg_catalog.count(*) from public.pad_edit_history history
    where history.pad_id=pad.id) as audit_count,
  (select last_value from public.pad_edit_history_id_seq) as audit_last_value,
  (select is_called from public.pad_edit_history_id_seq) as audit_is_called,
  (select pg_catalog.to_jsonb(snapshot)
    from public.brinesearch_directory_snapshots_v18 snapshot
    where snapshot.publication_state='current') as directory_row,
  (select pg_catalog.to_jsonb(snapshot)
    from public.brinesearch_company_road_overlay_snapshots_v18 snapshot
    where snapshot.publication_state='current') as overlay_row,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(row_value)::text,'|'
    order by pg_catalog.to_jsonb(row_value)::text),''))
    from public.pads row_value where row_value.id<>pad.id) as non_target_pad_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(row_value)::text,'|'
    order by pg_catalog.to_jsonb(row_value)::text),''))
    from public.public_pad_detail row_value where row_value.id<>pad.id)
    as non_target_public_detail_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(row_value)::text,'|'
    order by pg_catalog.to_jsonb(row_value)::text),''))
    from public.pad_verification_status row_value where row_value.pad_id<>pad.id)
    as non_target_verification_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(row_value)::text,'|'
    order by pg_catalog.to_jsonb(row_value)::text),''))
    from public.brinesearch_driver_route_reference row_value
    where row_value.pad_id<>pad.id) as non_target_reference_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(snapshot)::text,'|'
    order by pg_catalog.to_jsonb(snapshot)::text),''))
    from public.brinesearch_directory_snapshots_v18 snapshot
    where snapshot.snapshot_id<>'66a66928-d78f-4dc2-9153-d2796a830ddc')
    as other_directory_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(snapshot)::text,'|'
    order by pg_catalog.to_jsonb(snapshot)::text),''))
    from public.brinesearch_company_road_overlay_snapshots_v18 snapshot
    where snapshot.snapshot_id<>'b4e9b847-449a-4b86-9206-9c6743b6c141')
    as other_overlay_digest,
  (select pg_catalog.to_jsonb(release_row)-'updated_at'
    from public.brinesearch_issue97_release_state release_row
    where release_row.singleton) as release_authority
from public.pads pad
join public.pad_verification_status verification on verification.pad_id=pad.id
join public.brinesearch_driver_route_reference reference on reference.pad_id=pad.id
join public.public_pad_detail detail on detail.id=pad.id
where pad.id='59061829-1122-4aae-872d-cf5024310373';

create temporary table tmp_bilinovich_no_blaze_protected(
  relation pg_catalog.regclass primary key,
  digest text not null
) on commit drop;

do $capture_protected$
declare
  v_relation pg_catalog.regclass;
  v_digest text;
begin
  foreach v_relation in array array[
    'public.brinesearch_direction_step_intelligence'::pg_catalog.regclass,
    'public.brinesearch_directory_snapshot_rows_v18'::pg_catalog.regclass,
    'public.brinesearch_directory_snapshot_well_rows_v18'::pg_catalog.regclass,
    'public.brinesearch_company_road_overlay_rows_v18'::pg_catalog.regclass,
    'private_verification.brinesearch_v18_company_road_overlay_releases'::pg_catalog.regclass,
    'public.brinesearch_road_graph_builds'::pg_catalog.regclass,
    'public.brinesearch_route_prep'::pg_catalog.regclass,
    'public.brinesearch_route_prep_steps'::pg_catalog.regclass,
    'private_verification.brinesearch_route_occurrence_receipts_issue97'::pg_catalog.regclass,
    'private_verification.brinesearch_route_occurrence_geometry_receipts_issue97'::pg_catalog.regclass,
    'private_verification.brinesearch_route_occurrence_geometry_history_issue97'::pg_catalog.regclass,
    'private_verification.brinesearch_route_transition_receipts_issue97'::pg_catalog.regclass,
    'private_verification.brinesearch_route_reconciliation_receipts_issue97'::pg_catalog.regclass,
    'public.brinesearch_driver_google_routes_public'::pg_catalog.regclass,
    'public.brinesearch_driver_google_handoffs_public'::pg_catalog.regclass,
    'private_verification.brinesearch_v18_google_handoff_receipts'::pg_catalog.regclass,
    'private_verification.brinesearch_google_route_receipts_issue97'::pg_catalog.regclass,
    'private_verification.brinesearch_google_route_refresh_queue_issue97'::pg_catalog.regclass,
    'private_verification.brinesearch_v18_public_google_route_releases'::pg_catalog.regclass,
    'private_verification.brinesearch_v18_core_destination_releases'::pg_catalog.regclass,
    'public.brinesearch_driver_core_destination_releases_public'::pg_catalog.regclass
  ] loop
    execute pg_catalog.format(
      'select md5(coalesce(string_agg(to_jsonb(row_value)::text,''|'' order by to_jsonb(row_value)::text),'''')) from %s row_value',
      v_relation
    ) into v_digest;
    insert into tmp_bilinovich_no_blaze_protected values(v_relation,v_digest);
  end loop;
end
$capture_protected$;

do $preflight$
declare
  expected tmp_bilinovich_no_blaze_expected%rowtype;
  before_state tmp_bilinovich_no_blaze_before%rowtype;
begin
  select * into strict expected from tmp_bilinovich_no_blaze_expected;
  select * into strict before_state from tmp_bilinovich_no_blaze_before;

  if not exists(
    select 1 from public.pads pad
    where pad.id=expected.pad_id
      and pad.legacy_id='ascent--bilinovich'
      and pad.company='Ascent' and pad.pad_name='BILINOVICH'
      and pad.state='Ohio' and pad.county='Guernsey'
      and pg_catalog.upper(pad.township)='LONDONDERRY'
      and pad.address='23212 Turkle Road'
      and pad.latitude=40.08863 and pad.longitude=-81.304164
      and pad.updated_at='2026-08-27T01:28:35.232844Z'
      and pad.directions_clear_updated_at='2026-08-27T01:28:35.232844Z'
      and pad.structured_road_sequence=expected.old_sequence
      and pad.directions_clear=expected.old_clear
      and pad.directions_clear_method=expected.old_method
      and pg_catalog.encode(extensions.digest(
        coalesce(pad.written_directions,''),'sha256'),'hex')=
        'fe4f19d922cf8887351d7ca3f876336e6fccc3b81c76d848eea82c9ea1d7eff0'
      and pg_catalog.encode(extensions.digest(
        coalesce(pad.structured_road_sequence,''),'sha256'),'hex')=
        '31246311a646ff6ab9041fdc513eb033e5c758835aab1d235675b926513e39d6'
      and pg_catalog.encode(extensions.digest(
        coalesce(pad.directions_clear,''),'sha256'),'hex')=
        'c19f59c27e1d86a5d1ce2a042eea61868a703ca47175de7fc4aea3928ef9ae06'
      and pg_catalog.encode(extensions.digest(
        coalesce(pad.directions_clear_method,''),'sha256'),'hex')=
        'a9dd9d31ea01513089f8c54e37b43c7773d509e0cd76bce05e579763d28fab9d'
      and pad.structured_route_steps='[]'::jsonb
      and pad.structured_route_revision=0
      and pad.brinesearch_google_route_status_issue97='not_evaluated'
      and pad.brinesearch_google_route_revision_issue97 is null
      and pg_catalog.jsonb_array_length(
        pad.extra_data->'reviewed_direction_revision_history')=1
      and pad.extra_data#>>'{reviewed_direction_revision_history,0,revision}'=
        '2026-08-26-bilinovich-owner-correction-v1'
  ) then
    raise exception 'BILINOVICH unsafe Blaze checkpoint diverged';
  end if;

  if not exists(
    select 1 from public.pad_edit_history history
    where history.id=-20260827000828
      and history.pad_id=expected.pad_id
      and history.new_data->>'structured_road_sequence'=expected.old_sequence
      and history.new_data->>'directions_clear'=expected.old_clear
      and pg_catalog.encode(extensions.digest(
        coalesce(history.old_data->>'written_directions',''),'sha256'),'hex')=
        'fe4f19d922cf8887351d7ca3f876336e6fccc3b81c76d848eea82c9ea1d7eff0'
      and pg_catalog.encode(extensions.digest(
        coalesce(history.old_data->>'directions_clear',''),'sha256'),'hex')=
        '38b970dada330a696352e40c4c9b81964be6674a1f5e28038c3da3b5b12cbbb1'
      and history.old_data->>'structured_road_sequence'=
        'Zipcode 43773 From Mccoy Rd → Merry Rd → Logan Rd → Pad'
  ) or exists(
    select 1 from public.pad_edit_history history
    where history.pad_id=expected.pad_id
      and history.changed_at>'2026-08-27T01:28:35.232844Z'
  ) or exists(
    select 1 from public.pad_edit_history history
    where history.id=-20260827033000
  ) then
    raise exception 'BILINOVICH immutable audit checkpoint diverged';
  end if;

  if before_state.verification_row->>'gps_verified' is distinct from 'false'
     or before_state.verification_row->>'directions_verified' is distinct from 'true'
     or before_state.verification_row->>'roads_verified' is distinct from 'false'
     or before_state.verification_row#>>'{evidence,directions,revision}'
          is distinct from '2026-08-26-bilinovich-owner-correction-v1'
     or before_state.reference_row->>'is_stale' is distinct from 'true'
     or before_state.reference_row->>'route_hash'
          is distinct from '40fb7a2952b2ece83689916314989de8'
     or before_state.driver_status#>>'{route,source}' is distinct from 'legacy_written'
     or before_state.driver_status#>>'{route,state}' is distinct from 'held'
     or before_state.driver_status#>'{route,steps}' is distinct from '[]'::jsonb
     or before_state.driver_status#>'{route,geometry}' is distinct from 'null'::jsonb
     or before_state.driver_status#>>'{graph,state}' is distinct from 'held'
     or before_state.driver_status#>>'{google,publicState}' is distinct from 'held'
     or before_state.driver_status#>>'{destination,available}' is distinct from 'false'
     or before_state.atomic_bundle->'namedApproaches' is distinct from '[]'::jsonb
     or before_state.atomic_bundle->'publicGoogleRoute' is distinct from 'null'::jsonb
     or before_state.atomic_bundle->'publicGoogleHandoff' is distinct from 'null'::jsonb then
    raise exception 'BILINOVICH held authority checkpoint diverged';
  end if;

  if (select count(*) from public.brinesearch_directory_snapshots_v18
      where publication_state='current')<>1
     or before_state.directory_row->>'snapshot_id'
          is distinct from '66a66928-d78f-4dc2-9153-d2796a830ddc'
     or before_state.directory_row->>'source_revision' is distinct from '7'
     or (select count(*) from public.brinesearch_directory_snapshots_v18
         where publication_state='retained')<>0
     or (select count(*) from public.brinesearch_company_road_overlay_snapshots_v18
         where publication_state='current')<>1
     or before_state.overlay_row->>'snapshot_id'
          is distinct from 'b4e9b847-449a-4b86-9206-9c6743b6c141'
     or before_state.overlay_row->>'source_revision' is distinct from '5'
     or before_state.overlay_row->>'directory_snapshot_id'
          is distinct from '66a66928-d78f-4dc2-9153-d2796a830ddc'
     or (select count(*) from public.brinesearch_company_road_overlay_snapshots_v18
         where publication_state='retained')<>0
     or (select count(*) from public.brinesearch_driver_google_routes_public)<>1
     or (select count(*) from public.brinesearch_driver_google_handoffs_public)<>1
     or (select count(*) from public.brinesearch_issue97_release_state
         where singleton)<>1
     or pg_catalog.jsonb_typeof(before_state.release_authority)
          is distinct from 'object'
     or before_state.release_authority->>'cutover_at' is not null
     or before_state.release_authority->>'cutover_by' is not null then
    raise exception 'BILINOVICH publication checkpoint diverged';
  end if;

  if not exists(
    select 1 from pg_catalog.pg_trigger trigger
    where trigger.tgrelid='public.pads'::pg_catalog.regclass
      and trigger.tgname='brinesearch_direction_intelligence_refresh'
      and trigger.tgenabled='O'
      and pg_catalog.md5(pg_catalog.pg_get_functiondef(trigger.tgfoid))=
        '5545b96db0162ff251624f639ba2490d'
  ) or not exists(
    select 1 from pg_catalog.pg_trigger trigger
    where trigger.tgrelid='public.pads'::pg_catalog.regclass
      and trigger.tgname='pads_audit_update'
      and trigger.tgenabled='O'
      and pg_catalog.md5(pg_catalog.pg_get_functiondef(trigger.tgfoid))=
        'b7068f4de6236d83c400caf5312a4336'
  ) or not exists(
    select 1 from pg_catalog.pg_trigger trigger
    where trigger.tgrelid='public.pads'::pg_catalog.regclass
      and trigger.tgname='pads_mark_driver_route_reference_stale'
      and trigger.tgenabled='O'
      and pg_catalog.md5(pg_catalog.pg_get_functiondef(trigger.tgfoid))=
        'd3c3caa7223852bcfce5b55792554cb8'
  ) or not exists(
    select 1 from pg_catalog.pg_trigger trigger
    where trigger.tgrelid='public.pads'::pg_catalog.regclass
      and trigger.tgname='trg_pad_verification_invalidate'
      and trigger.tgenabled='O'
      and pg_catalog.md5(pg_catalog.pg_get_functiondef(trigger.tgfoid))=
        '99fdfd970215224bf717f108b523ceb1'
  ) or not exists(
    select 1 from pg_catalog.pg_trigger trigger
    where trigger.tgrelid='public.pads'::pg_catalog.regclass
      and trigger.tgname='pads_sync_public_pad_detail_projection'
      and trigger.tgenabled='O'
      and pg_catalog.md5(pg_catalog.pg_get_functiondef(trigger.tgfoid))=
        '0825fbdd1e0dc28bb46412a0a22222ae'
  ) or not exists(
    select 1 from pg_catalog.pg_trigger trigger
    where trigger.tgrelid='public.pads'::pg_catalog.regclass
      and trigger.tgname='brinesearch_v18_directory_snapshot_invalidate'
      and trigger.tgenabled='O'
      and pg_catalog.md5(pg_catalog.pg_get_functiondef(trigger.tgfoid))=
        '214b88fe8950995bf93ab25f0db4dc4e'
  ) or not exists(
    select 1 from pg_catalog.pg_trigger trigger
    where trigger.tgrelid='public.pads'::pg_catalog.regclass
      and trigger.tgname='brinesearch_v18_company_road_overlay_invalidate'
      and trigger.tgenabled='O'
      and pg_catalog.md5(pg_catalog.pg_get_functiondef(trigger.tgfoid))=
        'f8a17bbf83b1e58f5be6091750a24584'
  ) then
    raise exception 'BILINOVICH trigger checkpoint diverged';
  end if;
end
$preflight$;

alter table public.pads
  disable trigger brinesearch_direction_intelligence_refresh;
alter table public.pads
  disable trigger pads_audit_update;

create temporary table tmp_bilinovich_no_blaze_update_result on commit drop as
with changed as (
  update public.pads pad
  set structured_road_sequence=expected.new_sequence,
      directions_clear=expected.new_clear,
      directions_clear_method=expected.new_method,
      directions_clear_updated_at=expected.installed_at,
      updated_at=expected.installed_at,
      extra_data=pg_catalog.jsonb_set(
        coalesce(pad.extra_data,'{}'::jsonb),
        '{reviewed_direction_revision_history}',
        coalesce(
          pad.extra_data->'reviewed_direction_revision_history','[]'::jsonb
        ) || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'revision',expected.revision,
          'reviewed_at',expected.installed_at,
          'scope','reviewed_display_only',
          'reason','Owner field correction: Blaze Road is not an inbound road and must not be used.',
          'withdrawn_revision','2026-08-26-bilinovich-owner-correction-v1',
          'withdrawn_sequence',expected.old_sequence,
          'withdrawn_directions_sha256',
            'c19f59c27e1d86a5d1ce2a042eea61868a703ca47175de7fc4aea3928ef9ae06',
          'replacement_sequence',expected.new_sequence,
          'raw_written_directions_preserved',true,
          'raw_written_directions_sha256',
            'fe4f19d922cf8887351d7ca3f876336e6fccc3b81c76d848eea82c9ea1d7eff0',
          'official_road_ids',pg_catalog.jsonb_build_array(
            'SGUEUS00022**C','CGUECR00082**C','TGUETR00967**C',
            'CGUECR00694**C','CGUECR00964**C','TGUETR00693**C'
          ),
          'forbidden_road_id','TGUETR00964**C',
          'terminal_gap',pg_catalog.jsonb_build_object(
            'saved_lease_approach',pg_catalog.jsonb_build_array(40.088630000,-81.304164000),
            'nearest_turkle_point',pg_catalog.jsonb_build_array(40.088789769,-81.303990829),
            'distance_meters',23.1,
            'private_geometry_verified',false
          ),
          'google_candidate',pg_catalog.jsonb_build_object(
            'status','withdrawn_no_replacement_published',
            'public_google_authority',false
          ),
          'authority',pg_catalog.jsonb_build_object(
            'structured_steps_created',false,'geometry_created',false,
            'graph_changed',false,'destination_released',false,
            'google_published',false,'cutover_changed',false
          )
        )),
        true
      )
  from tmp_bilinovich_no_blaze_expected expected
  where pad.id=expected.pad_id
    and pad.structured_road_sequence=expected.old_sequence
    and pad.directions_clear=expected.old_clear
    and pad.directions_clear_method=expected.old_method
    and pad.updated_at='2026-08-27T01:28:35.232844Z'
  returning pad.id
)
select pg_catalog.count(*)::integer as row_count from changed;

do $verify_target_update$
begin
  if (select row_count from tmp_bilinovich_no_blaze_update_result)<>1 then
    raise exception 'BILINOVICH no-Blaze target update count diverged';
  end if;
end
$verify_target_update$;

alter table public.pads enable trigger pads_audit_update;
alter table public.pads enable trigger brinesearch_direction_intelligence_refresh;

create temporary table tmp_bilinovich_no_blaze_audit_result on commit drop as
with inserted as (
  insert into public.pad_edit_history(
    id,pad_id,editor_user_id,changed_at,changed_fields,old_data,new_data
  ) overriding system value
  select
    -20260827033000,
    expected.pad_id,
    null,
    expected.installed_at,
    array[
      'directions_clear','directions_clear_method',
      'directions_clear_updated_at','structured_road_sequence',
      'extra_data','updated_at'
    ]::text[],
    before_state.pad_row,
    pg_catalog.to_jsonb(pad)
  from tmp_bilinovich_no_blaze_expected expected
  cross join tmp_bilinovich_no_blaze_before before_state
  join public.pads pad on pad.id=expected.pad_id
  returning id
)
select pg_catalog.count(*)::integer as row_count from inserted;

do $verify_audit$
begin
  if (select row_count from tmp_bilinovich_no_blaze_audit_result)<>1 then
    raise exception 'BILINOVICH no-Blaze deterministic audit insert diverged';
  end if;
end
$verify_audit$;

create temporary table tmp_bilinovich_no_blaze_verification_result on commit drop as
with changed as (
  update public.pad_verification_status verification
  set directions_verified=true,
      roads_verified=false,
      evidence=pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          coalesce(verification.evidence,'{}'::jsonb),
          '{directions_history}',
          coalesce(verification.evidence->'directions_history','[]'::jsonb)
            || pg_catalog.jsonb_build_array(verification.evidence->'directions'),
          true
        ),
        '{directions}',
        pg_catalog.jsonb_build_object(
          'basis','Owner field correction plus exact Guernsey/ODOT/OGRIP topology restores the reviewed no-Blaze road core. The private terminal connection remains unverified.',
          'auto_reviewed',false,
          'reviewed_display_only',true,
          'revision','2026-08-27-bilinovich-no-blaze-reviewed-display-v1',
          'blaze_excluded',true,
          'terminal_private_geometry_verified',false,
          'route_authority_upgrade',false,
          'public_google_publication',false
        ),
        true
      ),
      review_note='BILINOVICH corrected display: McCoy to Merry to Penrose to Logan to Turkle. Do not use Blaze. Private terminal connection, route, graph, destination, and Google remain held.',
      updated_at=(select installed_at from tmp_bilinovich_no_blaze_expected)
  where verification.pad_id=(select pad_id from tmp_bilinovich_no_blaze_expected)
    and not verification.gps_verified
    and not verification.directions_verified
    and not verification.roads_verified
    and verification.wells_verified
    and verification.api_verified
    and not verification.property_verified
  returning verification.pad_id
)
select pg_catalog.count(*)::integer as row_count from changed;

do $verify_verification$
begin
  if (select row_count from tmp_bilinovich_no_blaze_verification_result)<>1 then
    raise exception 'BILINOVICH no-Blaze verification update diverged';
  end if;
end
$verify_verification$;

do $postflight$
declare
  expected tmp_bilinovich_no_blaze_expected%rowtype;
  before_state tmp_bilinovich_no_blaze_before%rowtype;
  after_status jsonb;
  after_bundle jsonb;
  protected_row record;
  after_digest text;
begin
  select * into strict expected from tmp_bilinovich_no_blaze_expected;
  select * into strict before_state from tmp_bilinovich_no_blaze_before;

  if not exists(
    select 1 from public.pads pad
    where pad.id=expected.pad_id
      and pad.structured_road_sequence=expected.new_sequence
      and pad.directions_clear=expected.new_clear
      and pad.directions_clear_method=expected.new_method
      and pad.directions_clear_updated_at=expected.installed_at
      and pad.updated_at=expected.installed_at
      and pg_catalog.encode(extensions.digest(
        coalesce(pad.written_directions,''),'sha256'),'hex')=
        'fe4f19d922cf8887351d7ca3f876336e6fccc3b81c76d848eea82c9ea1d7eff0'
      and pad.latitude=40.08863 and pad.longitude=-81.304164
      and pad.structured_route_steps='[]'::jsonb
      and pad.structured_route_revision=0
      and pad.brinesearch_google_route_status_issue97='not_evaluated'
      and pad.brinesearch_google_route_revision_issue97 is null
      and pg_catalog.jsonb_array_length(
        pad.extra_data->'reviewed_direction_revision_history')=2
      and pad.extra_data#>>'{reviewed_direction_revision_history,0,revision}'=
        '2026-08-26-bilinovich-owner-correction-v1'
      and pad.extra_data#>>'{reviewed_direction_revision_history,1,revision}'=
        expected.revision
      and pad.extra_data#>>'{reviewed_direction_revision_history,1,forbidden_road_id}'=
        'TGUETR00964**C'
      and pad.extra_data#>>'{reviewed_direction_revision_history,1,authority,google_published}'='false'
      and pg_catalog.strpos(pad.structured_road_sequence,'Blaze')=0
  ) then
    raise exception 'BILINOVICH no-Blaze reviewed row did not install exactly';
  end if;

  if not exists(
    select 1 from public.brinesearch_driver_directions_public directions
    where directions.pad_id=expected.pad_id
      and directions.directions_clear=expected.new_clear
      and directions.source_revision=expected.installed_at
  ) or not exists(
    select 1 from public.public_pad_detail detail
    where detail.id=expected.pad_id
      and detail.structured_road_sequence=expected.new_sequence
      and detail.directions_clear=expected.new_clear
      and detail.updated_at=expected.installed_at
      and detail.written_directions=before_state.pad_row->>'written_directions'
      and not (coalesce(detail.extra_data,'{}'::jsonb)
        ? 'reviewed_direction_revision_history')
      and pg_catalog.strpos(coalesce(detail.extra_data::text,''),'google.com/maps')=0
  ) then
    raise exception 'BILINOVICH safe public no-Blaze display did not update';
  end if;

  if not exists(
    select 1 from public.pad_verification_status verification
    where verification.pad_id=expected.pad_id
      and not verification.gps_verified
      and verification.directions_verified
      and not verification.roads_verified
      and verification.evidence#>>'{directions,revision}'=expected.revision
      and verification.evidence#>>'{directions,blaze_excluded}'='true'
      and verification.evidence#>>'{directions,terminal_private_geometry_verified}'='false'
      and verification.evidence#>>'{directions,route_authority_upgrade}'='false'
      and verification.evidence#>>'{directions,public_google_publication}'='false'
      and pg_catalog.jsonb_array_length(
        verification.evidence->'directions_history')>=1
  ) then
    raise exception 'BILINOVICH no-Blaze verification did not remain held';
  end if;

  if not exists(
    select 1 from public.brinesearch_driver_route_reference reference
    where reference.pad_id=expected.pad_id
      and reference.status=before_state.reference_row->>'status'
      and reference.anchor_name=before_state.reference_row->>'anchor_name'
      and reference.is_stale
      and reference.route_hash=before_state.reference_row->>'route_hash'
      and reference.updated_at=expected.installed_at
  ) then
    raise exception 'BILINOVICH route reference did not remain stale';
  end if;

  select public.brinesearch_v18_driver_pad_status(expected.pad_id)
  into strict after_status;
  if after_status#>>'{route,source}' is distinct from 'legacy_written'
     or after_status#>>'{route,state}' is distinct from 'held'
     or after_status#>>'{route,writtenDirections}' is distinct from expected.new_clear
     or after_status#>'{route,steps}' is distinct from '[]'::jsonb
     or after_status#>'{route,geometry}' is distinct from 'null'::jsonb
     or after_status->'graph' is distinct from before_state.driver_status->'graph'
     or after_status->'google' is distinct from before_state.driver_status->'google'
     or after_status->'destination' is distinct from before_state.driver_status->'destination' then
    raise exception 'BILINOVICH no-Blaze display escaped held authority: %',after_status;
  end if;

  select public.brinesearch_v18_driver_pad_status_with_named_approaches(expected.pad_id)
  into strict after_bundle;
  if after_bundle#>>'{status,route,state}' is distinct from 'held'
     or after_bundle#>'{status,route,steps}' is distinct from '[]'::jsonb
     or after_bundle#>'{status,route,geometry}' is distinct from 'null'::jsonb
     or after_bundle->'namedApproaches' is distinct from '[]'::jsonb
     or after_bundle->'publicGoogleRoute' is distinct from 'null'::jsonb
     or after_bundle->'publicGoogleHandoff' is distinct from 'null'::jsonb then
    raise exception 'BILINOVICH atomic no-Blaze envelope escaped held authority';
  end if;

  if (select pg_catalog.count(*) from public.pad_edit_history history
      where history.pad_id=expected.pad_id)<>before_state.audit_count+1
     or not exists(
       select 1 from public.pad_edit_history history
       where history.id=-20260827033000
         and history.pad_id=expected.pad_id
         and history.old_data->>'directions_clear'=expected.old_clear
         and history.new_data->>'directions_clear'=expected.new_clear
         and history.old_data->>'written_directions'=
             history.new_data->>'written_directions'
     )
     or (select last_value from public.pad_edit_history_id_seq)
          is distinct from before_state.audit_last_value
     or (select is_called from public.pad_edit_history_id_seq)
          is distinct from before_state.audit_is_called then
    raise exception 'BILINOVICH no-Blaze audit history diverged';
  end if;

  if not exists(
    select 1 from pg_catalog.pg_trigger trigger
    where trigger.tgrelid='public.pads'::pg_catalog.regclass
      and trigger.tgname='brinesearch_direction_intelligence_refresh'
      and trigger.tgenabled='O'
  ) or not exists(
    select 1 from pg_catalog.pg_trigger trigger
    where trigger.tgrelid='public.pads'::pg_catalog.regclass
      and trigger.tgname='pads_audit_update'
      and trigger.tgenabled='O'
  ) then
    raise exception 'BILINOVICH triggers were not restored';
  end if;

  if (select count(*) from public.brinesearch_directory_snapshots_v18
      where publication_state='current')<>0
     or not exists(
       select 1 from public.brinesearch_directory_snapshots_v18 snapshot
       where snapshot.snapshot_id='66a66928-d78f-4dc2-9153-d2796a830ddc'
         and snapshot.source_revision=7
         and snapshot.publication_state='withdrawn'
         and snapshot.retained_until is null
         and (pg_catalog.to_jsonb(snapshot)-array[
           'publication_state','retained_until']::text[])=
           (before_state.directory_row-array[
             'publication_state','retained_until']::text[])
     )
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(snapshot)::text,'|'
       order by pg_catalog.to_jsonb(snapshot)::text),''))
       from public.brinesearch_directory_snapshots_v18 snapshot
       where snapshot.snapshot_id<>'66a66928-d78f-4dc2-9153-d2796a830ddc')
          is distinct from before_state.other_directory_digest
     or (select count(*) from public.brinesearch_company_road_overlay_snapshots_v18
         where publication_state='current')<>0
     or not exists(
       select 1 from public.brinesearch_company_road_overlay_snapshots_v18 snapshot
       where snapshot.snapshot_id='b4e9b847-449a-4b86-9206-9c6743b6c141'
         and snapshot.source_revision=5
         and snapshot.publication_state='withdrawn'
         and snapshot.retained_until is null
         and (pg_catalog.to_jsonb(snapshot)-array[
           'publication_state','retained_until']::text[])=
           (before_state.overlay_row-array[
             'publication_state','retained_until']::text[])
     )
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(snapshot)::text,'|'
       order by pg_catalog.to_jsonb(snapshot)::text),''))
       from public.brinesearch_company_road_overlay_snapshots_v18 snapshot
       where snapshot.snapshot_id<>'b4e9b847-449a-4b86-9206-9c6743b6c141')
          is distinct from before_state.other_overlay_digest then
    raise exception 'BILINOVICH directory/overlay withdrawal was not exact';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text),''))
       from public.pads row_value where row_value.id<>expected.pad_id)
       is distinct from before_state.non_target_pad_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text),''))
       from public.public_pad_detail row_value where row_value.id<>expected.pad_id)
       is distinct from before_state.non_target_public_detail_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text),''))
       from public.pad_verification_status row_value
       where row_value.pad_id<>expected.pad_id)
       is distinct from before_state.non_target_verification_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text),''))
       from public.brinesearch_driver_route_reference row_value
       where row_value.pad_id<>expected.pad_id)
       is distinct from before_state.non_target_reference_digest then
    raise exception 'BILINOVICH correction changed a non-target row';
  end if;

  for protected_row in select * from tmp_bilinovich_no_blaze_protected loop
    execute pg_catalog.format(
      'select md5(coalesce(string_agg(to_jsonb(row_value)::text,''|'' order by to_jsonb(row_value)::text),'''')) from %s row_value',
      protected_row.relation
    ) into after_digest;
    if after_digest is distinct from protected_row.digest then
      raise exception 'BILINOVICH correction changed protected relation %',
        protected_row.relation;
    end if;
  end loop;

  if (select pg_catalog.to_jsonb(release_row)-'updated_at'
      from public.brinesearch_issue97_release_state release_row
      where release_row.singleton) is distinct from before_state.release_authority
     or exists(
       select 1 from public.brinesearch_issue97_release_state state
       where state.singleton
         and (state.cutover_at is not null or state.cutover_by is not null)
     ) then
    raise exception 'BILINOVICH correction changed cutover authority';
  end if;
end
$postflight$;
