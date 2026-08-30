-- Ascent Ohio source-first completion: reconcile CRICKET's existing exact
-- Foxes Bottom Rd / CR-15 binding with its already-resolved Issue #97 receipt.
--
-- This migration is intentionally UNAPPLIED. It updates one stale route-prep
-- match label only. The canonical road, exact ODOT identity, verified mapping,
-- and occurrence receipt already exist. It creates no road, graph, junction,
-- geometry, Google, route-release, teal, approval, or cutover authority.

do $ascent_cricket_foxes_identity_binding$
declare
  v_pad constant uuid := '3a72c3df-f0a1-4639-a468-019989c78f43';
  v_prep constant uuid := 'ae9fe561-45ee-4611-8015-54567b4816ac';
  v_step constant uuid := '4bb28389-455d-4c09-b9fa-ad5d6b543aba';
  v_road constant uuid := '86bf887d-4995-4604-8456-6243722a544e';
  v_identity constant uuid := '6e9b209c-9b94-663f-9e0f-76391c2d9e0a';
  v_mapping constant uuid := 'b10b52ef-2674-33e5-878d-fabfdae55840';
  v_source_key constant text := 'OH:ODOT:NLF:CHASCR00015**C';
  v_driver_status_before text;
  v_google_status_before text;
  v_named_status_before text;
  v_occurrence_receipts_before text;
  v_transition_receipts_before text;
  v_geometry_receipts_before text;
  v_sibling_steps_before text;
  v_rows integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:saved-road-reconciliation')
  );

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
        and pad.legacy_id = 'ascent--cricket'
        and pg_catalog.upper(pg_catalog.btrim(pad.company)) = 'ASCENT'
        and pg_catalog.upper(pg_catalog.btrim(pad.state)) in ('OH', 'OHIO')
        and pg_catalog.upper(pg_catalog.btrim(pad.county)) = 'HARRISON'
        and pad.latitude = 40.221655
        and pad.longitude = -80.881193
        and snapshot_row.record_revision = 1786265812046205
        and directions.direction_source = 'directions_clear'
        and pg_catalog.encode(extensions.digest(
          pg_catalog.convert_to(directions.directions_clear, 'UTF8'),
          'sha256'
        ), 'hex') =
          '67f1b6e80384a0211404d5e724954ed2adc256179623ffda8b8ee76ede594704'
      ) <> 1 then
    raise exception 'CRICKET pad/revision/GPS/cleaned-source checkpoint drift';
  end if;

  if not exists (
    select 1
    from public.brinesearch_route_prep prep
    where prep.id = v_prep
      and prep.pad_id = v_pad
      and prep.active
      and prep.route_group = 'primary'
      and prep.variant_index = 1
      and prep.source_sequence =
        'Route 250 → Foxes Bottom Rd → Springdale Hill Rd → Lamborn Rd → Lease Road'
      and prep.normalized_sequence =
        'Route 250 → Foxes Bottom Rd → Springdale Hill Rd → Lamborn Rd → Lease Road'
      and prep.readiness_status = 'ready_for_road_matching'
      and prep.issue_codes = '{}'::text[]
      and prep.no_guess_policy = 'strict'
  ) then
    raise exception 'CRICKET route-prep checkpoint drift';
  end if;

  if not exists (
    select 1
    from public.brinesearch_route_prep_steps step
    where step.id = v_step
      and step.route_prep_id = v_prep
      and step.active
      and step.step_order = 2
      and step.raw_text = 'Foxes Bottom Rd'
      and step.normalized_text = 'Foxes Bottom Rd'
      and step.step_kind = 'local_road'
      and step.road_id = v_road
      and step.match_status = 'needs_official_match'
      and step.match_method = 'unmatched_saved_road_name'
      and step.match_confidence is null
      and step.geometry_status = 'ready'
  ) then
    raise exception 'CRICKET stale route-prep step checkpoint drift';
  end if;

  if not exists (
       select 1
       from public.brinesearch_roads road
       where road.id = v_road
         and road.canonical_name = 'Foxs Bottom Rd'
         and road.normalized_name = 'foxs-bottom-rd'
         and road.road_type = 'county'
         and road.state = 'OH'
         and road.county = 'Harrison'
         and road.route_number = '15'
         and road.source_agency = 'Ohio Department of Transportation'
         and road.source_dataset = 'Road Inventory'
         and road.source_method = 'official_centerline'
         and road.source_record_id = 'CHASCR00015**C'
         and road.verification_status = 'verified'
         and road.approved_by_default = false
         and road.candidate_only = false
     ) or not exists (
       select 1
       from public.brinesearch_authoritative_road_identities identity
       where identity.id = v_identity
         and identity.source_identity_key = v_source_key
         and identity.state_code = 'OH'
         and identity.county_code = 'HAS'
         and identity.county_name = 'Harrison'
         and identity.route_system = 'CR'
         and identity.route_number = '15'
         and identity.display_name = 'FOXS BOTTOM RD'
         and identity.source_digest = 'bd3a716f67bc4f0388c777f77f666ec8'
         and identity.active
         and private_verification.brinesearch_issue97_dataset_scope_current(
           identity.dataset_id, identity.state_code, identity.county_code
         )
         and private_verification
           .brinesearch_issue97_authoritative_identity_geometry_digest(identity.id)
           = 'ba50265d441f7e24434c4078f866f46d'
     ) or not exists (
       select 1
       from public.brinesearch_road_identity_mappings mapping
       where mapping.id = v_mapping
         and mapping.identity_id = v_identity
         and mapping.road_id = v_road
         and mapping.mapping_status = 'verified'
         and mapping.mapping_method = 'exact_source_record_id'
         and mapping.evidence->>'source_identity_key' = v_source_key
         and mapping.evidence->>'road_source_record_id' = 'CHASCR00015**C'
         and coalesce(
           (mapping.evidence->>'no_name_matching')::boolean, false
         )
     ) then
    raise exception 'CRICKET exact road/identity/mapping checkpoint drift';
  end if;

  if not exists (
    select 1
    from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
    where receipt.route_prep_step_id = v_step
      and receipt.route_prep_id = v_prep
      and receipt.pad_id = v_pad
      and receipt.source_step_order = 2
      and receipt.raw_text = 'Foxes Bottom Rd'
      and receipt.resolution_status = 'resolved'
      and receipt.resolution_method = 'route_graph_unique_identity_path'
      and receipt.identity_id = v_identity
      and receipt.canonical_road_id = v_road
      and receipt.source_identity_key = v_source_key
      and receipt.driver_road_name = 'FOXS BOTTOM RD'
      and receipt.source_digest = 'bd3a716f67bc4f0388c777f77f666ec8'
      and receipt.receipt_digest = '49de8bbe31e3aa99a909af1527c0e90d'
      and receipt.candidate_count = 1
      and receipt.input_road_id = v_road
      and receipt.evidence->>'selection_uses_name_similarity' = 'false'
      and receipt.evidence->>'selection_uses_nearest_road' = 'false'
      and receipt.evidence->>'selection_uses_route_number_alone' = 'false'
  ) then
    raise exception 'CRICKET exact occurrence receipt checkpoint drift';
  end if;

  select pg_catalog.md5(public.brinesearch_v18_driver_pad_status(v_pad)::text)
    into strict v_driver_status_before;
  select pg_catalog.md5(
      public.brinesearch_v18_driver_pad_status_with_google_handoff(v_pad)::text
    ) into strict v_google_status_before;
  select pg_catalog.md5(
      public.brinesearch_v18_driver_pad_status_with_named_approaches(v_pad)::text
    ) into strict v_named_status_before;
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.to_jsonb(receipt)::text, '|' order by receipt.route_prep_step_id
    ), ''))
    into strict v_occurrence_receipts_before
  from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
  where receipt.route_prep_id = v_prep;
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.to_jsonb(receipt)::text, '|' order by receipt.boundary_index
    ), ''))
    into strict v_transition_receipts_before
  from private_verification.brinesearch_route_transition_receipts_issue97 receipt
  where receipt.route_prep_id = v_prep;
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.to_jsonb(receipt)::text, '|' order by receipt.route_prep_step_id
    ), ''))
    into strict v_geometry_receipts_before
  from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
  where receipt.route_prep_id = v_prep;
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.to_jsonb(step)::text, '|' order by step.step_order
    ), ''))
    into strict v_sibling_steps_before
  from public.brinesearch_route_prep_steps step
  where step.route_prep_id = v_prep and step.id <> v_step;

  update public.brinesearch_route_prep_steps step
  set match_status = 'exact_master',
      match_method = 'issue97_source_first_exact_existing_mapping',
      match_confidence = 1,
      source_details = coalesce(step.source_details, '{}'::jsonb) ||
        pg_catalog.jsonb_build_object(
          'issue', 97,
          'scope', 'CRICKET existing Foxes Bottom occurrence binding only',
          'source_identity_key', v_source_key,
          'authoritative_identity_id', v_identity,
          'canonical_road_id', v_road,
          'mapping_id', v_mapping,
          'source_digest', 'bd3a716f67bc4f0388c777f77f666ec8',
          'directions_clear_sha256',
            '67f1b6e80384a0211404d5e724954ed2adc256179623ffda8b8ee76ede594704',
          'name_matching_used', false,
          'fuzzy_matching_used', false,
          'nearest_road_used', false,
          'route_number_only_used', false,
          'occurrence_or_junction_authority_created', false,
          'route_authority_upgrade', false,
          'teal_authority', false,
          'public_google_publication', false,
          'graph_changed', false,
          'cutover_changed', false
        ),
      updated_at = pg_catalog.clock_timestamp()
  where step.id = v_step
    and step.route_prep_id = v_prep
    and step.active
    and step.step_order = 2
    and step.raw_text = 'Foxes Bottom Rd'
    and step.normalized_text = 'Foxes Bottom Rd'
    and step.step_kind = 'local_road'
    and step.road_id = v_road
    and step.match_status = 'needs_official_match'
    and step.match_method = 'unmatched_saved_road_name'
    and step.match_confidence is null
    and step.geometry_status = 'ready';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'CRICKET exact binding update affected % rows', v_rows;
  end if;

  if not exists (
       select 1
       from public.brinesearch_route_prep_steps step
       where step.id = v_step
         and step.route_prep_id = v_prep
         and step.road_id = v_road
         and step.step_kind = 'local_road'
         and step.match_status = 'exact_master'
         and step.match_method = 'issue97_source_first_exact_existing_mapping'
         and step.match_confidence = 1
         and step.geometry_status = 'ready'
         and step.source_details->>'source_identity_key' = v_source_key
         and step.source_details->>'authoritative_identity_id' = v_identity::text
         and step.source_details->>'canonical_road_id' = v_road::text
         and step.source_details->>'mapping_id' = v_mapping::text
         and coalesce(
           (step.source_details->>'route_authority_upgrade')::boolean, true
         ) = false
         and coalesce((step.source_details->>'teal_authority')::boolean, true) = false
         and coalesce(
           (step.source_details->>'public_google_publication')::boolean, true
         ) = false
     ) or not exists (
       select 1
       from public.brinesearch_route_prep prep
       where prep.id = v_prep
         and prep.readiness_status = 'ready_for_road_matching'
         and prep.issue_codes = '{}'::text[]
     ) then
    raise exception 'CRICKET identity-binding postcondition failed';
  end if;

  if pg_catalog.md5(public.brinesearch_v18_driver_pad_status(v_pad)::text)
       is distinct from v_driver_status_before
     or pg_catalog.md5(
       public.brinesearch_v18_driver_pad_status_with_google_handoff(v_pad)::text
     ) is distinct from v_google_status_before
     or pg_catalog.md5(
       public.brinesearch_v18_driver_pad_status_with_named_approaches(v_pad)::text
     ) is distinct from v_named_status_before
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
          pg_catalog.to_jsonb(receipt)::text, '|' order by receipt.route_prep_step_id
        ), ''))
        from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
        where receipt.route_prep_id = v_prep) is distinct from v_occurrence_receipts_before
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
          pg_catalog.to_jsonb(receipt)::text, '|' order by receipt.boundary_index
        ), ''))
        from private_verification.brinesearch_route_transition_receipts_issue97 receipt
        where receipt.route_prep_id = v_prep) is distinct from v_transition_receipts_before
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
          pg_catalog.to_jsonb(receipt)::text, '|' order by receipt.route_prep_step_id
        ), ''))
        from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
        where receipt.route_prep_id = v_prep) is distinct from v_geometry_receipts_before
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
          pg_catalog.to_jsonb(step)::text, '|' order by step.step_order
        ), ''))
        from public.brinesearch_route_prep_steps step
        where step.route_prep_id = v_prep and step.id <> v_step)
          is distinct from v_sibling_steps_before then
    raise exception 'CRICKET non-target route/receipt/public contract changed';
  end if;
end
$ascent_cricket_foxes_identity_binding$;
