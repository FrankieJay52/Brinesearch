-- Ascent source-first 27: prepare BELLA's exact Airport Rd / CR-38 identity.
--
-- This migration is intentionally UNAPPLIED in this phase. When separately
-- authorized, it adopts one current ODOT source identity into Road Manager and
-- binds only BELLA's exact route-prep step. It does not create occurrence,
-- junction, graph, route, teal, Google, or cutover authority. The mapping
-- fingerprint change makes the current Harrison graph stale; the ordinary
-- invalidation triggers may withdraw stale company overlays. A later graph and
-- overlay reconciliation is required before BELLA can leave GPS_ONLY.

do $ascent_source_first_bella_airport_identity$
declare
  v_pad constant uuid := '807ccb15-6f57-4c7a-978d-ab02e7a7c4ba';
  v_prep constant uuid := '7e97ed5c-d06e-4b6d-8680-0f6658a02c52';
  v_step constant uuid := '0116d6cb-5283-4602-8008-9a594c4dfe10';
  v_private_step constant uuid := 'efba9f06-684a-43af-9047-c021aa79d779';
  v_identity_id constant uuid := '5e78e286-52af-c0e0-904c-4333b603a6c3';
  v_source_key constant text :=
    'OH:ODOT:NLF:CHASCR00038**C:COMP:2025_000000000025902';
  v_road constant uuid := '6eb2d5b0-fc1e-1440-6ea5-c35aabdaf549';
  v_mapping constant uuid := '8a0accae-9fc2-edf3-ae72-9f38b35116a3';
  v_identity public.brinesearch_authoritative_road_identities%rowtype;
  v_geom extensions.geometry;
  v_rows integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(
      'brinesearch:issue97:ingest:' ||
      '3efc5c6b-9666-ea1a-49b8-a68ba2055839:HAS'
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:saved-road-reconciliation')
  );

  if private_verification.brinesearch_issue97_uuid(
       'canonical-road:' || v_source_key
     ) is distinct from v_road
     or private_verification.brinesearch_issue97_uuid(
       'identity-mapping:' || v_identity_id::text || ':' || v_road::text
     ) is distinct from v_mapping then
    raise exception 'BELLA deterministic identifier drift';
  end if;

  if (select count(*)
      from public.public_pad_detail pad
      join public.brinesearch_directory_snapshot_rows_v18 snapshot_row
        on snapshot_row.pad_id = pad.id
      join public.brinesearch_directory_snapshots_v18 snapshot
        on snapshot.snapshot_id = snapshot_row.snapshot_id
       and snapshot.publication_state = 'current'
      cross join lateral
        private_verification.brinesearch_v18_public_pad_directions(pad.id)
          directions
      where pad.id = v_pad
        and pad.legacy_id = 'ascent--bella'
        and pg_catalog.upper(pg_catalog.btrim(pad.company)) = 'ASCENT'
        and pg_catalog.upper(pg_catalog.btrim(pad.state)) in ('OH', 'OHIO')
        and pg_catalog.upper(pg_catalog.btrim(pad.county)) = 'HARRISON'
        and pad.latitude = 40.235367
        and pad.longitude = -81.0188
        and snapshot_row.record_revision = 1786265812046205
        and directions.direction_source = 'directions_clear'
        and pg_catalog.octet_length(
          pg_catalog.convert_to(directions.directions_clear, 'UTF8')
        ) = 223
        and pg_catalog.encode(extensions.digest(
          pg_catalog.convert_to(directions.directions_clear, 'UTF8'),
          'sha256'
        ), 'hex') =
          'd67652f025e8812afdddbb879709a313646c2d792419d9c7db00fbfa431f90ef'
      ) <> 1 then
    raise exception 'BELLA pad/revision/GPS/cleaned-source checkpoint drift';
  end if;

  if not exists (
    select 1
    from public.brinesearch_route_prep prep
    where prep.id = v_prep
      and prep.pad_id = v_pad
      and prep.active
      and prep.route_group = 'primary'
      and prep.variant_index = 1
      and prep.source_sequence = 'Route 22 → Route 9 → Airport Rd → Pad'
      and prep.normalized_sequence = 'Route 22 → Route 9 → Airport Rd → Pad'
      and prep.readiness_status = 'needs_sequence_reorder'
      and prep.issue_codes = array['ambiguous_route_reference']::text[]
  ) then
    raise exception 'BELLA route-prep checkpoint drift';
  end if;

  if not exists (
    select 1
    from public.brinesearch_route_prep_steps step
    where step.id = v_step
      and step.route_prep_id = v_prep
      and step.active
      and step.step_order = 3
      and step.raw_text = 'Airport Rd'
      and step.normalized_text = 'Airport Rd'
      and step.step_kind = 'local_road'
      and step.road_id is null
      and step.match_status = 'needs_official_match'
      and step.match_method = 'unmatched_saved_road_name'
      and step.geometry_status = 'not_started'
  ) then
    raise exception 'BELLA Airport step checkpoint drift';
  end if;

  if not exists (
    select 1
    from public.brinesearch_route_prep_steps step
    join private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
      on receipt.route_prep_step_id = step.id
    where step.id = v_private_step
      and step.route_prep_id = v_prep
      and step.active
      and step.road_id is null
      and step.step_kind = 'private_segment'
      and receipt.resolution_status = 'held'
      and receipt.hold_reason =
        'terminal_private_access_destination_requires_authoritative_geometry'
      and receipt.identity_id is null
      and receipt.canonical_road_id is null
  ) then
    raise exception 'BELLA private tail checkpoint drift';
  end if;

  select identity.*
  into strict v_identity
  from public.brinesearch_authoritative_road_identities identity
  where identity.id = v_identity_id
    and identity.dataset_id = '3efc5c6b-9666-ea1a-49b8-a68ba2055839'
    and identity.source_identity_key = v_source_key
    and identity.state_code = 'OH'
    and identity.county_code = 'HAS'
    and identity.county_name = 'Harrison'
    and identity.township = 'Cadiz'
    and identity.route_system = 'CR'
    and identity.route_number = '38'
    and identity.display_name = 'AIRPORT RD'
    and identity.normalized_name = 'airport rd'
    and identity.road_class = 'county'
    and identity.public_access_status = 'public'
    and identity.drivable_status = 'drivable'
    and identity.source_digest = 'b7c0a95ba347c3e0332b322b787bdeed'
    and identity.attributes->>'nlf_id' = 'CHASCR00038**C'
    and identity.active
    and private_verification.brinesearch_issue97_dataset_scope_current(
      identity.dataset_id, identity.state_code, identity.county_code
    );

  v_geom :=
    private_verification.brinesearch_issue97_authoritative_identity_geometry(
      v_identity_id
    );
  if v_geom is null
     or extensions.st_isempty(v_geom)
     or extensions.st_srid(v_geom) <> 4326
     or extensions.st_dimension(v_geom) <> 1
     or private_verification
          .brinesearch_issue97_authoritative_identity_geometry_digest(
            v_identity_id
          ) is distinct from 'a04480431efc706caca01e45e2789109' then
    raise exception 'BELLA current authoritative geometry checkpoint drift';
  end if;

  if not exists (
    select 1
    from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
    where receipt.route_prep_step_id = v_step
      and receipt.route_prep_id = v_prep
      and receipt.pad_id = v_pad
      and receipt.source_step_order = 3
      and receipt.raw_text = 'Airport Rd'
      and receipt.resolution_status = 'resolved'
      and receipt.resolution_method = 'route_graph_unique_identity_path'
      and receipt.identity_id = v_identity_id
      and receipt.canonical_road_id is null
      and receipt.source_identity_key = v_source_key
      and receipt.driver_road_name = 'AIRPORT RD'
      and receipt.valid_aliases @> array['AIRPORT RD', 'CR 38']::text[]
      and receipt.source_digest = 'b7c0a95ba347c3e0332b322b787bdeed'
      and receipt.receipt_digest = '577de2422efdcc9e6b0f910992b9f944'
      and receipt.candidate_count = 9
  ) then
    raise exception 'BELLA exact occurrence identity receipt drift';
  end if;

  -- Reuse is only safe when explicitly reviewed. This migration fails rather
  -- than cloning an existing mapping or same-jurisdiction CR-38 road.
  if exists (
       select 1 from public.brinesearch_road_identity_mappings mapping
       where mapping.identity_id = v_identity_id or mapping.id = v_mapping
     ) or exists (
       select 1 from public.brinesearch_roads road
       where road.id = v_road
          or road.source_record_id = 'CHASCR00038**C'
          or (
            road.state = 'OH'
            and pg_catalog.lower(coalesce(road.county, '')) = 'harrison'
            and road.road_type = 'county'
            and road.route_number = '38'
          )
     ) then
    raise exception 'BELLA exact road/mapping already exists or conflicts';
  end if;

  insert into public.brinesearch_roads (
    id, canonical_name, normalized_name, road_type, state, county, township,
    aliases, route_number, verification_status, verified_at, source_agency,
    source_dataset, source_method, source_url, source_record_id,
    centerline_geojson, geometry_status, geometry_checked_at,
    approved_by_default, candidate_only, candidate_basis
  ) values (
    v_road, 'Airport Rd', 'airport-rd', 'county', 'OH', 'Harrison', 'Cadiz',
    array['AIRPORT RD', 'CR 38']::text[], '38', 'verified',
    pg_catalog.clock_timestamp(), 'Ohio Department of Transportation',
    'Road Inventory', 'issue97_oh_exact_source_identity',
    'https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0',
    'CHASCR00038**C', extensions.st_asgeojson(v_geom, 7)::jsonb,
    'official_centerline_loaded', pg_catalog.clock_timestamp(), false, false,
    pg_catalog.jsonb_build_object(
      'issue', 97,
      'scope', 'BELLA source-first exact identity only',
      'adoption', 'exact_source_identity',
      'pad_id', v_pad,
      'route_prep_id', v_prep,
      'route_prep_step_id', v_step,
      'source_identity_key', v_source_key,
      'source_digest', v_identity.source_digest,
      'geometry_digest', 'a04480431efc706caca01e45e2789109',
      'directions_clear_sha256',
        'd67652f025e8812afdddbb879709a313646c2d792419d9c7db00fbfa431f90ef',
      'name_matching_used', false,
      'fuzzy_matching_used', false,
      'nearest_road_used', false,
      'route_number_only_used', false,
      'route_authority_upgrade', false,
      'teal_authority', false,
      'public_google_publication', false,
      'active_graphs_require_rebuild', true
    )
  );
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'BELLA road insert affected % rows', v_rows;
  end if;

  insert into public.brinesearch_road_identity_mappings (
    id, identity_id, road_id, mapping_status, mapping_method, evidence,
    verified_at, created_at, updated_at
  ) values (
    v_mapping, v_identity_id, v_road, 'verified', 'exact_source_record_id',
    pg_catalog.jsonb_build_object(
      'issue', 97,
      'scope', 'BELLA source-first exact identity only',
      'pad_id', v_pad,
      'source_identity_key', v_source_key,
      'source_digest', v_identity.source_digest,
      'exact_source_record_id', true,
      'name_matching_used', false,
      'fuzzy_matching_used', false,
      'nearest_road_used', false,
      'route_number_only_used', false,
      'route_authority_upgrade', false,
      'teal_authority', false,
      'public_google_publication', false,
      'active_graphs_require_rebuild', true
    ),
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  );
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'BELLA mapping insert affected % rows', v_rows;
  end if;

  update public.brinesearch_route_prep_steps step
  set road_id = v_road,
      step_kind = 'county_road',
      match_status = 'exact_master',
      match_method = 'issue97_source_first_exact_source_identity',
      match_confidence = 1,
      -- Identity only. Occurrence and graph reconciliation remain separate.
      geometry_status = 'not_started',
      source_details = coalesce(step.source_details, '{}'::jsonb) ||
        pg_catalog.jsonb_build_object(
          'issue', 97,
          'source_identity_key', v_source_key,
          'authoritative_identity_id', v_identity_id,
          'source_digest', v_identity.source_digest,
          'directions_clear_sha256',
            'd67652f025e8812afdddbb879709a313646c2d792419d9c7db00fbfa431f90ef',
          'name_matching_used', false,
          'fuzzy_matching_used', false,
          'nearest_road_used', false,
          'route_number_only_used', false,
          'occurrence_or_junction_authority', false,
          'route_authority_upgrade', false,
          'teal_authority', false,
          'public_google_publication', false,
          'active_graphs_require_rebuild', true
        ),
      updated_at = pg_catalog.clock_timestamp()
  where step.id = v_step
    and step.route_prep_id = v_prep
    and step.active
    and step.step_order = 3
    and step.raw_text = 'Airport Rd'
    and step.normalized_text = 'Airport Rd'
    and step.step_kind = 'local_road'
    and step.road_id is null
    and step.match_status = 'needs_official_match'
    and step.match_method = 'unmatched_saved_road_name'
    and step.geometry_status = 'not_started';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'BELLA Airport step binding affected % rows', v_rows;
  end if;

  if not exists (
       select 1 from public.brinesearch_roads road
       where road.id = v_road
         and road.approved_by_default = false
         and road.candidate_only = false
         and road.geometry_status = 'official_centerline_loaded'
     )
     or not exists (
       select 1 from public.brinesearch_road_identity_mappings mapping
       where mapping.id = v_mapping
         and mapping.identity_id = v_identity_id
         and mapping.road_id = v_road
         and mapping.mapping_status = 'verified'
         and mapping.mapping_method = 'exact_source_record_id'
     )
     or not exists (
       select 1 from public.brinesearch_route_prep_steps step
       where step.id = v_step
         and step.road_id = v_road
         and step.geometry_status = 'not_started'
         and coalesce(
           (step.source_details->>'teal_authority')::boolean, false
         ) = false
     )
     or not exists (
       select 1 from public.brinesearch_route_prep_steps step
       where step.id = v_private_step
         and step.road_id is null
         and step.step_kind = 'private_segment'
     )
     or not exists (
       select 1
       from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
       where receipt.route_prep_step_id = v_step
         and receipt.identity_id = v_identity_id
         and receipt.canonical_road_id is null
     )
     or not exists (
       select 1 from public.brinesearch_route_prep prep
       where prep.id = v_prep
         and prep.readiness_status = 'needs_sequence_reorder'
     ) then
    raise exception 'BELLA identity-only postcondition failed';
  end if;
end
$ascent_source_first_bella_airport_identity$;
