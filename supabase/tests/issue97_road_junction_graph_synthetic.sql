-- GitHub #97 synthetic topology regression. Disposable database only.
-- Apply all migrations first, then execute this file with ON_ERROR_STOP=1.
begin;

-- A legacy/bypassed complete status without bound coverage receipts must not
-- authorize a graph build or stale-row retirement.
insert into public.brinesearch_road_source_ingest_runs(
  dataset_id,state_code,county_code,status,started_at,completed_at,
  page_count,source_row_count,ingested_row_count,details
)
select d.id,'WV','DOD','complete',now()-interval '4 minutes',now()-interval '3 minutes',
  1,case when d.topology_role='primary_network' then 24 else 0 end,
  case when d.topology_role='primary_network' then 24 else 0 end,
  jsonb_build_object('synthetic_fixture',true,'coverage_complete',true)
from public.brinesearch_road_source_datasets d
where d.state_code='WV' and d.active;

do $issue97_incomplete_receipts$
begin
  perform public.brinesearch_issue97_rebuild_county_graph('WV','DOD');
  raise exception '#97 graph rebuild accepted an unbound legacy complete status';
exception
  when sqlstate '55000' then null;
end
$issue97_incomplete_receipts$;


-- Replace only the remote snapshot probe inside this rollback-only fixture.
-- The run lifecycle, page receipts, finalizer and graph activation are the
-- production functions under test.
create or replace function public.brinesearch_issue97_source_snapshot(
  p_source_key text,p_county_code text
)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select pg_catalog.jsonb_build_object(
    'source_key',p_source_key,'dataset_id',d.id,'state_code','WV',
    'county_code',p_county_code,'source_county_code',p_county_code,
    'query_url','https://fixture.invalid/issue97/'||p_source_key||'/'||p_county_code,
    'source_version','synthetic-v1','object_id_field','OBJECTID',
    'expected_source_rows',case when d.topology_role='primary_network'
      then case p_county_code when 'DOD' then 19 when 'HAR' then 1 else 0 end else 0 end,
    'object_id_set_digest',pg_catalog.md5('ids:'||p_source_key||':'||p_county_code),
    'source_revision_token',pg_catalog.md5('revision:'||p_source_key||':'||p_county_code),
    'count_checked_at',pg_catalog.clock_timestamp()
  ) from public.brinesearch_road_source_datasets d where d.source_key=p_source_key
$$;

create temporary table issue97_ingest_runs(
  run_id uuid primary key,source_key text,county_code text,source_rows integer
) on commit drop;

insert into issue97_ingest_runs(run_id,source_key,county_code,source_rows)
select (started.result->>'run_id')::uuid,d.source_key,fixture.county_code,
  (snapshot.value->>'expected_source_rows')::integer
from public.brinesearch_road_source_datasets d
join public.brinesearch_road_source_dataset_counties scope
  on scope.dataset_id=d.id and scope.state_code='WV'
  and scope.active and scope.required_for_graph
join (values ('DOD'),('HAR')) fixture(county_code)
  on fixture.county_code=scope.county_code
cross join lateral (
  select public.brinesearch_issue97_source_snapshot(d.source_key,fixture.county_code) as value
) snapshot
cross join lateral (
  select public.brinesearch_issue97_begin_ingest(
    d.source_key,fixture.county_code,
    (snapshot.value->>'expected_source_rows')::integer,snapshot.value
  ) as result
) started
where d.state_code='WV' and d.active;

insert into public.brinesearch_road_source_ingest_pages(
  run_id,page_offset,requested_limit,source_row_count,ingested_row_count,
  rejected_row_count,has_more,page_digest,result
)
select fixture.run_id,0,1000,fixture.source_rows,fixture.source_rows,0,false,
	  md5('issue97-synthetic:'||fixture.source_key||':'||fixture.county_code),
  jsonb_build_object(
	    'source',fixture.source_key,'county_code',fixture.county_code,'offset',0,'page_size',1000,
	    'source_rows',fixture.source_rows,'rows',fixture.source_rows,
    'rejected_rows',0,'has_more',false,
	    'page_digest',md5('issue97-synthetic:'||fixture.source_key||':'||fixture.county_code),
    'synthetic_fixture',true
  )
from issue97_ingest_runs fixture;

-- A single NLF can cross an access/jurisdiction boundary. The identity builder
-- must split the physically connected source records before classification so
-- a private segment can never inherit the adjacent public identity status.
insert into public.brinesearch_odot_road_catalog(
  roadway_inventory_id,objectid,nlf_id,county_code,jurisdiction_code,
  route_type,route_number,official_name,ctl_begin,ctl_end,attributes,geom,
  geometry_loaded_at,source_active
) values
  ('ISSUE97_ODOT_PUBLIC',-970001,'ZBELZZ99999**C','BEL','M','MR','999',
   'Issue 97 Mixed Access Road',0,0.10,'{}'::jsonb,
   extensions.st_geomfromtext('LINESTRING(-80.7500 40.0500,-80.7490 40.0500)',4326),now(),true),
  ('ISSUE97_ODOT_PRIVATE',-970002,'ZBELZZ99999**C','BEL','P','MR','999',
   'Issue 97 Mixed Access Road',0.10,0.20,'{}'::jsonb,
   extensions.st_geomfromtext('LINESTRING(-80.7490 40.0500,-80.7480 40.0500)',4326),now(),true);

select public.brinesearch_issue97_refresh_oh_identities('BEL');

do $issue97_odot_private$
begin
  if (select count(*) from public.brinesearch_authoritative_road_identities i
      where i.state_code='OH' and i.active
        and i.attributes->>'nlf_id'='ZBELZZ99999**C')<>2 then
    raise exception '#97 mixed-jurisdiction ODOT NLF was not split into two exact identities';
  end if;
  if not exists(select 1 from public.brinesearch_authoritative_road_identities i
      where i.state_code='OH' and i.active
        and i.attributes->>'nlf_id'='ZBELZZ99999**C'
        and i.attributes->>'jurisdiction_code'='P'
        and i.public_access_status='private' and i.drivable_status='drivable') then
    raise exception '#97 ODOT jurisdiction P identity did not remain private';
  end if;
  if not exists(select 1 from public.brinesearch_authoritative_road_segments s
      where s.source_segment_key='OH:ODOT:SEGMENT:ISSUE97_ODOT_PRIVATE'
        and s.public_access_status='private' and s.drivable_status='drivable') then
    raise exception '#97 ODOT jurisdiction P segment did not remain private';
  end if;
  if private_verification.brinesearch_issue97_identity_route_usable(
      'private','drivable','local') then
    raise exception '#97 canonical publication accepted a private ODOT identity';
  end if;
end
$issue97_odot_private$;

with source_rows(source_key,display_name,normalized_name,road_class,access_status,drivable_status,county_code,county_name,route_number,township) as (
  values
    ('WV:TEST:OVER_A','Over A','over a','local','public','drivable','DOD','Doddridge',null,null),
    ('WV:TEST:OVER_B','Over B','over b','local','public','drivable','DOD','Doddridge',null,null),
    ('WV:TEST:RAMP_MAIN','Ramp Main','ramp main','state_route','public','drivable','DOD','Doddridge','7',null),
    ('WV:TEST:RAMP','Ramp 7A','ramp 7a','ramp','public','drivable','DOD','Doddridge','7A',null),
    ('WV:TEST:PAIR_A','Pair A','pair a','local','public','drivable','DOD','Doddridge',null,null),
    ('WV:TEST:PAIR_B','Pair B','pair b','local','public','drivable','DOD','Doddridge',null,null),
    ('WV:TEST:SAME_NAME_A','Twin Road','twin road','local','public','drivable','DOD','Doddridge',null,'A'),
    ('WV:TEST:SAME_NAME_B','Twin Road','twin road','local','public','drivable','DOD','Doddridge',null,'B'),
    ('WV:TEST:MULTI_A','Multi A','multi a','local','public','drivable','DOD','Doddridge',null,null),
    ('WV:TEST:MULTI_B','Multi B','multi b','local','public','drivable','DOD','Doddridge',null,null),
    ('WV:TEST:MULTI_C','Multi C','multi c','local','public','drivable','DOD','Doddridge',null,null),
    ('WV:TEST:SHARED_A','Shared A','shared a','local','public','drivable','DOD','Doddridge',null,null),
    ('WV:TEST:SHARED_B','Shared B','shared b','local','public','drivable','DOD','Doddridge',null,null),
    ('WV:TEST:PUBLIC','Public Road','public road','local','public','drivable','DOD','Doddridge',null,null),
    ('WV:TEST:PRIVATE','Private Road','private road','access','private','drivable','DOD','Doddridge',null,null),
    ('WV:TEST:BOUNDARY_DOD','Boundary Road','boundary road','local','public','drivable','DOD','Doddridge',null,null),
    ('WV:TEST:BOUNDARY_HAR','Boundary Road','boundary road','local','public','drivable','HAR','Harrison',null,null),
    ('WV:TEST:TRAIL','Rail Trail','rail trail','trail','held','non_drivable','DOD','Doddridge',null,null),
    ('WV:TEST:TR_7_A','TR-7','tr 7','township','public','drivable','DOD','Doddridge','7','Alpha'),
    ('WV:TEST:TR_7_B','TR-7','tr 7','township','public','drivable','DOD','Doddridge','7','Beta')
)
insert into public.brinesearch_authoritative_road_identities(
  id,dataset_id,source_identity_key,state_code,county_code,county_name,township,
  route_system,route_number,display_name,normalized_name,road_class,
  public_access_status,drivable_status,maintainer,source_record_ids,
  attributes,source_digest,active,last_seen_at
)
select private_verification.brinesearch_issue97_uuid(s.source_key),d.id,s.source_key,
  'WV',s.county_code,s.county_name,s.township,'TEST',s.route_number,
  s.display_name,s.normalized_name,s.road_class,s.access_status,s.drivable_status,
  'Synthetic fixture',array[s.source_key],jsonb_build_object('synthetic_fixture',true),
  md5(s.source_key),true,clock_timestamp()
from source_rows s
cross join lateral (
  select id from public.brinesearch_road_source_datasets
  where source_key='wv_wvdot_publication_lrs'
) d;

insert into public.brinesearch_authoritative_road_names(
  identity_id,source_dataset_id,source_record_id,name_type,road_name,normalized_name,provenance
)
select i.id,i.dataset_id,i.source_identity_key,'official',i.display_name,i.normalized_name,
  jsonb_build_object('synthetic_fixture',true)
from public.brinesearch_authoritative_road_identities i
where i.source_identity_key like 'WV:TEST:%';

with segment_rows(segment_key,identity_key,county_code,county_name,access_status,drivable_status,z_level,bridge_status,wkt) as (
  values
    ('WV:TEST:SEG:OVER_A','WV:TEST:OVER_A','DOD','Doddridge','public','drivable',0,null,'LINESTRING(-81.100 39.800,-81.095 39.800,-81.090 39.800)'),
    ('WV:TEST:SEG:OVER_B','WV:TEST:OVER_B','DOD','Doddridge','public','drivable',1,'bridge','LINESTRING(-81.095 39.800,-81.095 39.810)'),
    ('WV:TEST:SEG:RAMP_MAIN','WV:TEST:RAMP_MAIN','DOD','Doddridge','public','drivable',0,null,'LINESTRING(-81.100 39.820,-81.095 39.820,-81.090 39.820)'),
    ('WV:TEST:SEG:RAMP','WV:TEST:RAMP','DOD','Doddridge','public','drivable',0,null,'LINESTRING(-81.095 39.820,-81.092 39.825)'),
    ('WV:TEST:SEG:PAIR_A','WV:TEST:PAIR_A','DOD','Doddridge','public','drivable',0,null,'LINESTRING(-81.100 39.840,-81.095 39.845,-81.090 39.840,-81.085 39.845)'),
    ('WV:TEST:SEG:PAIR_B','WV:TEST:PAIR_B','DOD','Doddridge','public','drivable',0,null,'LINESTRING(-81.100 39.845,-81.095 39.845,-81.090 39.845,-81.085 39.845)'),
    ('WV:TEST:SEG:SAME_A','WV:TEST:SAME_NAME_A','DOD','Doddridge','public','drivable',0,null,'LINESTRING(-81.100 39.860,-81.090 39.860)'),
    ('WV:TEST:SEG:SAME_B','WV:TEST:SAME_NAME_B','DOD','Doddridge','public','drivable',0,null,'LINESTRING(-81.100 39.865,-81.090 39.865)'),
    ('WV:TEST:SEG:MULTI_A','WV:TEST:MULTI_A','DOD','Doddridge','public','drivable',0,null,'LINESTRING(-81.100 39.880,-81.095 39.880,-81.090 39.880)'),
    ('WV:TEST:SEG:MULTI_B','WV:TEST:MULTI_B','DOD','Doddridge','public','drivable',0,null,'LINESTRING(-81.095 39.875,-81.095 39.880)'),
    ('WV:TEST:SEG:MULTI_C','WV:TEST:MULTI_C','DOD','Doddridge','public','drivable',0,null,'LINESTRING(-81.100 39.885,-81.095 39.880)'),
    ('WV:TEST:SEG:SHARED_A','WV:TEST:SHARED_A','DOD','Doddridge','public','drivable',0,null,'LINESTRING(-81.100 39.900,-81.095 39.900,-81.090 39.900)'),
    ('WV:TEST:SEG:SHARED_B','WV:TEST:SHARED_B','DOD','Doddridge','public','drivable',0,null,'LINESTRING(-81.100 39.900,-81.090 39.900)'),
    ('WV:TEST:SEG:PUBLIC','WV:TEST:PUBLIC','DOD','Doddridge','public','drivable',0,null,'LINESTRING(-81.100 39.920,-81.095 39.920,-81.090 39.920)'),
    ('WV:TEST:SEG:PRIVATE','WV:TEST:PRIVATE','DOD','Doddridge','private','drivable',0,null,'LINESTRING(-81.095 39.920,-81.095 39.925)'),
    ('WV:TEST:SEG:BOUNDARY_DOD','WV:TEST:BOUNDARY_DOD','DOD','Doddridge','public','drivable',0,null,'LINESTRING(-81.100 39.940,-81.095 39.940)'),
    ('WV:TEST:SEG:BOUNDARY_HAR','WV:TEST:BOUNDARY_HAR','HAR','Harrison','public','drivable',0,null,'LINESTRING(-81.095 39.940,-81.090 39.940)'),
    ('WV:TEST:SEG:TRAIL','WV:TEST:TRAIL','DOD','Doddridge','held','non_drivable',0,null,'LINESTRING(-81.095 39.950,-81.095 39.955)'),
    ('WV:TEST:SEG:TR7A','WV:TEST:TR_7_A','DOD','Doddridge','public','drivable',0,null,'LINESTRING(-81.100 39.970,-81.090 39.970)'),
    ('WV:TEST:SEG:TR7B','WV:TEST:TR_7_B','DOD','Doddridge','public','drivable',0,null,'LINESTRING(-81.100 39.980,-81.090 39.980)')
)
insert into public.brinesearch_authoritative_external_road_segments(
  id,dataset_id,identity_id,source_segment_key,source_record_id,state_code,
  county_code,county_name,from_measure,to_measure,z_level,bridge_status,
  public_access_status,drivable_status,geom,attributes,source_digest,active,fetched_at
)
select private_verification.brinesearch_issue97_uuid(s.segment_key),d.id,
  private_verification.brinesearch_issue97_uuid(s.identity_key),s.segment_key,s.segment_key,
  'WV',s.county_code,s.county_name,0,
  extensions.st_length(extensions.st_geomfromtext(s.wkt,4326)::extensions.geography)/1609.344,
  s.z_level,s.bridge_status,s.access_status,s.drivable_status,
  extensions.st_geomfromtext(s.wkt,4326),jsonb_build_object('synthetic_fixture',true),
  md5(s.segment_key||s.wkt),true,clock_timestamp()
from segment_rows s
cross join lateral (
  select id from public.brinesearch_road_source_datasets
  where source_key='wv_wvdot_publication_lrs'
) d;

-- Canonical road mappings must exist before the graph is built because each
-- generation snapshots the exact identity-to-road mapping it publishes.
insert into public.brinesearch_roads(
  id,canonical_name,normalized_name,road_type,state,county,aliases,
  verification_status,verified_at,route_number,source_agency,source_dataset,
  source_method,source_url,source_record_id,centerline_geojson,geometry_status,
  geometry_checked_at,approved_by_default,candidate_only,coverage_states
) values
  (private_verification.brinesearch_issue97_uuid('WV:TEST:CANONICAL:RAMP_MAIN'),
   'Ramp Main','ramp main','state_route','WV','Doddridge','{}'::text[],
   'verified',now(),'97007','Synthetic fixture','WVDOT Publication LRS',
   'official_centerline','https://fixture.invalid/issue97/ramp-main','WV:TEST:SEG:RAMP_MAIN',
   extensions.st_asgeojson(extensions.st_geomfromtext(
     'LINESTRING(-81.100 39.820,-81.095 39.820,-81.090 39.820)',4326),15)::jsonb,
   'official_centerline_loaded',now(),true,false,array['WV']),
  (private_verification.brinesearch_issue97_uuid('WV:TEST:CANONICAL:RAMP'),
   'Ramp 7A','ramp 7a','ramp','WV','Doddridge','{}'::text[],
   'verified',now(),'97007A','Synthetic fixture','WVDOT Publication LRS',
   'official_centerline','https://fixture.invalid/issue97/ramp','WV:TEST:SEG:RAMP',
   extensions.st_asgeojson(extensions.st_geomfromtext(
     'LINESTRING(-81.095 39.820,-81.092 39.825)',4326),15)::jsonb,
   'official_centerline_loaded',now(),true,false,array['WV']);

insert into public.brinesearch_road_identity_mappings(
  id,identity_id,road_id,mapping_status,mapping_method,evidence,verified_at
) values
  (private_verification.brinesearch_issue97_uuid('WV:TEST:MAPPING:RAMP_MAIN'),
   private_verification.brinesearch_issue97_uuid('WV:TEST:RAMP_MAIN'),
   private_verification.brinesearch_issue97_uuid('WV:TEST:CANONICAL:RAMP_MAIN'),
   'verified','owner_verified_source_record_id',jsonb_build_object('synthetic_fixture',true),now()),
  (private_verification.brinesearch_issue97_uuid('WV:TEST:MAPPING:RAMP'),
   private_verification.brinesearch_issue97_uuid('WV:TEST:RAMP'),
	   private_verification.brinesearch_issue97_uuid('WV:TEST:CANONICAL:RAMP'),
	   'verified','owner_verified_source_record_id',jsonb_build_object('synthetic_fixture',true),now());

do $issue97_finalize_runs$
declare
  fixture record;
  v_result jsonb;
begin
  for fixture in select * from issue97_ingest_runs order by county_code,source_key loop
    v_result:=public.brinesearch_issue97_finalize_ingest(
      fixture.run_id,jsonb_build_object('synthetic_fixture',true)
    );
    if v_result->>'status'<>'complete'
       or coalesce((v_result->>'run_bound')::boolean,false) is not true then
      raise exception '#97 receipt-derived finalizer rejected coherent run %: %',fixture.run_id,v_result;
    end if;
  end loop;
end
$issue97_finalize_runs$;

create temporary table issue97_build_results(result jsonb) on commit drop;
insert into issue97_build_results
select public.brinesearch_issue97_rebuild_county_graph('WV','DOD');

do $issue97_assert$
declare
  v_build uuid:=(select (result->>'build_id')::uuid from issue97_build_results order by ctid desc limit 1);
  v_digest text:=(select result->>'graph_digest' from issue97_build_results order by ctid desc limit 1);
  v_second jsonb;
  v_second_build uuid;
  v_activation jsonb;
begin
  v_activation:=public.brinesearch_issue97_activate_graph_build(v_build);
  if not coalesce((v_activation->>'activated')::boolean,false) then
    raise exception '#97 first validated graph generation did not activate: %',v_activation;
  end if;
  if (select count(*) from public.brinesearch_road_junctions where build_id=v_build)<>8 then
    raise exception '#97 synthetic expected 8 logical physical occurrences';
  end if;
  if (select count(*) from public.brinesearch_road_junctions
      where build_id=v_build and verification_status='held' and source_provenance->>'grade_conflict'='true')<>1 then
    raise exception '#97 source-endpoint overpass was not held exactly once';
  end if;
  if (select count(*) from public.brinesearch_road_junctions
      where build_id=v_build and junction_type='ramp' and verification_status='verified')<>1 then
    raise exception '#97 ramp regression failed';
  end if;
  if (select count(*) from public.brinesearch_road_junctions j
      where j.build_id=v_build and exists(select 1 from public.brinesearch_road_junction_memberships a
        where a.junction_id=j.id and a.identity_id=private_verification.brinesearch_issue97_uuid('WV:TEST:PAIR_A'))
      and exists(select 1 from public.brinesearch_road_junction_memberships b
        where b.junction_id=j.id and b.identity_id=private_verification.brinesearch_issue97_uuid('WV:TEST:PAIR_B')))<>2 then
    raise exception '#97 same road pair at two locations was collapsed';
  end if;
  if not exists(select 1 from public.brinesearch_road_junctions j
      where j.build_id=v_build and j.junction_type='multiway'
        and (select count(*) from public.brinesearch_road_junction_memberships m where m.junction_id=j.id)=3) then
    raise exception '#97 multiway regression failed';
  end if;
  if not exists(select 1 from public.brinesearch_road_junctions j
      where j.build_id=v_build and j.junction_type='shared_segment'
        and extensions.st_dimension(j.geom)=1
        and (select count(*) from public.brinesearch_road_junction_anchors a where a.junction_id=j.id)=2) then
    raise exception '#97 different-vertexization shared section regression failed';
  end if;
  if exists(select 1 from public.brinesearch_road_junctions p
      where p.build_id=v_build and p.junction_type<>'shared_segment'
        and extensions.st_dwithin(p.geom::extensions.geography,
          extensions.st_geomfromtext('LINESTRING(-81.100 39.900,-81.090 39.900)',4326)::extensions.geography,0.05)) then
    raise exception '#97 shared section emitted duplicate point cards';
  end if;
  if not exists(select 1 from public.brinesearch_road_junctions j
      where j.build_id=v_build and j.junction_type='continuation'
        and exists(select 1 from public.brinesearch_road_junction_memberships m
          join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
          where m.junction_id=j.id and i.county_code='HAR')) then
    raise exception '#97 cross-county continuation regression failed';
  end if;
  if not exists(select 1 from public.brinesearch_road_junctions j
      join public.brinesearch_road_junction_memberships m on m.junction_id=j.id
      join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
      where j.build_id=v_build and i.public_access_status='private') then
    raise exception '#97 private/public physical membership was lost';
  end if;
  if exists(select 1 from public.brinesearch_road_junction_memberships m
      where m.identity_id=private_verification.brinesearch_issue97_uuid('WV:TEST:TRAIL')) then
    raise exception '#97 non-drivable trail entered the routable graph';
  end if;
  if (select count(*) from public.brinesearch_authoritative_road_identities
      where source_identity_key in ('WV:TEST:TR_7_A','WV:TEST:TR_7_B'))<>2 then
    raise exception '#97 same route number in different townships was collapsed';
  end if;
  if exists(select 1 from public.brinesearch_road_junctions j
      where j.build_id=v_build and exists(select 1 from public.brinesearch_road_junction_memberships a
        where a.junction_id=j.id and a.identity_id=private_verification.brinesearch_issue97_uuid('WV:TEST:SAME_NAME_A'))
      and exists(select 1 from public.brinesearch_road_junction_memberships b
        where b.junction_id=j.id and b.identity_id=private_verification.brinesearch_issue97_uuid('WV:TEST:SAME_NAME_B'))) then
    raise exception '#97 unrelated same-name roads acquired a junction';
  end if;

  v_second:=public.brinesearch_issue97_rebuild_county_graph('WV','DOD');
  if v_second->>'graph_digest'<>v_digest then
    raise exception '#97 graph digest is not deterministic';
  end if;
  v_second_build:=(v_second->>'build_id')::uuid;
  v_activation:=public.brinesearch_issue97_activate_graph_build(v_second_build);
  if not coalesce((v_activation->>'activated')::boolean,false) then
    raise exception '#97 second validated graph generation did not activate: %',v_activation;
  end if;
  if (select count(*) from public.brinesearch_road_graph_builds
      where state_code='WV' and county_code='DOD' and status='active')<>1
     or (select count(*) from public.brinesearch_road_graph_builds
      where state_code='WV' and county_code='DOD' and status='retired')<1 then
    raise exception '#97 immutable build activation/retirement regression failed';
  end if;
end
$issue97_assert$;

-- Automatic Google Maps manifest: exact clipped occurrences + the current
-- graph anchor + authoritative shaping + saved pad GPS produce a ready public
-- receipt without any manually authored URL.
-- This disposable fixture exercises the post-cutover path directly; the live
-- cutover function remains fail-closed on the reviewed 16,109-key baseline.
update public.brinesearch_issue97_release_state
set cutover_at=now(),review_details=jsonb_build_object(
  'synthetic_fixture',true,'verification_report_digest',repeat('a',32)
),updated_at=now()
where singleton;

insert into public.pads(
  id,legacy_id,company,state,pad_name,record_type,latitude,longitude,county,
  structured_road_sequence,road_sequence_status,structured_route_revision
) values (
  private_verification.brinesearch_issue97_uuid('WV:TEST:GOOGLE:PAD'),
  'issue97--google-route-fixture','Issue 97','WV','GOOGLE ROUTE FIXTURE','pad',
  39.825,-81.092,'Doddridge','Ramp Main → Ramp 7A','owner_verified',1
);

insert into public.brinesearch_pad_roads(
  id,pad_id,road_id,route_group,step_order,instruction,distance_miles,
  route_variant_index,turn_direction,distance_source,distance_status,
  source_details,match_confidence,route_step_id,step_geometry,step_aliases,
  geometry_source,geometry_source_record_id,geometry_status,geometry_version,
  inbound_turn,route_revision,road_geometry_digest,road_geometry_checked_at,
  road_source_method,entry_junction_id,entry_junction_anchor_id,
  junction_build_id,junction_digest
)
select
  private_verification.brinesearch_issue97_uuid('WV:TEST:GOOGLE:STEP:1'),
  private_verification.brinesearch_issue97_uuid('WV:TEST:GOOGLE:PAD'),r.id,
  'primary',1,'Take Ramp Main',
  extensions.st_length(g.geom::extensions.geography)/1609.344,0,null,
  'clipped_step_geometry','map_measured',jsonb_build_object('synthetic_fixture',true),1,
  private_verification.brinesearch_issue97_uuid('WV:TEST:GOOGLE:OCCURRENCE:1'),
  g.geom,'{}'::text[],'road_manager_clip_issue69',r.source_record_id,
  'snapped_intersections',1,'right',1,md5(r.centerline_geojson::text),now(),
  r.source_method,null,null,null,null
from public.brinesearch_roads r
cross join lateral (select extensions.st_geomfromtext(
  'LINESTRING(-81.100 39.820,-81.095 39.820)',4326) as geom) g
where r.id=private_verification.brinesearch_issue97_uuid('WV:TEST:CANONICAL:RAMP_MAIN')
union all
select
  private_verification.brinesearch_issue97_uuid('WV:TEST:GOOGLE:STEP:2'),
  private_verification.brinesearch_issue97_uuid('WV:TEST:GOOGLE:PAD'),r.id,
  'primary',2,'Merge onto Ramp 7A',
  extensions.st_length(g.geom::extensions.geography)/1609.344,0,'merge_right',
  'clipped_step_geometry','map_measured',jsonb_build_object('synthetic_fixture',true),1,
  private_verification.brinesearch_issue97_uuid('WV:TEST:GOOGLE:OCCURRENCE:2'),
  g.geom,'{}'::text[],'road_manager_clip_issue69',r.source_record_id,
  'snapped_intersections',1,null,1,md5(r.centerline_geojson::text),now(),
  r.source_method,j.id,a.id,b.id,j.graph_digest
from public.brinesearch_roads r
cross join lateral (select extensions.st_geomfromtext(
  'LINESTRING(-81.095 39.820,-81.092 39.825)',4326) as geom) g
join public.brinesearch_road_graph_builds b
  on b.state_code='WV' and b.county_code='DOD' and b.status='active'
join public.brinesearch_road_junctions j
  on j.build_id=b.id and j.junction_type='ramp' and j.verification_status='verified'
join public.brinesearch_road_junction_anchors a
  on a.junction_id=j.id and a.anchor_role='point'
where r.id=private_verification.brinesearch_issue97_uuid('WV:TEST:CANONICAL:RAMP');

do $issue97_google_route$
declare
  v_pad uuid:=private_verification.brinesearch_issue97_uuid('WV:TEST:GOOGLE:PAD');
  v_result jsonb;
  v_manifest jsonb;
begin
  v_result:=private_verification.brinesearch_issue97_refresh_google_route(v_pad);
  if coalesce((v_result->>'route_ready')::boolean,false) is not true then
    raise exception '#97 exact route did not generate a ready Google manifest: %',v_result;
  end if;
  select manifest into strict v_manifest
  from public.brinesearch_driver_google_routes_public where pad_id=v_pad;
  if v_manifest->>'manifest_version'<>'issue97-google-v1'
     or (v_manifest->'points'->-1)->>'kind'<>'pad_destination'
     or (v_manifest->'points'->-1)->>'latitude'<>'39.825'
     or (v_manifest->'points'->-1)->>'longitude'<>'-81.092'
     or not exists(select 1 from jsonb_array_elements(v_manifest->'points') p
       where p->>'kind'='junction' and p->>'source_kind'='authoritative_junction_anchor')
     or not exists(select 1 from jsonb_array_elements(v_manifest->'points') p
       where p->>'kind'='shape' and p->>'source_kind'='authoritative_clipped_geometry') then
    raise exception '#97 generated Google manifest lost exact coordinates or provenance: %',v_manifest;
  end if;

  update public.brinesearch_road_identity_mappings
  set evidence=evidence||jsonb_build_object('dependency_changed',true),updated_at=now()
  where identity_id=private_verification.brinesearch_issue97_uuid('WV:TEST:RAMP');
  if exists(select 1 from public.brinesearch_driver_google_routes_public where pad_id=v_pad)
     or not exists(select 1 from private_verification.brinesearch_google_route_receipts_issue97
       where pad_id=v_pad and status='stale' and hold_reason='road_identity_mapping_changed') then
    raise exception '#97 dependency change did not remove/stale the public Google route';
  end if;
end
$issue97_google_route$;

rollback;
