-- GitHub #97 — one immutable BANJO primary approach.
--
-- Authority boundary:
--   exact OH-9/OH-519 junction in New Athens
--   -> exact, current Harrison OH-519 centerline
--   -> projected on-road handoff beside BANJO
--   -> separate saved GPS destination (no approved connector geometry)
--
-- This migration does not alter pads, directions, route prep, graph authority,
-- Google-publication rows, or cutover state. The alternate US-250 approach is
-- deliberately not released by this unit.

set local statement_timeout='5min';
set local lock_timeout='5s';

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
    'brinesearch:issue97:banjo-oh519-named-core',97
  )
);

create temporary table tmp_issue97_banjo_before on commit drop as
select
  public.brinesearch_v18_driver_pad_status_with_named_approaches(
    'b7526e45-0b33-4988-ae1c-0a4140971f8e'
  ) as banjo_bundle,
  public.brinesearch_v18_driver_pad_status_with_named_approaches(
    'e2b32e85-9e93-4388-8215-9d8167cbbeb8'
  ) as cologie_bundle,
  (select pg_catalog.count(*)
   from private_verification.brinesearch_v18_named_approach_releases)
    as named_private_count,
  (select pg_catalog.count(*)
   from public.brinesearch_driver_named_approach_releases_public)
    as named_public_count,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.release_id::text
   ),''))
   from private_verification.brinesearch_v18_named_approach_releases row_value)
    as named_private_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.release_id::text
   ),''))
   from public.brinesearch_driver_named_approach_releases_public row_value)
    as named_public_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.pad_id::text
   ),''))
   from private_verification.brinesearch_v18_core_destination_releases row_value)
    as core_private_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.pad_id::text
   ),''))
   from public.brinesearch_driver_core_destination_releases_public row_value)
    as core_public_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.id::text
   ),'')) from public.pads row_value
   where row_value.id='b7526e45-0b33-4988-ae1c-0a4140971f8e') as pad_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.pad_id::text
   ),'')) from public.brinesearch_driver_directions_public row_value
   where row_value.pad_id='b7526e45-0b33-4988-ae1c-0a4140971f8e')
    as directions_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.id::text
   ),'')) from public.brinesearch_route_prep row_value
   where row_value.id='20bc6634-c5de-46bd-9da7-e0785a3796fe') as route_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.id::text
   ),'')) from public.brinesearch_route_prep_steps row_value
   where row_value.route_prep_id='20bc6634-c5de-46bd-9da7-e0785a3796fe')
    as route_step_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.route_prep_id::text,
       row_value.occurrence_index
   ),''))
   from private_verification.brinesearch_route_occurrence_receipts_issue97 row_value
   where row_value.route_prep_id='20bc6634-c5de-46bd-9da7-e0785a3796fe')
    as occurrence_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.route_prep_id::text,
       row_value.boundary_index
   ),''))
   from private_verification.brinesearch_route_transition_receipts_issue97 row_value
   where row_value.route_prep_id='20bc6634-c5de-46bd-9da7-e0785a3796fe')
    as transition_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.route_prep_id::text,
       row_value.occurrence_index
   ),''))
   from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 row_value
   where row_value.route_prep_id='20bc6634-c5de-46bd-9da7-e0785a3796fe')
    as geometry_receipt_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.id::text
   ),'')) from public.brinesearch_road_graph_builds row_value
   where row_value.id='f4e4d43f-e86c-499c-893f-73f2eef3dc29')
    as graph_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.id::text
   ),'')) from public.brinesearch_road_junctions row_value
   where row_value.id='28810924-2650-8c00-3a6b-23bc24088e2b')
    as junction_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.id::text
   ),'')) from public.brinesearch_road_junction_anchors row_value
   where row_value.id='c3edbe8d-3c66-cb5e-96a0-364a788ee344')
    as anchor_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.id::text
   ),'')) from public.brinesearch_road_junction_memberships row_value
   where row_value.junction_id='28810924-2650-8c00-3a6b-23bc24088e2b')
    as membership_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.snapshot_id::text,
       row_value.ordinal
   ),'')) from public.brinesearch_directory_snapshot_rows_v18 row_value
   where row_value.pad_id='b7526e45-0b33-4988-ae1c-0a4140971f8e'
     and row_value.snapshot_id=(
       select snapshot.snapshot_id
       from public.brinesearch_directory_snapshots_v18 snapshot
       where snapshot.publication_state='current'
     ))
    as directory_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.pad_id::text
   ),'')) from public.brinesearch_driver_google_routes_public row_value)
    as google_route_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.pad_id::text
   ),'')) from public.brinesearch_driver_google_handoffs_public row_value)
    as google_handoff_digest,
  (select pg_catalog.to_jsonb(row_value)
   from public.brinesearch_issue97_release_state row_value
   where row_value.singleton) as cutover_state;

do $preflight$
declare
  v_snapshot_id uuid;
  v_route_receipt_digest text;
  v_safety jsonb;
begin
  if pg_catalog.to_regclass(
       'private_verification.brinesearch_v18_named_approach_releases'
     ) is null
     or pg_catalog.to_regclass(
       'public.brinesearch_driver_named_approach_releases_public'
     ) is null
     or pg_catalog.to_regprocedure(
       'private_verification.brinesearch_v18_named_approach_release_receipt_active(uuid)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.brinesearch_v18_driver_pad_status_with_named_approaches(uuid)'
     ) is null then
    raise exception 'Named-approach contract is not installed';
  end if;

  if (select named_private_count from tmp_issue97_banjo_before)<>12
     or (select named_public_count from tmp_issue97_banjo_before)<>12
     or (select pg_catalog.count(*)
         from private_verification.brinesearch_v18_core_destination_releases)<>3
     or (select pg_catalog.count(*)
         from public.brinesearch_driver_core_destination_releases_public)<>3 then
    raise exception 'Existing immutable release counts diverged';
  end if;

  if exists(
       select 1
       from private_verification.brinesearch_v18_named_approach_releases
       where pad_id='b7526e45-0b33-4988-ae1c-0a4140971f8e'
     )
     or exists(
       select 1
       from public.brinesearch_driver_named_approach_releases_public
       where pad_id='b7526e45-0b33-4988-ae1c-0a4140971f8e'
     )
     or exists(
       select 1
       from private_verification.brinesearch_v18_core_destination_releases
       where pad_id='b7526e45-0b33-4988-ae1c-0a4140971f8e'
     ) then
    raise exception 'BANJO already has a released core';
  end if;

  if not exists(
       select 1 from public.pads pad
       where pad.id='b7526e45-0b33-4988-ae1c-0a4140971f8e'
         and pad.legacy_id='ascent--banjo'
         and pad.company='Ascent' and pad.pad_name='BANJO'
         and pad.state='Ohio' and pad.county='Harrison'
         and pad.township='SHORT CREEK'
         and pad.address='45350 Stumptown Rd/Sr 519'
         and pad.latitude=40.186964 and pad.longitude=-80.968365
         and pad.structured_road_sequence=
           'OH-9 → OH-519 → Lease Road → OR → US-250 → OH-519 → Pad'
     ) then
    raise exception 'BANJO pad checkpoint diverged';
  end if;

  select snapshot.snapshot_id into strict v_snapshot_id
  from public.brinesearch_directory_snapshots_v18 snapshot
  where snapshot.publication_state='current';
  if not exists(
       select 1
       from public.brinesearch_directory_snapshot_rows_v18 row_value
       where row_value.snapshot_id=v_snapshot_id
         and row_value.pad_id='b7526e45-0b33-4988-ae1c-0a4140971f8e'
         and row_value.record_revision::text='1787615581785257'
         and row_value.coordinate_state='verified'
         and row_value.driver_latitude=40.186964
         and row_value.driver_longitude=-80.968365
     ) then
    raise exception 'BANJO current directory checkpoint diverged';
  end if;

  if not exists(
       select 1
       from public.brinesearch_driver_directions_public directions
       where directions.pad_id='b7526e45-0b33-4988-ae1c-0a4140971f8e'
         and directions.source_revision=
           '2026-08-07T23:09:14.309486Z'::timestamptz
         and pg_catalog.md5(directions.directions_clear)=
           '2252565a0b0b6f313382815e35767c33'
         and directions.directions_clear like '%OH-519 E (1.5 miles)%'
         and directions.directions_clear like '%blinking stop light%'
     ) then
    raise exception 'BANJO reviewed directions checkpoint diverged';
  end if;

  if not exists(
       select 1 from public.pad_verification_status verification
       where verification.pad_id='b7526e45-0b33-4988-ae1c-0a4140971f8e'
         and verification.gps_verified
         and verification.directions_verified
         and verification.roads_verified
         and not verification.needs_field_check
     ) then
    raise exception 'BANJO reviewed GPS/road/direction checkpoint diverged';
  end if;

  v_safety:=private_verification.brinesearch_issue97_pad_safety_facts(
    'b7526e45-0b33-4988-ae1c-0a4140971f8e'
  );
  if coalesce((v_safety->>'has_hold')::boolean,true)
     or coalesce((v_safety->>'hold_count')::integer,-1)<>0
     or coalesce((v_safety->>'private_hold_text_exposed')::boolean,true) then
    raise exception 'BANJO has a current route safety hold';
  end if;

  if not exists(
       select 1 from public.brinesearch_route_prep route
       where route.id='20bc6634-c5de-46bd-9da7-e0785a3796fe'
         and route.pad_id='b7526e45-0b33-4988-ae1c-0a4140971f8e'
         and route.active and route.route_group='primary'
         and route.variant_index=1
         and route.source_sequence='OH-9 → OH-519 → Lease Road'
         and route.source_sequence_hash='52d01e234f4e7b56003699bfc771d435'
         and route.readiness_status='ready_for_road_matching'
         and pg_catalog.md5(pg_catalog.to_jsonb(route)::text)=
           '76471ac0318bbb21581614cbfb1b2f48'
     ) then
    raise exception 'BANJO primary route checkpoint diverged';
  end if;

  if (select pg_catalog.count(*)
      from public.brinesearch_route_prep_steps step
      where step.route_prep_id='20bc6634-c5de-46bd-9da7-e0785a3796fe')<>3
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
          pg_catalog.to_jsonb(step)::text,'|' order by step.step_order
        ),''))
         from public.brinesearch_route_prep_steps step
         where step.route_prep_id='20bc6634-c5de-46bd-9da7-e0785a3796fe')<>
           'b72d0ac657cd240a56f78e4c91e5a41f'
     or (select pg_catalog.count(*)
         from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
         where receipt.route_prep_id='20bc6634-c5de-46bd-9da7-e0785a3796fe')<>3
     or (select pg_catalog.count(*)
         from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
         where receipt.route_prep_id='20bc6634-c5de-46bd-9da7-e0785a3796fe'
           and receipt.resolution_status='resolved')<>2
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
          pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.occurrence_index
        ),''))
         from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
         where receipt.route_prep_id='20bc6634-c5de-46bd-9da7-e0785a3796fe')<>
           '46b73e4110bb6754d60a5a69637f08b7'
     or not exists(
       select 1
       from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
       where receipt.route_prep_id='20bc6634-c5de-46bd-9da7-e0785a3796fe'
         and receipt.occurrence_index=1
         and receipt.identity_id='a1d85866-9f8d-0cd4-a176-a8aaa2158b12'
         and receipt.canonical_road_id='52b08bc7-9b54-4b8d-a833-f903fc298f7b'
         and receipt.source_identity_key='OH:ODOT:NLF:SHASSR00009**C'
         and receipt.resolution_status='resolved'
         and receipt.resolution_method='route_graph_unique_identity_path'
     )
     or not exists(
       select 1
       from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
       where receipt.route_prep_id='20bc6634-c5de-46bd-9da7-e0785a3796fe'
         and receipt.occurrence_index=2
         and receipt.identity_id='e883315b-bf54-9192-4556-342bcb7bb1a5'
         and receipt.canonical_road_id='3a4b7ffe-f5b9-4f61-afe6-5875044dc367'
         and receipt.source_identity_key='OH:ODOT:NLF:SHASSR00519**C'
         and receipt.resolution_status='resolved'
         and receipt.resolution_method='route_graph_unique_identity_path'
     )
     or not exists(
       select 1
       from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
       where receipt.route_prep_id='20bc6634-c5de-46bd-9da7-e0785a3796fe'
         and receipt.occurrence_index=3
         and receipt.resolution_status='held'
         and receipt.hold_reason=
           'terminal_private_access_destination_requires_authoritative_geometry'
         and receipt.identity_id is null
     ) then
    raise exception 'BANJO exact occurrence/private-endpoint checkpoint diverged';
  end if;

  if exists(
       select 1
       from private_verification.brinesearch_route_transition_receipts_issue97 receipt
       where receipt.route_prep_id='20bc6634-c5de-46bd-9da7-e0785a3796fe'
     )
     or exists(
       select 1
       from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
       where receipt.route_prep_id='20bc6634-c5de-46bd-9da7-e0785a3796fe'
     ) then
    raise exception 'BANJO already has transition or geometry receipts';
  end if;

  select pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'route',(select pg_catalog.to_jsonb(route)
               from public.brinesearch_route_prep route
               where route.id='20bc6634-c5de-46bd-9da7-e0785a3796fe'),
      'steps',(select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value) order by row_value.step_order
      ),'[]'::jsonb) from public.brinesearch_route_prep_steps row_value
        where row_value.route_prep_id='20bc6634-c5de-46bd-9da7-e0785a3796fe'),
      'occurrences',(select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value) order by row_value.occurrence_index
      ),'[]'::jsonb)
        from private_verification.brinesearch_route_occurrence_receipts_issue97 row_value
        where row_value.route_prep_id='20bc6634-c5de-46bd-9da7-e0785a3796fe'),
      'transitions','[]'::jsonb,
      'geometryReceipts','[]'::jsonb
    )::text,'UTF8'),'sha256'),'hex') into strict v_route_receipt_digest;
  if v_route_receipt_digest<>
       '89f3fd217148e6e205e84dd99b980001623a93b0293e309b25d3bf3c3f5013d2' then
    raise exception 'BANJO frozen route receipt digest diverged';
  end if;

  if not exists(
       select 1 from public.brinesearch_road_graph_builds build
       where build.id='f4e4d43f-e86c-499c-893f-73f2eef3dc29'
         and build.state_code='OH' and build.county_code='HAS'
         and build.county_name='Harrison' and build.status='active'
         and build.graph_digest='71cb3479ac57b6f5dc26d0985a056d06'
         and build.activated_at='2026-08-24T23:53:01.785257Z'::timestamptz
         and private_verification.brinesearch_issue97_graph_build_release_current(
               build.id
             )
     ) then
    raise exception 'Current Harrison graph checkpoint diverged';
  end if;

  if not exists(
       select 1 from public.brinesearch_roads road
       where road.id='3a4b7ffe-f5b9-4f61-afe6-5875044dc367'
         and road.canonical_name='OH-519'
         and road.verification_status='verified'
         and road.geometry_status='measured_from_official_centerline'
         and not coalesce(road.candidate_only,false)
         and coalesce(road.approved_by_default,false)
         and pg_catalog.md5(pg_catalog.to_jsonb(road)::text)=
           'dc3255fe082e787de59dd7b4d0dbdb42'
     ) then
    raise exception 'Exact OH-519 road/identity checkpoint diverged';
  end if;

  if not exists(
       select 1
       from public.brinesearch_road_junctions junction
       where junction.id='28810924-2650-8c00-3a6b-23bc24088e2b'
         and junction.build_id='f4e4d43f-e86c-499c-893f-73f2eef3dc29'
         and junction.logical_junction_id='f30b60d9-d470-e505-ac99-35b3b6db5f4d'
         and junction.graph_digest='ab3f4ddb3253710adc486bf703a81d66'
         and junction.verification_status='verified'
         and junction.source_method='exact_authoritative_source_vertex'
     )
     or not exists(
       select 1
       from public.brinesearch_road_junction_anchors anchor
       where anchor.id='c3edbe8d-3c66-cb5e-96a0-364a788ee344'
         and anchor.junction_id='28810924-2650-8c00-3a6b-23bc24088e2b'
         and anchor.anchor_digest='c299caf2f5bbf06d6a1fb635a8e162d2'
         and extensions.st_equals(
           anchor.geom,
           extensions.st_setsrid(
             extensions.st_makepoint(-80.9958138,40.1849138),4326
           )
         )
     )
     or (select pg_catalog.count(*)
         from public.brinesearch_road_junction_memberships membership
         where membership.junction_id='28810924-2650-8c00-3a6b-23bc24088e2b')<>2
     or not exists(
       select 1
       from public.brinesearch_road_junction_memberships membership
       where membership.junction_id='28810924-2650-8c00-3a6b-23bc24088e2b'
         and membership.identity_id='a1d85866-9f8d-0cd4-a176-a8aaa2158b12'
         and membership.road_id='52b08bc7-9b54-4b8d-a833-f903fc298f7b'
         and membership.provenance->>'source_identity_key'=
           'OH:ODOT:NLF:SHASSR00009**C'
     )
     or not exists(
       select 1
       from public.brinesearch_road_junction_memberships membership
       where membership.junction_id='28810924-2650-8c00-3a6b-23bc24088e2b'
         and membership.identity_id='e883315b-bf54-9192-4556-342bcb7bb1a5'
         and membership.road_id='3a4b7ffe-f5b9-4f61-afe6-5875044dc367'
         and membership.provenance->>'source_identity_key'=
           'OH:ODOT:NLF:SHASSR00519**C'
     ) then
    raise exception 'Exact OH-9/OH-519 junction checkpoint diverged';
  end if;

  if (select banjo_bundle#>>'{status,statusRevision}'
      from tmp_issue97_banjo_before)<>
       '9895b50ab96bad8139ac29c6e3d3e508'
     or (select banjo_bundle#>>'{status,route,source}'
         from tmp_issue97_banjo_before)<>'legacy_written'
     or (select banjo_bundle#>>'{status,route,state}'
         from tmp_issue97_banjo_before)<>'held'
     or (select banjo_bundle#>'{status,route,steps}'
         from tmp_issue97_banjo_before)<>'[]'::jsonb
     or (select banjo_bundle#>'{status,route,geometry}'
         from tmp_issue97_banjo_before) is distinct from 'null'::jsonb
     or (select banjo_bundle->'namedApproaches'
         from tmp_issue97_banjo_before)<>'[]'::jsonb
     or (select banjo_bundle->'publicGoogleRoute'
         from tmp_issue97_banjo_before) is distinct from 'null'::jsonb
     or (select banjo_bundle->'publicGoogleHandoff'
         from tmp_issue97_banjo_before) is distinct from 'null'::jsonb then
    raise exception 'BANJO base driver checkpoint diverged';
  end if;

  if (select pg_catalog.count(*) from public.brinesearch_driver_google_routes_public)<>1
     or (select pg_catalog.count(*)
         from public.brinesearch_driver_google_handoffs_public)<>1
     or (select cutover_at
         from public.brinesearch_issue97_release_state where singleton)
          is not null then
    raise exception 'Google/cutover checkpoint diverged';
  end if;
end
$preflight$;

do $release$
declare
  v_release private_verification.brinesearch_v18_named_approach_releases%rowtype;
  v_master extensions.geometry;
  v_ingress_point extensions.geometry;
  v_destination_point extensions.geometry;
  v_handoff_point extensions.geometry;
  v_core extensions.geometry;
  v_fraction_start double precision;
  v_fraction_end double precision;
  v_midpoint extensions.geometry;
  v_steps jsonb;
  v_geometry jsonb;
  v_ingress jsonb;
  v_core_end jsonb;
  v_destination jsonb;
  v_handoff jsonb;
  v_evidence jsonb;
  v_route_receipt_digest text;
  v_status_revision text;
  v_published_at constant timestamptz:='2026-08-27T01:58:00Z';
begin
  v_master:=private_verification.brinesearch_issue97_authoritative_identity_geometry(
    'e883315b-bf54-9192-4556-342bcb7bb1a5'
  );
  select anchor.geom into strict v_ingress_point
  from public.brinesearch_road_junction_anchors anchor
  where anchor.id='c3edbe8d-3c66-cb5e-96a0-364a788ee344';
  v_destination_point:=extensions.st_setsrid(
    extensions.st_makepoint(-80.968365,40.186964),4326
  );
  -- Projection only clips an already exact, owner-selected OH-519 identity.
  -- It does not select a road by nearest distance.
  v_handoff_point:=extensions.st_closestpoint(v_master,v_destination_point);
  v_fraction_start:=extensions.st_linelocatepoint(v_master,v_ingress_point);
  v_fraction_end:=extensions.st_linelocatepoint(v_master,v_handoff_point);
  if v_fraction_start>=v_fraction_end then
    raise exception 'Reviewed eastbound OH-519 direction is not preserved';
  end if;
  v_core:=extensions.st_linesubstring(
    v_master,v_fraction_start,v_fraction_end
  );
  v_core:=extensions.st_setpoint(v_core,0,v_ingress_point);
  v_core:=extensions.st_setpoint(
    v_core,extensions.st_npoints(v_core)-1,v_handoff_point
  );
  v_core:=extensions.st_setsrid(
    extensions.st_geomfromgeojson(extensions.st_asgeojson(v_core,7)),4326
  );
  v_midpoint:=extensions.st_pointn(v_core,59);

  if extensions.geometrytype(v_master)<>'LINESTRING'
     or extensions.geometrytype(v_core)<>'LINESTRING'
     or extensions.st_npoints(v_core)<>118
     or pg_catalog.md5(extensions.st_asgeojson(v_core,7))<>
          'c070ef779fc51e099df5318ac47ea97f'
     or pg_catalog.round(
          (extensions.st_length(v_core::extensions.geography)/1609.344)::numeric,
          6
        )<>1.514341::numeric
     or not extensions.st_equals(
       extensions.st_startpoint(v_core),
       extensions.st_setsrid(
         extensions.st_makepoint(-80.9958138,40.1849138),4326
       )
     )
     or not extensions.st_equals(
       extensions.st_endpoint(v_core),
       extensions.st_setsrid(
         extensions.st_makepoint(-80.9683995,40.1868135),4326
       )
     )
     or not extensions.st_equals(
       v_midpoint,
       extensions.st_setsrid(
         extensions.st_makepoint(-80.9832588,40.1858818),4326
       )
     )
     or extensions.st_distance(
          v_destination_point::extensions.geography,
          v_handoff_point::extensions.geography
        ) not between 16.96 and 16.98 then
    raise exception 'Frozen BANJO OH-519 clip drifted';
  end if;

  v_steps:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'order',1,'kind','turn','displayName','OH-519 / Stumptown Rd',
      'instruction','From the OH-9 junction in New Athens, take OH-519 east',
      'distanceMiles',1.514341::numeric,
      'verifiedDesignations',pg_catalog.jsonb_build_array(
        'OH-519','SR 519','STUMPTOWN RD','WHEELING ST'
      )
    )
  );
  v_geometry:=pg_catalog.jsonb_build_object(
    'type','FeatureCollection','features',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'type','Feature',
        'properties',pg_catalog.jsonb_build_object('stepOrder',1),
        'geometry',extensions.st_asgeojson(v_core,7)::jsonb
      )
    )
  );
  v_ingress:=pg_catalog.jsonb_build_object(
    'role','exact_approved_ingress',
    'label','OH-9 at OH-519 in New Athens',
    'latitude',40.1849138::double precision,
    'longitude',-80.9958138::double precision
  );
  v_core_end:=pg_catalog.jsonb_build_object(
    'role','exact_approved_handoff',
    'label','OH-519 at BANJO lease approach',
    'latitude',40.1868135::double precision,
    'longitude',-80.9683995::double precision
  );
  v_destination:=pg_catalog.jsonb_build_object(
    'role','saved_pad_destination',
    'label','BANJO verified driver GPS',
    'latitude',40.186964::double precision,
    'longitude',-80.968365::double precision
  );
  v_handoff:=pg_catalog.jsonb_build_object(
    'originMode','current_location_to_named_ingress',
    'handoffMode','verified_compact',
    'waypoints',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'latitude',40.1849138::double precision,
        'longitude',-80.9958138::double precision
      ),
      pg_catalog.jsonb_build_object(
        'latitude',40.1858818::double precision,
        'longitude',-80.9832588::double precision
      ),
      pg_catalog.jsonb_build_object(
        'latitude',40.1868135::double precision,
        'longitude',-80.9683995::double precision
      )
    )
  );

  select pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'route',(select pg_catalog.to_jsonb(route)
               from public.brinesearch_route_prep route
               where route.id='20bc6634-c5de-46bd-9da7-e0785a3796fe'),
      'steps',(select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value) order by row_value.step_order
      ),'[]'::jsonb) from public.brinesearch_route_prep_steps row_value
        where row_value.route_prep_id='20bc6634-c5de-46bd-9da7-e0785a3796fe'),
      'occurrences',(select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value) order by row_value.occurrence_index
      ),'[]'::jsonb)
        from private_verification.brinesearch_route_occurrence_receipts_issue97 row_value
        where row_value.route_prep_id='20bc6634-c5de-46bd-9da7-e0785a3796fe'),
      'transitions','[]'::jsonb,
      'geometryReceipts','[]'::jsonb
    )::text,'UTF8'),'sha256'),'hex') into strict v_route_receipt_digest;
  v_status_revision:=(
    select banjo_bundle#>>'{status,statusRevision}'
    from tmp_issue97_banjo_before
  );
  v_evidence:=pg_catalog.jsonb_build_object(
    'issue',97,
    'contract','named_exact_public_road_core_plus_saved_gps_destination',
    'sourceRoutePrepId','20bc6634-c5de-46bd-9da7-e0785a3796fe',
    'sourceSequenceHash','52d01e234f4e7b56003699bfc771d435',
    'sourceRouteSnapshot',pg_catalog.jsonb_build_object(
      'scope','frozen_source_snapshot_not_full_route_readiness',
      'routeGroup','primary','variantIndex',1,
      'readinessStatus','ready_for_road_matching',
      'routeRowDigest','76471ac0318bbb21581614cbfb1b2f48',
      'stepCount',3,'stepDigest','b72d0ac657cd240a56f78e4c91e5a41f',
      'occurrenceCount',3,'resolvedOccurrenceCount',2,
      'occurrenceDigest','46b73e4110bb6754d60a5a69637f08b7',
      'transitionCount',0,
      'transitionDigest','d41d8cd98f00b204e9800998ecf8427e',
      'geometryReceiptCount',0,
      'geometryReceiptDigest','d41d8cd98f00b204e9800998ecf8427e',
      'snapshotDigest',v_route_receipt_digest,
      'preflightPinned',true,'fullRouteReadinessClaimed',false
    ),
    'ownerAuthorization',pg_catalog.jsonb_build_object(
      'scope','banjo_primary_oh519_core_only',
      'authority','route_specific_owner_reviewed_named_release',
      'alternateUs250Released',false,
      'globalRoadPolicyChanged',false
    ),
    'exactCoreIdentity',pg_catalog.jsonb_build_object(
      'identityId','e883315b-bf54-9192-4556-342bcb7bb1a5',
      'roadId','3a4b7ffe-f5b9-4f61-afe6-5875044dc367',
      'sourceIdentityKey','OH:ODOT:NLF:SHASSR00519**C',
      'identityGeometryDigest','6d0ce41d8ae2f1ce774b62746a65a87a'
    ),
    'exactIngressJunction',pg_catalog.jsonb_build_object(
      'junctionId','28810924-2650-8c00-3a6b-23bc24088e2b',
      'anchorId','c3edbe8d-3c66-cb5e-96a0-364a788ee344',
      'junctionGraphDigest','ab3f4ddb3253710adc486bf703a81d66',
      'leftIdentityId','a1d85866-9f8d-0cd4-a176-a8aaa2158b12',
      'rightIdentityId','e883315b-bf54-9192-4556-342bcb7bb1a5'
    ),
    'baseStatusRevision',v_status_revision,
    'currentGraphBuildId','f4e4d43f-e86c-499c-893f-73f2eef3dc29',
    'currentGraphDigest','71cb3479ac57b6f5dc26d0985a056d06',
    'coreKind','new_athens_oh519_clip',
    'coreLineDigest','c070ef779fc51e099df5318ac47ea97f',
    'coreLengthMiles',1.514341::numeric,
    'destinationRole','saved_pad_destination',
    'destinationOffsetMeters',16.967::numeric,
    'gpsSelectedRoad',false,
    'handoffMethod','projection_on_owner_selected_exact_occurrence',
    'nearestRoadMatching',false,
    'fuzzyMatching',false,
    'nameOnlyMatching',false,
    'privateAccessGeometryCreated',false,
    'approvedGeometryReachesDestination',false,
    'fullSourceRouteReadyClaimed',false,
    'alternateUs250AuthorityChanged',false,
    'publicGoogleRowsCreated',false,
    'cutoverChanged',false,
    'googleVisualCheck','OH-519 E, 1.5 miles, no detour or backtrack'
  );

  v_release.release_id:='d159a1ba-268d-4a4f-960b-0196075caf80';
  v_release.pad_id:='b7526e45-0b33-4988-ae1c-0a4140971f8e';
  v_release.approach_key:='via_new_athens';
  v_release.approach_label:='Via New Athens';
  v_release.route_group:='primary';
  v_release.variant_index:=1;
  v_release.release_version:='v18-named-approach-v1';
  v_release.route_prep_id:='20bc6634-c5de-46bd-9da7-e0785a3796fe';
  v_release.source_sequence:='OH-9 → OH-519 → Lease Road';
  v_release.source_sequence_hash:='52d01e234f4e7b56003699bfc771d435';
  v_release.route_revision:=1;
  v_release.route_receipt_digest:=v_route_receipt_digest;
  v_release.graph_build_id:='f4e4d43f-e86c-499c-893f-73f2eef3dc29';
  v_release.graph_digest:='71cb3479ac57b6f5dc26d0985a056d06';
  v_release.steps:=v_steps;
  v_release.geometry:=v_geometry;
  v_release.ingress:=v_ingress;
  v_release.core_end:=v_core_end;
  v_release.destination:=v_destination;
  v_release.final_leg_mode:='google_to_saved_gps_unapproved';
  v_release.handoff:=v_handoff;
  v_release.last_verified_at:='2026-08-24T23:53:01.785257Z';
  v_release.status_revision:=v_status_revision;
  v_release.evidence:=v_evidence;
  v_release.published_at:=v_published_at;
  v_release.revoked_at:=null;
  v_release.release_digest:=
    private_verification.brinesearch_v18_named_approach_release_digest(v_release);

  insert into private_verification.brinesearch_v18_named_approach_releases(
    release_id,pad_id,approach_key,approach_label,route_group,variant_index,
    release_version,route_prep_id,source_sequence,source_sequence_hash,
    route_revision,route_receipt_digest,graph_build_id,graph_digest,steps,
    geometry,ingress,core_end,destination,final_leg_mode,handoff,
    last_verified_at,status_revision,evidence,release_digest,published_at,
    revoked_at
  ) values(
    v_release.release_id,v_release.pad_id,v_release.approach_key,
    v_release.approach_label,v_release.route_group,v_release.variant_index,
    v_release.release_version,v_release.route_prep_id,
    v_release.source_sequence,v_release.source_sequence_hash,
    v_release.route_revision,v_release.route_receipt_digest,
    v_release.graph_build_id,v_release.graph_digest,v_release.steps,
    v_release.geometry,v_release.ingress,v_release.core_end,
    v_release.destination,v_release.final_leg_mode,v_release.handoff,
    v_release.last_verified_at,v_release.status_revision,v_release.evidence,
    v_release.release_digest,v_release.published_at,v_release.revoked_at
  );

  insert into public.brinesearch_driver_named_approach_releases_public(
    release_id,pad_id,approach_key,approach_label,route_group,variant_index,
    release_version,route_revision,steps,geometry,ingress,core_end,destination,
    final_leg_mode,handoff,last_verified_at,status_revision,release_digest,
    published_at
  ) values(
    v_release.release_id,v_release.pad_id,v_release.approach_key,
    v_release.approach_label,v_release.route_group,v_release.variant_index,
    v_release.release_version,v_release.route_revision,v_release.steps,
    v_release.geometry,v_release.ingress,v_release.core_end,
    v_release.destination,v_release.final_leg_mode,v_release.handoff,
    v_release.last_verified_at,v_release.status_revision,
    v_release.release_digest,v_release.published_at
  );
end
$release$;

do $postflight$
declare
  v_before tmp_issue97_banjo_before%rowtype;
  v_after jsonb;
  v_approach jsonb;
begin
  select * into strict v_before from tmp_issue97_banjo_before;
  v_after:=public.brinesearch_v18_driver_pad_status_with_named_approaches(
    'b7526e45-0b33-4988-ae1c-0a4140971f8e'
  );

  if private_verification.brinesearch_v18_named_approach_release_receipt_active(
       'd159a1ba-268d-4a4f-960b-0196075caf80'
     ) is not true
     or pg_catalog.jsonb_array_length(v_after->'namedApproaches')<>1 then
    raise exception 'BANJO named release is not active and atomic';
  end if;
  v_approach:=v_after#>'{namedApproaches,0}';
  if v_approach->>'approachKey'<>'via_new_athens'
     or v_approach->>'approachLabel'<>'Via New Athens'
     or v_approach->>'routeGroup'<>'primary'
     or (v_approach->>'variantIndex')::integer<>1
     or v_approach->>'releaseVersion'<>'v18-named-approach-v1'
     or v_approach->>'finalLegMode'<>'google_to_saved_gps_unapproved'
     or v_approach#>>'{ingress,label}'<>'OH-9 at OH-519 in New Athens'
     or v_approach#>>'{coreEnd,label}'<>'OH-519 at BANJO lease approach'
     or v_approach#>>'{destination,label}'<>'BANJO verified driver GPS'
     or pg_catalog.jsonb_array_length(v_approach->'steps')<>1
     or pg_catalog.jsonb_array_length(v_approach#>'{geometry,features}')<>1
     or pg_catalog.jsonb_array_length(v_approach#>'{handoff,waypoints}')<>3
     or v_approach#>>'{steps,0,displayName}'<>'OH-519 / Stumptown Rd'
     or (v_approach#>>'{steps,0,distanceMiles}')::numeric<>
          1.514341::numeric
     or v_approach::text~*'(https?://|google\.com|private|ownerAuthorization|evidence)'
     or (v_approach-'releaseDigest') ? 'releaseDigest' then
    raise exception 'BANJO public named approach projection failed closed';
  end if;

  if (v_after-'namedApproaches') is distinct from
       (v_before.banjo_bundle-'namedApproaches')
     or v_after#>>'{status,route,source}'<>'legacy_written'
     or v_after#>>'{status,route,state}'<>'held'
     or v_after#>'{status,route,steps}'<>'[]'::jsonb
     or v_after#>'{status,route,geometry}' is distinct from 'null'::jsonb
     or v_after->'publicGoogleRoute' is distinct from 'null'::jsonb
     or v_after->'publicGoogleHandoff' is distinct from 'null'::jsonb then
    raise exception 'BANJO base route/graph/Google authority changed';
  end if;

  if (select pg_catalog.count(*)
      from private_verification.brinesearch_v18_named_approach_releases)<>
       v_before.named_private_count+1
     or (select pg_catalog.count(*)
         from public.brinesearch_driver_named_approach_releases_public)<>
          v_before.named_public_count+1
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
          pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.release_id::text
        ),''))
         from private_verification.brinesearch_v18_named_approach_releases row_value
         where row_value.release_id<>'d159a1ba-268d-4a4f-960b-0196075caf80')<>
          v_before.named_private_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
          pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.release_id::text
        ),''))
         from public.brinesearch_driver_named_approach_releases_public row_value
         where row_value.release_id<>'d159a1ba-268d-4a4f-960b-0196075caf80')<>
          v_before.named_public_digest then
    raise exception 'Non-target named approach rows changed';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.pad_id::text
     ),'')) from private_verification.brinesearch_v18_core_destination_releases row_value)
       <>v_before.core_private_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.pad_id::text
     ),'')) from public.brinesearch_driver_core_destination_releases_public row_value)
       <>v_before.core_public_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.id::text
     ),'')) from public.pads row_value
       where row_value.id='b7526e45-0b33-4988-ae1c-0a4140971f8e')<>v_before.pad_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.pad_id::text
     ),'')) from public.brinesearch_driver_directions_public row_value
       where row_value.pad_id='b7526e45-0b33-4988-ae1c-0a4140971f8e')
       <>v_before.directions_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.id::text
     ),'')) from public.brinesearch_route_prep row_value
       where row_value.id='20bc6634-c5de-46bd-9da7-e0785a3796fe')<>v_before.route_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.id::text
     ),'')) from public.brinesearch_route_prep_steps row_value
       where row_value.route_prep_id='20bc6634-c5de-46bd-9da7-e0785a3796fe')
       <>v_before.route_step_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.route_prep_id::text,
         row_value.occurrence_index
     ),'')) from private_verification.brinesearch_route_occurrence_receipts_issue97 row_value
       where row_value.route_prep_id='20bc6634-c5de-46bd-9da7-e0785a3796fe')
       <>v_before.occurrence_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.route_prep_id::text,
         row_value.boundary_index
     ),'')) from private_verification.brinesearch_route_transition_receipts_issue97 row_value
       where row_value.route_prep_id='20bc6634-c5de-46bd-9da7-e0785a3796fe')
       <>v_before.transition_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.route_prep_id::text,
         row_value.occurrence_index
     ),'')) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 row_value
       where row_value.route_prep_id='20bc6634-c5de-46bd-9da7-e0785a3796fe')
       <>v_before.geometry_receipt_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.id::text
     ),'')) from public.brinesearch_road_graph_builds row_value
       where row_value.id='f4e4d43f-e86c-499c-893f-73f2eef3dc29')<>v_before.graph_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.id::text
     ),'')) from public.brinesearch_road_junctions row_value
       where row_value.id='28810924-2650-8c00-3a6b-23bc24088e2b')<>v_before.junction_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.id::text
     ),'')) from public.brinesearch_road_junction_anchors row_value
       where row_value.id='c3edbe8d-3c66-cb5e-96a0-364a788ee344')<>v_before.anchor_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.id::text
     ),'')) from public.brinesearch_road_junction_memberships row_value
       where row_value.junction_id='28810924-2650-8c00-3a6b-23bc24088e2b')
       <>v_before.membership_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.snapshot_id::text,
         row_value.ordinal
     ),'')) from public.brinesearch_directory_snapshot_rows_v18 row_value
       where row_value.pad_id='b7526e45-0b33-4988-ae1c-0a4140971f8e'
         and row_value.snapshot_id=(
           select snapshot.snapshot_id
           from public.brinesearch_directory_snapshots_v18 snapshot
           where snapshot.publication_state='current'
         ))
       <>v_before.directory_digest then
    raise exception 'Protected pad/route/graph/directory rows changed';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.pad_id::text
     ),'')) from public.brinesearch_driver_google_routes_public row_value)
       <>v_before.google_route_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.pad_id::text
     ),'')) from public.brinesearch_driver_google_handoffs_public row_value)
       <>v_before.google_handoff_digest
     or (select pg_catalog.to_jsonb(row_value)
         from public.brinesearch_issue97_release_state row_value
         where row_value.singleton)<>v_before.cutover_state
     or (select pg_catalog.count(*) from public.brinesearch_driver_google_routes_public)<>1
     or (select pg_catalog.count(*)
         from public.brinesearch_driver_google_handoffs_public)<>1
     or (select cutover_at
         from public.brinesearch_issue97_release_state where singleton) is not null then
    raise exception 'Public Google or cutover authority changed';
  end if;

  if public.brinesearch_v18_driver_pad_status_with_named_approaches(
       'e2b32e85-9e93-4388-8215-9d8167cbbeb8'
     ) is distinct from v_before.cologie_bundle then
    raise exception 'Cologie regression changed';
  end if;
end
$postflight$;
