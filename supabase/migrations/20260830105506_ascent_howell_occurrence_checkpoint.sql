-- Ascent source-first 27: preserve HOWELL's cleaned SR-151 -> SR-152
-- checkpoint without promoting the legacy-bound Batch-2 receipt.
--
-- This migration is intentionally UNAPPLIED in this phase. If separately
-- authorized, it adds one private, non-runtime checkpoint. It does not update
-- route prep, occurrence receipts, transition receipts, graph tables, route
-- releases, Google handoffs, map geometry, teal authority, or cutover state.

create table private_verification.brinesearch_ascent_source_first_occurrence_checkpoints (
  pad_id uuid not null references public.pads(id) on delete restrict,
  record_revision bigint not null,
  baseline_route_prep_id uuid not null references public.brinesearch_route_prep(id) on delete restrict,
  direction_source text not null,
  directions_clear_sha256 text not null,
  cleaned_sequence text not null,
  cleaned_sequence_sha256 text not null,
  checkpoint_status text not null,
  baseline_receipt_source text not null,
  baseline_receipt_proves_cleaned_order boolean not null,
  graph_build_id uuid not null references public.brinesearch_road_graph_builds(id) on delete restrict,
  graph_build_digest text not null,
  junction_id uuid not null references public.brinesearch_road_junctions(id) on delete restrict,
  junction_digest text not null,
  anchor_baseline_step_id uuid not null references public.brinesearch_route_prep_steps(id) on delete restrict,
  anchor_road_id uuid not null references public.brinesearch_roads(id) on delete restrict,
  anchor_identity_id uuid not null references public.brinesearch_authoritative_road_identities(id) on delete restrict,
  anchor_source_identity_key text not null,
  anchor_source_digest text not null,
  anchor_geometry_digest text not null,
  traveled_baseline_step_id uuid not null references public.brinesearch_route_prep_steps(id) on delete restrict,
  traveled_road_id uuid not null references public.brinesearch_roads(id) on delete restrict,
  traveled_identity_id uuid not null references public.brinesearch_authoritative_road_identities(id) on delete restrict,
  traveled_source_identity_key text not null,
  traveled_source_digest text not null,
  traveled_geometry_digest text not null,
  junction_longitude numeric not null,
  junction_latitude numeric not null,
  baseline_display_occurrence_end_longitude numeric not null,
  baseline_display_occurrence_end_latitude numeric not null,
  baseline_display_occurrence_meters numeric not null,
  baseline_display_occurrence_miles numeric not null,
  authoritative_clip_miles numeric not null,
  authoritative_clip_sha256 text not null,
  source_mileage_miles numeric not null,
  destination_longitude numeric not null,
  destination_latitude numeric not null,
  destination_neutral_tether_meters numeric not null,
  navigation_state text not null,
  private_tail_authority text not null,
  route_authority boolean not null,
  graph_authority boolean not null,
  teal_authority boolean not null,
  google_publication boolean not null,
  graph_changed boolean not null,
  cutover_changed boolean not null,
  evidence jsonb not null,
  created_at timestamptz not null default now(),
  primary key (pad_id, record_revision, cleaned_sequence_sha256),
  constraint brinesearch_ascent_source_first_checkpoint_source_check check (
    direction_source = 'directions_clear'
    and directions_clear_sha256 ~ '^[0-9a-f]{64}$'
    and cleaned_sequence_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint brinesearch_ascent_source_first_checkpoint_digest_check check (
    graph_build_digest ~ '^[0-9a-f]{32}$'
    and junction_digest ~ '^[0-9a-f]{32}$'
    and anchor_source_digest ~ '^[0-9a-f]{32}$'
    and anchor_geometry_digest ~ '^[0-9a-f]{32}$'
    and traveled_source_digest ~ '^[0-9a-f]{32}$'
    and traveled_geometry_digest ~ '^[0-9a-f]{32}$'
    and authoritative_clip_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint brinesearch_ascent_source_first_checkpoint_non_authority_check check (
    checkpoint_status = 'source_first_checkpoint_only'
    and baseline_receipt_source = 'legacy_structured_road_sequence'
    and baseline_receipt_proves_cleaned_order = false
    and navigation_state = 'GPS_ONLY'
    and private_tail_authority = 'neutral_gps_only'
    and route_authority = false
    and graph_authority = false
    and teal_authority = false
    and google_publication = false
    and graph_changed = false
    and cutover_changed = false
  ),
  constraint brinesearch_ascent_source_first_checkpoint_measure_check check (
    baseline_display_occurrence_meters > 0
    and baseline_display_occurrence_miles > 0
    and authoritative_clip_miles > 0
    and source_mileage_miles > 0
    and destination_neutral_tether_meters > 0
  )
);

alter table private_verification.brinesearch_ascent_source_first_occurrence_checkpoints
  enable row level security;
alter table private_verification.brinesearch_ascent_source_first_occurrence_checkpoints
  force row level security;
revoke all on private_verification.brinesearch_ascent_source_first_occurrence_checkpoints
  from public, anon, authenticated, service_role;

comment on table private_verification.brinesearch_ascent_source_first_occurrence_checkpoints is
  'Non-runtime source-first evidence only. Rows create no route, graph, Google, teal, or cutover authority.';

do $ascent_source_first_howell_occurrence_checkpoint$
declare
  v_pad constant uuid := '2805772b-58c9-4a41-9c75-de5355f2904a';
  v_prep constant uuid := '53943b29-edca-4495-88a7-64e2e0ee09a3';
  v_from_step constant uuid := '8e5e5178-3ae3-431c-8464-17de40d44e43';
  v_from_road constant uuid := '61cd460a-7b21-4e1d-9261-b1b691792102';
  v_from_identity constant uuid := '5f08c51a-14d6-f472-57ef-99f9a264c510';
  v_to_step constant uuid := 'b3853f47-098c-443e-9daa-820bb89b6e1d';
  v_to_road constant uuid := '032e69fc-afdf-49ed-821a-f0921cefeef6';
  v_to_identity constant uuid := 'e7e27927-4586-1ba7-7d4c-1e41476c9459';
  v_build constant uuid := 'c9bac3a2-82d4-4b76-813c-6a29c1bf062a';
  v_junction constant uuid := '97666182-8756-75b9-ea1a-b6d63b8930ef';
  v_start extensions.geometry;
  v_end extensions.geometry;
  v_destination extensions.geometry;
  v_clip jsonb;
  v_clip_geom extensions.geometry;
  v_clip_sha256 text;
  v_driver_status_before text;
  v_core_destination_before text;
  v_google_handoff_before text;
  v_named_approaches_before text;
  v_occurrence_receipts_before text;
  v_transition_receipts_before text;
  v_geometry_receipts_before text;
  v_rows integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:ascent-source-first:howell:checkpoint')
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
        and pad.legacy_id = 'ascent--howell'
        and pg_catalog.upper(pg_catalog.btrim(pad.company)) = 'ASCENT'
        and pg_catalog.upper(pg_catalog.btrim(pad.state)) in ('OH', 'OHIO')
        and pg_catalog.upper(pg_catalog.btrim(pad.county)) = 'JEFFERSON'
        and pad.latitude = 40.234171
        and pad.longitude = -80.787957
        and snapshot_row.record_revision = 1787459253071652
        and directions.direction_source = 'directions_clear'
        and pg_catalog.octet_length(
          pg_catalog.convert_to(directions.directions_clear, 'UTF8')
        ) = 261
        and pg_catalog.encode(extensions.digest(
          pg_catalog.convert_to(directions.directions_clear, 'UTF8'),
          'sha256'
        ), 'hex') =
          'e80e04aedff72cf747b135e5a5257e80a712336c4dc9381558a044793738e95c'
      ) <> 1 then
    raise exception 'HOWELL pad/revision/GPS/cleaned-source checkpoint drift';
  end if;

  if not exists (
    select 1
    from public.brinesearch_route_prep prep
    where prep.id = v_prep
      and prep.pad_id = v_pad
      and prep.active
      and prep.route_group = 'primary'
      and prep.variant_index = 1
      and prep.source_sequence = 'Route 7 → Route 151 → Route 152 → Route 22 → Pad'
      and prep.normalized_sequence = 'Route 7 → Route 151 → Route 152 → Route 22 → Pad'
      and prep.readiness_status = 'ready_for_road_matching'
      and prep.issue_codes = '{}'::text[]
  ) then
    raise exception 'HOWELL route-prep checkpoint drift';
  end if;

  v_driver_status_before := pg_catalog.md5(
    public.brinesearch_v18_driver_pad_status(v_pad)::text
  );
  v_core_destination_before := pg_catalog.md5(
    public.brinesearch_v18_driver_core_destination_release(v_pad)::text
  );
  v_google_handoff_before := pg_catalog.md5(
    public.brinesearch_v18_driver_pad_status_with_google_handoff(v_pad)::text
  );
  v_named_approaches_before := pg_catalog.md5(
    public.brinesearch_v18_driver_pad_status_with_named_approaches(v_pad)::text
  );
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

  if not exists (
       select 1 from public.brinesearch_route_prep_steps step
       where step.id = v_from_step
         and step.route_prep_id = v_prep
         and step.active
         and step.step_order = 2
         and step.raw_text = 'Route 151'
         and step.normalized_text = 'Route 151'
         and step.step_kind = 'state_route'
         and step.road_id = v_from_road
         and step.match_status = 'exact_master'
         and step.match_method = 'v17312_evidence_backed_generic_route_resolution'
         and step.geometry_status = 'not_started'
     ) or not exists (
       select 1 from public.brinesearch_route_prep_steps step
       where step.id = v_to_step
         and step.route_prep_id = v_prep
         and step.active
         and step.step_order = 3
         and step.raw_text = 'Route 152'
         and step.normalized_text = 'Route 152'
         and step.step_kind = 'state_route'
         and step.road_id = v_to_road
         and step.match_status = 'exact_master'
         and step.match_method = 'v17312_evidence_backed_generic_route_resolution'
         and step.geometry_status = 'not_started'
     ) then
    raise exception 'HOWELL exact Road Manager step binding drift';
  end if;

  if not exists (
    select 1
    from public.brinesearch_route_prep_steps step
    join private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
      on receipt.route_prep_step_id = step.id
    where step.route_prep_id = v_prep
      and step.active
      and step.step_order = 5
      and step.raw_text = 'Pad'
      and step.normalized_text = 'Pad'
      and step.step_kind = 'private_segment'
      and step.road_id is null
      and step.match_status = 'private_segment'
      and step.match_method = 'unmatched_saved_road_name'
      and step.geometry_status = 'not_started'
      and receipt.resolution_status = 'held'
      and receipt.hold_reason =
        'terminal_private_access_destination_requires_authoritative_geometry'
      and receipt.identity_id is null
      and receipt.canonical_road_id is null
  ) then
    raise exception 'HOWELL private tail checkpoint drift';
  end if;

  if not exists (
       select 1
       from public.brinesearch_authoritative_road_identities identity
       join public.brinesearch_road_identity_mappings mapping
         on mapping.identity_id = identity.id
        and mapping.mapping_status = 'verified'
       where identity.id = v_from_identity
         and identity.source_identity_key = 'OH:ODOT:NLF:SJEFSR00151**C'
         and identity.state_code = 'OH'
         and identity.county_code = 'JEF'
         and identity.route_system = 'SR'
         and identity.route_number = '151'
         and identity.source_digest = '361c4fb8ac32e4806f5bcdb1d9a1c2bc'
         and identity.active
         and mapping.road_id = v_from_road
         and private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(
           identity.id
         ) = '519dbc2444698451ad57b1e5eba661d9'
     ) or not exists (
       select 1
       from public.brinesearch_authoritative_road_identities identity
       join public.brinesearch_road_identity_mappings mapping
         on mapping.identity_id = identity.id
        and mapping.mapping_status = 'verified'
       where identity.id = v_to_identity
         and identity.source_identity_key =
           'OH:ODOT:NLF:SJEFSR00152**C:COMP:2025_000000000306854'
         and identity.state_code = 'OH'
         and identity.county_code = 'JEF'
         and identity.route_system = 'SR'
         and identity.route_number = '152'
         and identity.source_digest = 'c63b7db139a671ed3e7e6459ad5ed971'
         and identity.active
         and mapping.road_id = v_to_road
         and private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(
           identity.id
         ) = 'd1336adcfe1092cd9ff92f3a33f5ec85'
     ) then
    raise exception 'HOWELL authoritative identity/mapping/geometry drift';
  end if;

  if not exists (
       select 1 from public.brinesearch_road_graph_builds build
       where build.id = v_build
         and build.state_code = 'OH'
         and build.county_code = 'JEF'
         and build.status = 'active'
         and build.graph_digest = 'ce2de7721f56a145b21ddded270f07fd'
         and private_verification.brinesearch_issue97_graph_build_release_current(
           build.id
         )
     ) or not exists (
       select 1
       from public.brinesearch_road_junctions junction
       where junction.id = v_junction
         and junction.build_id = v_build
         and junction.graph_digest = '41f2ac39cb99f4466c4dd8f95b30446b'
         and extensions.geometrytype(junction.geom) = 'POINT'
         and junction.confidence in ('authoritative', 'authoritative_at_grade')
         and junction.verification_status = 'verified'
         and extensions.st_dwithin(
           junction.geom::extensions.geography,
           extensions.st_setsrid(
             extensions.st_makepoint(-80.7788733, 40.2739904), 4326
           )::extensions.geography,
           1
         )
         and exists (
           select 1 from public.brinesearch_road_junction_memberships membership
           where membership.junction_id = junction.id
             and membership.identity_id = v_from_identity
             and membership.road_id = v_from_road
         )
         and exists (
           select 1 from public.brinesearch_road_junction_memberships membership
           where membership.junction_id = junction.id
             and membership.identity_id = v_to_identity
             and membership.road_id = v_to_road
         )
     ) then
    raise exception 'HOWELL current SR-151/SR-152 graph junction drift';
  end if;

  v_start := extensions.st_setsrid(
    extensions.st_makepoint(-80.7788733, 40.2739904), 4326
  );
  v_end := extensions.st_setsrid(
    extensions.st_makepoint(-80.790569, 40.234383), 4326
  );
  v_destination := extensions.st_setsrid(
    extensions.st_makepoint(-80.787957, 40.234171), 4326
  );

  if not extensions.st_dwithin(
       private_verification.brinesearch_issue97_authoritative_identity_geometry(
         v_from_identity
       )::extensions.geography,
       v_start::extensions.geography,
       1
     )
     or not extensions.st_dwithin(
       private_verification.brinesearch_issue97_authoritative_identity_geometry(
         v_to_identity
       )::extensions.geography,
       v_start::extensions.geography,
       1
     )
     or not extensions.st_dwithin(
       private_verification.brinesearch_issue97_authoritative_identity_geometry(
         v_to_identity
       )::extensions.geography,
       v_end::extensions.geography,
       1
     )
     or extensions.st_dwithin(
       private_verification.brinesearch_issue97_authoritative_identity_geometry(
         v_to_identity
       )::extensions.geography,
       v_destination::extensions.geography,
       1
     )
     or pg_catalog.abs(
       extensions.st_distance(
         v_end::extensions.geography,
         v_destination::extensions.geography,
         false
       ) - 222.9755200609303
     ) > 0.05 then
    raise exception 'HOWELL exact boundaries or neutral GPS tail drift';
  end if;

  v_clip :=
    private_verification.brinesearch_issue97_clip_exact_authoritative_occurrence(
      v_to_identity, v_to_road, v_start, v_end
    );
  if coalesce((v_clip->>'resolved')::boolean, false) = false
     or v_clip->>'identity_id' is distinct from v_to_identity::text
     or v_clip->>'road_id' is distinct from v_to_road::text
     or v_clip->>'road_geometry_digest' is distinct from
       'd1336adcfe1092cd9ff92f3a33f5ec85'
     or v_clip->>'geometry_status' is distinct from 'snapped_intersections'
     or coalesce((v_clip->>'selection_uses_name_similarity')::boolean, true)
     or coalesce((v_clip->>'selection_uses_nearest_road')::boolean, true) then
    raise exception 'HOWELL exact SR-152 authoritative clip did not resolve: %', v_clip;
  end if;
  begin
    v_clip_geom := extensions.st_setsrid(
      extensions.st_geomfromgeojson((v_clip->'clipped_geometry')::text), 4326
    );
  exception when others then
    raise exception 'HOWELL exact SR-152 authoritative clip is not valid GeoJSON';
  end;
  if v_clip_geom is null
     or extensions.st_isempty(v_clip_geom)
     or extensions.st_dimension(v_clip_geom) <> 1
     or not extensions.st_dwithin(
       extensions.st_startpoint(v_clip_geom)::extensions.geography,
       v_start::extensions.geography,
       0.05
     )
     or not extensions.st_dwithin(
       extensions.st_endpoint(v_clip_geom)::extensions.geography,
       v_end::extensions.geography,
       0.05
     ) then
    raise exception 'HOWELL exact SR-152 clip endpoint drift';
  end if;
  v_clip_sha256 := pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to((v_clip->'clipped_geometry')::text, 'UTF8'),
    'sha256'
  ), 'hex');

  if exists (
    select 1
    from private_verification.brinesearch_ascent_source_first_occurrence_checkpoints checkpoint
    where checkpoint.pad_id = v_pad
  ) then
    raise exception 'HOWELL source-first checkpoint already exists';
  end if;

  insert into private_verification.brinesearch_ascent_source_first_occurrence_checkpoints (
    pad_id, record_revision, baseline_route_prep_id, direction_source,
    directions_clear_sha256, cleaned_sequence, cleaned_sequence_sha256,
    checkpoint_status, baseline_receipt_source,
    baseline_receipt_proves_cleaned_order, graph_build_id,
    graph_build_digest, junction_id, junction_digest, anchor_baseline_step_id,
    anchor_road_id, anchor_identity_id, anchor_source_identity_key,
    anchor_source_digest, anchor_geometry_digest, traveled_baseline_step_id,
    traveled_road_id, traveled_identity_id, traveled_source_identity_key,
    traveled_source_digest, traveled_geometry_digest, junction_longitude,
    junction_latitude, baseline_display_occurrence_end_longitude,
    baseline_display_occurrence_end_latitude,
    baseline_display_occurrence_meters, baseline_display_occurrence_miles,
    authoritative_clip_miles, authoritative_clip_sha256,
    source_mileage_miles, destination_longitude,
    destination_latitude, destination_neutral_tether_meters,
    navigation_state, private_tail_authority, route_authority,
    graph_authority, teal_authority, google_publication, graph_changed,
    cutover_changed, evidence
  ) values (
    v_pad, 1787459253071652, v_prep, 'directions_clear',
    'e80e04aedff72cf747b135e5a5257e80a712336c4dc9381558a044793738e95c',
    'Route 151 / Route 152 junction in Smithfield → Route 152 S (3.5 miles) → Pad',
    '49721799afd338786209f6ea57ccc13c96e347a03c6c18de4bee56b040c6c3cd',
    'source_first_checkpoint_only', 'legacy_structured_road_sequence', false,
    v_build, 'ce2de7721f56a145b21ddded270f07fd', v_junction,
    '41f2ac39cb99f4466c4dd8f95b30446b', v_from_step, v_from_road,
    v_from_identity, 'OH:ODOT:NLF:SJEFSR00151**C',
    '361c4fb8ac32e4806f5bcdb1d9a1c2bc',
    '519dbc2444698451ad57b1e5eba661d9', v_to_step, v_to_road,
    v_to_identity, 'OH:ODOT:NLF:SJEFSR00152**C:COMP:2025_000000000306854',
    'c63b7db139a671ed3e7e6459ad5ed971',
    'd1336adcfe1092cd9ff92f3a33f5ec85', -80.7788733, 40.2739904,
    -80.790569, 40.234383, 5613.3, 3.488,
    (v_clip->>'miles')::numeric, v_clip_sha256, 3.5, -80.787957,
    40.234171, 222.9755, 'GPS_ONLY', 'neutral_gps_only', false,
    false, false, false, false, false,
    pg_catalog.jsonb_build_object(
      'scope', 'Ascent source-first 27 HOWELL checkpoint',
      'source_first_binding',
        'exact_pad_revision_gps_cleaned_sequence_identity_junction_checkpoint',
      'baseline_graph_receipt_source', 'legacy_structured_road_sequence',
      'baseline_graph_receipt_proves_cleaned_order', false,
      'baseline_routed_identity_sha256',
        '1743e30a445af43d1ae6eefb6dc715401e0a663f1e058dc4edd3e032acd588b0',
      'baseline_route_coordinate_sha256',
        '0b86db240a8619cbf1cf97df5d7add446c2aac8ea527e327d02a1ca015c30f31',
      'baseline_receipt_key_sha256',
        '6fbf69dba054bf79b869a732ae80a2595441c2fadf071d72670c7cd689516469',
      'baseline_receipt_sha256',
        '985ac0e809b0e030ed468c7be1c9171c91ca13184c82d33c8df8b7bbace86977',
      'baseline_sr151_source_match', 'graph_named_only',
      'baseline_sr152_source_match', 'graph_named_only',
      'name_matching_used', false,
      'fuzzy_matching_used', false,
      'nearest_road_used', false,
      'shortest_or_fastest_used', false,
      'formal_occurrence_receipt_created', false,
      'formal_transition_receipt_created', false,
      'promotion_requires_source_first_route_prep', true,
      'route_authority_upgrade', false,
      'graph_authority', false,
      'teal_authority', false,
      'public_google_publication', false,
      'graph_changed', false,
      'cutover_changed', false,
      'navigation_state_after_apply', 'GPS_ONLY'
    )
  );
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'HOWELL checkpoint insert affected % rows', v_rows;
  end if;

  if not exists (
    select 1
    from private_verification.brinesearch_ascent_source_first_occurrence_checkpoints checkpoint
    where checkpoint.pad_id = v_pad
      and checkpoint.record_revision = 1787459253071652
      and checkpoint.baseline_route_prep_id = v_prep
      and checkpoint.directions_clear_sha256 =
        'e80e04aedff72cf747b135e5a5257e80a712336c4dc9381558a044793738e95c'
      and checkpoint.cleaned_sequence_sha256 =
        '49721799afd338786209f6ea57ccc13c96e347a03c6c18de4bee56b040c6c3cd'
      and checkpoint.checkpoint_status = 'source_first_checkpoint_only'
      and checkpoint.baseline_receipt_proves_cleaned_order = false
      and checkpoint.navigation_state = 'GPS_ONLY'
      and checkpoint.private_tail_authority = 'neutral_gps_only'
      and checkpoint.route_authority = false
      and checkpoint.graph_authority = false
      and checkpoint.teal_authority = false
      and checkpoint.google_publication = false
      and checkpoint.graph_changed = false
      and checkpoint.cutover_changed = false
      and checkpoint.authoritative_clip_sha256 = v_clip_sha256
      and checkpoint.authoritative_clip_miles = (v_clip->>'miles')::numeric
  ) then
    raise exception 'HOWELL source-first non-authority postcondition failed';
  end if;

  if pg_catalog.md5(public.brinesearch_v18_driver_pad_status(v_pad)::text)
       is distinct from v_driver_status_before
     or pg_catalog.md5(
       public.brinesearch_v18_driver_core_destination_release(v_pad)::text
     ) is distinct from v_core_destination_before
     or pg_catalog.md5(
       public.brinesearch_v18_driver_pad_status_with_google_handoff(v_pad)::text
     ) is distinct from v_google_handoff_before
     or pg_catalog.md5(
       public.brinesearch_v18_driver_pad_status_with_named_approaches(v_pad)::text
     ) is distinct from v_named_approaches_before then
    raise exception 'HOWELL public driver response changed during checkpoint insert';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
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
      where receipt.route_prep_id = v_prep) is distinct from v_geometry_receipts_before then
    raise exception 'HOWELL formal Issue #97 receipts changed during checkpoint insert';
  end if;

  if not exists (
       select 1 from pg_catalog.pg_class relation
       join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
       where namespace.nspname = 'private_verification'
         and relation.relname = 'brinesearch_ascent_source_first_occurrence_checkpoints'
         and relation.relrowsecurity
         and relation.relforcerowsecurity
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'private_verification.brinesearch_ascent_source_first_occurrence_checkpoints',
       'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'private_verification.brinesearch_ascent_source_first_occurrence_checkpoints',
       'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'private_verification.brinesearch_ascent_source_first_occurrence_checkpoints',
       'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
     ) then
    raise exception 'HOWELL private checkpoint RLS or privilege postcondition failed';
  end if;
end
$ascent_source_first_howell_occurrence_checkpoint$;
