-- GitHub #97 -- STUART HENDERSON's saved OH-646 occurrence traverses the
-- exact TAPPAN SCIO RD source segments.  The identity-wide fallback label is
-- ANNAPOLIS RD, which belongs to the same long SR-646 identity but not to this
-- occurrence.  Bind the driver-facing name to the exact source segment while
-- preserving route identity, graph, geometry, readiness, Google, and cutover.

set local statement_timeout = '10min';
set local lock_timeout = '5s';

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:v18:directory-snapshot',18)
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:v18:company-road-overlay',18)
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:issue97:all-pad-routing-pipeline',97)
);

create temporary table tmp_issue97_stuart_before on commit drop as
select
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(build)::text,'|' order by build.id
  ),'')) from public.brinesearch_road_graph_builds build) as graph_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(pad)::text,'|' order by pad.id
  ),'')) from public.pads pad) as pad_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(route)::text,'|' order by route.id
  ),'')) from public.brinesearch_route_prep route) as route_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(step)::text,'|' order by step.id
  ),'')) from public.brinesearch_route_prep_steps step
    where step.id<>'f7161ff9-60d0-46ad-9fb5-3d023f8fa5ca')
    as non_target_step_digest,
  (select pg_catalog.to_jsonb(step)-'source_details'-'updated_at'-'match_method'
   from public.brinesearch_route_prep_steps step
   where step.id='f7161ff9-60d0-46ad-9fb5-3d023f8fa5ca')
    as target_step_semantic,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_step_id
  ),''))
   from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
   where receipt.route_prep_step_id<>'f7161ff9-60d0-46ad-9fb5-3d023f8fa5ca')
    as non_target_occurrence_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_step_id
  ),''))
   from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
   where receipt.route_prep_id<>'0415cc7e-fcff-4768-a280-b55476b073d3')
    as non_target_geometry_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    (pg_catalog.to_jsonb(receipt)-'updated_at'-'resolved_at'-
      'receipt_digest'-'dependency_digest'-
      'start_transition_digest'-'end_transition_digest'-'evidence')::text,
    '|' order by receipt.occurrence_index
  ),''))
   from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
   where receipt.route_prep_id='0415cc7e-fcff-4768-a280-b55476b073d3')
    as target_geometry_semantic_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.boundary_index
  ),''))
   from private_verification.brinesearch_route_transition_receipts_issue97 receipt
   where receipt.route_prep_id<>'0415cc7e-fcff-4768-a280-b55476b073d3')
    as non_target_transition_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.jsonb_build_object(
      'route_prep_id',receipt.route_prep_id,
      'pad_id',receipt.pad_id,
      'route_group',receipt.route_group,
      'variant_index',receipt.variant_index,
      'boundary_index',receipt.boundary_index,
      'left_route_prep_step_id',receipt.left_route_prep_step_id,
      'right_route_prep_step_id',receipt.right_route_prep_step_id,
      'left_identity_id',receipt.left_identity_id,
      'right_identity_id',receipt.right_identity_id,
      'left_road_id',receipt.left_road_id,
      'right_road_id',receipt.right_road_id,
      'status',receipt.status,
      'resolution_method',receipt.resolution_method,
      'hold_reason',receipt.hold_reason,
      'stable_junction_key',junction.stable_junction_key,
      'anchor_role',receipt.anchor_role,
      'coordinate',receipt.coordinate,
      'candidate_count',receipt.candidate_count,
      'graph_digest',receipt.graph_digest,
      'anchor_digest',receipt.anchor_digest
    )::text,
    '|' order by receipt.boundary_index
  ),''))
   from private_verification.brinesearch_route_transition_receipts_issue97 receipt
   join public.brinesearch_road_junctions junction
     on junction.id=receipt.junction_id
   where receipt.route_prep_id='0415cc7e-fcff-4768-a280-b55476b073d3')
    as target_transition_semantic_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id
  ),''))
   from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
   where receipt.route_prep_id<>'0415cc7e-fcff-4768-a280-b55476b073d3')
    as non_target_reconciliation_digest,
  (select pg_catalog.to_jsonb(receipt)-'updated_at'-
      'receipt_digest'-'dependency_digest'-'evidence'
   from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
   where receipt.route_prep_id='0415cc7e-fcff-4768-a280-b55476b073d3')
    as target_reconciliation_semantic,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.pad_id
  ),'')) from private_verification.brinesearch_google_route_receipts_issue97 receipt)
    as private_google_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(route)::text,'|' order by route.pad_id
  ),'')) from public.brinesearch_driver_google_routes_public route)
    as public_google_digest,
  (select count(*) from public.brinesearch_driver_google_routes_public)
    as public_google_count,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(direction)::text,'|' order by direction.pad_id
  ),'')) from public.brinesearch_driver_directions_public direction)
    as directions_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(row)::text,'|' order by row.snapshot_id,row.pad_id
  ),'')) from public.brinesearch_directory_snapshot_rows_v18 row)
    as directory_rows_digest,
  (select snapshot_id from public.brinesearch_directory_snapshots_v18
   where publication_state='current') as directory_snapshot_id,
  (select source_revision from public.brinesearch_directory_snapshots_v18
   where publication_state='current') as directory_revision,
  (select snapshot_id from public.brinesearch_company_road_overlay_snapshots_v18
   where publication_state='current') as overlay_snapshot_id,
  (select content_sha256 from public.brinesearch_company_road_overlay_snapshots_v18
   where publication_state='current') as overlay_content_sha256,
  (select cutover_at from public.brinesearch_issue97_release_state where singleton)
    as cutover_at,
  (select public.brinesearch_v18_driver_pad_status(
    '3ef517c7-c783-490c-878f-2a82ebc0c2cf'
  )) as public_status;

do $issue97_stuart_preconditions$
declare
  v_overlap_count integer;
  v_overlap_m double precision;
begin
  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_occurrence_driver_name(uuid,uuid)'::
         pg_catalog.regprocedure
     ))<>'cf5c0ab2d8e070418d4f8a9f4fcfca85'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::
         pg_catalog.regprocedure
     ))<>'f8431e99d1573f59fc7cd11ab7725e51'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_refresh_transition_receipts(uuid)'::
         pg_catalog.regprocedure
     ))<>'5d6a002a25bd37011b574858b3870382'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_refresh_route_geometry(uuid)'::
         pg_catalog.regprocedure
     ))<>'d605449432a99f39e13c16aa6f2c8662'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_refresh_route_receipt(uuid)'::
         pg_catalog.regprocedure
     ))<>'8283a543bf42f939296d32e5e5a92b4f'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_dataset_scope_current(uuid,text,text)'::
         pg_catalog.regprocedure
     ))<>'a9a808efeb53a1fec977229afb1ab6df'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_identity_driver_name(uuid)'::
         pg_catalog.regprocedure
     ))<>'279d434b23a7aa871a5845d2264678dd'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_v18_exact_route_projection(uuid,integer)'::
         pg_catalog.regprocedure
     ))<>'6056ebecfb3f2a35872a0f80f47b30d9'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_v18_exact_route_projection_cached(uuid,integer)'::
         pg_catalog.regprocedure
     ))<>'e014a2c12f659be6d8c6156efaeeccbf'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_v18_company_road_authority_definition_sha256()'::
         pg_catalog.regprocedure
     ))<>'1f9cd463cdff07fbe21b1fbb6241ff6c'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change()'::
         pg_catalog.regprocedure
     ))<>'f8a17bbf83b1e58f5be6091750a24584'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_v18_driver_pad_status(uuid)'::pg_catalog.regprocedure
     ))<>'568d9dc661706002e4f516399a1685d1' then
    raise exception 'Issue #97 STUART reviewed function checkpoint diverged';
  end if;

  if (select count(*)
      from private_verification.brinesearch_route_transition_receipts_issue97 receipt
      where receipt.route_prep_id='0415cc7e-fcff-4768-a280-b55476b073d3'
        and receipt.status='resolved'
        and receipt.graph_build_id='0870470a-11f8-4f33-8af3-08d6849d5f34'
        and receipt.source_revision_digest='ece929162c9063ea35a6a276de59a940'
     )<>2 then
    raise exception 'Issue #97 STUART retired-build transition checkpoint diverged';
  end if;

  if not exists(
    select 1 from public.pads pad
    where pad.id='3ef517c7-c783-490c-878f-2a82ebc0c2cf'
      and pad.legacy_id='eog--stuart-henderson'
      and pad.pad_name='STUART HENDERSON'
      and pad.state='Ohio' and pad.county='Harrison'
      and pad.latitude=40.36199 and pad.longitude=-81.128728
  ) then
    raise exception 'Issue #97 STUART pad checkpoint diverged';
  end if;

  if not exists(
    select 1 from public.brinesearch_route_prep route
    where route.id='0415cc7e-fcff-4768-a280-b55476b073d3'
      and route.pad_id='3ef517c7-c783-490c-878f-2a82ebc0c2cf'
      and route.route_group='primary' and route.variant_index=1 and route.active
      and route.source_sequence='Route 250 → Route 646 → Henderson Rd'
      and route.source_sequence_hash='3105a9974005c2ac7a4e0efe5f4a342e'
      and route.readiness_status='ready_for_road_matching'
      and route.no_guess_policy='strict'
  ) or (select count(*) from public.brinesearch_route_prep_steps step
        where step.route_prep_id='0415cc7e-fcff-4768-a280-b55476b073d3'
          and step.active)<>3
     or not exists(
       select 1 from public.brinesearch_route_prep_steps step
       where step.id='f7161ff9-60d0-46ad-9fb5-3d023f8fa5ca'
         and step.route_prep_id='0415cc7e-fcff-4768-a280-b55476b073d3'
         and step.step_order=2 and step.raw_text='Route 646'
         and step.normalized_text='Route 646' and step.step_kind='state_route'
         and step.road_id='9b980c79-5542-4b60-a9f9-c4639ddc2cc2'
         and step.match_status='exact_master'
         and step.match_method='v17312_evidence_backed_generic_route_resolution'
         and not step.source_details?'source_identity_key'
         and not step.source_details?'authoritative_driver_name_receipt'
     ) then
    raise exception 'Issue #97 STUART route/step checkpoint diverged';
  end if;

  if not exists(
    select 1
    from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
    where receipt.route_prep_step_id='f7161ff9-60d0-46ad-9fb5-3d023f8fa5ca'
      and receipt.route_prep_id='0415cc7e-fcff-4768-a280-b55476b073d3'
      and receipt.pad_id='3ef517c7-c783-490c-878f-2a82ebc0c2cf'
      and receipt.occurrence_index=2
      and receipt.resolution_status='resolved'
      and receipt.resolution_method='route_graph_unique_identity_path'
      and receipt.identity_id='99898ae8-b80a-06d3-71c3-7d3901867bcd'
      and receipt.canonical_road_id='9b980c79-5542-4b60-a9f9-c4639ddc2cc2'
      and receipt.source_identity_key='OH:ODOT:NLF:SHASSR00646**C'
      and receipt.driver_road_name='ANNAPOLIS RD'
      and array['ANNAPOLIS RD','TAPPAN SCIO RD']::text[] <@ receipt.valid_aliases
  ) then
    raise exception 'Issue #97 STUART current occurrence checkpoint diverged';
  end if;

  if not exists(
    select 1
    from public.brinesearch_authoritative_road_identities identity
    where identity.id='99898ae8-b80a-06d3-71c3-7d3901867bcd'
      and identity.source_identity_key='OH:ODOT:NLF:SHASSR00646**C'
      and identity.dataset_id='3efc5c6b-9666-ea1a-49b8-a68ba2055839'
      and identity.state_code='OH' and identity.county_code='HAS'
      and identity.route_system='SR' and identity.route_number='646'
      and identity.source_digest='d1c7fe6571d0a3e799c4b46355797d5f'
      and identity.active and identity.drivable_status='drivable'
      and identity.public_access_status='public'
  ) or private_verification.brinesearch_issue97_identity_driver_name(
       '99898ae8-b80a-06d3-71c3-7d3901867bcd'
     ) is distinct from 'ANNAPOLIS RD'
     or not array['ANNAPOLIS RD','TAPPAN SCIO RD']::text[] <@
       private_verification.brinesearch_issue97_identity_aliases(
         '99898ae8-b80a-06d3-71c3-7d3901867bcd',
         '9b980c79-5542-4b60-a9f9-c4639ddc2cc2'
       ) then
    raise exception 'Issue #97 STUART SR-646 identity/name checkpoint diverged';
  end if;

  if not exists(
    select 1
    from public.brinesearch_authoritative_segment_identity_assignments assignment
    join public.brinesearch_authoritative_road_names name
      on name.identity_id=assignment.identity_id
     and name.source_dataset_id=assignment.dataset_id
     and name.source_segment_key=assignment.source_segment_key
     and name.id=28814 and name.name_type='official'
     and name.road_name='TAPPAN SCIO RD' and name.active
     and (name.valid_from is null or name.valid_from<=now())
     and (name.valid_to is null or name.valid_to>now())
    where assignment.identity_id='99898ae8-b80a-06d3-71c3-7d3901867bcd'
      and assignment.source_segment_key='OH:ODOT:SEGMENT:2025_000000000302354'
      and assignment.assignment_method='connected_component'
      and assignment.source_digest='9f97036fbc6073e5f82dd159f2147eca'
      and assignment.active
      and private_verification.brinesearch_issue97_dataset_scope_current(
        assignment.dataset_id,'OH','HAS'
      )
  ) then
    raise exception 'Issue #97 STUART exact Tappan Scio segment proof diverged';
  end if;

  select count(*)::integer,
         coalesce(pg_catalog.sum(overlap.overlap_m),0)::double precision
  into v_overlap_count,v_overlap_m
  from (
    select segment.source_segment_key,
      extensions.st_length(
        extensions.st_intersection(segment.geom,geometry.step_geometry)::
          extensions.geography
      ) as overlap_m
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
    join private_verification.brinesearch_issue97_authoritative_road_segments_internal segment
      on segment.identity_id=geometry.identity_id and segment.active
    where geometry.route_prep_step_id='f7161ff9-60d0-46ad-9fb5-3d023f8fa5ca'
      and geometry.status='resolved'
      and geometry.geometry_method='issue69_equivalent_exact_component_clip'
      and geometry.geometry_miles=1.797322
  ) overlap
  where overlap.overlap_m>0.01;
  if v_overlap_count<>6 or v_overlap_m<2856 or v_overlap_m>2858
     or exists(
       select 1
       from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
       join private_verification.brinesearch_issue97_authoritative_road_segments_internal segment
         on segment.identity_id=geometry.identity_id and segment.active
       where geometry.route_prep_step_id='f7161ff9-60d0-46ad-9fb5-3d023f8fa5ca'
         and extensions.st_length(
           extensions.st_intersection(segment.geom,geometry.step_geometry)::
             extensions.geography
         )>0.01
         and not exists(
           select 1 from public.brinesearch_authoritative_road_names name
           where name.identity_id=segment.identity_id
             and name.source_dataset_id=segment.dataset_id
             and name.source_segment_key=segment.source_segment_key
             and name.name_type='official'
             and name.road_name='TAPPAN SCIO RD' and name.active
             and (name.valid_from is null or name.valid_from<=now())
             and (name.valid_to is null or name.valid_to>now())
         )
     ) then
    raise exception 'Issue #97 STUART exact occurrence/name overlap diverged: % segments, % m',
      v_overlap_count,v_overlap_m;
  end if;

  if not exists(
    select 1
    from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
    where receipt.route_prep_id='0415cc7e-fcff-4768-a280-b55476b073d3'
      and receipt.pad_id='3ef517c7-c783-490c-878f-2a82ebc0c2cf'
      and receipt.route_status='needs_review' and receipt.stage='exact_geometry'
      and receipt.road_occurrence_count=3 and receipt.resolved_occurrence_count=3
      and receipt.held_occurrence_count=0 and receipt.canonical_mapping_count=3
      and receipt.exact_geometry_count=2
      and receipt.exception_reasons=array['exact_occurrence_geometry_incomplete']::text[]
  ) or not exists(
    select 1
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
    where receipt.route_prep_step_id='f5eb54dc-0a4a-4144-9690-4fcb054e17ea'
      and receipt.status='held'
      and receipt.hold_reason='verified_pad_gps_not_on_final_authoritative_geometry'
      and receipt.identity_id='dbcc9da8-07cb-f054-68ca-debe2f8640fc'
      and receipt.end_coordinate is null and receipt.step_geometry is null
  ) then
    raise exception 'Issue #97 STUART fail-closed endpoint checkpoint diverged';
  end if;

  if (select count(*) from private_verification.brinesearch_google_route_receipts_issue97
      where pad_id='3ef517c7-c783-490c-878f-2a82ebc0c2cf')<>0
     or (select count(*) from public.brinesearch_driver_google_routes_public
      where pad_id='3ef517c7-c783-490c-878f-2a82ebc0c2cf')<>0
     or (select public_google_count from tmp_issue97_stuart_before)<>1
     or (select cutover_at from tmp_issue97_stuart_before) is not null
     or (select count(*) from public.brinesearch_directory_snapshots_v18
        where publication_state='current')<>1
     or (select count(*) from public.brinesearch_company_road_overlay_snapshots_v18
        where publication_state='current')<>1 then
    raise exception 'Issue #97 STUART Google/directory/overlay/cutover checkpoint diverged';
  end if;

  if (select count(distinct relation.relname)
      from pg_catalog.pg_trigger trigger
      join pg_catalog.pg_class relation on relation.oid=trigger.tgrelid
      join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
      where not trigger.tgisinternal
        and trigger.tgenabled<>'D'
        and trigger.tgname='brinesearch_v18_company_road_overlay_invalidate'
        and (namespace.nspname,relation.relname) in (
          ('public','brinesearch_route_prep_steps'),
          ('private_verification','brinesearch_route_occurrence_receipts_issue97'),
          ('private_verification','brinesearch_route_occurrence_geometry_receipts_issue97'),
          ('private_verification','brinesearch_route_transition_receipts_issue97'),
          ('private_verification','brinesearch_route_reconciliation_receipts_issue97')
        ))<>5 then
    raise exception 'Issue #97 STUART overlay invalidation trigger checkpoint diverged';
  end if;

  if (select public_status->'route'->>'source' from tmp_issue97_stuart_before)
       is distinct from 'legacy_written'
     or (select public_status->'route'->>'state' from tmp_issue97_stuart_before)
       is distinct from 'stale'
     or (select public_status->'route'->'steps' from tmp_issue97_stuart_before)
       is distinct from '[]'::jsonb
     or (select public_status->'route'->'geometry' from tmp_issue97_stuart_before)
       is distinct from 'null'::jsonb
     or (select public_status->'google'->>'publicState' from tmp_issue97_stuart_before)
       is distinct from 'unavailable' then
    raise exception 'Issue #97 STUART public fail-closed checkpoint diverged';
  end if;
end
$issue97_stuart_preconditions$;

do $issue97_stuart_stamp$
declare
  v_count integer;
begin
  update public.brinesearch_route_prep_steps
  set match_method='issue97_owner_reviewed_exact_source_identity',
      source_details=coalesce(source_details,'{}'::jsonb)||
      pg_catalog.jsonb_build_object(
        'issue',97,
        'source_identity_key','OH:ODOT:NLF:SHASSR00646**C',
        'authoritative_identity_key','OH:ODOT:NLF:SHASSR00646**C',
        'authoritative_identity_proof',true,
        'proof_scope','STUART HENDERSON OH-646 occurrence geometry overlaps only current ODOT TAPPAN SCIO RD source segments 2025_000000000302354 through 2025_000000000302359; identity, geometry, and route authority unchanged',
        'authoritative_driver_name_receipt',pg_catalog.jsonb_build_object(
          'proof','owner_reviewed_exact_source_segment',
          'identity_id','99898ae8-b80a-06d3-71c3-7d3901867bcd',
          'source_segment_key','OH:ODOT:SEGMENT:2025_000000000302354',
          'road_name','TAPPAN SCIO RD',
          'name_matching_used',false,
          'fuzzy_matching_used',false,
          'nearest_road_used',false
        ),
        'covered_source_segment_keys',pg_catalog.jsonb_build_array(
          'OH:ODOT:SEGMENT:2025_000000000302354',
          'OH:ODOT:SEGMENT:2025_000000000302355',
          'OH:ODOT:SEGMENT:2025_000000000302356',
          'OH:ODOT:SEGMENT:2025_000000000302357',
          'OH:ODOT:SEGMENT:2025_000000000302358',
          'OH:ODOT:SEGMENT:2025_000000000302359'
        ),
        'geometry_overlap_proof',pg_catalog.jsonb_build_object(
          'method','exact_authoritative_intersection',
          'source_segment_count',6,
          'exact_overlap_meters',2856.951,
          'official_road_name','TAPPAN SCIO RD',
          'selection_uses_name_similarity',false,
          'selection_uses_nearest_road',false
        ),
        'route_authority_upgrade',false,
        'public_google_publication',false,
        'name_matching_used',false,
        'fuzzy_matching_used',false,
        'nearest_road_used',false,
        'route_number_only_used',false
      ),
      updated_at=pg_catalog.clock_timestamp()
  where id='f7161ff9-60d0-46ad-9fb5-3d023f8fa5ca';
  get diagnostics v_count=row_count;
  if v_count<>1 then
    raise exception 'Issue #97 STUART driver-name stamp affected % rows',v_count;
  end if;

  if private_verification.brinesearch_issue97_occurrence_driver_name(
       'f7161ff9-60d0-46ad-9fb5-3d023f8fa5ca',
       '99898ae8-b80a-06d3-71c3-7d3901867bcd'
     ) is distinct from 'TAPPAN SCIO RD' then
    raise exception 'Issue #97 STUART exact driver-name receipt did not validate';
  end if;
end
$issue97_stuart_stamp$;

select private_verification.brinesearch_issue97_refresh_occurrence_candidate(
  'f7161ff9-60d0-46ad-9fb5-3d023f8fa5ca'
);
select private_verification.brinesearch_issue97_refresh_transition_receipts(
  '0415cc7e-fcff-4768-a280-b55476b073d3'
);
select private_verification.brinesearch_issue97_refresh_route_geometry(
  '0415cc7e-fcff-4768-a280-b55476b073d3'
);
select private_verification.brinesearch_issue97_refresh_route_receipt(
  '0415cc7e-fcff-4768-a280-b55476b073d3'
);

do $issue97_stuart_postconditions$
declare
  v_status jsonb;
begin
  if private_verification.brinesearch_issue97_identity_driver_name(
       '99898ae8-b80a-06d3-71c3-7d3901867bcd'
     ) is distinct from 'ANNAPOLIS RD'
     or private_verification.brinesearch_issue97_occurrence_driver_name(
       'f7161ff9-60d0-46ad-9fb5-3d023f8fa5ca',
       '99898ae8-b80a-06d3-71c3-7d3901867bcd'
     ) is distinct from 'TAPPAN SCIO RD' then
    raise exception 'Issue #97 STUART identity/occurrence name separation failed';
  end if;

  if not exists(
    select 1 from public.brinesearch_route_prep_steps step
    where step.id='f7161ff9-60d0-46ad-9fb5-3d023f8fa5ca'
      and step.source_details->>'source_identity_key'=
        'OH:ODOT:NLF:SHASSR00646**C'
      and step.match_method='issue97_owner_reviewed_exact_source_identity'
      and step.source_details->>'authoritative_identity_key'=
        'OH:ODOT:NLF:SHASSR00646**C'
      and (step.source_details->>'authoritative_identity_proof')::boolean
      and step.source_details->'authoritative_driver_name_receipt'->>'identity_id'=
        '99898ae8-b80a-06d3-71c3-7d3901867bcd'
      and step.source_details->'authoritative_driver_name_receipt'->>'source_segment_key'=
        'OH:ODOT:SEGMENT:2025_000000000302354'
      and step.source_details->'authoritative_driver_name_receipt'->>'road_name'=
        'TAPPAN SCIO RD'
      and not (step.source_details->>'route_authority_upgrade')::boolean
      and not (step.source_details->>'public_google_publication')::boolean
      and not (step.source_details->>'name_matching_used')::boolean
      and not (step.source_details->>'fuzzy_matching_used')::boolean
      and not (step.source_details->>'nearest_road_used')::boolean
      and step.source_details->'covered_source_segment_keys'=
        pg_catalog.jsonb_build_array(
          'OH:ODOT:SEGMENT:2025_000000000302354',
          'OH:ODOT:SEGMENT:2025_000000000302355',
          'OH:ODOT:SEGMENT:2025_000000000302356',
          'OH:ODOT:SEGMENT:2025_000000000302357',
          'OH:ODOT:SEGMENT:2025_000000000302358',
          'OH:ODOT:SEGMENT:2025_000000000302359'
        )
  ) or (select pg_catalog.to_jsonb(step)-'source_details'-'updated_at'-'match_method'
        from public.brinesearch_route_prep_steps step
        where step.id='f7161ff9-60d0-46ad-9fb5-3d023f8fa5ca')
       is distinct from (select target_step_semantic from tmp_issue97_stuart_before) then
    raise exception 'Issue #97 STUART target step changed beyond its exact name receipt';
  end if;

  if not exists(
    select 1
    from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
    where receipt.route_prep_step_id='f7161ff9-60d0-46ad-9fb5-3d023f8fa5ca'
      and receipt.route_prep_id='0415cc7e-fcff-4768-a280-b55476b073d3'
      and receipt.pad_id='3ef517c7-c783-490c-878f-2a82ebc0c2cf'
      and receipt.occurrence_index=2
      and receipt.resolution_status='resolved'
      and receipt.resolution_method='explicit_authoritative_source_receipt'
      and receipt.identity_id='99898ae8-b80a-06d3-71c3-7d3901867bcd'
      and receipt.canonical_road_id='9b980c79-5542-4b60-a9f9-c4639ddc2cc2'
      and receipt.source_identity_key='OH:ODOT:NLF:SHASSR00646**C'
      and receipt.driver_road_name='TAPPAN SCIO RD'
      and array['ANNAPOLIS RD','TAPPAN SCIO RD']::text[] <@ receipt.valid_aliases
  ) then
    raise exception 'Issue #97 STUART exact occurrence refresh failed';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       (pg_catalog.to_jsonb(receipt)-'updated_at'-'resolved_at'-
         'receipt_digest'-'dependency_digest'-
         'start_transition_digest'-'end_transition_digest'-'evidence')::text,
       '|' order by receipt.occurrence_index
     ),''))
      from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
      where receipt.route_prep_id='0415cc7e-fcff-4768-a280-b55476b073d3')
       is distinct from (select target_geometry_semantic_digest
                         from tmp_issue97_stuart_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.jsonb_build_object(
         'route_prep_id',receipt.route_prep_id,
         'pad_id',receipt.pad_id,
         'route_group',receipt.route_group,
         'variant_index',receipt.variant_index,
         'boundary_index',receipt.boundary_index,
         'left_route_prep_step_id',receipt.left_route_prep_step_id,
         'right_route_prep_step_id',receipt.right_route_prep_step_id,
         'left_identity_id',receipt.left_identity_id,
         'right_identity_id',receipt.right_identity_id,
         'left_road_id',receipt.left_road_id,
         'right_road_id',receipt.right_road_id,
         'status',receipt.status,
         'resolution_method',receipt.resolution_method,
         'hold_reason',receipt.hold_reason,
         'stable_junction_key',junction.stable_junction_key,
         'anchor_role',receipt.anchor_role,
         'coordinate',receipt.coordinate,
         'candidate_count',receipt.candidate_count,
         'graph_digest',receipt.graph_digest,
         'anchor_digest',receipt.anchor_digest
       )::text,
       '|' order by receipt.boundary_index
     ),''))
      from private_verification.brinesearch_route_transition_receipts_issue97 receipt
      join public.brinesearch_road_junctions junction
        on junction.id=receipt.junction_id
      where receipt.route_prep_id='0415cc7e-fcff-4768-a280-b55476b073d3')
       is distinct from (select target_transition_semantic_digest
                         from tmp_issue97_stuart_before)
    or (select pg_catalog.to_jsonb(receipt)-'updated_at'-
          'receipt_digest'-'dependency_digest'-'evidence'
         from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
         where receipt.route_prep_id='0415cc7e-fcff-4768-a280-b55476b073d3')
       is distinct from (select target_reconciliation_semantic
                         from tmp_issue97_stuart_before) then
    raise exception 'Issue #97 STUART route topology/geometry semantics changed';
  end if;

  if (select count(*)
      from private_verification.brinesearch_route_transition_receipts_issue97 receipt
      join public.brinesearch_road_graph_builds build
        on build.id=receipt.graph_build_id
      join public.brinesearch_road_junctions junction
        on junction.id=receipt.junction_id
       and junction.build_id=build.id
      join public.brinesearch_road_junction_anchors anchor
        on anchor.id=receipt.anchor_id
       and anchor.junction_id=junction.id
      where receipt.route_prep_id='0415cc7e-fcff-4768-a280-b55476b073d3'
        and receipt.status='resolved'
        and receipt.graph_build_id='f4e4d43f-e86c-499c-893f-73f2eef3dc29'
        and receipt.source_revision_digest='ccbfb928a7c7ae96e72aebfc18037165'
        and build.status='active'
        and private_verification.brinesearch_issue97_graph_build_release_current_contextual(
          build.id
        )
        and (
          (receipt.boundary_index=1
           and receipt.junction_id='28a37aa0-8ef8-ff45-21a6-1fd4e20c0b17'
           and receipt.anchor_id='6cac884f-16e8-9fc5-e51c-2be122dcb60b')
          or
          (receipt.boundary_index=2
           and receipt.junction_id='c9fb2e5c-307c-95ea-a032-f665d2b83530'
           and receipt.anchor_id='0044ef33-c23f-9f4b-95b6-c7af0a7f5a33')
        )
     )<>2 then
    raise exception 'Issue #97 STUART transitions did not refresh onto the exact current graph';
  end if;

  if exists(
       select 1
       from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
       where receipt.route_prep_id='0415cc7e-fcff-4768-a280-b55476b073d3'
         and (
           coalesce((receipt.evidence->>'selection_uses_nearest_road')::boolean,true)
           or coalesce((receipt.evidence->>'selection_uses_name_similarity')::boolean,true)
         )
     ) or exists(
       select 1
       from private_verification.brinesearch_route_transition_receipts_issue97 receipt
       where receipt.route_prep_id='0415cc7e-fcff-4768-a280-b55476b073d3'
         and (
           coalesce((receipt.evidence->>'selection_uses_nearest_road')::boolean,true)
           or coalesce((receipt.evidence->>'selection_uses_name_similarity')::boolean,true)
           or coalesce((receipt.evidence->>'selection_uses_route_number_alone')::boolean,true)
         )
     ) then
    raise exception 'Issue #97 STUART refreshed receipts used forbidden inference';
  end if;

  if not exists(
    select 1
    from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
    where receipt.route_prep_id='0415cc7e-fcff-4768-a280-b55476b073d3'
      and receipt.route_status='needs_review' and receipt.stage='exact_geometry'
      and receipt.road_occurrence_count=3 and receipt.resolved_occurrence_count=3
      and receipt.held_occurrence_count=0 and receipt.canonical_mapping_count=3
      and receipt.exact_geometry_count=2
      and receipt.exception_reasons=array['exact_occurrence_geometry_incomplete']::text[]
  ) or not exists(
    select 1
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
    where receipt.route_prep_step_id='f5eb54dc-0a4a-4144-9690-4fcb054e17ea'
      and receipt.status='held'
      and receipt.hold_reason='verified_pad_gps_not_on_final_authoritative_geometry'
      and receipt.end_coordinate is null and receipt.step_geometry is null
  ) then
    raise exception 'Issue #97 STUART final endpoint did not remain held';
  end if;

  v_status:=public.brinesearch_v18_driver_pad_status(
    '3ef517c7-c783-490c-878f-2a82ebc0c2cf'
  );
  if v_status->'route'->>'source' is distinct from 'legacy_written'
     or v_status->'route'->>'state' is distinct from 'held'
     or v_status->'route'->'steps' is distinct from '[]'::jsonb
     or v_status->'route'->'geometry' is distinct from 'null'::jsonb
     or v_status->'route'->>'writtenDirections' is distinct from
        (select public_status->'route'->>'writtenDirections'
         from tmp_issue97_stuart_before)
     or v_status->'graph'->>'state' is distinct from 'active_current'
     or v_status->'graph'->>'county' is distinct from 'Harrison'
     or v_status->'graph'->>'graphCount' is distinct from '1'
     or v_status->'google'->>'publicState' is distinct from 'held'
     or v_status->'google'->>'safeReason' is distinct from
        'public_route_or_graph_authority_held' then
    raise exception 'Issue #97 STUART public fail-closed status changed';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(build)::text,'|' order by build.id
     ),'')) from public.brinesearch_road_graph_builds build)
       is distinct from (select graph_digest from tmp_issue97_stuart_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(pad)::text,'|' order by pad.id
     ),'')) from public.pads pad)
       is distinct from (select pad_digest from tmp_issue97_stuart_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(route)::text,'|' order by route.id
     ),'')) from public.brinesearch_route_prep route)
       is distinct from (select route_digest from tmp_issue97_stuart_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(step)::text,'|' order by step.id
     ),'')) from public.brinesearch_route_prep_steps step
       where step.id<>'f7161ff9-60d0-46ad-9fb5-3d023f8fa5ca')
       is distinct from (select non_target_step_digest from tmp_issue97_stuart_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_step_id
     ),'')) from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
       where receipt.route_prep_step_id<>'f7161ff9-60d0-46ad-9fb5-3d023f8fa5ca')
       is distinct from (select non_target_occurrence_digest from tmp_issue97_stuart_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_step_id
     ),'')) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
       where receipt.route_prep_id<>'0415cc7e-fcff-4768-a280-b55476b073d3')
       is distinct from (select non_target_geometry_digest from tmp_issue97_stuart_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.boundary_index
     ),'')) from private_verification.brinesearch_route_transition_receipts_issue97 receipt
       where receipt.route_prep_id<>'0415cc7e-fcff-4768-a280-b55476b073d3')
       is distinct from (select non_target_transition_digest from tmp_issue97_stuart_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id
     ),'')) from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
       where receipt.route_prep_id<>'0415cc7e-fcff-4768-a280-b55476b073d3')
       is distinct from (select non_target_reconciliation_digest from tmp_issue97_stuart_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.pad_id
     ),'')) from private_verification.brinesearch_google_route_receipts_issue97 receipt)
       is distinct from (select private_google_digest from tmp_issue97_stuart_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(route)::text,'|' order by route.pad_id
     ),'')) from public.brinesearch_driver_google_routes_public route)
       is distinct from (select public_google_digest from tmp_issue97_stuart_before)
     or (select count(*) from public.brinesearch_driver_google_routes_public)
       is distinct from (select public_google_count from tmp_issue97_stuart_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(direction)::text,'|' order by direction.pad_id
     ),'')) from public.brinesearch_driver_directions_public direction)
       is distinct from (select directions_digest from tmp_issue97_stuart_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row)::text,'|' order by row.snapshot_id,row.pad_id
     ),'')) from public.brinesearch_directory_snapshot_rows_v18 row)
       is distinct from (select directory_rows_digest from tmp_issue97_stuart_before)
     or (select snapshot_id from public.brinesearch_directory_snapshots_v18
         where publication_state='current')
       is distinct from (select directory_snapshot_id from tmp_issue97_stuart_before)
     or (select source_revision from public.brinesearch_directory_snapshots_v18
         where publication_state='current')
       is distinct from (select directory_revision from tmp_issue97_stuart_before)
     or (select cutover_at from public.brinesearch_issue97_release_state where singleton)
       is distinct from (select cutover_at from tmp_issue97_stuart_before) then
    raise exception 'Issue #97 STUART non-target authority delta detected';
  end if;

  if (select count(*) from public.brinesearch_company_road_overlay_snapshots_v18
      where publication_state='current')<>0
     or not exists(
       select 1 from public.brinesearch_company_road_overlay_snapshots_v18 snapshot
       where snapshot.snapshot_id=(select overlay_snapshot_id
                                   from tmp_issue97_stuart_before)
         and snapshot.publication_state='withdrawn'
         and snapshot.content_sha256=(select overlay_content_sha256
                                      from tmp_issue97_stuart_before)
     )
     or exists(
       select 1 from private_verification.brinesearch_v18_company_road_overlay_releases
       where approval_state='approved'
     ) then
    raise exception 'Issue #97 STUART overlay was not safely withdrawn for reauthorization';
  end if;
end
$issue97_stuart_postconditions$;
