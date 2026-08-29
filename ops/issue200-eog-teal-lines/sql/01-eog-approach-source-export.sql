\set ON_ERROR_STOP on
\pset pager off
\timing on

-- Issue #200. Read-only export only; deliberately unexecuted after the current
-- production read lane failed closed. A fresh read-only phase must run it.
begin transaction isolation level repeatable read read only;
set local statement_timeout='60s';
set local lock_timeout='2s';
set local search_path='pg_catalog';

do $baseline$
declare
v_pads integer;
v_saved_gps integer;
v_sequences integer;
v_written integer;
begin
select
count(*)::integer,
count(*) filter(where latitude is not null and longitude is not null)::integer,
count(*) filter(where nullif(pg_catalog.btrim(coalesce(structured_road_sequence,'')),'') is not null)::integer,
count(*) filter(where nullif(pg_catalog.btrim(coalesce(written_directions,'')),'') is not null)::integer
into strict v_pads,v_saved_gps,v_sequences,v_written
from public.pads
where record_type='pad'
and pg_catalog.upper(pg_catalog.btrim(company))='EOG'
and state='Ohio';
if v_pads<>301 or v_saved_gps<>214 or v_sequences<>286 or v_written<>296 then
raise exception 'EOG #200 source baseline drifted: pads %, saved GPS %, sequences %, written %',
v_pads,v_saved_gps,v_sequences,v_written using errcode='P0001';
end if;
end
$baseline$;

with current_snapshot as materialized (
select snapshot.*
from public.brinesearch_directory_snapshots_v18 snapshot
where snapshot.publication_state='current'
order by snapshot.source_revision desc
limit 1
), reference_payload_raw as materialized (
select public.brinesearch_v18_pad_reference_coordinates(snapshot.snapshot_id) as payload
from current_snapshot snapshot
), reference_payload as materialized (
select case when pg_catalog.jsonb_typeof(payload)='array' then payload->0 else payload end as payload
from reference_payload_raw
), reference_rows as materialized (
select
(entry.value->>'padId')::uuid as pad_id,
entry.value->>'referenceKind' as reference_kind,
(entry.value->>'latitude')::double precision as latitude,
(entry.value->>'longitude')::double precision as longitude
from reference_payload payload
cross join lateral pg_catalog.jsonb_array_elements(coalesce(payload.payload->'rows','[]'::jsonb)) entry(value)
), pad_scope as materialized (
select
row.pad_id,row.pad_id as canonical_id,row.legacy_id,row.record_revision,
row.pad_name,row.company,row.state,row.county,
coalesce(row.structured_road_sequence,'') as structured_road_sequence,
(nullif(pg_catalog.btrim(coalesce(live.written_directions,'')),'') is not null) as written_directions_present,
reference.reference_kind,
reference.latitude as destination_latitude,
reference.longitude as destination_longitude
from public.brinesearch_directory_snapshot_rows_v18 row
join current_snapshot snapshot on snapshot.snapshot_id=row.snapshot_id
join public.pads live on live.id=row.pad_id
left join reference_rows reference on reference.pad_id=row.pad_id
where row.record_type='pad'
and pg_catalog.upper(pg_catalog.btrim(row.company))='EOG'
and row.state='Ohio'
), selected_route as materialized (
select pad.pad_id as scope_pad_id,route.*
from pad_scope pad
left join lateral (
select candidate.*
from public.brinesearch_route_prep candidate
where candidate.pad_id=pad.pad_id
and nullif(pg_catalog.btrim(pad.structured_road_sequence),'') is not null
and candidate.active
and candidate.route_group='primary'
order by candidate.variant_index,candidate.id
limit 1
) route on true
), exact_steps as materialized (
select
route.scope_pad_id as pad_id,route.id as route_prep_id,
step.id as route_prep_step_id,step.step_order,
step.raw_text,step.normalized_text,step.step_kind,step.road_id,
occurrence.resolution_method,
case
when step.step_kind='exit_note' then 'route_note'
when step.step_kind='private_segment' then 'private_segment'
when occurrence.resolution_status='resolved'
and occurrence.canonical_road_id=step.road_id
and occurrence.identity_id is not null
and identity.active
and private_verification.brinesearch_issue97_dataset_scope_current(
identity.dataset_id,identity.state_code,identity.county_code
) then 'exact_master'
else 'needs_review'
end as match_status,
road.canonical_name,road.aliases,road.road_type,road.route_number,
road.centerline_geojson,
case when road.centerline_geojson is not null then 'official_centerline_loaded' else 'not_loaded' end as geometry_status,
(road.centerline_geojson is not null) as has_geometry,
step.distance_miles,step.turn_direction
from selected_route route
join public.brinesearch_route_prep_steps step on step.route_prep_id=route.id and step.active
left join private_verification.brinesearch_route_occurrence_receipts_issue97 occurrence
on occurrence.route_prep_step_id=step.id
left join public.brinesearch_authoritative_road_identities identity on identity.id=occurrence.identity_id
left join public.brinesearch_roads road on road.id=step.road_id
), highway_step as materialized (
select distinct on (step.pad_id) step.*
from exact_steps step
where step.match_status='exact_master'
and step.step_kind in ('interstate','us_route','state_route')
order by step.pad_id,step.step_order desc,step.route_prep_step_id
), next_step as materialized (
select step.*
from exact_steps step
join highway_step highway
on highway.pad_id=step.pad_id
and highway.route_prep_id=step.route_prep_id
and step.step_order=highway.step_order+1
), exact_anchor as materialized (
select distinct on (transition.route_prep_id,transition.left_route_prep_step_id)
transition.route_prep_id,transition.left_route_prep_step_id,
transition.right_route_prep_step_id,anchor.geom
from private_verification.brinesearch_route_transition_receipts_issue97 transition
join public.brinesearch_road_junction_anchors anchor on anchor.id=transition.anchor_id
join public.brinesearch_road_junctions junction
on junction.id=transition.junction_id and junction.verification_status='verified'
join public.brinesearch_road_graph_builds build
on build.id=transition.graph_build_id
and build.status='active'
and private_verification.brinesearch_issue97_graph_build_release_current(build.id)
where transition.status='resolved'
and transition.anchor_id is not null
order by transition.route_prep_id,transition.left_route_prep_step_id,transition.receipt_digest
), route_rows as materialized (
select
route.scope_pad_id as pad_id,route.id as route_prep_id,route.variant_index,
route.source_sequence,route.source_sequence_hash,route.normalized_sequence,
route.readiness_status,route.issue_codes,route.highway_anchor_text,
route.highway_anchor_kind,route.highway_anchor_status,
route.analysis_version,route.updated_at,
highway.step_order as highway_order,
highway.route_prep_step_id as highway_step_id,
coalesce((
select pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
'roadId',case when step.match_status='exact_master' then step.road_id else null end,
'aliases',case when step.match_status='exact_master'
then coalesce(pg_catalog.to_jsonb(step.aliases),'[]'::jsonb) else '[]'::jsonb end,
'rawText',step.raw_text,
'roadType',step.road_type,
'stepKind',step.step_kind,
'stepOrder',step.step_order,
'matchMethod',step.resolution_method,
'matchStatus',step.match_status,
'routeNumber',step.route_number,
'canonicalName',case when step.match_status='exact_master' then step.canonical_name else null end,
'distanceMiles',step.distance_miles,
'turnDirection',step.turn_direction,
'normalizedText',step.normalized_text,
'roadGeometryStatus',step.geometry_status,
'stepGeometryStatus',case when step.match_status='exact_master' and step.has_geometry then 'ready' else 'blocked' end
)) order by step.step_order,step.route_prep_step_id)
from exact_steps step where step.route_prep_id=route.id
),'[]'::jsonb) as steps,
highway.road_id as highway_road_id,
highway.raw_text as highway_raw_text,
highway.normalized_text as highway_normalized_text,
highway.step_kind as highway_step_kind,
highway.road_type as highway_road_type,
highway.route_number as highway_route_number,
highway.canonical_name as highway_canonical_name,
highway.aliases as highway_aliases,
highway.resolution_method as highway_match_method,
highway.match_status as highway_match_status,
highway.has_geometry as highway_has_geometry,
highway.geometry_status as highway_geometry_status,
next_step.route_prep_step_id as next_step_id,
next_step.step_order as next_step_order,
next_step.road_id as next_step_road_id,
next_step.raw_text as next_step_raw_text,
next_step.normalized_text as next_step_normalized_text,
next_step.step_kind as next_step_kind,
next_step.road_type as next_step_road_type,
next_step.route_number as next_step_route_number,
next_step.canonical_name as next_step_canonical_name,
next_step.aliases as next_step_aliases,
next_step.resolution_method as next_step_match_method,
next_step.match_status as next_step_match_status,
next_step.has_geometry as next_step_has_geometry,
next_step.geometry_status as next_step_geometry_status,
anchor.geom as exact_anchor_geom,
highway.centerline_geojson as highway_centerline_geojson
from selected_route route
left join highway_step highway on highway.route_prep_id=route.id
left join next_step on next_step.route_prep_id=route.id
left join exact_anchor anchor
on anchor.route_prep_id=route.id
and anchor.left_route_prep_step_id=highway.route_prep_step_id
and anchor.right_route_prep_step_id=next_step.route_prep_step_id
), records as (
select
pad.*,
route.*,
case when pad.destination_latitude is not null and pad.destination_longitude is not null
then extensions.st_setsrid(extensions.st_makepoint(pad.destination_longitude,pad.destination_latitude),4326)
else null end as destination_geom
from pad_scope pad
left join route_rows route on route.pad_id=pad.pad_id
), scope_counts as materialized (
select
count(*)::integer as pad_count,
count(distinct pad_id)::integer as distinct_pad_count,
count(*) filter(where reference_kind='saved_pad_reference')::integer as saved_gps_count,
count(*) filter(where nullif(pg_catalog.btrim(structured_road_sequence),'') is not null)::integer as structured_sequence_count,
count(*) filter(where written_directions_present)::integer as written_directions_count
from records
), scope_guard as materialized (
select case when pad_count=301 and distinct_pad_count=301
and saved_gps_count=214 and structured_sequence_count=286
and written_directions_count=296
then 1
else (('EOG #200 exported fixture scope drifted: pads '||pad_count::text
||', distinct '||distinct_pad_count::text||', saved GPS '||saved_gps_count::text
||', sequences '||structured_sequence_count::text||', written '||written_directions_count::text
)::integer) end as ok
from scope_counts
)
select pg_catalog.jsonb_build_object(
'schemaVersion',1,
'snapshotId','eog-ohio-approach-source-issue200',
'directorySnapshotId',snapshot.snapshot_id,
'sourceRevision',snapshot.source_revision::text,
'directoryContentSha256',snapshot.content_sha256,
'scope','eog-ohio-last-exact-highway-to-pad-source-issue200',
'authority','Read-only exact source evidence. No route geometry or approval is created by this export.',
'baseline',pg_catalog.jsonb_build_object(
'productionPadCount',301,'savedGpsCount',214,'structuredSequenceCount',286,'writtenDirectionsCount',296
),
'rules',pg_catalog.jsonb_build_object(
'primaryRouteOnly',true,
'exactHighwayStepRequiredForRouting',true,
'exactMasterRoadIdsOnly',true,
'noFuzzyNearestOrNameOnlyRoadIdentityMatching',true,
'nearestHighwayCoordinateIsCandidateOnly',true,
'firstMismatchStopsTealPermanently',true,
'gpsTetherIsUnapprovedAndExcludedFromMileage',true,
'productionWrites',0
),
'records',coalesce((
select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
'padId',record.pad_id,
'canonicalId',record.canonical_id,
'legacyId',record.legacy_id,
'recordRevision',record.record_revision,
'padName',record.pad_name,
'company',record.company,
'state',record.state,
'county',record.county,
'structuredRoadSequence',record.structured_road_sequence,
'writtenDirectionsPresent',record.written_directions_present,
'directoryCoordinateRole',case record.reference_kind
when 'saved_pad_reference' then 'saved pad reference'
when 'official_pad_reference' then 'official pad reference'
when 'official_wellhead_reference' then 'official wellhead reference'
else null end,
'directoryCoordinate',case when record.destination_geom is not null
then pg_catalog.jsonb_build_array(record.destination_longitude,record.destination_latitude) else null end,
'destinationGpsSource',case record.reference_kind
when 'saved_pad_reference' then 'saved'
when 'official_pad_reference' then 'ODNR pad'
when 'official_wellhead_reference' then 'ODNR wellhead'
else null end,
'destination',case when record.destination_geom is not null
then pg_catalog.jsonb_build_array(record.destination_longitude,record.destination_latitude) else null end,
'routePrep',case when record.route_prep_id is null
or nullif(pg_catalog.btrim(record.structured_road_sequence),'') is null then null else
pg_catalog.jsonb_build_object(
'pad_id',record.pad_id,
'route_prep_id',record.route_prep_id,
'variant_index',record.variant_index,
'source_sequence',record.source_sequence,
'source_sequence_hash',record.source_sequence_hash,
'normalized_sequence',record.normalized_sequence,
'readiness_status',record.readiness_status,
'issue_codes',record.issue_codes,
'highway_anchor_text',record.highway_anchor_text,
'highway_anchor_kind',record.highway_anchor_kind,
'highway_anchor_status',record.highway_anchor_status,
'analysis_version',record.analysis_version,
'updated_at',record.updated_at,
'highway_order',record.highway_order,
'highway',case when record.highway_step_id is null then null else
pg_catalog.jsonb_build_object(
'roadId',record.highway_road_id,
'aliases',coalesce(pg_catalog.to_jsonb(record.highway_aliases),'[]'::jsonb),
'rawText',record.highway_raw_text,
'roadType',record.highway_road_type,
'stepKind',record.highway_step_kind,
'stepOrder',record.highway_order,
'hasGeometry',record.highway_has_geometry,
'matchMethod',record.highway_match_method,
'matchStatus',record.highway_match_status,
'routeNumber',record.highway_route_number,
'canonicalName',record.highway_canonical_name,
'geometryStatus',record.highway_geometry_status,
'normalizedText',record.highway_normalized_text
) end,
'next_step',case when record.next_step_id is null then null else
pg_catalog.jsonb_build_object(
'roadId',case when record.next_step_match_status='exact_master' then record.next_step_road_id else null end,
'aliases',case when record.next_step_match_status='exact_master'
then coalesce(pg_catalog.to_jsonb(record.next_step_aliases),'[]'::jsonb) else '[]'::jsonb end,
'rawText',record.next_step_raw_text,
'roadType',record.next_step_road_type,
'stepKind',record.next_step_kind,
'stepOrder',record.next_step_order,
'hasGeometry',record.next_step_has_geometry,
'matchMethod',record.next_step_match_method,
'matchStatus',record.next_step_match_status,
'routeNumber',record.next_step_route_number,
'canonicalName',case when record.next_step_match_status='exact_master'
then record.next_step_canonical_name else null end,
'geometryStatus',record.next_step_geometry_status,
'normalizedText',record.next_step_normalized_text
) end,
'point_intersections',case when record.exact_anchor_geom is not null
then extensions.st_asgeojson(record.exact_anchor_geom)::jsonb else null end,
'nearest_highway_point',case
when record.exact_anchor_geom is null
and record.highway_centerline_geojson is not null
and record.destination_geom is not null
then extensions.st_asgeojson(extensions.st_closestpoint(
extensions.st_setsrid(extensions.st_geomfromgeojson(record.highway_centerline_geojson::text),4326),
record.destination_geom
))::jsonb else null end,
'steps',record.steps
) end
) order by record.pad_name,record.pad_id)
from records record
),'[]'::jsonb)
) as eog_approach_source
from current_snapshot snapshot
cross join scope_guard guard
where guard.ok=1;

rollback;
