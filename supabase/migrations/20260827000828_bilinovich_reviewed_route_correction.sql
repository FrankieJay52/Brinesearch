-- BILINOVICH owner correction: replace only the reviewed display route.
--
-- The raw saved field note remains immutable. This migration does not create
-- structured route steps, geometry, a destination release, a Google release,
-- a graph change, or cutover. The reviewed Google URL is retained as private
-- audit evidence only; it is not public navigation authority.

-- Baseline and postflight digests must observe one database snapshot. This
-- still exposes this transaction's own writes while preventing an unrelated
-- authority writer from creating a READ COMMITTED false positive.
set transaction isolation level repeatable read;
set local statement_timeout='5min';
set local lock_timeout='5s';

-- Freeze every target row before taking the publication advisory locks and
-- baseline so an ordinary editor cannot race the one correction.
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

create temporary table tmp_bilinovich_expected(
  pad_id uuid primary key,
  revision text not null,
  installed_at timestamptz not null,
  old_sequence text not null,
  old_clear text not null,
  old_method text not null,
  new_sequence text not null,
  new_clear text not null,
  new_method text not null,
  candidate_url text not null
) on commit drop;

insert into tmp_bilinovich_expected values (
  '59061829-1122-4aae-872d-cf5024310373',
  '2026-08-26-bilinovich-owner-correction-v1',
  pg_catalog.transaction_timestamp(),
  'Zipcode 43773 From Mccoy Rd → Merry Rd → Logan Rd → Pad',
  $old_clear$Road sequence reference:
McCoy Rd → Merry Rd (0.7 mile) → Penrose Rd (0.8 mile) → Logan Rd (1 mile) → Pad

Step-by-step directions:
1. From McCoy Rd, continue straight onto Merry Rd. Continue 0.7 mile to Penrose Rd.
2. Turn right onto Penrose Rd. Continue 0.8 mile to the T.
3. At the T, turn left onto Logan Rd. The saved field note says the visible sign may point right for Blaze Rd.
4. Continue 1 mile on Logan Rd.
5. The Bilinovich pad is on the left.$old_clear$,
  'Ascent controlled cleanup batch: exact saved turns and mileage preserved; shared McCoy, Merry, Penrose, and Logan road identities reused from Road Manager; field sign note preserved without inferring a different road; no guessed facts; pending field confirmation',
  'I-70 W → Exit 193 → OH-513 N → US-22 E → McCoy Rd → Blaze Rd → Logan Rd → Turkle Rd / lease access → BILINOVICH',
  $new_clear$Road sequence reference:
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
10. BILINOVICH pad/wellhead-area reference: 40.08738445, -81.30282620. This ODNR-derived pad-surface reference is not a verified public-road entrance.$new_clear$,
  'Owner-corrected exact-GPS reviewed display route 2026-08-26. Guernsey County Road Centerline layer 84 confirms McCoy Rd (CR-82), Blaze Rd (TR-964), Logan Rd (CR-964), and Turkle Rd (TR-693). ODNR WellPads ObjectID 792 and exact APIs 34-059-2-4567-00-00, 34-059-2-4568-00-00, and 34-059-2-4569-00-00 support the pad-surface reference. Physical junctions are owner reviewed; Google-safe points are shaping-only. Display guidance only; route, graph, destination, and Google authority remain held.',
  'https://www.google.com/maps/dir/?api=1&origin=Saint%20Clairsville%2C%20OH&destination=40.08738445%2C-81.30282620&waypoints=40.12303995%2C-81.35382341%7C40.112583770%2C-81.294937982%7C40.09955931%2C-81.29781917&travelmode=driving&dir_action=navigate'
);

create temporary table tmp_bilinovich_before on commit drop as
select
  pg_catalog.to_jsonb(pad) as pad_row,
  (select pg_catalog.to_jsonb(v) from public.pad_verification_status v
    where v.pad_id=pad.id) as verification_row,
  (select pg_catalog.to_jsonb(r) from public.brinesearch_driver_route_reference r
    where r.pad_id=pad.id) as route_reference_row,
  (select pg_catalog.to_jsonb(d) from public.public_pad_detail d
    where d.id=pad.id) as public_detail_row,
  (select pg_catalog.count(*) from public.pad_edit_history h
    where h.pad_id=pad.id) as audit_count,
  (select last_value from public.pad_edit_history_id_seq)
    as audit_sequence_last_value,
  (select is_called from public.pad_edit_history_id_seq)
    as audit_sequence_is_called,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from public.pads row_value where row_value.id<>pad.id)
    as non_target_pad_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from public.public_pad_detail row_value where row_value.id<>pad.id)
    as non_target_public_detail_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from public.pad_verification_status row_value
     where row_value.pad_id<>pad.id) as non_target_verification_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from public.brinesearch_driver_route_reference row_value
     where row_value.pad_id<>pad.id) as non_target_reference_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from public.brinesearch_direction_step_intelligence row_value)
    as direction_intelligence_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from public.brinesearch_road_graph_builds row_value) as graph_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from public.brinesearch_route_prep row_value) as route_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from public.brinesearch_route_prep_steps row_value) as route_step_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from private_verification.brinesearch_route_occurrence_receipts_issue97 row_value)
    as occurrence_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 row_value)
    as occurrence_geometry_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from private_verification.brinesearch_route_occurrence_geometry_history_issue97 row_value)
    as occurrence_geometry_history_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from private_verification.brinesearch_route_transition_receipts_issue97 row_value)
    as transition_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from private_verification.brinesearch_route_reconciliation_receipts_issue97 row_value)
    as reconciliation_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from public.brinesearch_driver_google_routes_public row_value)
    as public_google_route_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from public.brinesearch_driver_google_handoffs_public row_value)
    as public_google_handoff_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from private_verification.brinesearch_v18_google_handoff_receipts row_value)
    as private_google_handoff_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from private_verification.brinesearch_google_route_receipts_issue97 row_value)
    as private_google_route_receipt_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from private_verification.brinesearch_google_route_refresh_queue_issue97 row_value)
    as private_google_queue_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from private_verification.brinesearch_v18_public_google_route_releases row_value)
    as private_google_release_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from private_verification.brinesearch_v18_core_destination_releases row_value)
    as private_destination_release_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from public.brinesearch_driver_core_destination_releases_public row_value)
    as public_destination_release_digest,
  (select pg_catalog.jsonb_build_object(
     'singleton',state.singleton,
     'cutover_at',state.cutover_at,
     'cutover_by',state.cutover_by,
     'review_details',state.review_details,
     'created_at',state.created_at,
     'updated_at',state.updated_at
   ) from public.brinesearch_issue97_release_state state
    where state.singleton) as release_state_row,
  (select snapshot_id from public.brinesearch_directory_snapshots_v18
    where publication_state='current') as directory_snapshot_id,
  (select source_revision from public.brinesearch_directory_snapshots_v18
    where publication_state='current') as directory_revision,
  (select pg_catalog.to_jsonb(snapshot)
   from public.brinesearch_directory_snapshots_v18 snapshot
   where snapshot.publication_state='current') as directory_snapshot_row,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(snapshot)::text,'|'
     order by pg_catalog.to_jsonb(snapshot)::text
   ),''))
   from public.brinesearch_directory_snapshots_v18 snapshot
   where snapshot.publication_state<>'current') as other_directory_snapshots_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from public.brinesearch_directory_snapshot_rows_v18 row_value)
    as directory_rows_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from public.brinesearch_directory_snapshot_well_rows_v18 row_value)
    as directory_well_rows_digest,
  (select snapshot_id from public.brinesearch_company_road_overlay_snapshots_v18
    where publication_state='current') as overlay_snapshot_id,
  (select content_sha256 from public.brinesearch_company_road_overlay_snapshots_v18
    where publication_state='current') as overlay_sha256,
  (select pg_catalog.to_jsonb(snapshot)
   from public.brinesearch_company_road_overlay_snapshots_v18 snapshot
   where snapshot.publication_state='current') as overlay_snapshot_row,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(snapshot)::text,'|'
     order by pg_catalog.to_jsonb(snapshot)::text
   ),''))
   from public.brinesearch_company_road_overlay_snapshots_v18 snapshot
   where snapshot.publication_state<>'current') as other_overlay_snapshots_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|'
     order by pg_catalog.to_jsonb(row_value)::text
   ),'')) from public.brinesearch_company_road_overlay_rows_v18 row_value)
    as overlay_rows_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(release_row)::text,'|'
     order by pg_catalog.to_jsonb(release_row)::text
   ),''))
   from private_verification.brinesearch_v18_company_road_overlay_releases release_row)
    as overlay_release_digest,
  public.brinesearch_v18_driver_pad_status(pad.id) as driver_status,
  public.brinesearch_v18_driver_pad_status_with_named_approaches(pad.id)
    as atomic_bundle
from public.pads pad
where pad.id='59061829-1122-4aae-872d-cf5024310373';

do $preflight$
declare
  v_expected tmp_bilinovich_expected%rowtype;
  v_before tmp_bilinovich_before%rowtype;
begin
  select * into strict v_expected from tmp_bilinovich_expected;
  select * into strict v_before from tmp_bilinovich_before;

  if not exists(
    select 1 from public.pads pad
    where pad.id=v_expected.pad_id
      and pad.legacy_id='ascent--bilinovich'
      and pad.company='Ascent' and pad.pad_name='BILINOVICH'
      and pad.state='Ohio' and pad.county='Guernsey'
      and pg_catalog.upper(pad.township)='LONDONDERRY'
      and pad.address='23212 Turkle Road'
      and pad.latitude=40.08863 and pad.longitude=-81.304164
      and pad.structured_road_sequence=v_expected.old_sequence
      and pad.directions_clear=v_expected.old_clear
      and pad.directions_clear_method=v_expected.old_method
      and pad.directions_clear_updated_at='2026-08-08T03:14:42.681309Z'
      and pg_catalog.encode(extensions.digest(
        coalesce(pad.written_directions,''),'sha256'
      ),'hex')='fe4f19d922cf8887351d7ca3f876336e6fccc3b81c76d848eea82c9ea1d7eff0'
      and pg_catalog.encode(extensions.digest(
        coalesce(pad.directions_clear,''),'sha256'
      ),'hex')='38b970dada330a696352e40c4c9b81964be6674a1f5e28038c3da3b5b12cbbb1'
      and pad.structured_route_steps='[]'::jsonb
      and pad.structured_route_revision=0
      and pad.brinesearch_google_route_status_issue97='not_evaluated'
      and pad.brinesearch_google_route_revision_issue97 is null
      and not (
        coalesce(pad.extra_data,'{}'::jsonb)
          ? 'reviewed_direction_revision_history'
      )
  ) then
    raise exception 'BILINOVICH exact reviewed starting checkpoint diverged';
  end if;

  if v_before.driver_status#>>'{route,source}' is distinct from 'legacy_written'
     or v_before.driver_status#>>'{route,state}' is distinct from 'held'
     or v_before.driver_status#>'{route,steps}' is distinct from '[]'::jsonb
     or v_before.driver_status#>'{route,geometry}' is distinct from 'null'::jsonb
     or v_before.driver_status#>>'{graph,state}' is distinct from 'held'
     or v_before.driver_status#>>'{google,publicState}' is distinct from 'held'
     or v_before.driver_status#>>'{destination,available}' is distinct from 'false' then
    raise exception 'BILINOVICH authority starting checkpoint diverged';
  end if;

  if v_before.atomic_bundle#>>'{status,statusRevision}'
       is distinct from v_before.driver_status->>'statusRevision'
     or v_before.atomic_bundle#>'{namedApproaches}' is distinct from '[]'::jsonb
     or v_before.atomic_bundle->'publicGoogleRoute' is distinct from 'null'::jsonb
     or v_before.atomic_bundle->'publicGoogleHandoff' is distinct from 'null'::jsonb
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_v18_driver_pad_status_with_named_approaches(uuid)'::
         pg_catalog.regprocedure
     ))<>'bbf04af9da6fc3f8b2f39fce12c6d6c8' then
    raise exception 'BILINOVICH atomic driver starting checkpoint diverged';
  end if;

  if v_before.verification_row->>'gps_verified' is distinct from 'false'
     or v_before.verification_row->>'directions_verified' is distinct from 'true'
     or v_before.verification_row->>'roads_verified' is distinct from 'false'
     or v_before.route_reference_row->>'is_stale' is distinct from 'false'
     or v_before.route_reference_row->>'route_hash'
          is distinct from '40fb7a2952b2ece83689916314989de8'
     or exists(
       select 1 from public.pad_edit_history history
       where history.id=-20260827000828
     ) then
    raise exception 'BILINOVICH verification/reference checkpoint diverged';
  end if;

  if (select count(*) from public.brinesearch_directory_snapshots_v18
      where publication_state='current')<>1
     or v_before.directory_snapshot_id is null
     or v_before.directory_snapshot_row is null
     or (select count(*) from public.brinesearch_directory_snapshots_v18
         where publication_state='retained')<>0
     or (select count(*) from public.brinesearch_company_road_overlay_snapshots_v18
         where publication_state='current')<>1
     or v_before.overlay_snapshot_id is null
     or v_before.overlay_snapshot_row is null
     or (select count(*) from public.brinesearch_company_road_overlay_snapshots_v18
         where publication_state='retained')<>0
     or (select count(*)
         from private_verification.brinesearch_v18_company_road_overlay_releases
         where approval_state='approved')<>0
     or (select count(*) from public.brinesearch_driver_google_routes_public)<>1
     or (select count(*) from public.brinesearch_driver_google_handoffs_public)<>1
     or (select count(*) from public.brinesearch_issue97_release_state
         where singleton)<>1
     or v_before.release_state_row is null
     or pg_catalog.jsonb_typeof(v_before.release_state_row)
          is distinct from 'object'
     or v_before.release_state_row->>'cutover_at' is not null then
    raise exception 'Directory/overlay/Google/cutover checkpoint diverged';
  end if;

  if pg_catalog.pg_get_serial_sequence('public.pad_edit_history','id')
       is distinct from 'public.pad_edit_history_id_seq'
     or (select column_row.data_type from information_schema.columns column_row
         where column_row.table_schema='public'
           and column_row.table_name='pad_edit_history'
           and column_row.column_name='id') is distinct from 'bigint'
     or (select column_row.is_identity from information_schema.columns column_row
         where column_row.table_schema='public'
           and column_row.table_name='pad_edit_history'
           and column_row.column_name='id') is distinct from 'YES'
     or (select column_row.identity_generation
         from information_schema.columns column_row
         where column_row.table_schema='public'
           and column_row.table_name='pad_edit_history'
           and column_row.column_name='id') is distinct from 'ALWAYS'
     or (select column_row.is_nullable from information_schema.columns column_row
         where column_row.table_schema='public'
           and column_row.table_name='pad_edit_history'
           and column_row.column_name='editor_user_id') is distinct from 'YES'
     or exists(
       select 1 from pg_catalog.pg_constraint constraint_row
       where constraint_row.conrelid='public.pad_edit_history'::pg_catalog.regclass
         and constraint_row.contype='c'
     ) then
    raise exception 'BILINOVICH deterministic audit-key schema diverged';
  end if;

  if not exists(
    select 1
    from pg_catalog.pg_trigger trigger
    join pg_catalog.pg_proc proc on proc.oid=trigger.tgfoid
    where trigger.tgrelid='public.pads'::pg_catalog.regclass
      and trigger.tgname='brinesearch_direction_intelligence_refresh'
      and trigger.tgenabled='O'
      and pg_catalog.pg_get_triggerdef(trigger.oid,true)=
        'CREATE TRIGGER brinesearch_direction_intelligence_refresh AFTER UPDATE OF directions_clear ON pads FOR EACH STATEMENT EXECUTE FUNCTION brinesearch_direction_intelligence_trigger()'
      and pg_catalog.md5(pg_catalog.pg_get_functiondef(proc.oid))=
        '5545b96db0162ff251624f639ba2490d'
  ) or not exists(
    select 1
    from pg_catalog.pg_trigger trigger
    join pg_catalog.pg_proc proc on proc.oid=trigger.tgfoid
    where trigger.tgrelid='public.pads'::pg_catalog.regclass
      and trigger.tgname='pads_audit_update'
      and trigger.tgenabled='O'
      and pg_catalog.pg_get_triggerdef(trigger.oid,true)=
        'CREATE TRIGGER pads_audit_update AFTER UPDATE ON pads FOR EACH ROW EXECUTE FUNCTION audit_pad_update()'
      and pg_catalog.md5(pg_catalog.pg_get_functiondef(proc.oid))=
        'b7068f4de6236d83c400caf5312a4336'
  ) or not exists(
    select 1
    from pg_catalog.pg_trigger trigger
    join pg_catalog.pg_proc proc on proc.oid=trigger.tgfoid
    where trigger.tgrelid='public.pads'::pg_catalog.regclass
      and trigger.tgname='pads_mark_driver_route_reference_stale'
      and trigger.tgenabled='O'
      and pg_catalog.pg_get_triggerdef(trigger.oid,true)=
        'CREATE TRIGGER pads_mark_driver_route_reference_stale AFTER UPDATE OF company, state, county, latitude, longitude, structured_road_sequence, written_directions, directions_clear ON pads FOR EACH ROW EXECUTE FUNCTION mark_driver_route_reference_stale()'
      and pg_catalog.md5(pg_catalog.pg_get_functiondef(proc.oid))=
        'd3c3caa7223852bcfce5b55792554cb8'
  ) or not exists(
    select 1
    from pg_catalog.pg_trigger trigger
    join pg_catalog.pg_proc proc on proc.oid=trigger.tgfoid
    where trigger.tgrelid='public.pads'::pg_catalog.regclass
      and trigger.tgname='brinesearch_v18_directory_snapshot_invalidate'
      and trigger.tgenabled='O'
      and pg_catalog.pg_get_triggerdef(trigger.oid,true)=
        'CREATE TRIGGER brinesearch_v18_directory_snapshot_invalidate AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON pads FOR EACH STATEMENT EXECUTE FUNCTION private_verification.brinesearch_v18_withdraw_directory_snapshot_on_source_change()'
      and pg_catalog.md5(pg_catalog.pg_get_functiondef(proc.oid))=
        '214b88fe8950995bf93ab25f0db4dc4e'
  ) or not exists(
    select 1
    from pg_catalog.pg_trigger trigger
    join pg_catalog.pg_proc proc on proc.oid=trigger.tgfoid
    where trigger.tgrelid='public.pads'::pg_catalog.regclass
      and trigger.tgname='brinesearch_v18_company_road_overlay_invalidate'
      and trigger.tgenabled='O'
      and pg_catalog.pg_get_triggerdef(trigger.oid,true)=
        'CREATE TRIGGER brinesearch_v18_company_road_overlay_invalidate AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON pads FOR EACH STATEMENT EXECUTE FUNCTION private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change()'
      and pg_catalog.md5(pg_catalog.pg_get_functiondef(proc.oid))=
        'f8a17bbf83b1e58f5be6091750a24584'
  ) then
    raise exception 'BILINOVICH trigger/audit checkpoint diverged';
  end if;
end
$preflight$;

-- A statement-level directions trigger rebuilds the entire direction corpus.
-- The ordinary audit trigger also consumes a non-transactional sequence value,
-- which would leave a persistent delta after a rollback rehearsal. Disable
-- only those two exact triggers for this one target-row correction. The audit
-- row below uses a fixed negative key, never nextval. Any failure rolls both
-- trigger states and the explicit audit row back with the transaction.
alter table public.pads
  disable trigger brinesearch_direction_intelligence_refresh;
alter table public.pads
  disable trigger pads_audit_update;

create temporary table tmp_bilinovich_update_result on commit drop as
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
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'revision',expected.revision,
        'reviewed_at',expected.installed_at,
        'scope','reviewed_display_only',
        'previous',pg_catalog.jsonb_build_object(
          'structured_road_sequence',expected.old_sequence,
          'directions_clear',expected.old_clear,
          'directions_clear_method',expected.old_method,
          'directions_clear_updated_at','2026-08-08T03:14:42.681309Z',
          'directions_clear_sha256','38b970dada330a696352e40c4c9b81964be6674a1f5e28038c3da3b5b12cbbb1'
        ),
        'raw_written_directions_preserved',true,
        'raw_written_directions_sha256',
          'fe4f19d922cf8887351d7ca3f876336e6fccc3b81c76d848eea82c9ea1d7eff0',
        'replacement_sequence',expected.new_sequence,
        'coordinate_evidence',pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('role','exit_193_ramp_reference','latitude',40.05399000,'longitude',-81.32158450,'source','owner supplied exact GPS; Google turn list visually checked','confidence','owner_reviewed'),
          pg_catalog.jsonb_build_object('role','oh_513_ramp_junction','latitude',40.05308330,'longitude',-81.32532670,'source','owner supplied exact GPS; Google turn list visually checked','confidence','owner_reviewed'),
          pg_catalog.jsonb_build_object('role','us_22_turn','latitude',40.12053090,'longitude',-81.35869280,'source','owner supplied exact GPS; Google turn list visually checked','confidence','owner_reviewed'),
          pg_catalog.jsonb_build_object('role','us_22_to_mccoy_physical_turn','latitude',40.12330216,'longitude',-81.35434374,'source','owner supplied exact GPS; Guernsey County Road Centerline layer 84','confidence','exact_reviewed_junction'),
          pg_catalog.jsonb_build_object('role','mccoy_google_safe_after_turn','latitude',40.12303995,'longitude',-81.35382341,'source','GIS-designed point inside McCoy; visually checked in Google','confidence','shaping_only'),
          pg_catalog.jsonb_build_object('role','mccoy_blaze_physical_turn','latitude',40.112922973,'longitude',-81.294912730,'source','owner satellite correction; Guernsey County Road Centerline layer 84','confidence','exact_reviewed_junction'),
          pg_catalog.jsonb_build_object('role','blaze_google_safe_after_turn','latitude',40.112583770,'longitude',-81.294937982,'source','GIS-designed point 37.7 m inside Blaze; visually checked in Google','confidence','shaping_only'),
          pg_catalog.jsonb_build_object('role','blaze_logan_physical_junction','latitude',40.099937405,'longitude',-81.298003204,'source','owner supplied exact GPS; Guernsey County Road Centerline layer 84','confidence','exact_reviewed_junction'),
          pg_catalog.jsonb_build_object('role','logan_google_safe_point','latitude',40.09955931,'longitude',-81.29781917,'source','GIS-designed point inside Logan; visually checked in Google','confidence','shaping_only'),
          pg_catalog.jsonb_build_object('role','logan_turkle_physical_junction','latitude',40.088758168,'longitude',-81.300650392,'source','owner supplied exact GPS; Guernsey County Road Centerline layer 84','confidence','exact_reviewed_junction'),
          pg_catalog.jsonb_build_object('role','turkle_google_safe_point','latitude',40.08865270,'longitude',-81.30095089,'source','GIS-designed point inside Turkle; visually checked in Google','confidence','shaping_only'),
          pg_catalog.jsonb_build_object('role','saved_lease_approach','latitude',40.08863000,'longitude',-81.30416400,'source','existing saved BrineSearch coordinate','confidence','saved_destination_not_verified_public_entrance'),
          pg_catalog.jsonb_build_object('role','pad_wellhead_area_centroid','latitude',40.08738445,'longitude',-81.30282620,'source','ODNR WellPads ObjectID 792 and exact BILINOVICH APIs','confidence','odnr_derived_pad_surface_not_entrance')
        ),
        'google_candidate',pg_catalog.jsonb_build_object(
          'url',expected.candidate_url,
          'status','visually_validated_candidate_unpublished',
          'waypoint_limit',3,
          'preserves_mccoy_blaze_logan',true,
          'avoids_mccoy_merry_penrose_detour',true,
          'backtracking_observed',false,
          'public_google_authority',false
        ),
        'authority',pg_catalog.jsonb_build_object(
          'structured_steps_created',false,
          'geometry_created',false,
          'graph_changed',false,
          'destination_released',false,
          'google_published',false,
          'cutover_changed',false
        )
      )),
      true
    )
from tmp_bilinovich_expected expected
where pad.id=expected.pad_id
  and pad.legacy_id='ascent--bilinovich'
  and pad.company='Ascent' and pad.pad_name='BILINOVICH'
  and pad.state='Ohio' and pad.county='Guernsey'
  and pg_catalog.upper(pad.township)='LONDONDERRY'
  and pad.latitude=40.08863 and pad.longitude=-81.304164
  and pad.structured_road_sequence=expected.old_sequence
  and pad.directions_clear=expected.old_clear
  and pad.directions_clear_method=expected.old_method
  and pad.directions_clear_updated_at='2026-08-08T03:14:42.681309Z'
  and pg_catalog.encode(extensions.digest(
    coalesce(pad.written_directions,''),'sha256'
  ),'hex')='fe4f19d922cf8887351d7ca3f876336e6fccc3b81c76d848eea82c9ea1d7eff0'
  and pad.structured_route_steps='[]'::jsonb
  and pad.structured_route_revision=0
  and pad.brinesearch_google_route_status_issue97='not_evaluated'
  and pad.brinesearch_google_route_revision_issue97 is null
returning pad.id
)
select pg_catalog.count(*)::integer as row_count from changed;

do $verify_target_update$
begin
  if (select row_count from tmp_bilinovich_update_result)<>1 then
    raise exception 'BILINOVICH exact target update count diverged';
  end if;
end
$verify_target_update$;

alter table public.pads
  enable trigger pads_audit_update;
alter table public.pads
  enable trigger brinesearch_direction_intelligence_refresh;

create temporary table tmp_bilinovich_audit_result on commit drop as
with inserted as (
insert into public.pad_edit_history(
  id,pad_id,editor_user_id,changed_at,changed_fields,old_data,new_data
)
overriding system value
select
  -20260827000828,
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
from tmp_bilinovich_expected expected
cross join tmp_bilinovich_before before_state
join public.pads pad on pad.id=expected.pad_id
returning id
)
select pg_catalog.count(*)::integer as row_count from inserted;

do $verify_audit_insert$
begin
  if (select row_count from tmp_bilinovich_audit_result)<>1 then
    raise exception 'BILINOVICH deterministic audit insert count diverged';
  end if;
end
$verify_audit_insert$;

-- The row trigger correctly invalidates reviewed-direction verification when
-- display text changes. Restore only that display verification with explicit
-- owner evidence. GPS and roads remain unverified; route authority stays held.
create temporary table tmp_bilinovich_verification_result on commit drop as
with changed as (
update public.pad_verification_status verification
set directions_verified=true,
    roads_verified=false,
    evidence=pg_catalog.jsonb_set(
      coalesce(verification.evidence,'{}'::jsonb),
      '{directions}',
      pg_catalog.jsonb_build_object(
        'basis','Owner-corrected exact-GPS reviewed display route; official county identities and ODNR destination references checked. This is not structured route, graph, destination, or Google-public authority.',
        'auto_reviewed',false,
        'reviewed_display_only',true,
        'revision','2026-08-26-bilinovich-owner-correction-v1',
        'route_authority_upgrade',false,
        'public_google_publication',false
      ),
      true
    ),
    review_note='BILINOVICH owner correction: McCoy to Blaze to Logan to Turkle reviewed display only; route/graph/destination/Google held.',
    updated_at=(select installed_at from tmp_bilinovich_expected)
where verification.pad_id=(select pad_id from tmp_bilinovich_expected)
  and not verification.gps_verified
  and not verification.directions_verified
  and not verification.roads_verified
  and verification.wells_verified
  and verification.api_verified
  and not verification.property_verified
returning verification.pad_id
)
select pg_catalog.count(*)::integer as row_count from changed;

do $verify_verification_update$
begin
  if (select row_count from tmp_bilinovich_verification_result)<>1 then
    raise exception 'BILINOVICH verification update count diverged';
  end if;
end
$verify_verification_update$;

do $postflight$
declare
  v_expected tmp_bilinovich_expected%rowtype;
  v_before tmp_bilinovich_before%rowtype;
  v_status jsonb;
  v_bundle jsonb;
  v_audit public.pad_edit_history%rowtype;
begin
  select * into strict v_expected from tmp_bilinovich_expected;
  select * into strict v_before from tmp_bilinovich_before;

  if not exists(
    select 1 from public.pads pad
    where pad.id=v_expected.pad_id
      and pad.legacy_id='ascent--bilinovich'
      and pad.structured_road_sequence=v_expected.new_sequence
      and pad.directions_clear=v_expected.new_clear
      and pad.directions_clear_method=v_expected.new_method
      and pad.directions_clear_updated_at=v_expected.installed_at
      and pad.updated_at=v_expected.installed_at
      and pg_catalog.encode(extensions.digest(
        coalesce(pad.written_directions,''),'sha256'
      ),'hex')='fe4f19d922cf8887351d7ca3f876336e6fccc3b81c76d848eea82c9ea1d7eff0'
      and pad.latitude=40.08863 and pad.longitude=-81.304164
      and pad.structured_route_steps='[]'::jsonb
      and pad.structured_route_revision=0
      and pad.brinesearch_google_route_status_issue97='not_evaluated'
      and pad.brinesearch_google_route_revision_issue97 is null
      and pg_catalog.jsonb_array_length(
        pad.extra_data->'reviewed_direction_revision_history'
      )=1
      and pad.extra_data#>>'{reviewed_direction_revision_history,0,revision}'=
        v_expected.revision
      and pad.extra_data#>>'{reviewed_direction_revision_history,0,google_candidate,status}'=
        'visually_validated_candidate_unpublished'
      and pad.extra_data#>>'{reviewed_direction_revision_history,0,google_candidate,public_google_authority}'=
        'false'
  ) then
    raise exception 'BILINOVICH corrected reviewed row did not install exactly';
  end if;

  if not exists(
    select 1 from public.brinesearch_driver_directions_public directions
    where directions.pad_id=v_expected.pad_id
      and directions.directions_clear=v_expected.new_clear
      and directions.source_revision=v_expected.installed_at
  ) or not exists(
    select 1 from public.public_pad_detail detail
    where detail.id=v_expected.pad_id
      and detail.structured_road_sequence=v_expected.new_sequence
      and detail.directions_clear=v_expected.new_clear
      and detail.updated_at=v_expected.installed_at
      and detail.written_directions=
        (v_before.pad_row->>'written_directions')
      and not (
        coalesce(detail.extra_data,'{}'::jsonb)
          ? 'reviewed_direction_revision_history'
      )
      and pg_catalog.strpos(coalesce(detail.extra_data::text,''),'google.com/maps')=0
  ) then
    raise exception 'BILINOVICH safe public display projection did not update';
  end if;

  if not exists(
    select 1 from public.pad_verification_status verification
    where verification.pad_id=v_expected.pad_id
      and not verification.gps_verified
      and verification.directions_verified
      and not verification.roads_verified
      and verification.evidence#>>'{directions,revision}'=v_expected.revision
      and verification.evidence#>>'{directions,route_authority_upgrade}'='false'
      and verification.evidence#>>'{directions,public_google_publication}'='false'
  ) then
    raise exception 'BILINOVICH display verification did not remain fail-closed';
  end if;

  if not exists(
    select 1 from public.brinesearch_driver_route_reference reference
    where reference.pad_id=v_expected.pad_id
      and reference.status=v_before.route_reference_row->>'status'
      and reference.anchor_name=v_before.route_reference_row->>'anchor_name'
      and reference.is_stale
      -- A stale reference retains the hash of the source it was reviewed
      -- against. The trigger deliberately does not replace it with the new
      -- display-route hash until the reference is independently refreshed.
      and reference.route_hash=v_before.route_reference_row->>'route_hash'
      and reference.route_hash is distinct from pg_catalog.md5(
        pg_catalog.concat_ws(E'\x1f',
          'Ascent','Ohio','Guernsey','40.08863','-81.304164',
          v_expected.new_sequence,
          v_before.pad_row->>'written_directions',v_expected.new_clear
        )
      )
      and reference.updated_at=v_expected.installed_at
  ) then
    raise exception 'BILINOVICH old distance reference was not safely marked stale';
  end if;

  select public.brinesearch_v18_driver_pad_status(v_expected.pad_id)
  into strict v_status;
  if v_status#>>'{route,source}' is distinct from 'legacy_written'
     or v_status#>>'{route,state}' is distinct from 'held'
     or v_status#>>'{route,writtenDirections}' is distinct from v_expected.new_clear
     or v_status#>'{route,steps}' is distinct from '[]'::jsonb
     or v_status#>'{route,geometry}' is distinct from 'null'::jsonb
     or v_status->'graph' is distinct from v_before.driver_status->'graph'
     or v_status->'google' is distinct from v_before.driver_status->'google'
     or v_status->'destination' is distinct from v_before.driver_status->'destination' then
    raise exception 'BILINOVICH corrected display escaped held authority: %',v_status;
  end if;

  select public.brinesearch_v18_driver_pad_status_with_named_approaches(
    v_expected.pad_id
  ) into strict v_bundle;
  if (v_bundle-array[
       'status','namedApproaches','publicGoogleRoute','publicGoogleHandoff'
     ]::text[]) is distinct from '{}'::jsonb
     or v_bundle#>>'{status,route,source}' is distinct from 'legacy_written'
     or v_bundle#>>'{status,route,state}' is distinct from 'held'
     or v_bundle#>>'{status,route,writtenDirections}'
          is distinct from v_expected.new_clear
     or v_bundle#>'{status,route,steps}' is distinct from '[]'::jsonb
     or v_bundle#>'{status,route,geometry}' is distinct from 'null'::jsonb
     or v_bundle#>'{status,graph}'
          is distinct from v_before.atomic_bundle#>'{status,graph}'
     or v_bundle#>'{status,google}'
          is distinct from v_before.atomic_bundle#>'{status,google}'
     or v_bundle#>'{status,destination}'
          is distinct from v_before.atomic_bundle#>'{status,destination}'
     or v_bundle->'namedApproaches' is distinct from '[]'::jsonb
     or v_bundle->'publicGoogleRoute' is distinct from 'null'::jsonb
     or v_bundle->'publicGoogleHandoff' is distinct from 'null'::jsonb then
    raise exception 'BILINOVICH atomic V18 envelope escaped held authority: %',
      v_bundle;
  end if;

  if (select pg_catalog.count(*) from public.pad_edit_history history
      where history.pad_id=v_expected.pad_id)<>v_before.audit_count+1 then
    raise exception 'BILINOVICH audit history cardinality diverged';
  end if;
  select history.* into strict v_audit
  from public.pad_edit_history history
  where history.id=-20260827000828
    and history.pad_id=v_expected.pad_id;
  if v_audit.old_data->>'directions_clear' is distinct from v_expected.old_clear
     or v_audit.new_data->>'directions_clear' is distinct from v_expected.new_clear
     or v_audit.old_data->>'structured_road_sequence'
          is distinct from v_expected.old_sequence
     or v_audit.new_data->>'structured_road_sequence'
          is distinct from v_expected.new_sequence
     or v_audit.old_data->>'written_directions'
          is distinct from v_audit.new_data->>'written_directions'
     or not (v_audit.changed_fields @> array[
          'directions_clear','directions_clear_method',
          'directions_clear_updated_at','structured_road_sequence',
          'extra_data','updated_at'
        ]::text[]) then
    raise exception 'BILINOVICH prior reviewed text was not preserved in audit history';
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
    raise exception 'Direction-intelligence or audit trigger was not restored';
  end if;

  if (select last_value from public.pad_edit_history_id_seq)
       is distinct from v_before.audit_sequence_last_value
     or (select is_called from public.pad_edit_history_id_seq)
       is distinct from v_before.audit_sequence_is_called then
    raise exception 'BILINOVICH correction advanced the audit sequence';
  end if;

  if (select count(*) from public.brinesearch_directory_snapshots_v18
      where publication_state='current')<>0
     or not exists(
       select 1 from public.brinesearch_directory_snapshots_v18 snapshot
       where snapshot.snapshot_id=v_before.directory_snapshot_id
         and snapshot.source_revision=v_before.directory_revision
         and snapshot.publication_state='withdrawn'
         and snapshot.retained_until is null
         and (pg_catalog.to_jsonb(snapshot)-array[
              'publication_state','retained_until'
            ]::text[])=
            (v_before.directory_snapshot_row-array[
              'publication_state','retained_until'
            ]::text[])
     )
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(snapshot)::text,'|'
       order by pg_catalog.to_jsonb(snapshot)::text
     ),'')) from public.brinesearch_directory_snapshots_v18 snapshot
       where snapshot.snapshot_id<>v_before.directory_snapshot_id)
       is distinct from v_before.other_directory_snapshots_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from public.brinesearch_directory_snapshot_rows_v18 row_value)
       is distinct from v_before.directory_rows_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from public.brinesearch_directory_snapshot_well_rows_v18 row_value)
       is distinct from v_before.directory_well_rows_digest
     or (select count(*) from public.brinesearch_company_road_overlay_snapshots_v18
         where publication_state='current')<>0
     or not exists(
       select 1 from public.brinesearch_company_road_overlay_snapshots_v18 snapshot
       where snapshot.snapshot_id=v_before.overlay_snapshot_id
         and snapshot.content_sha256=v_before.overlay_sha256
         and snapshot.publication_state='withdrawn'
         and snapshot.retained_until is null
         and (pg_catalog.to_jsonb(snapshot)-array[
              'publication_state','retained_until'
            ]::text[])=
            (v_before.overlay_snapshot_row-array[
              'publication_state','retained_until'
            ]::text[])
     )
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(snapshot)::text,'|'
       order by pg_catalog.to_jsonb(snapshot)::text
     ),'')) from public.brinesearch_company_road_overlay_snapshots_v18 snapshot
       where snapshot.snapshot_id<>v_before.overlay_snapshot_id)
       is distinct from v_before.other_overlay_snapshots_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from public.brinesearch_company_road_overlay_rows_v18 row_value)
       is distinct from v_before.overlay_rows_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(release_row)::text,'|'
       order by pg_catalog.to_jsonb(release_row)::text
     ),''))
       from private_verification.brinesearch_v18_company_road_overlay_releases release_row)
       is distinct from v_before.overlay_release_digest
     or exists(
       select 1
       from private_verification.brinesearch_v18_company_road_overlay_releases release
       where release.overlay_snapshot_id=v_before.overlay_snapshot_id
         and release.approval_state='approved'
     ) then
    raise exception 'Directory/overlay source-change withdrawal was not exact';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from public.pads row_value where row_value.id<>v_expected.pad_id)
       is distinct from v_before.non_target_pad_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from public.public_pad_detail row_value where row_value.id<>v_expected.pad_id)
       is distinct from v_before.non_target_public_detail_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from public.pad_verification_status row_value
       where row_value.pad_id<>v_expected.pad_id)
       is distinct from v_before.non_target_verification_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from public.brinesearch_driver_route_reference row_value
       where row_value.pad_id<>v_expected.pad_id)
       is distinct from v_before.non_target_reference_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from public.brinesearch_direction_step_intelligence row_value)
       is distinct from v_before.direction_intelligence_digest then
    raise exception 'BILINOVICH correction changed non-target display/intelligence data';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from public.brinesearch_road_graph_builds row_value)
       is distinct from v_before.graph_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from public.brinesearch_route_prep row_value)
       is distinct from v_before.route_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from public.brinesearch_route_prep_steps row_value)
       is distinct from v_before.route_step_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from private_verification.brinesearch_route_occurrence_receipts_issue97 row_value)
       is distinct from v_before.occurrence_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 row_value)
       is distinct from v_before.occurrence_geometry_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from private_verification.brinesearch_route_occurrence_geometry_history_issue97 row_value)
       is distinct from v_before.occurrence_geometry_history_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from private_verification.brinesearch_route_transition_receipts_issue97 row_value)
       is distinct from v_before.transition_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from private_verification.brinesearch_route_reconciliation_receipts_issue97 row_value)
       is distinct from v_before.reconciliation_digest then
    raise exception 'BILINOVICH correction changed route or graph authority';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from public.brinesearch_driver_google_routes_public row_value)
       is distinct from v_before.public_google_route_digest then
    raise exception 'BILINOVICH correction changed public Google routes';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from public.brinesearch_driver_google_handoffs_public row_value)
       is distinct from v_before.public_google_handoff_digest then
    raise exception 'BILINOVICH correction changed public Google handoffs';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from private_verification.brinesearch_v18_google_handoff_receipts row_value)
       is distinct from v_before.private_google_handoff_digest then
    raise exception 'BILINOVICH correction changed private Google handoff receipts';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from private_verification.brinesearch_google_route_receipts_issue97 row_value)
       is distinct from v_before.private_google_route_receipt_digest then
    raise exception 'BILINOVICH correction changed private Google route receipts';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from private_verification.brinesearch_google_route_refresh_queue_issue97 row_value)
       is distinct from v_before.private_google_queue_digest then
    raise exception 'BILINOVICH correction changed private Google refresh queue';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from private_verification.brinesearch_v18_public_google_route_releases row_value)
       is distinct from v_before.private_google_release_digest then
    raise exception 'BILINOVICH correction changed private Google releases';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from private_verification.brinesearch_v18_core_destination_releases row_value)
       is distinct from v_before.private_destination_release_digest then
    raise exception 'BILINOVICH correction changed private destination releases';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|'
       order by pg_catalog.to_jsonb(row_value)::text
     ),'')) from public.brinesearch_driver_core_destination_releases_public row_value)
       is distinct from v_before.public_destination_release_digest then
    raise exception 'BILINOVICH correction changed public destination releases';
  end if;

  -- Cutover authority is the singleton's activation identity, not its
  -- incidental metadata timestamp. Keep the actual authority fail-closed.
  if (select pg_catalog.count(*)
      from public.brinesearch_issue97_release_state state
      where state.singleton)<>1
     or (select pg_catalog.jsonb_build_object(
           'singleton',state.singleton,
           'cutover_at',state.cutover_at,
           'cutover_by',state.cutover_by,
           'review_details',state.review_details,
           'created_at',state.created_at,
           'updated_at',state.updated_at
         )-'updated_at'
         from public.brinesearch_issue97_release_state state
         where state.singleton)
       is distinct from (v_before.release_state_row-'updated_at')
     or exists(
       select 1 from public.brinesearch_issue97_release_state state
       where state.singleton
         and (state.cutover_at is not null or state.cutover_by is not null)
     ) then
    raise exception 'BILINOVICH correction changed cutover authority';
  end if;
end
$postflight$;
