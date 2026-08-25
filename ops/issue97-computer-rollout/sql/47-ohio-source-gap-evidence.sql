\set ON_ERROR_STOP on
\pset pager off
\timing on

-- Read-only evidence for display-only official references. No pad coordinate,
-- route, graph, Google, direction, or cutover state is changed.
begin transaction isolation level repeatable read read only;
set local statement_timeout='30s';
set local lock_timeout='2s';

with current_snapshot as (
  select snapshot.*
  from public.brinesearch_directory_snapshots_v18 snapshot
  where snapshot.publication_state='current'
  order by snapshot.source_revision desc
  limit 1
), missing_ohio_pads as (
  select pad.*
  from public.brinesearch_directory_snapshot_rows_v18 snapshot_row
  join current_snapshot snapshot
    on snapshot.snapshot_id=snapshot_row.snapshot_id
  join public.pads pad on pad.id=snapshot_row.pad_id
  where snapshot_row.state='Ohio'
    and snapshot_row.record_type='pad'
    and (pad.latitude is null or pad.longitude is null)
), official_pad_candidates as (
  select pad.id,
    case when pg_catalog.btrim(
      pad.extra_data->'official_pad_record'->>'latitude'
    )~'^-?[0-9]+([.][0-9]+)?$'
      then (pad.extra_data->'official_pad_record'->>'latitude')::numeric
    end as latitude,
    case when pg_catalog.btrim(
      pad.extra_data->'official_pad_record'->>'longitude'
    )~'^-?[0-9]+([.][0-9]+)?$'
      then (pad.extra_data->'official_pad_record'->>'longitude')::numeric
    end as longitude
  from missing_ohio_pads pad
  where pg_catalog.jsonb_typeof(
    pad.extra_data->'official_pad_record'
  )='object'
    and pad.extra_data->'official_audit_outcome'->>'recommendation_class'
      in ('official_pad_layer','normalized_existing_pad_attachment',
          'corrected_exact_api_pad_match')
), official_pad_references as (
  select * from official_pad_candidates
  where latitude between 36.5 and 43.5
    and longitude between -84.5 and -73.5
), official_well_candidates as (
  select pad.id,well.value->>'api_digits' api_digits,
    case when pg_catalog.btrim(well.value->>'wellhead_latitude')
      ~'^-?[0-9]+([.][0-9]+)?$'
      then (well.value->>'wellhead_latitude')::numeric end latitude,
    case when pg_catalog.btrim(well.value->>'wellhead_longitude')
      ~'^-?[0-9]+([.][0-9]+)?$'
      then (well.value->>'wellhead_longitude')::numeric end longitude
  from missing_ohio_pads pad
  cross join lateral pg_catalog.jsonb_array_elements(
    case when pg_catalog.jsonb_typeof(
      pad.extra_data->'official_well_records'
    )='array' and pg_catalog.jsonb_array_length(
      pad.extra_data->'official_well_records'
    )<=64 then pad.extra_data->'official_well_records' else '[]'::jsonb end
  ) well(value)
  where coalesce(well.value->>'api_digits','')~'^[0-9]{14}$'
    and coalesce(well.value->>'verification_method','') in (
      'saved_api_exact_official','saved_api_corrected_to_official',
      'shared_physical_pad_alias_verified',
      'official_well_added_to_existing_pad',
      'confirmed_cross_pad_conflict_reassigned',
      'official_well_added_by_deep_inventory_pad_identity',
      'official_well_added_by_direct_wellhead_pad_recovery'
    )
), ranked_well_references as (
  select candidate.*,row_number() over(
    partition by candidate.id
    order by candidate.api_digits,candidate.latitude,candidate.longitude
  ) candidate_order
  from official_well_candidates candidate
  where latitude between 36.5 and 43.5
    and longitude between -84.5 and -73.5
), reference_rows as (
  select pad.id,'official_pad_reference'::text reference_kind,
    pad.latitude,pad.longitude
  from official_pad_references pad
  union all
  select well.id,'official_wellhead_reference',well.latitude,well.longitude
  from ranked_well_references well
  where well.candidate_order=1
    and not exists(
      select 1 from official_pad_references pad where pad.id=well.id
    )
)
select pg_catalog.jsonb_build_object(
  'snapshotId',(select snapshot_id from current_snapshot),
  'sourceRevision',(select source_revision from current_snapshot),
  'missingVerifiedEntrance',(select pg_catalog.count(*) from missing_ohio_pads),
  'officialPadReferences',(select pg_catalog.count(*) from reference_rows
    where reference_kind='official_pad_reference'),
  'officialWellheadReferences',(select pg_catalog.count(*) from reference_rows
    where reference_kind='official_wellhead_reference'),
  'safeReferences',(select pg_catalog.count(*) from reference_rows),
  'stillUnmapped',(select pg_catalog.count(*) from missing_ohio_pads missing
    where not exists(select 1 from reference_rows ref where ref.id=missing.id)),
  'duplicateReferencePads',(select pg_catalog.count(*) from (
    select id from reference_rows group by id having pg_catalog.count(*)<>1
  ) duplicate),
  'contentSha256',(select pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(pg_catalog.string_agg(
      id::text||'|'||reference_kind||'|'||latitude::text||'|'||longitude::text,
      E'\n' order by id
    ),'UTF8'),'sha256'),'hex') from reference_rows)
) as ohio_reference_evidence;

rollback;
