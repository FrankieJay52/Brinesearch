-- Issue #112 first-wave BrinePads reconciliation.
-- BrinePads is discovery-only. Every promoted identity/well field below is
-- independently supported by the current ODNR live pad and well services.
-- Driver-facing address/GPS/directions, property numbers, roads, and routes
-- are deliberately not populated.

do $issue112$
declare
  v_pads_before bigint;
  v_public_before bigint;
  v_inserted bigint;
  v_target_ids uuid[] := array[
    '46b82718-a6ca-437a-a2c6-f50c3f57c552'::uuid,
    '518659d9-bca2-47b0-b294-3141ba679fc4'::uuid,
    '8ed9b8f8-33f6-4701-a4a4-4849d4b8c254'::uuid
  ];
  v_target_apis text[] := array[
    '34013216690000',
    '34067218730000',
    '34067218740000',
    '34067218750000',
    '34059243140000',
    '34059243340000',
    '34059243350000'
  ];
begin
  perform pg_catalog.set_config('lock_timeout', '5s', true);
  perform pg_catalog.set_config('statement_timeout', '30s', true);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue112:first-wave')
  );

  -- Fail closed if any other pad writer is active. This also stabilizes the
  -- before/after projection assertions for this small controlled batch.
  lock table public.pads in share row exclusive mode;
  lock table public.pad_verification_status in share row exclusive mode;
  lock table public.public_pad_detail in share row exclusive mode;

  select pg_catalog.count(*) into v_pads_before from public.pads;
  select pg_catalog.count(*) into v_public_before from public.public_pad_detail;

  if v_pads_before <> v_public_before then
    raise exception
      'Issue #112 precondition failed: pads/public projection count mismatch (% vs %)',
      v_pads_before, v_public_before;
  end if;

  if exists (
    select 1
    from public.pads p
    where p.id = any(v_target_ids)
       or pg_catalog.lower(p.legacy_id) = any(array[
         'ascent--ezekiel', 'ascent--lasso', 'ascent--shugert-daddy'
       ])
  ) then
    raise exception 'Issue #112 collision: target UUID or legacy_id already exists';
  end if;

  if exists (
    select 1
    from public.public_pad_detail d
    where d.id = any(v_target_ids)
       or pg_catalog.lower(d.legacy_id) = any(array[
         'ascent--ezekiel', 'ascent--lasso', 'ascent--shugert-daddy'
       ])
  ) then
    raise exception 'Issue #112 collision: target already exists in public projection';
  end if;

  if exists (
    select 1
    from public.pad_verification_status s
    where s.pad_id = any(v_target_ids)
  ) then
    raise exception 'Issue #112 collision: target verification row already exists';
  end if;

  if exists (
    select 1
    from public.pads p
    join (
      values
        ('ohio', 'belmont', 'ezekiel'),
        ('ohio', 'harrison', 'lasso'),
        ('ohio', 'guernsey', 'shugert daddy')
    ) as target(state_name, county_name, pad_name)
      on pg_catalog.lower(pg_catalog.btrim(p.state)) = target.state_name
     and pg_catalog.lower(pg_catalog.btrim(coalesce(p.county, ''))) = target.county_name
     and pg_catalog.lower(pg_catalog.btrim(p.pad_name)) = target.pad_name
  ) then
    raise exception 'Issue #112 collision: same-state/county exact pad name already exists';
  end if;

  if exists (
    select 1
    from public.pads p
    where coalesce(
      p.extra_data->'official_pad_record'->>'official_pad_id',
      p.extra_data->'official_pad_record'->>'pad_id'
    ) = any(array[
      'PadBelmontWarrenSection28-2',
      'PadHarrisonShortCreekSection9-1',
      'PadGuernseyWillsSection24-1'
    ])
  ) then
    raise exception 'Issue #112 collision: official ODNR pad identity already exists';
  end if;

  if exists (
    select 1
    from public.pads p
    cross join lateral (
      select pg_catalog.regexp_replace(api_piece, '[^0-9]', '', 'g') as api_digits
      from pg_catalog.regexp_split_to_table(
        coalesce(p.api, ''), E'\\s*\\|\\s*'
      ) as api_piece
      union all
      select pg_catalog.regexp_replace(entry->>'api', '[^0-9]', '', 'g')
      from pg_catalog.jsonb_array_elements(
        coalesce(p.well_entries, '[]'::jsonb)
      ) as entry
    ) existing_api
    where existing_api.api_digits = any(v_target_apis)
  ) then
    raise exception 'Issue #112 collision: one or more exact official APIs already exist';
  end if;

  insert into public.pads (
    id,
    legacy_id,
    company,
    state,
    pad_name,
    record_type,
    county,
    township,
    well_name,
    api,
    verification_status,
    operating_status,
    import_source,
    import_status,
    research_status,
    research_note,
    research_sources,
    research_date,
    list_only,
    research_method,
    research_notes,
    audit_source,
    audit_verified,
    extra_data,
    well_entries
  )
  values
  (
    '46b82718-a6ca-437a-a2c6-f50c3f57c552'::uuid,
    'ascent--ezekiel',
    'Ascent',
    'Ohio',
    'EZEKIEL',
    'pad',
    'Belmont',
    'Warren',
    'Ezekiel NE WRN BL 1H',
    '34-013-2-1669-00-00',
    'PARTIAL: official pad identity and wells; driver location held',
    'ACTIVE',
    'Issue #112 first-wave authoritative reconciliation',
    'authoritative_identity_only',
    'official_pad_and_wells_verified; address_entrance_route_held',
    'ODNR live records independently confirm the current Ascent pad identity and exact API. BrinePads was discovery-only. Address, canonical GPS, property number, lease entrance, directions, roads, and routes remain held.',
    $json$[
      {"type":"odnr_live_well_pad_record","agency":"Ohio Department of Natural Resources","checked":"2026-08-17","source_record_id":"OBJECTID:167","official_pad_id":"PadBelmontWarrenSection28-2","url":"https://services5.arcgis.com/ajRlmtxbNBjZggOT/arcgis/rest/services/Well_Pads/FeatureServer/3/query?where=OBJECTID%3D167&outFields=*&returnGeometry=false&f=json"},
      {"type":"odnr_live_well_record","agency":"Ohio Department of Natural Resources","checked":"2026-08-17","source_record_ids":["OBJECTID:26515"],"apis":["34-013-2-1669-00-00"],"url":"https://services5.arcgis.com/ajRlmtxbNBjZggOT/arcgis/rest/services/Oil_And_Gas_Wells/FeatureServer/3/query?where=OBJECTID%3D26515&outFields=*&returnGeometry=false&f=json"},
      {"type":"brinepads_secondary_discovery","role":"discovery_only_no_fields_promoted","page_url":"https://brinepads.com/directions.php?company=Ascent&state=Ohio&pad=Ezekiel","raw_sha256":"6a390f9ae17f913eb07dfe8d447c3dea9aa6bc79c139ec002c7ef8738a73f947"}
    ]$json$::jsonb,
    '2026-08-17'::date,
    false,
    'exact current ODNR pad identity plus exact current ODNR API/well identity',
    'Official pad point and wellhead are retained as reference provenance only. They are not promoted to canonical driver GPS or a lease entrance.',
    'ODNR live Well Pads OBJECTID 167 + ODNR live Oil and Gas Wells OBJECTID 26515',
    true,
    $json${
      "issue112_first_wave":{"prepared_on":"2026-08-17","manifest_version":1,"brinepads_role":"secondary_discovery_only"},
      "official_pad_record":{"agency":"Ohio Department of Natural Resources","source_key":"oh_odnr_live_wellpads","source_record_id":"OBJECTID:167","official_pad_id":"PadBelmontWarrenSection28-2","official_name":"EZEKIEL WRN BL","operator":"ASCENT RESOURCES UTICA LLC","county":"BELMONT","township":"WARREN","pad_status":"ACTIVE","permit_number":1541,"source_method":"Operator Submitted","latitude":40.005506,"longitude":-81.208849,"coordinate_role":"official pad reference only; not lease-entrance or driver GPS","checked":"2026-08-17"},
      "official_well_records":[{"api":"34-013-2-1669-00-00","api_digits":"34013216690000","well_name":"Ezekiel NE WRN BL 1H","official_raw_well_name":"Ezekiel NE WRN BL 1H","status":"Well Permitted","gis_status":"Permitted","operator":"ASCENT RESOURCES UTICA LLC","county":"BELMONT","township":"WARREN","source_record_id":"OBJECTID:26515","wellhead_latitude":40.00535,"wellhead_longitude":-81.208943,"coordinate_role":"official wellhead reference; not lease entrance"}],
      "api_verification_summary":{"checked":"2026-08-17","saved_api_count":1,"exact_odnr_matches":1,"unmatched_count":0,"unmatched_saved_apis":[]},
      "location_verification":{"canonical_address":null,"canonical_latitude":null,"canonical_longitude":null,"official_reference_only":true,"lease_entrance_verified":false,"driver_gps_verified":false,"brinepads_address_held":true,"brinepads_gps_held":true,"brinepads_directions_held":true},
      "verification":{"pad_identity_verified":true,"operator_verified":true,"wells_verified":true,"api_verified":true,"gps_verified":false,"address_verified":false,"directions_verified":false,"roads_verified":false,"property_verified":false,"needs_field_check":true}
    }$json$::jsonb,
    $json$[{"api":"34-013-2-1669-00-00","well_name":"Ezekiel NE WRN BL 1H","official_status":"Well Permitted","property_number":"","source_record_id":"OBJECTID:26515","official_operator":"ASCENT RESOURCES UTICA LLC","official_wellhead":{"latitude":40.00535,"longitude":-81.208943,"coordinate_role":"official wellhead reference only"},"resolution_method":"exact_current_odnr_api_and_pad_identity","verification_status":"official_exact"}]$json$::jsonb
  ),
  (
    '518659d9-bca2-47b0-b294-3141ba679fc4'::uuid,
    'ascent--lasso',
    'Ascent',
    'Ohio',
    'LASSO',
    'pad',
    'Harrison',
    'Short Creek',
    'Lasso NW SHC HR 1H | Lasso N SHC HR 3H | Lasso NE SHC HR 5H',
    '34-067-2-1873-00-00 | 34-067-2-1874-00-00 | 34-067-2-1875-00-00',
    'PARTIAL: official pad identity and wells; driver location held',
    'ACTIVE',
    'Issue #112 first-wave authoritative reconciliation',
    'authoritative_identity_only',
    'official_pad_and_wells_verified; address_entrance_route_held',
    'ODNR live records independently confirm the current Ascent pad identity and three exact APIs. BrinePads was discovery-only. Address, canonical GPS, property numbers, lease entrance, directions, roads, and routes remain held.',
    $json$[
      {"type":"odnr_live_well_pad_record","agency":"Ohio Department of Natural Resources","checked":"2026-08-17","source_record_id":"OBJECTID:735","official_pad_id":"PadHarrisonShortCreekSection9-1","url":"https://services5.arcgis.com/ajRlmtxbNBjZggOT/arcgis/rest/services/Well_Pads/FeatureServer/3/query?where=OBJECTID%3D735&outFields=*&returnGeometry=false&f=json"},
      {"type":"odnr_live_well_record","agency":"Ohio Department of Natural Resources","checked":"2026-08-17","source_record_ids":["OBJECTID:72084","OBJECTID:72085","OBJECTID:72086"],"apis":["34-067-2-1873-00-00","34-067-2-1874-00-00","34-067-2-1875-00-00"],"url":"https://services5.arcgis.com/ajRlmtxbNBjZggOT/arcgis/rest/services/Oil_And_Gas_Wells/FeatureServer/3/query?where=OBJECTID%20IN%20(72084%2C72085%2C72086)&outFields=*&returnGeometry=false&f=json"},
      {"type":"brinepads_secondary_discovery","role":"discovery_only_no_fields_promoted","page_url":"https://brinepads.com/directions.php?company=Ascent&state=Ohio&pad=Lasso","raw_sha256":"fb996fe373bd0c43c84751ae3eedb1132139d874b83c05dbd98c21d9b11ee554"}
    ]$json$::jsonb,
    '2026-08-17'::date,
    false,
    'exact current ODNR pad identity plus three exact current ODNR API/well identities',
    'Official pad point and wellheads are retained as reference provenance only. They are not promoted to canonical driver GPS or a lease entrance.',
    'ODNR live Well Pads OBJECTID 735 + ODNR live Oil and Gas Wells OBJECTIDs 72084/72085/72086',
    true,
    $json${
      "issue112_first_wave":{"prepared_on":"2026-08-17","manifest_version":1,"brinepads_role":"secondary_discovery_only"},
      "official_pad_record":{"agency":"Ohio Department of Natural Resources","source_key":"oh_odnr_live_wellpads","source_record_id":"OBJECTID:735","official_pad_id":"PadHarrisonShortCreekSection9-1","official_name":"LASSO SHC HR","operator":"ASCENT RESOURCES UTICA LLC","county":"HARRISON","township":"SHORT CREEK","pad_status":"ACTIVE","permit_number":1533,"source_method":"operator submitted","latitude":40.241125,"longitude":-80.915419,"coordinate_role":"official pad reference only; not lease-entrance or driver GPS","checked":"2026-08-17"},
      "official_well_records":[
        {"api":"34-067-2-1873-00-00","api_digits":"34067218730000","well_name":"Lasso NW SHC HR 1H","official_raw_well_name":"Lasso NW SHC HR  1H","status":"Well Permitted","gis_status":"Permitted","operator":"ASCENT RESOURCES UTICA LLC","county":"HARRISON","township":"SHORT CREEK","source_record_id":"OBJECTID:72084","wellhead_latitude":40.240983,"wellhead_longitude":-80.913607,"coordinate_role":"official wellhead reference; not lease entrance"},
        {"api":"34-067-2-1874-00-00","api_digits":"34067218740000","well_name":"Lasso N SHC HR 3H","official_raw_well_name":"Lasso N SHC HR 3H","status":"Well Permitted","gis_status":"Permitted","operator":"ASCENT RESOURCES UTICA LLC","county":"HARRISON","township":"SHORT CREEK","source_record_id":"OBJECTID:72085","wellhead_latitude":40.240967,"wellhead_longitude":-80.913538,"coordinate_role":"official wellhead reference; not lease entrance"},
        {"api":"34-067-2-1875-00-00","api_digits":"34067218750000","well_name":"Lasso NE SHC HR 5H","official_raw_well_name":"Lasso NE SHC HR 5H","status":"Well Drilled","gis_status":"Drilled","operator":"ASCENT RESOURCES UTICA LLC","county":"HARRISON","township":"SHORT CREEK","source_record_id":"OBJECTID:72086","wellhead_latitude":40.240952,"wellhead_longitude":-80.91347,"coordinate_role":"official wellhead reference; not lease entrance"}
      ],
      "api_verification_summary":{"checked":"2026-08-17","saved_api_count":3,"exact_odnr_matches":3,"unmatched_count":0,"unmatched_saved_apis":[]},
      "location_verification":{"canonical_address":null,"canonical_latitude":null,"canonical_longitude":null,"official_reference_only":true,"lease_entrance_verified":false,"driver_gps_verified":false,"brinepads_address_held":true,"brinepads_gps_held":true,"brinepads_directions_held":true},
      "verification":{"pad_identity_verified":true,"operator_verified":true,"wells_verified":true,"api_verified":true,"gps_verified":false,"address_verified":false,"directions_verified":false,"roads_verified":false,"property_verified":false,"needs_field_check":true}
    }$json$::jsonb,
    $json$[
      {"api":"34-067-2-1873-00-00","well_name":"Lasso NW SHC HR 1H","official_status":"Well Permitted","property_number":"","source_record_id":"OBJECTID:72084","official_operator":"ASCENT RESOURCES UTICA LLC","official_wellhead":{"latitude":40.240983,"longitude":-80.913607,"coordinate_role":"official wellhead reference only"},"resolution_method":"exact_current_odnr_api_and_pad_identity","verification_status":"official_exact"},
      {"api":"34-067-2-1874-00-00","well_name":"Lasso N SHC HR 3H","official_status":"Well Permitted","property_number":"","source_record_id":"OBJECTID:72085","official_operator":"ASCENT RESOURCES UTICA LLC","official_wellhead":{"latitude":40.240967,"longitude":-80.913538,"coordinate_role":"official wellhead reference only"},"resolution_method":"exact_current_odnr_api_and_pad_identity","verification_status":"official_exact"},
      {"api":"34-067-2-1875-00-00","well_name":"Lasso NE SHC HR 5H","official_status":"Well Drilled","property_number":"","source_record_id":"OBJECTID:72086","official_operator":"ASCENT RESOURCES UTICA LLC","official_wellhead":{"latitude":40.240952,"longitude":-80.91347,"coordinate_role":"official wellhead reference only"},"resolution_method":"exact_current_odnr_api_and_pad_identity","verification_status":"official_exact"}
    ]$json$::jsonb
  ),
  (
    '8ed9b8f8-33f6-4701-a4a4-4849d4b8c254'::uuid,
    'ascent--shugert-daddy',
    'Ascent',
    'Ohio',
    'SHUGERT DADDY',
    'pad',
    'Guernsey',
    'Wills',
    'SHUGERT DADDY E WLS GR 5H | SHUGERT DADDY WLS GR 1H | SHUGERT DADDY WLS GR 3H',
    '34-059-2-4314-00-00 | 34-059-2-4334-00-00 | 34-059-2-4335-00-00',
    'PARTIAL: official pad identity and wells; driver location held',
    'ACTIVE',
    'Issue #112 first-wave authoritative reconciliation',
    'authoritative_identity_only',
    'official_pad_and_wells_verified; address_entrance_route_held',
    'ODNR live records independently confirm the current Ascent pad identity and three exact APIs. BrinePads was discovery-only, and its Wills Township typo was rejected. Address, canonical GPS, property numbers, lease entrance, directions, roads, and routes remain held.',
    $json$[
      {"type":"odnr_live_well_pad_record","agency":"Ohio Department of Natural Resources","checked":"2026-08-17","source_record_id":"OBJECTID:593","official_pad_id":"PadGuernseyWillsSection24-1","url":"https://services5.arcgis.com/ajRlmtxbNBjZggOT/arcgis/rest/services/Well_Pads/FeatureServer/3/query?where=OBJECTID%3D593&outFields=*&returnGeometry=false&f=json"},
      {"type":"odnr_live_well_record","agency":"Ohio Department of Natural Resources","checked":"2026-08-17","source_record_ids":["OBJECTID:60503","OBJECTID:60525","OBJECTID:60526"],"apis":["34-059-2-4314-00-00","34-059-2-4334-00-00","34-059-2-4335-00-00"],"url":"https://services5.arcgis.com/ajRlmtxbNBjZggOT/arcgis/rest/services/Oil_And_Gas_Wells/FeatureServer/3/query?where=OBJECTID%20IN%20(60503%2C60525%2C60526)&outFields=*&returnGeometry=false&f=json"},
      {"type":"brinepads_secondary_discovery","role":"discovery_only_no_fields_promoted","page_url":"https://brinepads.com/directions.php?company=Ascent&state=Ohio&pad=Shugert+Daddy","raw_sha256":"c0704466156bee43d5ddb6b3824c665ffa414696e1f07c56418a27982b397c92"}
    ]$json$::jsonb,
    '2026-08-17'::date,
    false,
    'exact current ODNR pad identity plus three exact current ODNR API/well identities',
    'Official pad point and wellheads are retained as reference provenance only. They are not promoted to canonical driver GPS or a lease entrance.',
    'ODNR live Well Pads OBJECTID 593 + ODNR live Oil and Gas Wells OBJECTIDs 60503/60525/60526',
    true,
    $json${
      "issue112_first_wave":{"prepared_on":"2026-08-17","manifest_version":1,"brinepads_role":"secondary_discovery_only"},
      "official_pad_record":{"agency":"Ohio Department of Natural Resources","source_key":"oh_odnr_live_wellpads","source_record_id":"OBJECTID:593","official_pad_id":"PadGuernseyWillsSection24-1","official_name":"SHUGERT DADDY WLS GR","operator":"ASCENT RESOURCES UTICA LLC","county":"GUERNSEY","township":"WILLS","pad_status":"ACTIVE","pad_number":413,"permit_number":null,"source_method":"Digitized from OSIP2","latitude":40.005114,"longitude":-81.411452,"coordinate_role":"official pad reference only; not lease-entrance or driver GPS","checked":"2026-08-17"},
      "official_well_records":[
        {"api":"34-059-2-4314-00-00","api_digits":"34059243140000","well_name":"SHUGERT DADDY E WLS GR 5H","official_raw_well_name":"SHUGERT DADDY E WLS GR     5H","status":"Producing","gis_status":"Producing","operator":"ASCENT RESOURCES UTICA LLC","county":"GUERNSEY","township":"WILLS","source_record_id":"OBJECTID:60503","wellhead_latitude":40.005186,"wellhead_longitude":-81.411292,"coordinate_role":"official wellhead reference; not lease entrance"},
        {"api":"34-059-2-4334-00-00","api_digits":"34059243340000","well_name":"SHUGERT DADDY WLS GR 1H","official_raw_well_name":"SHUGERT DADDY WLS GR     1H","status":"Producing","gis_status":"Producing","operator":"ASCENT RESOURCES UTICA LLC","county":"GUERNSEY","township":"WILLS","source_record_id":"OBJECTID:60525","wellhead_latitude":40.005107,"wellhead_longitude":-81.411393,"coordinate_role":"official wellhead reference; not lease entrance"},
        {"api":"34-059-2-4335-00-00","api_digits":"34059243350000","well_name":"SHUGERT DADDY WLS GR 3H","official_raw_well_name":"SHUGERT DADDY WLS GR     3H","status":"Producing","gis_status":"Producing","operator":"ASCENT RESOURCES UTICA LLC","county":"GUERNSEY","township":"WILLS","source_record_id":"OBJECTID:60526","wellhead_latitude":40.005145,"wellhead_longitude":-81.411342,"coordinate_role":"official wellhead reference; not lease entrance"}
      ],
      "api_verification_summary":{"checked":"2026-08-17","saved_api_count":3,"exact_odnr_matches":3,"unmatched_count":0,"unmatched_saved_apis":[]},
      "location_verification":{"canonical_address":null,"canonical_latitude":null,"canonical_longitude":null,"official_reference_only":true,"lease_entrance_verified":false,"driver_gps_verified":false,"brinepads_address_held":true,"brinepads_gps_held":true,"brinepads_directions_held":true},
      "verification":{"pad_identity_verified":true,"operator_verified":true,"wells_verified":true,"api_verified":true,"gps_verified":false,"address_verified":false,"directions_verified":false,"roads_verified":false,"property_verified":false,"needs_field_check":true}
    }$json$::jsonb,
    $json$[
      {"api":"34-059-2-4314-00-00","well_name":"SHUGERT DADDY E WLS GR 5H","official_status":"Producing","property_number":"","source_record_id":"OBJECTID:60503","official_operator":"ASCENT RESOURCES UTICA LLC","official_wellhead":{"latitude":40.005186,"longitude":-81.411292,"coordinate_role":"official wellhead reference only"},"resolution_method":"exact_current_odnr_api_and_pad_identity","verification_status":"official_exact"},
      {"api":"34-059-2-4334-00-00","well_name":"SHUGERT DADDY WLS GR 1H","official_status":"Producing","property_number":"","source_record_id":"OBJECTID:60525","official_operator":"ASCENT RESOURCES UTICA LLC","official_wellhead":{"latitude":40.005107,"longitude":-81.411393,"coordinate_role":"official wellhead reference only"},"resolution_method":"exact_current_odnr_api_and_pad_identity","verification_status":"official_exact"},
      {"api":"34-059-2-4335-00-00","well_name":"SHUGERT DADDY WLS GR 3H","official_status":"Producing","property_number":"","source_record_id":"OBJECTID:60526","official_operator":"ASCENT RESOURCES UTICA LLC","official_wellhead":{"latitude":40.005145,"longitude":-81.411342,"coordinate_role":"official wellhead reference only"},"resolution_method":"exact_current_odnr_api_and_pad_identity","verification_status":"official_exact"}
    ]$json$::jsonb
  );

  get diagnostics v_inserted = row_count;
  if v_inserted <> 3 then
    raise exception 'Issue #112 insert count mismatch: expected 3, got %', v_inserted;
  end if;

  insert into public.pad_verification_status (
    pad_id,
    gps_verified,
    directions_verified,
    wells_verified,
    api_verified,
    property_verified,
    roads_verified,
    needs_field_check,
    review_note,
    evidence
  )
  select
    p.id,
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    'Issue #112 verified official pad/API identity only. Driver GPS, entrance, address, directions, roads, and property numbers remain held.',
    pg_catalog.jsonb_build_object(
      'gps', pg_catalog.jsonb_build_object('verified', false, 'basis', 'ODNR coordinates are reference-only and are not stored as canonical driver GPS.'),
      'directions', pg_catalog.jsonb_build_object('verified', false, 'basis', 'BrinePads directions were not promoted.'),
      'wells', pg_catalog.jsonb_build_object('verified', true, 'basis', 'Every saved well has an exact current ODNR record attached.'),
      'api', pg_catalog.jsonb_build_object('verified', true, 'basis', 'Every saved API has an exact current ODNR match.'),
      'property', pg_catalog.jsonb_build_object('verified', false, 'basis', 'No BrinePads property number was promoted.'),
      'roads', pg_catalog.jsonb_build_object('verified', false, 'basis', 'Issue #112 makes no road, graph, or route assertion.')
    )
  from public.pads p
  where p.id = any(v_target_ids);

  get diagnostics v_inserted = row_count;
  if v_inserted <> 3 then
    raise exception 'Issue #112 verification-state insert mismatch: expected 3, got %', v_inserted;
  end if;

  if (
    select pg_catalog.count(*)
    from public.pads p
    where p.id = any(v_target_ids)
      and p.record_type = 'pad'
      and p.company = 'Ascent'
      and p.state = 'Ohio'
      and p.address is null
      and p.latitude is null
      and p.longitude is null
      and p.property_number is null
      and p.written_directions is null
      and p.directions_clear is null
      and p.structured_road_sequence is null
      and p.audit_verified is true
      and p.extra_data->'location_verification'->>'official_reference_only' = 'true'
      and p.extra_data->'location_verification'->>'lease_entrance_verified' = 'false'
  ) <> 3 then
    raise exception 'Issue #112 postcondition failed: private target fields differ from manifest';
  end if;

  if (
    select pg_catalog.count(*)
    from public.pad_verification_status s
    where s.pad_id = any(v_target_ids)
      and s.gps_verified is false
      and s.directions_verified is false
      and s.wells_verified is true
      and s.api_verified is true
      and s.property_verified is false
      and s.roads_verified is false
      and s.needs_field_check is true
  ) <> 3 then
    raise exception 'Issue #112 postcondition failed: verification states differ from manifest';
  end if;

  if (
    select pg_catalog.count(*)
    from public.public_pad_detail d
    where d.id = any(v_target_ids)
      and d.record_type = 'pad'
      and d.company = 'Ascent'
      and d.state = 'Ohio'
      and d.address is null
      and d.latitude is null
      and d.longitude is null
      and d.property_number is null
  ) <> 3 then
    raise exception 'Issue #112 postcondition failed: public projection was not synchronized exactly';
  end if;

  if (select pg_catalog.count(*) from public.pads) <> v_pads_before + 3 then
    raise exception 'Issue #112 postcondition failed: unexpected public.pads count delta';
  end if;

  if (select pg_catalog.count(*) from public.public_pad_detail) <> v_public_before + 3 then
    raise exception 'Issue #112 postcondition failed: unexpected public projection count delta';
  end if;

  if (select pg_catalog.count(*) from public.pads)
     <> (select pg_catalog.count(*) from public.public_pad_detail) then
    raise exception 'Issue #112 postcondition failed: pads/public projection parity lost';
  end if;
end
$issue112$;
