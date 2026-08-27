-- GitHub #97 — one immutable BEETLE primary approach.
--
-- Authority boundary:
--   exact US-250/OH-519 junction east of Cadiz
--   -> exact, current Harrison OH-519 centerline, travelled WESTBOUND
--   -> projected on-road handoff beside BEETLE
--   -> separate saved GPS destination (no approved connector geometry)
--
-- BEETLE shares the exact OH-519 identity already released for BANJO
-- (e883315b-bf54-9192-4556-342bcb7bb1a5, STUMPTOWN RD). BANJO enters that
-- identity at its OH-9 end and travels eastbound; BEETLE enters at the
-- opposite US-250 end and travels westbound. The direction is therefore
-- asserted from the measured fractions rather than copied from BANJO: the
-- BANJO unit's eastbound assertion (start < end) is false here and would
-- fail closed. Nothing about the BANJO release is read, altered, or reused
-- beyond the shared read-only identity geometry.
--
-- The pad's stored structured_road_sequence reads 'OH-519 -> US-250', which
-- is pad-outward rather than drive order. Orientation is therefore taken
-- from geometry: BEETLE lies 339.6 ft from the OH-519 centerline and 0.583
-- miles from US-250, so OH-519 is the core and US-250 is the ingress
-- partner. Token order is not treated as authority.
--
-- This migration does not alter pads, directions, route prep, graph
-- authority, Google-publication rows, or cutover state.

set local statement_timeout='5min';
set local lock_timeout='5s';

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
    'brinesearch:issue97:beetle-oh519-named-core',97
  )
);

create temporary table tmp_issue97_beetle_before on commit drop as
select
  public.brinesearch_v18_driver_pad_status_with_named_approaches(
    '0e6f23f1-3bfb-44b0-aa4e-f24dde611880'
  ) as beetle_bundle,
  public.brinesearch_v18_driver_pad_status_with_named_approaches(
    'e2b32e85-9e93-4388-8215-9d8167cbbeb8'
  ) as cologie_bundle,
  public.brinesearch_v18_driver_pad_status_with_named_approaches(
    'b7526e45-0b33-4988-ae1c-0a4140971f8e'
  ) as banjo_bundle,
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
  (select pg_catalog.count(*)
   from public.brinesearch_driver_google_routes_public) as google_routes,
  (select pg_catalog.count(*)
   from public.brinesearch_driver_google_handoffs_public) as google_handoffs,
  (select cutover_at from public.brinesearch_issue97_release_state
    where singleton) as cutover_at,
  (select pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.to_jsonb(b)::text,'|' order by b.id::text))
   from public.brinesearch_road_graph_builds b
   where b.state_code='OH' and b.county_name='Harrison') as harrison_builds_digest,
  (select pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.to_jsonb(rp)::text,'|' order by rp.id::text))
   from public.brinesearch_route_prep rp
   where rp.id='d6f74d54-3102-4f02-bd8a-ee19e1b986cb') as route_prep_digest,
  (select pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.to_jsonb(p)::text,'|' order by p.id::text))
   from public.pads p
   where p.id='0e6f23f1-3bfb-44b0-aa4e-f24dde611880') as pad_digest;

-- ---------------------------------------------------------------- preflight
do $preflight$
declare
  v_before tmp_issue97_beetle_before%rowtype;
  v_route record;
  v_build record;
  v_identity record;
  v_junction record;
  v_anchor_count integer;
begin
  select * into strict v_before from tmp_issue97_beetle_before;

  if pg_catalog.to_regclass(
       'private_verification.brinesearch_v18_named_approach_releases') is null
     or pg_catalog.to_regclass(
       'public.brinesearch_driver_named_approach_releases_public') is null then
    raise exception 'Named-approach contract is not installed';
  end if;

  if exists(select 1 from private_verification.brinesearch_v18_named_approach_releases
             where pad_id='0e6f23f1-3bfb-44b0-aa4e-f24dde611880') then
    raise exception 'BEETLE already has a released named approach';
  end if;

  -- Pad identity and exact saved destination.
  if not exists(
       select 1 from public.pads p
       where p.id='0e6f23f1-3bfb-44b0-aa4e-f24dde611880'
         and p.state='Ohio' and p.county='Harrison'
         and pg_catalog.upper(pg_catalog.btrim(p.pad_name))='BEETLE'
         and pg_catalog.lower(pg_catalog.btrim(p.company))='ascent'
         and p.latitude=40.185403::double precision
         and p.longitude=-80.922718::double precision) then
    raise exception 'BEETLE pad checkpoint diverged';
  end if;

  -- Source route prep must be the exact ready primary variant.
  select * into strict v_route from public.brinesearch_route_prep
   where id='d6f74d54-3102-4f02-bd8a-ee19e1b986cb';
  if v_route.pad_id<>'0e6f23f1-3bfb-44b0-aa4e-f24dde611880'
     or v_route.route_group<>'primary'
     or v_route.readiness_status<>'ready_for_road_matching'
     or v_route.source_sequence_hash<>pg_catalog.md5(v_route.source_sequence) then
    raise exception 'BEETLE route-prep checkpoint diverged';
  end if;

  -- Receipt profile must match the released BANJO profile exactly:
  -- 3 steps, 3 occurrences, 2 resolved, no transition/geometry receipts.
  if (select pg_catalog.count(*) from public.brinesearch_route_prep_steps s
       where s.route_prep_id=v_route.id)<>3
     or (select pg_catalog.count(*)
           from private_verification.brinesearch_route_occurrence_receipts_issue97 o
          where o.route_prep_id=v_route.id)<>3
     or (select pg_catalog.count(*)
           from private_verification.brinesearch_route_occurrence_receipts_issue97 o
          where o.route_prep_id=v_route.id and o.resolved_at is not null)<>2
     or (select pg_catalog.count(*)
           from private_verification.brinesearch_route_transition_receipts_issue97 t
          where t.route_prep_id=v_route.id)<>0
     or (select pg_catalog.count(*)
           from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
          where g.route_prep_id=v_route.id)<>0 then
    raise exception 'BEETLE source receipt profile diverged';
  end if;

  -- Current Harrison graph must be the exact release-current build.
  select * into strict v_build from public.brinesearch_road_graph_builds
   where id='f4e4d43f-e86c-499c-893f-73f2eef3dc29';
  if v_build.state_code<>'OH' or v_build.county_name<>'Harrison'
     or v_build.status<>'active'
     or v_build.graph_digest<>'71cb3479ac57b6f5dc26d0985a056d06' then
    raise exception 'Current Harrison graph checkpoint diverged';
  end if;

  -- Exact OH-519 identity (shared, read-only, with BANJO).
  select * into strict v_identity
    from public.brinesearch_authoritative_road_identities
   where id='e883315b-bf54-9192-4556-342bcb7bb1a5';
  if v_identity.state_code<>'OH' or v_identity.county_name<>'Harrison'
     or not v_identity.active
     or v_identity.route_system<>'SR' or v_identity.route_number<>'519'
     or v_identity.public_access_status<>'public'
     or v_identity.drivable_status<>'drivable' then
    raise exception 'Exact OH-519 road/identity checkpoint diverged';
  end if;

  -- Exact US-250/OH-519 verified junction and its single anchor.
  select * into strict v_junction from public.brinesearch_road_junctions
   where id='4fc9143f-604a-b331-8536-abf72dfd4bba';
  if v_junction.build_id<>'f4e4d43f-e86c-499c-893f-73f2eef3dc29'
     or v_junction.verification_status<>'verified'
     or v_junction.confidence<>'authoritative'
     or v_junction.county_name<>'Harrison' then
    raise exception 'Exact US-250/OH-519 junction checkpoint diverged';
  end if;

  -- The junction must actually carry both route identities.
  if not exists(
       select 1 from public.brinesearch_road_junction_memberships m
       join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
       where m.junction_id=v_junction.id
         and i.route_system='SR' and i.route_number='519')
     or not exists(
       select 1 from public.brinesearch_road_junction_memberships m
       join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
       where m.junction_id=v_junction.id
         and i.route_system='US' and i.route_number='250') then
    raise exception 'US-250/OH-519 junction membership is not exact';
  end if;

  select pg_catalog.count(*) into v_anchor_count
    from public.brinesearch_road_junction_anchors
   where junction_id='4fc9143f-604a-b331-8536-abf72dfd4bba';
  if v_anchor_count<>1
     or not exists(select 1 from public.brinesearch_road_junction_anchors
                    where id='fbb28b88-ce62-33f6-ca3e-dc57783b8d99'
                      and junction_id='4fc9143f-604a-b331-8536-abf72dfd4bba') then
    raise exception 'BEETLE ingress anchor is not exact and singular';
  end if;

  -- Global authority must be untouched on entry.
  if v_before.google_routes<>0 or v_before.google_handoffs<>0
     or v_before.cutover_at is not null then
    raise exception 'Google/cutover checkpoint diverged';
  end if;
end
$preflight$;

-- ------------------------------------------------------------------ release
do $release$
declare
  v_master extensions.geometry;
  v_ingress_point extensions.geometry;
  v_destination_point extensions.geometry;
  v_handoff_point extensions.geometry;
  v_core extensions.geometry;
  v_fraction_start double precision;
  v_fraction_end double precision;
  v_core_miles numeric;
  v_tail_feet numeric;
  v_route public.brinesearch_route_prep%rowtype;
  v_release private_verification.brinesearch_v18_named_approach_releases%rowtype;
  v_route_receipt_digest text;
  v_status_revision text;
  v_bundle jsonb;
  v_published_at constant timestamptz:='2026-08-27T18:00:00Z';
begin
  select * into strict v_route from public.brinesearch_route_prep
   where id='d6f74d54-3102-4f02-bd8a-ee19e1b986cb';

  v_master:=private_verification.brinesearch_issue97_authoritative_identity_geometry(
    'e883315b-bf54-9192-4556-342bcb7bb1a5'
  );
  if extensions.geometrytype(v_master)<>'LINESTRING' then
    raise exception 'OH-519 master geometry is not a single linestring';
  end if;

  select anchor.geom into strict v_ingress_point
    from public.brinesearch_road_junction_anchors anchor
   where anchor.id='fbb28b88-ce62-33f6-ca3e-dc57783b8d99';

  v_destination_point:=extensions.st_setsrid(
    extensions.st_makepoint(-80.922718,40.185403),4326
  );

  -- Projection only clips an already exact, owner-selected OH-519 identity.
  -- It does not select a road by nearest distance.
  v_handoff_point:=extensions.st_closestpoint(v_master,v_destination_point);
  v_fraction_start:=extensions.st_linelocatepoint(v_master,v_ingress_point);
  v_fraction_end:=extensions.st_linelocatepoint(v_master,v_handoff_point);

  -- BEETLE is WESTBOUND: it enters at the US-250 terminus (fraction 1.0) and
  -- travels toward decreasing measure. This is the opposite of the released
  -- BANJO approach on the same identity and is asserted, not assumed.
  if v_fraction_start<=v_fraction_end then
    raise exception
      'Reviewed westbound OH-519 direction is not preserved (start % end %)',
      v_fraction_start, v_fraction_end;
  end if;

  v_core:=extensions.st_reverse(
    extensions.st_linesubstring(v_master,v_fraction_end,v_fraction_start)
  );

  v_core_miles:=round(
    (extensions.st_length(v_core::extensions.geography)/1609.344)::numeric,6);
  v_tail_feet:=round(
    (extensions.st_distance(v_handoff_point::extensions.geography,
                            v_destination_point::extensions.geography)
     *3.28084)::numeric,1);

  -- The handoff is only honest while the unapproved tail is a lease-length
  -- stub. BANJO ships at ~55 ft; BEETLE measures 339.6 ft. Anything beyond a
  -- quarter mile means the projection is not the real turnoff.
  if v_core_miles<=0 or v_tail_feet>1320 then
    raise exception
      'BEETLE core/tail outside the honest named-approach envelope (core % mi, tail % ft)',
      v_core_miles, v_tail_feet;
  end if;

  v_route_receipt_digest:=pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'route',pg_catalog.to_jsonb(v_route),
      'steps',(select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(r) order by r.step_order),'[]'::jsonb)
        from public.brinesearch_route_prep_steps r
        where r.route_prep_id=v_route.id),
      'occurrences',(select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(r) order by r.occurrence_index),'[]'::jsonb)
        from private_verification.brinesearch_route_occurrence_receipts_issue97 r
        where r.route_prep_id=v_route.id),
      'transitions',(select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(r) order by r.boundary_index),'[]'::jsonb)
        from private_verification.brinesearch_route_transition_receipts_issue97 r
        where r.route_prep_id=v_route.id),
      'geometryReceipts',(select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(r) order by r.occurrence_index),'[]'::jsonb)
        from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 r
        where r.route_prep_id=v_route.id)
    )::text,'UTF8'),'sha256'),'hex');

  v_bundle:=public.brinesearch_v18_driver_pad_status_with_named_approaches(
    '0e6f23f1-3bfb-44b0-aa4e-f24dde611880');
  v_status_revision:=pg_catalog.lower(
    coalesce(v_bundle#>>'{status,statusRevision}',''));
  if v_status_revision!~'^[0-9a-f]{32,64}$'
     or v_bundle#>>'{status,route,source}'<>'legacy_written'
     or v_bundle->'publicGoogleRoute' is distinct from 'null'::jsonb
     or v_bundle->'publicGoogleHandoff' is distinct from 'null'::jsonb then
    raise exception 'BEETLE base driver revision/authority checkpoint diverged';
  end if;

  v_release.release_id:=extensions.gen_random_uuid();
  v_release.pad_id:='0e6f23f1-3bfb-44b0-aa4e-f24dde611880';
  v_release.approach_key:='us250-oh519-stumptown-westbound';
  v_release.approach_label:='US-250 at OH-519, then OH-519 west';
  v_release.route_group:='primary';
  v_release.variant_index:=1;
  v_release.release_version:='v18-named-approach-v1';
  v_release.route_prep_id:=v_route.id;
  v_release.source_sequence:=v_route.source_sequence;
  v_release.source_sequence_hash:=v_route.source_sequence_hash;
  v_release.route_revision:=1;
  v_release.route_receipt_digest:=v_route_receipt_digest;
  v_release.graph_build_id:='f4e4d43f-e86c-499c-893f-73f2eef3dc29';
  v_release.graph_digest:='71cb3479ac57b6f5dc26d0985a056d06';

  v_release.steps:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'stepOrder',1,
      'displayName','OH-519 / Stumptown Rd',
      'travelDirection','westbound',
      'distanceMiles',v_core_miles
    )
  );

  v_release.geometry:=pg_catalog.jsonb_build_object(
    'type','FeatureCollection',
    'features',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'type','Feature',
        'properties',pg_catalog.jsonb_build_object(
          'role','exact_approved_core',
          'displayName','OH-519 / Stumptown Rd'),
        'geometry',extensions.st_asgeojson(v_core)::jsonb
      )
    )
  );

  v_release.ingress:=pg_catalog.jsonb_build_object(
    'role','exact_approved_ingress',
    'label','US-250 at OH-519 east of Cadiz',
    'latitude',round(extensions.st_y(v_ingress_point)::numeric,7)::double precision,
    'longitude',round(extensions.st_x(v_ingress_point)::numeric,7)::double precision
  );

  v_release.core_end:=pg_catalog.jsonb_build_object(
    'role','exact_approved_handoff',
    'label','OH-519 at BEETLE lease approach',
    'latitude',round(extensions.st_y(v_handoff_point)::numeric,7)::double precision,
    'longitude',round(extensions.st_x(v_handoff_point)::numeric,7)::double precision
  );

  v_release.destination:=pg_catalog.jsonb_build_object(
    'role','saved_pad_destination',
    'label','BEETLE verified driver GPS',
    'latitude',40.185403::double precision,
    'longitude',-80.922718::double precision
  );

  v_release.final_leg_mode:='google_to_saved_gps_unapproved';

  -- Both ends pinned: a lone junction anchor lets Google reach the junction
  -- from the wrong side and choose an unreviewed final path (see the
  -- 20260826215136 revocation).
  v_release.handoff:=pg_catalog.jsonb_build_object(
    'originMode','current_location_to_named_ingress',
    'handoffMode','verified_compact',
    'waypoints',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'latitude',round(extensions.st_y(v_ingress_point)::numeric,7)::double precision,
        'longitude',round(extensions.st_x(v_ingress_point)::numeric,7)::double precision),
      pg_catalog.jsonb_build_object(
        'latitude',round(extensions.st_y(v_handoff_point)::numeric,7)::double precision,
        'longitude',round(extensions.st_x(v_handoff_point)::numeric,7)::double precision)
    )
  );

  v_release.last_verified_at:=v_published_at;
  v_release.status_revision:=v_status_revision;

  v_release.evidence:=pg_catalog.jsonb_build_object(
    'issue',97,
    'contract','named_exact_public_road_core_plus_saved_gps_destination',
    'sourceRoutePrepId',v_route.id,
    'sourceSequenceHash',v_route.source_sequence_hash,
    'orientation',pg_catalog.jsonb_build_object(
      'method','geometric_core_road_selection',
      'note','stored sequence is pad-outward; core road taken from measured proximity',
      'padToCoreRoadFeet',v_tail_feet,
      'padToIngressPartnerMiles',0.583,
      'fractionIngress',v_fraction_start,
      'fractionCoreEnd',v_fraction_end,
      'travelDirection','westbound'),
    'ingressJunctionId','4fc9143f-604a-b331-8536-abf72dfd4bba',
    'ingressAnchorId','fbb28b88-ce62-33f6-ca3e-dc57783b8d99',
    'coreIdentityId','e883315b-bf54-9192-4556-342bcb7bb1a5',
    'coreMiles',v_core_miles,
    'sharedIdentityWith','BANJO (opposite direction, independent release)'
  );

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
    release_version,route_revision,steps,geometry,ingress,core_end,
    destination,final_leg_mode,handoff,last_verified_at,status_revision,
    release_digest,published_at
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

-- ---------------------------------------------------------------- postflight
do $postflight$
declare
  v_before tmp_issue97_beetle_before%rowtype;
  v_after jsonb;
  v_approach jsonb;
begin
  select * into strict v_before from tmp_issue97_beetle_before;

  if (select pg_catalog.count(*)
        from private_verification.brinesearch_v18_named_approach_releases)
       <>v_before.named_private_count+1
     or (select pg_catalog.count(*)
        from public.brinesearch_driver_named_approach_releases_public)
       <>v_before.named_public_count+1 then
    raise exception 'BEETLE named release is not active and atomic';
  end if;

  -- Nothing else moved.
  if (select pg_catalog.count(*) from public.brinesearch_driver_google_routes_public)<>0
     or (select pg_catalog.count(*) from public.brinesearch_driver_google_handoffs_public)<>0
     or (select cutover_at from public.brinesearch_issue97_release_state
          where singleton) is not null then
    raise exception 'Google/cutover authority changed';
  end if;

  if (select pg_catalog.md5(pg_catalog.string_agg(
        pg_catalog.to_jsonb(b)::text,'|' order by b.id::text))
      from public.brinesearch_road_graph_builds b
      where b.state_code='OH' and b.county_name='Harrison')
     is distinct from v_before.harrison_builds_digest then
    raise exception 'Harrison graph authority changed';
  end if;

  if (select pg_catalog.md5(pg_catalog.string_agg(
        pg_catalog.to_jsonb(rp)::text,'|' order by rp.id::text))
      from public.brinesearch_route_prep rp
      where rp.id='d6f74d54-3102-4f02-bd8a-ee19e1b986cb')
     is distinct from v_before.route_prep_digest then
    raise exception 'BEETLE route prep changed';
  end if;

  if (select pg_catalog.md5(pg_catalog.string_agg(
        pg_catalog.to_jsonb(p)::text,'|' order by p.id::text))
      from public.pads p
      where p.id='0e6f23f1-3bfb-44b0-aa4e-f24dde611880')
     is distinct from v_before.pad_digest then
    raise exception 'BEETLE pad authority changed';
  end if;

  -- COLOGIE and BANJO bundles must be byte-identical.
  if public.brinesearch_v18_driver_pad_status_with_named_approaches(
       'e2b32e85-9e93-4388-8215-9d8167cbbeb8')
     is distinct from v_before.cologie_bundle then
    raise exception 'COLOGIE bundle changed';
  end if;
  if public.brinesearch_v18_driver_pad_status_with_named_approaches(
       'b7526e45-0b33-4988-ae1c-0a4140971f8e')
     is distinct from v_before.banjo_bundle then
    raise exception 'BANJO bundle changed';
  end if;

  -- Public projection must be clean and complete.
  v_after:=public.brinesearch_v18_driver_pad_status_with_named_approaches(
    '0e6f23f1-3bfb-44b0-aa4e-f24dde611880');
  v_approach:=v_after#>'{namedApproaches,0}';

  if v_approach->>'releaseVersion'<>'v18-named-approach-v1'
     or v_approach->>'finalLegMode'<>'google_to_saved_gps_unapproved'
     or v_approach#>>'{ingress,label}'<>'US-250 at OH-519 east of Cadiz'
     or v_approach#>>'{coreEnd,label}'<>'OH-519 at BEETLE lease approach'
     or v_approach#>>'{destination,label}'<>'BEETLE verified driver GPS'
     or v_approach#>>'{steps,0,displayName}'<>'OH-519 / Stumptown Rd'
     or pg_catalog.jsonb_array_length(v_approach->'steps')<>1
     or pg_catalog.jsonb_array_length(v_approach#>'{geometry,features}')<>1
     or pg_catalog.jsonb_array_length(v_approach#>'{handoff,waypoints}')<>2
     or v_approach::text~*'(https?://|google\.com|private|ownerAuthorization|evidence)'
  then
    raise exception 'BEETLE public named approach projection failed closed';
  end if;

  -- The base route state must remain held; a named approach is not a route.
  if v_after#>>'{status,route,source}'<>'legacy_written'
     or (v_after-'namedApproaches')
        is distinct from (v_before.beetle_bundle-'namedApproaches') then
    raise exception 'BEETLE base driver status changed';
  end if;
end
$postflight$;
