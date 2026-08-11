-- GitHub #97 — authoritative road identities, physical junctions and connections.
--
-- This migration deliberately keeps public.brinesearch_roads as the small,
-- route-facing canonical layer. Ohio source segments continue to live in the
-- existing public.brinesearch_odot_road_catalog. Only WV/PA source segments are
-- landed in the new external-segment table; the normalized view below unions
-- those rows with ODOT without copying Ohio geometry.
--
-- Source ingestion and graph rebuild functions are service-role only. Editors
-- read bounded, curated data through the RPCs near the end of this migration.
-- No topology decision uses a road name, nearest-road guess or raw geometric
-- crossing. Point junctions require a shared authoritative vertex plus a source
-- endpoint/at-grade node. Shared road sections retain line geometry and anchors.

create schema if not exists private_verification;
create extension if not exists pg_trgm with schema extensions;

create or replace function private_verification.brinesearch_issue97_uuid(p_value text)
returns uuid
language sql
immutable
strict
set search_path=''
as $$
  select (
    pg_catalog.substr(pg_catalog.md5(p_value),1,8)||'-'||
    pg_catalog.substr(pg_catalog.md5(p_value),9,4)||'-'||
    pg_catalog.substr(pg_catalog.md5(p_value),13,4)||'-'||
    pg_catalog.substr(pg_catalog.md5(p_value),17,4)||'-'||
    pg_catalog.substr(pg_catalog.md5(p_value),21,12)
  )::uuid
$$;

revoke all on function private_verification.brinesearch_issue97_uuid(text)
from public,anon,authenticated,service_role;

create table public.brinesearch_road_graph_counties (
  state_code text not null,
  county_code text not null,
  county_name text not null,
  county_geoid text not null,
  source_county_code text not null,
  source_county_code_kind text not null,
  active boolean not null default true,
  added_at timestamptz not null default now(),
  primary key(state_code,county_code),
  unique(state_code,county_name),
  unique(county_geoid),
  constraint brinesearch_road_graph_counties_state_check
    check(state_code in ('OH','WV','PA')),
  constraint brinesearch_road_graph_counties_geoid_check
    check(county_geoid ~ '^[0-9]{5}$')
);

insert into public.brinesearch_road_graph_counties(
  state_code,county_code,county_name,county_geoid,source_county_code,source_county_code_kind
) values
  ('OH','ATH','Athens','39009','ATH','ODOT COUNTY_CD'),
  ('OH','BEL','Belmont','39013','BEL','ODOT COUNTY_CD'),
  ('OH','CAR','Carroll','39019','CAR','ODOT COUNTY_CD'),
  ('OH','COL','Columbiana','39029','COL','ODOT COUNTY_CD'),
  ('OH','COS','Coshocton','39031','COS','ODOT COUNTY_CD'),
  ('OH','GUE','Guernsey','39059','GUE','ODOT COUNTY_CD'),
  ('OH','HAS','Harrison','39067','HAS','ODOT COUNTY_CD'),
  ('OH','HOL','Holmes','39075','HOL','ODOT COUNTY_CD'),
  ('OH','JEF','Jefferson','39081','JEF','ODOT COUNTY_CD'),
  ('OH','LIC','Licking','39089','LIC','ODOT COUNTY_CD'),
  ('OH','MAH','Mahoning','39099','MAH','ODOT COUNTY_CD'),
  ('OH','MOE','Monroe','39111','MOE','ODOT COUNTY_CD'),
  ('OH','MUS','Muskingum','39119','MUS','ODOT COUNTY_CD'),
  ('OH','NOB','Noble','39121','NOB','ODOT COUNTY_CD'),
  ('OH','POR','Portage','39133','POR','ODOT COUNTY_CD'),
  ('OH','STA','Stark','39151','STA','ODOT COUNTY_CD'),
  ('OH','TRU','Trumbull','39155','TRU','ODOT COUNTY_CD'),
  ('OH','TUS','Tuscarawas','39157','TUS','ODOT COUNTY_CD'),
  ('OH','WAS','Washington','39167','WAS','ODOT COUNTY_CD'),
  ('WV','BRO','Brooke','54009','05','WVDOT CO_CountyID'),
  ('WV','DOD','Doddridge','54017','09','WVDOT CO_CountyID'),
  ('WV','HAR','Harrison','54033','17','WVDOT CO_CountyID'),
  ('WV','MAR','Marion','54049','25','WVDOT CO_CountyID / Route ID prefix'),
  ('WV','MSH','Marshall','54051','26','WVDOT CO_CountyID / Route ID prefix'),
  ('WV','MON','Monongalia','54061','31','WVDOT CO_CountyID'),
  ('WV','OHI','Ohio','54069','35','WVDOT CO_CountyID'),
  ('WV','RIT','Ritchie','54085','43','WVDOT CO_CountyID'),
  ('WV','TYL','Tyler','54095','48','WVDOT CO_CountyID'),
  ('WV','WET','Wetzel','54103','52','WVDOT CO_CountyID'),
  ('PA','ALL','Allegheny','42003','02','PennDOT COUNTY_NUM/CTY_CODE'),
  ('PA','ARM','Armstrong','42005','03','PennDOT COUNTY_NUM/CTY_CODE'),
  ('PA','BEA','Beaver','42007','04','PennDOT COUNTY_NUM/CTY_CODE'),
  ('PA','BRA','Bradford','42015','08','PennDOT COUNTY_NUM/CTY_CODE'),
  ('PA','BUT','Butler','42019','10','PennDOT COUNTY_NUM/CTY_CODE'),
  ('PA','FAY','Fayette','42051','26','PennDOT COUNTY_NUM/CTY_CODE'),
  ('PA','GRE','Greene','42059','30','PennDOT COUNTY_NUM/CTY_CODE'),
  ('PA','IND','Indiana','42063','32','PennDOT COUNTY_NUM/CTY_CODE'),
  ('PA','WAS','Washington','42125','62','PennDOT COUNTY_NUM/CTY_CODE'),
  ('PA','WES','Westmoreland','42129','64','PennDOT COUNTY_NUM/CTY_CODE')
on conflict(state_code,county_code) do update set
  county_name=excluded.county_name,
  county_geoid=excluded.county_geoid,
  source_county_code=excluded.source_county_code,
  source_county_code_kind=excluded.source_county_code_kind,
  active=true;

create table public.brinesearch_road_source_datasets (
  id uuid primary key,
  source_key text not null unique,
  state_code text not null,
  source_agency text not null,
  source_dataset text not null,
  source_layer text not null,
  source_version text not null,
  source_url text not null,
  authority_rank integer not null,
  topology_role text not null,
  active boolean not null default true,
  fetched_at timestamptz,
  source_timestamp timestamptz,
  content_digest text,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brinesearch_road_source_datasets_state_check
    check(state_code in ('OH','WV','PA')),
  constraint brinesearch_road_source_datasets_rank_check
    check(authority_rank between 1 and 1000),
  constraint brinesearch_road_source_datasets_https_check
    check(source_url like 'https://%'),
  constraint brinesearch_road_source_datasets_role_check
    check(topology_role in ('primary_network','official_names','at_grade_nodes','supplemental_aliases'))
);

insert into public.brinesearch_road_source_datasets(
  id,source_key,state_code,source_agency,source_dataset,source_layer,
  source_version,source_url,authority_rank,topology_role,provenance
) values
  (private_verification.brinesearch_issue97_uuid('dataset:oh_odot_tims_road_inventory'),
   'oh_odot_tims_road_inventory','OH','Ohio Department of Transportation',
   'TIMS Road Inventory','FeatureServer/0','live-current',
   'https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0',
   100,'primary_network',jsonb_build_object('raw_table','public.brinesearch_odot_road_catalog','issue',97)),
  (private_verification.brinesearch_issue97_uuid('dataset:wv_wvdot_publication_lrs'),
   'wv_wvdot_publication_lrs','WV','West Virginia Division of Highways',
   'Publication LRS','County_Milepoint MapServer/89','live-current',
   'https://gis.transportation.wv.gov/arcgis/rest/services/Roads_And_Highways/Publication_LRS/MapServer/89',
   100,'primary_network',jsonb_build_object('identity_field','CO_ROUTEID','measure_network','County_Milepoint')),
  (private_verification.brinesearch_issue97_uuid('dataset:wv_wvdot_street_name_doh'),
   'wv_wvdot_street_name_doh','WV','West Virginia Division of Highways',
   'Publication LRS','Street Name DOH MapServer/117','live-current',
   'https://gis.transportation.wv.gov/arcgis/rest/services/Roads_And_Highways/Publication_LRS/MapServer/117',
   100,'official_names',jsonb_build_object('identity_field','ROUTE_ID','measure_fields',jsonb_build_array('FROM_MEASURE','TO_MEASURE'))),
  (private_verification.brinesearch_issue97_uuid('dataset:wv_wvdot_street_name_sams'),
   'wv_wvdot_street_name_sams','WV','West Virginia Division of Highways',
   'Publication LRS','Street Name SAMS MapServer/118','live-current',
   'https://gis.transportation.wv.gov/arcgis/rest/services/Roads_And_Highways/Publication_LRS/MapServer/118',
   95,'supplemental_aliases',jsonb_build_object('identity_field','ROUTE_ID','name_type','911_local')),
  (private_verification.brinesearch_issue97_uuid('dataset:wv_wvdot_alternate_route_name'),
   'wv_wvdot_alternate_route_name','WV','West Virginia Division of Highways',
   'Publication LRS','Alternate Route Name MapServer/4','live-current',
   'https://gis.transportation.wv.gov/arcgis/rest/services/Roads_And_Highways/Publication_LRS/MapServer/4',
   95,'supplemental_aliases',jsonb_build_object('identity_field','ROUTE_ID','name_type','alternate')),
  (private_verification.brinesearch_issue97_uuid('dataset:pa_penndot_state_roads'),
   'pa_penndot_state_roads','PA','Pennsylvania Department of Transportation',
   'PennDOT RMS Roadway','Pa State Roads MapServer/4','2026_07',
   'https://mapservices.pasda.psu.edu/server/rest/services/pasda/PennDOT/MapServer/4',
   100,'primary_network',jsonb_build_object(
     'internal_identity','NLF_ID',
     'internal_route_field','T_RT_NO',
     'signed_fields',jsonb_build_array(
       'TRAF_RT_NO','TRAF_RT__1','TRAF_RT__2',
       'TRAF_RT__3','TRAF_RT__4','TRAF_RT__5',
       'TRAF_RT__6','TRAF_RT__7','TRAF_RT__8'
     )
   )),
  (private_verification.brinesearch_issue97_uuid('dataset:pa_penndot_local_roads'),
   'pa_penndot_local_roads','PA','Pennsylvania Department of Transportation',
   'PennDOT Local Roads','Pa Local Roads MapServer/3','2026_07',
   'https://mapservices.pasda.psu.edu/server/rest/services/pasda/PennDOT/MapServer/3',
   100,'primary_network',jsonb_build_object('identity_fields',jsonb_build_array('CTY_CODE','MUN_ID','LR_ID','LR_RT_NO'))),
  (private_verification.brinesearch_issue97_uuid('dataset:pa_penndot_at_grade_intersections'),
   'pa_penndot_at_grade_intersections','PA','Pennsylvania Department of Transportation',
   'PennDOT RMS Roadway','Pa At Grade Intersections MapServer/23','2026_07',
   'https://mapservices.pasda.psu.edu/server/rest/services/pasda/PennDOT/MapServer/23',
   100,'at_grade_nodes',jsonb_build_object('node_field','NODE_ID','route_field','T_RT_NO',
     'segment_field','SEG_NO','county_filter','CTY_CODE','purpose','reject grade-separated crossings')),
  (private_verification.brinesearch_issue97_uuid('dataset:oh_ogrip_lbrs_centerlines'),
   'oh_ogrip_lbrs_centerlines','OH','Ohio Geographically Referenced Information Program',
   'Statewide LBRS Road Centerlines','FeatureServer/0','live-current',
   'https://maps.ohio.gov/arcgis/rest/services/Hosted/Ohio_Statewide_LBRS_Centerlines/FeatureServer/0',
   95,'supplemental_aliases',jsonb_build_object(
     'official_item','f32714e2c6b94f6894bab0b33268180c','record_field','objectid',
     'stable_record_field','seg_id','route_linkage_field','nlfid',
     'current_name_fields',jsonb_build_array('str_pre','str_name','str_type','str_suffix'),
     'county_fields',jsonb_build_array('laddcounty','raddcounty'),
     'jurisdiction_fields',jsonb_build_array('l_twp','r_twp','l_dotmuni','r_dotmuni'),
     'route_measure_fields',jsonb_build_array('rd_num','cardinal','nlfid','beg_log','end_log'),
     'classification_evidence_fields',jsonb_build_array('jurisdic','stype','dir_trav'),
     'retained_qa_fields',jsonb_build_array('ldotcounty','rdotcounty','l_fips','r_fips'),
     'blank_classification_rule','unknown; never infer public or drivable',
     'topology_use','supplemental geometry equivalence only')),
  (private_verification.brinesearch_issue97_uuid('dataset:pa_allegheny_ng911_centerlines'),
   'pa_allegheny_ng911_centerlines','PA','Allegheny County',
   'Allegheny County Street Centerlines','MapServer/7','2026_07_27',
   'https://mapservices.pasda.psu.edu/server/rest/services/pasda/AlleghenyCounty/MapServer/7',
   95,'supplemental_aliases',jsonb_build_object('oid_field','OBJECTID','record_field','FEATURE_KE','key_scope','source version',
     'name_field','FULL_NAME','grade_fields',jsonb_build_array('F_ZLEV','T_ZLEV'))),
  (private_verification.brinesearch_issue97_uuid('dataset:pa_bradford_ng911_centerlines'),
   'pa_bradford_ng911_centerlines','PA','Bradford County',
   'Bradford County Road Centerlines','MapServer/3','2025_11',
   'https://mapservices.pasda.psu.edu/server/rest/services/pasda/BradfordCounty/MapServer/3',
   95,'supplemental_aliases',jsonb_build_object('oid_field','OBJECTID_12','record_field','RCL_NGUID','name_field','StreetName',
     'legacy_fields',jsonb_build_array('LSt_Name','Alias'))),
  (private_verification.brinesearch_issue97_uuid('dataset:pa_butler_centerlines'),
   'pa_butler_centerlines','PA','Butler County',
   'Butler County Road Centerlines','MapServer/1','2023_04',
   'https://mapservices.pasda.psu.edu/server/rest/services/pasda/ButlerCounty/MapServer/1',
   90,'supplemental_aliases',jsonb_build_object('oid_field','OBJECTID','record_field','OBJECTID','key_scope','source version',
     'name_field','FULLNAME','classification_fields',jsonb_build_array('RoadClass','OneWay','SpeedLimit'))),
  (private_verification.brinesearch_issue97_uuid('dataset:pa_fayette_ng911_centerlines'),
   'pa_fayette_ng911_centerlines','PA','Fayette County',
   'Fayette County Road Centerlines','MapServer/6','2026_02',
   'https://mapservices.pasda.psu.edu/server/rest/services/pasda/FayetteCounty/MapServer/6',
   95,'supplemental_aliases',jsonb_build_object('oid_field','OBJECTID_12','record_field','RCL_NGUID','name_field','St_Name',
     'linkage_fields',jsonb_build_array('NLF_ID','NLF_BGN','NLF_END','ST_RT_NO','LocalRoute'))),
  (private_verification.brinesearch_issue97_uuid('dataset:pa_indiana_ng911_centerlines'),
   'pa_indiana_ng911_centerlines','PA','Indiana County',
   'Indiana County Road Centerlines','MapServer/0','2026_05',
   'https://mapservices.pasda.psu.edu/server/rest/services/pasda/IndianaCounty/MapServer/0',
   95,'supplemental_aliases',jsonb_build_object('oid_field','OBJECTID','record_field','RCL_NGUID','name_fields',jsonb_build_array('ST_NAME','ALIAS'))),
  (private_verification.brinesearch_issue97_uuid('dataset:pa_washington_ng911_centerlines'),
   'pa_washington_ng911_centerlines','PA','Washington County Department of Public Safety',
   'Washington County Road Centerlines','MapServer/3','2026_08',
   'https://mapservices.pasda.psu.edu/server/rest/services/pasda/WashingtonCounty/MapServer/3',
   100,'supplemental_aliases',jsonb_build_object('oid_field','OBJECTID','record_field','RCL_NGUID',
     'current_name_fields',jsonb_build_array('St_PreMod','St_PreDir','St_PreTyp','St_PreSep','St_Name','St_PosTyp','St_PosDir','St_PosMod'),
     'legacy_name_fields',jsonb_build_array('Lst_PreDir','LSt_Name','LSt_Type','LSt_PosDir'),
     'municipality_fields',jsonb_build_array('IncMuni_L','IncMuni_R','MSAGComm_L','MSAGComm_R'),
     'lifecycle_fields',jsonb_build_array('DateUpdate','Effective','Expire'))),
  (private_verification.brinesearch_issue97_uuid('dataset:us_census_tiger_roads_qa_oh'),
   'us_census_tiger_roads_qa_oh','OH','United States Census Bureau',
   'TIGER/Line Roads','annual county files','2026',
   'https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html',
   10,'supplemental_aliases',jsonb_build_object('qa_only',true,'topology_authority',false,
     'must_never_override_official',true)),
  (private_verification.brinesearch_issue97_uuid('dataset:us_census_tiger_roads_qa_wv'),
   'us_census_tiger_roads_qa_wv','WV','United States Census Bureau',
   'TIGER/Line Roads','annual county files','2026',
   'https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html',
   10,'supplemental_aliases',jsonb_build_object('qa_only',true,'topology_authority',false,
     'must_never_override_official',true)),
  (private_verification.brinesearch_issue97_uuid('dataset:us_census_tiger_roads_qa_pa'),
   'us_census_tiger_roads_qa_pa','PA','United States Census Bureau',
   'TIGER/Line Roads','annual county files','2026',
   'https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html',
   10,'supplemental_aliases',jsonb_build_object('qa_only',true,'topology_authority',false,
     'must_never_override_official',true))
on conflict(source_key) do update set
  source_version=excluded.source_version,
  source_url=excluded.source_url,
  authority_rank=excluded.authority_rank,
  topology_role=excluded.topology_role,
  provenance=excluded.provenance,
  active=true,
  updated_at=now();

alter table public.brinesearch_road_source_datasets
  add constraint brinesearch_road_source_datasets_id_state_unique unique(id,state_code);

-- A source applies only to its declared county scopes. This prevents a county
-- Public Safety feed from being required in every Pennsylvania county and lets
-- registry-only TIGER QA remain visible without entering authoritative builds.
create table public.brinesearch_road_source_dataset_counties (
  dataset_id uuid not null references public.brinesearch_road_source_datasets(id),
  state_code text not null,
  county_code text not null,
  ingest_enabled boolean not null default true,
  required_for_graph boolean not null default true,
  active boolean not null default true,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(dataset_id,state_code,county_code),
  foreign key(dataset_id,state_code)
    references public.brinesearch_road_source_datasets(id,state_code),
  foreign key(state_code,county_code)
    references public.brinesearch_road_graph_counties(state_code,county_code)
);

insert into public.brinesearch_road_source_dataset_counties(
  dataset_id,state_code,county_code,ingest_enabled,required_for_graph,provenance
)
select d.id,c.state_code,c.county_code,true,true,
  pg_catalog.jsonb_build_object('scope_rule','all active issue-97 counties in source state')
from public.brinesearch_road_source_datasets d
join public.brinesearch_road_graph_counties c on c.state_code=d.state_code and c.active
where d.source_key in (
  'oh_odot_tims_road_inventory',
  'wv_wvdot_publication_lrs','wv_wvdot_street_name_doh',
  'wv_wvdot_street_name_sams','wv_wvdot_alternate_route_name',
  'pa_penndot_state_roads','pa_penndot_local_roads','pa_penndot_at_grade_intersections'
)
on conflict(dataset_id,state_code,county_code) do update set
  ingest_enabled=true,required_for_graph=true,active=true,
  provenance=excluded.provenance,updated_at=now();

-- Supplemental feeds remain registry-only until their loaders can prove every
-- landed occurrence is either exact-mapped or explicitly held. They never
-- block or create authoritative topology in this release.
insert into public.brinesearch_road_source_dataset_counties(
  dataset_id,state_code,county_code,ingest_enabled,required_for_graph,provenance
)
select d.id,c.state_code,c.county_code,false,false,
  pg_catalog.jsonb_build_object(
    'scope_rule','official statewide LBRS supplemental coverage',
    'topology_authority',false,'geometry_mapping_required',true
  )
from public.brinesearch_road_source_datasets d
join public.brinesearch_road_graph_counties c on c.state_code='OH' and c.active
where d.source_key='oh_ogrip_lbrs_centerlines'
on conflict(dataset_id,state_code,county_code) do update set
  ingest_enabled=false,required_for_graph=false,active=true,
  provenance=excluded.provenance,updated_at=now();

insert into public.brinesearch_road_source_dataset_counties(
  dataset_id,state_code,county_code,ingest_enabled,required_for_graph,provenance
)
select d.id,'PA',scope.county_code,false,false,
  pg_catalog.jsonb_build_object(
    'scope_rule','official county/NG911 centerline availability',
    'official_county_centerline_available',true,'geometry_mapping_required',true
  )
from (values
  ('pa_allegheny_ng911_centerlines','ALL'),('pa_bradford_ng911_centerlines','BRA'),
  ('pa_butler_centerlines','BUT'),('pa_fayette_ng911_centerlines','FAY'),
  ('pa_indiana_ng911_centerlines','IND'),('pa_washington_ng911_centerlines','WAS')
) scope(source_key,county_code)
join public.brinesearch_road_source_datasets d on d.source_key=scope.source_key
on conflict(dataset_id,state_code,county_code) do update set
  ingest_enabled=false,required_for_graph=false,active=true,
  provenance=excluded.provenance,updated_at=now();

insert into public.brinesearch_road_source_dataset_counties(
  dataset_id,state_code,county_code,ingest_enabled,required_for_graph,provenance
)
select d.id,c.state_code,c.county_code,false,false,
  pg_catalog.jsonb_build_object('scope_rule','QA registry only; never authoritative topology')
from public.brinesearch_road_source_datasets d
join public.brinesearch_road_graph_counties c on c.state_code=d.state_code and c.active
where d.source_key in (
  'us_census_tiger_roads_qa_oh','us_census_tiger_roads_qa_wv','us_census_tiger_roads_qa_pa'
)
on conflict(dataset_id,state_code,county_code) do update set
  ingest_enabled=false,required_for_graph=false,active=true,
  provenance=excluded.provenance,updated_at=now();

-- The existing Ohio catalog is reused, but issue #97 needs an explicit source
-- lifecycle bit so a full refresh can retire records removed upstream without
-- deleting audit history or leaving stale geometry in the active graph.
alter table public.brinesearch_odot_road_catalog
  add column if not exists source_active boolean not null default true;
-- Historical production rows tagged HAR are Hardin County. Harrison's official
-- TIMS/LBRS code is HAS, so quarantine HAR from the 39-county graph footprint.
update public.brinesearch_odot_road_catalog set source_active=false
where county_code='HAR' and source_active;
create index if not exists brinesearch_odot_road_catalog_active_scope_idx
  on public.brinesearch_odot_road_catalog(county_code,source_active,nlf_id);

create table public.brinesearch_authoritative_road_identities (
  id uuid primary key,
  dataset_id uuid not null references public.brinesearch_road_source_datasets(id),
  source_identity_key text not null unique,
  state_code text not null,
  county_code text not null,
  county_name text not null,
  township text,
  municipality text,
  route_system text,
  route_number text,
  route_suffix text,
  route_fraction text,
  route_extension text,
  display_name text not null,
  normalized_name text not null,
  road_class text not null,
  public_access_status text not null,
  drivable_status text not null,
  maintainer text,
  surface text,
  truck_status text,
  source_record_ids text[] not null default '{}'::text[],
  attributes jsonb not null default '{}'::jsonb,
  source_digest text not null,
  source_timestamp timestamptz,
  active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint brinesearch_authoritative_road_identities_state_check
    check(state_code in ('OH','WV','PA')),
  constraint brinesearch_authoritative_road_identities_access_check
    check(public_access_status in ('public','private','access','unknown','held')),
  constraint brinesearch_authoritative_road_identities_drivable_check
    check(drivable_status in ('drivable','non_drivable','held'))
);

create table public.brinesearch_authoritative_road_names (
  id bigint generated always as identity primary key,
  identity_id uuid not null references public.brinesearch_authoritative_road_identities(id) on delete cascade,
  source_dataset_id uuid not null references public.brinesearch_road_source_datasets(id),
  source_record_id text not null,
  name_type text not null,
  road_name text not null,
  normalized_name text not null,
  source_segment_key text,
  from_measure numeric,
  to_measure numeric,
  valid_from timestamptz,
  valid_to timestamptz,
  provenance jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(identity_id,source_dataset_id,source_record_id,name_type,road_name),
  constraint brinesearch_authoritative_road_names_type_check
    check(name_type in ('official','signed','local','911','legacy','alternate','internal')),
  constraint brinesearch_authoritative_road_names_measure_check
    check((from_measure is null and to_measure is null)
      or (from_measure is not null and to_measure is not null))
);

create table public.brinesearch_road_source_ingest_runs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  dataset_id uuid not null references public.brinesearch_road_source_datasets(id),
  state_code text not null,
  county_code text not null,
  status text not null default 'loading',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  page_count integer not null default 0,
  source_row_count integer not null default 0,
  ingested_row_count integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  constraint brinesearch_road_source_ingest_runs_state_check check(state_code in ('OH','WV','PA')),
  constraint brinesearch_road_source_ingest_runs_status_check
    check(status in ('loading','complete','failed','superseded')),
  foreign key(state_code,county_code)
    references public.brinesearch_road_graph_counties(state_code,county_code)
);

create unique index brinesearch_road_source_one_loading_run_idx
on public.brinesearch_road_source_ingest_runs(dataset_id,state_code,county_code)
where status='loading';

create table public.brinesearch_road_source_ingest_pages (
  run_id uuid not null references public.brinesearch_road_source_ingest_runs(id) on delete cascade,
  page_offset integer not null,
  requested_limit integer not null,
  source_row_count integer not null,
  ingested_row_count integer not null,
  rejected_row_count integer not null,
  has_more boolean not null,
  page_digest text not null,
  result jsonb not null,
  completed_at timestamptz not null default now(),
  primary key(run_id,page_offset),
  constraint brinesearch_road_source_ingest_pages_offset_check check(page_offset>=0),
  constraint brinesearch_road_source_ingest_pages_limit_check check(requested_limit between 1 and 2000),
  constraint brinesearch_road_source_ingest_pages_counts_check check(
    source_row_count>=0 and ingested_row_count>=0 and rejected_row_count>=0
    and ingested_row_count+rejected_row_count=source_row_count
  ),
  constraint brinesearch_road_source_ingest_pages_digest_check check(page_digest~'^[0-9a-f]{32}$')
);

create index brinesearch_road_source_ingest_pages_terminal_idx
on public.brinesearch_road_source_ingest_pages(run_id,has_more,page_offset);

create or replace function private_verification.brinesearch_issue97_ingest_run_verified(p_run_id uuid)
returns boolean
language sql
stable
set search_path=''
as $$
  select coalesce((
    select r.status='complete'
      and coalesce((r.details->>'run_bound')::boolean,false)
      and coalesce((r.details->>'coverage_receipts_verified')::boolean,false)
      and r.page_count=receipt.page_count
      and r.source_row_count=receipt.source_row_count
      and r.ingested_row_count=receipt.ingested_row_count
      and receipt.page_count>0
      and receipt.terminal_count=1
      and receipt.terminal_offset=receipt.maximum_offset
      and not exists(
        with ordered as (
          select p.page_offset,p.requested_limit,
            pg_catalog.lag(p.page_offset+p.requested_limit)
              over(order by p.page_offset) as expected_offset,
            pg_catalog.row_number() over(order by p.page_offset) as ordinal
          from public.brinesearch_road_source_ingest_pages p where p.run_id=r.id
        )
        select 1 from ordered where (ordinal=1 and page_offset<>0)
          or (ordinal>1 and page_offset<>expected_offset)
      )
      and r.source_row_count=coalesce((r.details->>'expected_source_rows')::integer,-1)
      and (r.details->>'page_set_digest')=receipt.page_set_digest
    from public.brinesearch_road_source_ingest_runs r
    cross join lateral (
      select count(*)::integer as page_count,
        coalesce(sum(p.source_row_count),0)::integer as source_row_count,
        coalesce(sum(p.ingested_row_count),0)::integer as ingested_row_count,
        count(*) filter(where not p.has_more)::integer as terminal_count,
        max(p.page_offset) filter(where not p.has_more) as terminal_offset,
        max(p.page_offset) as maximum_offset,
        pg_catalog.md5(coalesce(pg_catalog.string_agg(
          p.page_offset::text||':'||p.page_digest,',' order by p.page_offset
        ),'')) as page_set_digest
      from public.brinesearch_road_source_ingest_pages p where p.run_id=r.id
    ) receipt
    where r.id=p_run_id
  ),false)
$$;

revoke all on function private_verification.brinesearch_issue97_ingest_run_verified(uuid)
from public,anon,authenticated,service_role;

create table public.brinesearch_authoritative_external_road_segments (
  id uuid primary key,
  dataset_id uuid not null references public.brinesearch_road_source_datasets(id),
  identity_id uuid not null references public.brinesearch_authoritative_road_identities(id) on delete cascade,
  source_segment_key text not null unique,
  source_record_id text not null,
  state_code text not null,
  county_code text not null,
  county_name text not null,
  township text,
  municipality text,
  from_measure numeric,
  to_measure numeric,
  route_direction text,
  z_level integer,
  bridge_status text,
  tunnel_status text,
  public_access_status text not null,
  drivable_status text not null,
  geom extensions.geometry(Geometry,4326) not null,
  attributes jsonb not null default '{}'::jsonb,
  source_digest text not null,
  source_timestamp timestamptz,
  active boolean not null default true,
  fetched_at timestamptz not null default now(),
  constraint brinesearch_authoritative_external_segments_state_check
    check(state_code in ('WV','PA')),
  constraint brinesearch_authoritative_external_segments_line_check
    check(extensions.st_dimension(geom)=1 and not extensions.st_isempty(geom)
      and extensions.st_isvalid(geom) and extensions.st_issimple(geom)
      and extensions.st_coveredby(geom,extensions.st_makeenvelope(-180,-90,180,90,4326))),
  -- LRS direction is source-authored. Some valid routes run from a larger
  -- measure to a smaller measure, so the two values must not be reordered or
  -- constrained into an invented ascending direction.
  constraint brinesearch_authoritative_external_segments_measure_check
    check((from_measure is null and to_measure is null)
      or (from_measure is not null and to_measure is not null)),
  constraint brinesearch_authoritative_external_segments_access_check
    check(public_access_status in ('public','private','access','unknown','held')),
  constraint brinesearch_authoritative_external_segments_drivable_check
    check(drivable_status in ('drivable','non_drivable','held'))
);

create table public.brinesearch_authoritative_road_nodes (
  id uuid primary key,
  dataset_id uuid not null references public.brinesearch_road_source_datasets(id),
  source_node_key text not null unique,
  source_record_id text not null,
  state_code text not null,
  county_code text not null,
  county_name text not null,
  node_type text not null,
  geom extensions.geometry(Point,4326) not null,
  attributes jsonb not null default '{}'::jsonb,
  source_digest text not null,
  active boolean not null default true,
  fetched_at timestamptz not null default now(),
  constraint brinesearch_authoritative_road_nodes_state_check check(state_code='PA'),
  constraint brinesearch_authoritative_road_nodes_type_check check(node_type='at_grade_intersection'),
  constraint brinesearch_authoritative_road_nodes_geometry_check check(
    not extensions.st_isempty(geom) and extensions.st_isvalid(geom)
    and extensions.st_coveredby(geom,extensions.st_makeenvelope(-180,-90,180,90,4326))
  )
);

-- Official county/NG911 and LBRS centerlines are landed once, independently
-- from source-road identities. One source feature may cover several exact
-- state inventory identities (Bellaire 44th is the canonical example), so the
-- association is explicitly many-to-many and is never chosen by road name.
create table public.brinesearch_authoritative_supplemental_centerlines (
  id uuid primary key,
  dataset_id uuid not null references public.brinesearch_road_source_datasets(id),
  source_feature_key text not null,
  source_record_id text not null,
  state_code text not null,
  county_code text not null,
  county_name text not null,
  municipality_left text,
  municipality_right text,
  township_left text,
  township_right text,
  name_events jsonb not null default '[]'::jsonb,
  geom extensions.geometry(Geometry,4326) not null,
  attributes jsonb not null default '{}'::jsonb,
  source_digest text not null,
  source_timestamp timestamptz,
  last_ingest_run_id uuid references public.brinesearch_road_source_ingest_runs(id),
  active boolean not null default true,
  fetched_at timestamptz not null default now(),
  unique(dataset_id,source_feature_key),
  foreign key(dataset_id,state_code)
    references public.brinesearch_road_source_datasets(id,state_code),
  constraint brinesearch_supplemental_centerlines_state_check check(state_code in ('OH','PA')),
  constraint brinesearch_supplemental_centerlines_geometry_check check(
    extensions.st_dimension(geom)=1 and not extensions.st_isempty(geom)
    and extensions.st_isvalid(geom) and extensions.st_issimple(geom)
    and extensions.st_coveredby(geom,extensions.st_makeenvelope(-180,-90,180,90,4326))
  ),
  constraint brinesearch_supplemental_centerlines_names_check
    check(pg_catalog.jsonb_typeof(name_events)='array')
);

create table public.brinesearch_supplemental_centerline_identity_mappings (
  centerline_id uuid not null
    references public.brinesearch_authoritative_supplemental_centerlines(id) on delete cascade,
  identity_id uuid not null
    references public.brinesearch_authoritative_road_identities(id) on delete cascade,
  mapping_status text not null,
  mapping_method text not null,
  source_segment_keys text[] not null default '{}'::text[],
  evidence jsonb not null default '{}'::jsonb,
  ingest_run_id uuid references public.brinesearch_road_source_ingest_runs(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(centerline_id,identity_id),
  constraint brinesearch_supplemental_mapping_status_check
    check(mapping_status in ('verified','ambiguous','unmatched','retired')),
  constraint brinesearch_supplemental_mapping_method_check
    check(mapping_method in ('exact_geometry_coverage','official_source_id','held_for_review'))
);

create table public.brinesearch_road_identity_mappings (
  id uuid primary key,
  identity_id uuid not null references public.brinesearch_authoritative_road_identities(id) on delete cascade,
  road_id uuid not null references public.brinesearch_roads(id) on delete cascade,
  mapping_status text not null,
  mapping_method text not null,
  evidence jsonb not null default '{}'::jsonb,
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(identity_id,road_id),
  constraint brinesearch_road_identity_mappings_status_check
    check(mapping_status in ('verified','candidate','rejected','retired')),
  constraint brinesearch_road_identity_mappings_verified_check
    check(mapping_status<>'verified' or (verified_at is not null and mapping_method<>'name_only')),
  constraint brinesearch_road_identity_mappings_no_fuzzy_check
    check(mapping_method not in ('name_only','fuzzy_name','nearest_road'))
);

create unique index brinesearch_road_identity_one_verified_mapping_idx
on public.brinesearch_road_identity_mappings(identity_id)
where mapping_status='verified';

create table public.brinesearch_road_graph_builds (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  state_code text not null,
  county_code text not null,
  county_name text not null,
  algorithm_version text not null,
  source_revision_digest text not null,
  status text not null,
  source_segment_count integer not null default 0,
  identity_count integer not null default 0,
  point_junction_count integer not null default 0,
  shared_segment_count integer not null default 0,
  membership_count integer not null default 0,
  graph_digest text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  activated_at timestamptz,
  created_by uuid,
  details jsonb not null default '{}'::jsonb,
  constraint brinesearch_road_graph_builds_status_check
    check(status in ('staging','validated','active','retired','rejected')),
  foreign key(state_code,county_code)
    references public.brinesearch_road_graph_counties(state_code,county_code)
);

create unique index brinesearch_road_graph_one_active_scope_idx
on public.brinesearch_road_graph_builds(state_code,county_code)
where status='active';

create or replace function private_verification.brinesearch_issue97_dataset_scope_current(
  p_dataset_id uuid,
  p_state_code text,
  p_county_code text
)
returns boolean
language sql
stable
set search_path=''
as $$
  select coalesce((
    select private_verification.brinesearch_issue97_ingest_run_verified(r.id)
    from public.brinesearch_road_source_ingest_runs r
    where r.dataset_id=p_dataset_id and r.state_code=p_state_code and r.county_code=p_county_code
    order by r.started_at desc,r.id desc limit 1
  ),false)
$$;

create or replace function private_verification.brinesearch_issue97_graph_build_sources_current(
  p_build_id uuid
)
returns boolean
language sql
stable
set search_path=''
as $$
  select coalesce((
    select pg_catalog.jsonb_array_length(coalesce(b.details->'source_run_vector','[]'::jsonb))>0
      and not exists(
        select 1
        from pg_catalog.jsonb_array_elements(b.details->'source_run_vector') entry
        where not exists(
          select 1 from public.brinesearch_road_source_ingest_runs r
          where r.id=(entry->>'run_id')::uuid
            and r.id=(select latest.id
              from public.brinesearch_road_source_ingest_runs latest
              where latest.dataset_id=(entry->>'dataset_id')::uuid
                and latest.state_code=entry->>'state_code'
                and latest.county_code=entry->>'county_code'
              order by latest.started_at desc,latest.id desc limit 1)
            and private_verification.brinesearch_issue97_ingest_run_verified(r.id)
        )
      )
    from public.brinesearch_road_graph_builds b where b.id=p_build_id
  ),false)
$$;

revoke all on function private_verification.brinesearch_issue97_dataset_scope_current(uuid,text,text)
from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_graph_build_sources_current(uuid)
from public,anon,authenticated,service_role;

create table public.brinesearch_road_junctions (
  id uuid primary key,
  logical_junction_id uuid not null,
  build_id uuid not null references public.brinesearch_road_graph_builds(id),
  stable_junction_key text not null,
  display_id text not null,
  state_code text not null,
  county_code text not null,
  county_name text not null,
  township text,
  municipality text,
  junction_type text not null,
  geom extensions.geometry(Geometry,4326) not null,
  source_method text not null,
  source_provenance jsonb not null,
  confidence text not null,
  verification_status text not null,
  graph_digest text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brinesearch_road_junctions_type_check check(junction_type in (
    'intersection','t_junction','multiway','ramp','continuation','name_change',
    'concurrency_begin','concurrency_end','shared_segment'
  )),
  constraint brinesearch_road_junctions_geometry_check check(
    (junction_type='shared_segment' and extensions.st_dimension(geom)=1 and extensions.st_length(geom::extensions.geography)>0)
    or
    (junction_type<>'shared_segment' and extensions.geometrytype(geom)='POINT')
  ),
  constraint brinesearch_road_junctions_confidence_check
    check(confidence in ('authoritative','authoritative_at_grade','held')),
  constraint brinesearch_road_junctions_verification_check
    check(verification_status in ('verified','held','rejected')),
  unique(build_id,stable_junction_key),
  unique(build_id,logical_junction_id)
);

create table public.brinesearch_road_junction_anchors (
  id uuid primary key,
  junction_id uuid not null references public.brinesearch_road_junctions(id) on delete cascade,
  anchor_key text not null,
  anchor_role text not null,
  geom extensions.geometry(Point,4326) not null,
  anchor_digest text not null,
  created_at timestamptz not null default now(),
  unique(junction_id,anchor_key),
  constraint brinesearch_road_junction_anchors_role_check
    check(anchor_role in ('point','shared_start','shared_end'))
);

create table public.brinesearch_road_junction_memberships (
  id uuid primary key,
  junction_id uuid not null references public.brinesearch_road_junctions(id) on delete cascade,
  identity_id uuid not null references public.brinesearch_authoritative_road_identities(id),
  road_id uuid references public.brinesearch_roads(id),
  source_segment_keys text[] not null default '{}'::text[],
  road_name_at_junction text not null,
  aliases_at_junction text[] not null default '{}'::text[],
  membership_role text not null,
  source_measure numeric,
  distance_along_road_m numeric,
  approach_data jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(junction_id,identity_id,membership_role),
  constraint brinesearch_road_junction_memberships_role_check check(membership_role in (
    'approach','terminus','continuation','ramp','shared','name_change'
  )),
  constraint brinesearch_road_junction_memberships_distance_check
    check(distance_along_road_m is null or distance_along_road_m>=0)
);

create index brinesearch_authoritative_identities_scope_idx
on public.brinesearch_authoritative_road_identities(state_code,county_code,active);
create index brinesearch_authoritative_identities_key_idx
on public.brinesearch_authoritative_road_identities(source_identity_key);
create index brinesearch_authoritative_identities_name_idx
on public.brinesearch_authoritative_road_identities
using gin(normalized_name extensions.gin_trgm_ops);
create index brinesearch_authoritative_names_identity_measure_idx
on public.brinesearch_authoritative_road_names(identity_id,active,from_measure,to_measure);
create index brinesearch_authoritative_names_search_idx
on public.brinesearch_authoritative_road_names
using gin(normalized_name extensions.gin_trgm_ops);
create index brinesearch_authoritative_external_segments_identity_idx
on public.brinesearch_authoritative_external_road_segments(identity_id,active);
create index brinesearch_authoritative_external_segments_scope_idx
on public.brinesearch_authoritative_external_road_segments(state_code,county_code,active);
create index brinesearch_authoritative_external_segments_geom_idx
on public.brinesearch_authoritative_external_road_segments using gist(geom);
create index brinesearch_authoritative_nodes_scope_idx
on public.brinesearch_authoritative_road_nodes(state_code,county_code,active);
create index brinesearch_authoritative_nodes_geom_idx
on public.brinesearch_authoritative_road_nodes using gist(geom);
create index brinesearch_identity_mappings_road_idx
on public.brinesearch_road_identity_mappings(road_id,mapping_status);
create index brinesearch_junctions_scope_idx
on public.brinesearch_road_junctions(state_code,county_code,junction_type);
create index brinesearch_junctions_build_idx
on public.brinesearch_road_junctions(build_id);
create index brinesearch_junctions_stable_key_idx
on public.brinesearch_road_junctions(stable_junction_key,build_id);
create index brinesearch_junctions_logical_id_idx
on public.brinesearch_road_junctions(logical_junction_id,build_id);
create index brinesearch_junctions_geom_idx
on public.brinesearch_road_junctions using gist(geom);
create index brinesearch_junction_anchors_geom_idx
on public.brinesearch_road_junction_anchors using gist(geom);
create index brinesearch_junction_memberships_identity_idx
on public.brinesearch_road_junction_memberships(identity_id,junction_id);
create index brinesearch_junction_memberships_identity_order_idx
on public.brinesearch_road_junction_memberships(identity_id,distance_along_road_m,junction_id);
create index brinesearch_junction_memberships_road_idx
on public.brinesearch_road_junction_memberships(road_id,junction_id)
where road_id is not null;

create or replace view public.brinesearch_authoritative_road_segments
with (security_invoker=true,security_barrier=true)
as
select
  private_verification.brinesearch_issue97_uuid('OH:ODOT:SEGMENT:'||c.roadway_inventory_id) as id,
  private_verification.brinesearch_issue97_uuid('dataset:oh_odot_tims_road_inventory') as dataset_id,
  private_verification.brinesearch_issue97_uuid('OH:ODOT:NLF:'||c.nlf_id) as identity_id,
  'OH:ODOT:SEGMENT:'||c.roadway_inventory_id as source_segment_key,
  c.roadway_inventory_id::text as source_record_id,
  'OH'::text as state_code,
  gc.county_code,
  gc.county_name,
  coalesce(c.attributes->>'TWP_CODE_LEFT',c.attributes->>'TWP_CODE_RIGHT') as township,
  coalesce(c.attributes->>'MUNI_CODE_LEFT',c.attributes->>'MUNI_CODE_RIGHT') as municipality,
  c.ctl_begin::numeric as from_measure,
  c.ctl_end::numeric as to_measure,
  c.direction_of_travel_code as route_direction,
  null::integer as z_level,
  case when coalesce(nullif(c.attributes->>'BRIDGE_IND',''),nullif(c.attributes->>'BRIDGE_FILE_NBR',''),nullif(c.attributes->>'STRUCTURE_FILE_NBR','')) is not null
    then 'bridge' end as bridge_status,
  case when coalesce(c.attributes->>'TUNNEL_IND','N')='Y' then 'tunnel' end as tunnel_status,
  case
    when c.jurisdiction_code='P' then 'private'
    when c.jurisdiction_code in ('S','C','T','M','F') then 'public'
    else 'held'
  end::text as public_access_status,
  case
    when c.route_type='BK' then 'non_drivable'
    when c.route_type in ('IR','US','SR','CR','TR','MR','RA')
      and c.jurisdiction_code in ('S','C','T','M','F','P') then 'drivable'
    else 'held'
  end::text as drivable_status,
  c.geom,
  c.attributes,
  pg_catalog.md5(c.attributes::text||coalesce(extensions.st_asewkb(c.geom)::text,'')) as source_digest,
  case when (c.attributes->>'LAST_MODIFIED_DATE') ~ '^[0-9]+$'
    then pg_catalog.to_timestamp((c.attributes->>'LAST_MODIFIED_DATE')::numeric/1000.0) end as source_timestamp,
  true as active,
  c.fetched_at
from public.brinesearch_odot_road_catalog c
join public.brinesearch_road_graph_counties gc
  on gc.state_code='OH' and gc.source_county_code=c.county_code and gc.active
where c.geom is not null and c.source_active
  and not extensions.st_isempty(c.geom) and extensions.st_isvalid(c.geom)
  and extensions.st_issimple(c.geom) and extensions.st_dimension(c.geom)=1
  and extensions.st_coveredby(c.geom,extensions.st_makeenvelope(-180,-90,180,90,4326))
union all
select
  s.id,s.dataset_id,s.identity_id,s.source_segment_key,s.source_record_id,
  s.state_code,s.county_code,s.county_name,s.township,s.municipality,
  s.from_measure,s.to_measure,s.route_direction,s.z_level,s.bridge_status,
  s.tunnel_status,s.public_access_status,s.drivable_status,s.geom,s.attributes,
  s.source_digest,s.source_timestamp,s.active,s.fetched_at
from public.brinesearch_authoritative_external_road_segments s;

comment on view public.brinesearch_authoritative_road_segments is
  'Issue #97 normalized source-segment registry. Ohio is projected from the existing ODOT catalog; WV/PA use the external source landing table.';

-- Raw source and graph tables are never browser-readable. Editors use only the
-- bounded SECURITY DEFINER RPCs below; service_role owns ingestion/rebuild.
do $issue97_rls$
declare
  v_table text;
begin
  foreach v_table in array array[
    'brinesearch_road_graph_counties','brinesearch_road_source_datasets',
    'brinesearch_road_source_dataset_counties',
    'brinesearch_road_source_ingest_runs','brinesearch_road_source_ingest_pages',
    'brinesearch_authoritative_road_identities','brinesearch_authoritative_road_names',
    'brinesearch_authoritative_external_road_segments','brinesearch_authoritative_road_nodes',
    'brinesearch_authoritative_supplemental_centerlines',
    'brinesearch_supplemental_centerline_identity_mappings',
    'brinesearch_road_identity_mappings','brinesearch_road_graph_builds',
    'brinesearch_road_junctions','brinesearch_road_junction_anchors',
    'brinesearch_road_junction_memberships'
  ] loop
    execute pg_catalog.format('alter table public.%I enable row level security',v_table);
    execute pg_catalog.format('alter table public.%I force row level security',v_table);
    execute pg_catalog.format('revoke all on public.%I from public,anon,authenticated',v_table);
    -- Supabase's public-schema default ACL also grants TRUNCATE, REFERENCES,
    -- TRIGGER, and MAINTAIN to service_role. Remove the complete table grant;
    -- controlled SECURITY DEFINER functions are the only mutation surface.
    execute pg_catalog.format('revoke all on public.%I from service_role',v_table);
    execute pg_catalog.format('grant select on public.%I to service_role',v_table);
    execute pg_catalog.format('drop policy if exists %I on public.%I',v_table||'_editor_read_issue97',v_table);
  end loop;
end
$issue97_rls$;

-- Graph generations are writable only through the owner-executed rebuild and
-- activation functions. service_role may invoke those functions but cannot
-- directly rewrite validated, active, or retired graph history.
revoke all on public.brinesearch_road_graph_builds from service_role;
revoke all on public.brinesearch_road_junctions from service_role;
revoke all on public.brinesearch_road_junction_anchors from service_role;
revoke all on public.brinesearch_road_junction_memberships from service_role;
grant select on public.brinesearch_road_graph_builds,
  public.brinesearch_road_junctions,
  public.brinesearch_road_junction_anchors,
  public.brinesearch_road_junction_memberships to service_role;

-- The reused ODOT landing table predates #97 and inherited broad service-role
-- table privileges. From this migration forward it is also loader-owned.
revoke all on public.brinesearch_odot_road_catalog from service_role;
grant select on public.brinesearch_odot_road_catalog to service_role;

revoke all on public.brinesearch_authoritative_road_segments from public,anon,authenticated,service_role;

comment on table public.brinesearch_authoritative_road_identities is
  'Issue #97 exact source road identities. source_identity_key is source/jurisdiction scoped and never derived from a road name.';
comment on table public.brinesearch_road_junctions is
  'Issue #97 one row per physical occurrence. Multiway nodes have one junction and N memberships; shared sections retain line geometry.';
comment on table public.brinesearch_road_junction_memberships is
  'Issue #97 one-to-many road membership for each physical junction/overlap.';

create or replace function public.brinesearch_issue97_ingest_oh_page(
  p_county_code text,
  p_offset integer default 0,
  p_page_size integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_county text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_county_code,'')));
  v_offset integer:=greatest(0,coalesce(p_offset,0));
  v_limit integer:=greatest(1,least(coalesce(p_page_size,1000),2000));
  v_url text;
  v_response extensions.http_response;
  v_body jsonb;
  v_feature jsonb;
  v_props jsonb;
  v_geom extensions.geometry;
  v_geometry_present boolean;
  v_rows integer:=0;
  v_source_rows integer:=0;
  v_has_more boolean:=false;
  v_inventory_id text;
  v_official_name text;
begin
  if not exists(
    select 1 from public.brinesearch_road_graph_counties c
    where c.state_code='OH' and c.source_county_code=v_county and c.active
  ) then
    raise exception 'County is outside the issue #97 Ohio footprint';
  end if;
  v_url:='https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0/query'
    ||'?where=COUNTY_CD%3D%27'||v_county||'%27'
    ||'&outFields=*&returnGeometry=true&returnM=false&returnZ=false&outSR=4326'
    ||'&orderByFields=OBJECTID'
    ||'&resultOffset='||v_offset||'&resultRecordCount='||v_limit||'&f=geojson';
  v_response:=extensions.http_get(v_url);
  if v_response.status<>200 then
    raise exception 'ODOT request failed with HTTP %',v_response.status;
  end if;
  v_body:=v_response.content::jsonb;
  if v_body ? 'error' then raise exception 'ODOT response contained an ArcGIS error'; end if;
  v_source_rows:=pg_catalog.jsonb_array_length(coalesce(v_body->'features','[]'::jsonb));
  v_has_more:=coalesce(
    nullif(v_body->>'exceededTransferLimit','')::boolean,
    nullif(v_body->'properties'->>'exceededTransferLimit','')::boolean,
    v_source_rows=v_limit
  );

  for v_feature in select value from pg_catalog.jsonb_array_elements(coalesce(v_body->'features','[]'::jsonb))
  loop
    v_props:=v_feature->'properties';
    v_geom:=null;
    v_geometry_present:=v_feature->'geometry' is not null
      and pg_catalog.jsonb_typeof(v_feature->'geometry')<>'null';
    if v_geometry_present then
      begin
        v_geom:=extensions.st_force2d(extensions.st_setsrid(
          extensions.st_geomfromgeojson((v_feature->'geometry')::text),4326
        ));
      exception when others then
        continue;
      end;
      if v_geom is null or extensions.st_isempty(v_geom)
         or not extensions.st_isvalid(v_geom) or not extensions.st_issimple(v_geom)
         or extensions.st_dimension(v_geom)<>1
         or not extensions.st_coveredby(v_geom,extensions.st_makeenvelope(-180,-90,180,90,4326)) then
        continue;
      end if;
    end if;
    v_inventory_id:=coalesce(nullif(v_props->>'ROADWAY_INVENTORY_ID',''),v_props->>'OBJECTID');
    if v_inventory_id is null then continue; end if;
    v_official_name:=nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ',
      nullif(v_props->>'STREET_PREFIX_DIR_CD',''),nullif(v_props->>'STREET_NAME',''),
      nullif(v_props->>'STREET_SUFFIX_CD',''),nullif(v_props->>'STREET_DIR_SUFFIX_CD','')
    )), '');
    insert into public.brinesearch_odot_road_catalog(
      roadway_inventory_id,objectid,nlf_id,county_code,jurisdiction_code,
      route_type,route_number,route_suffix,route_extension_code,cardinality_code,
      direction_of_travel_code,street_prefix_direction,street_name,street_suffix,
      street_direction_suffix,segment_description,segment_length_miles,ctl_begin,
      ctl_end,truck_route_indicator,roadway_class,surface_type_left,surface_type_right,
      official_name,street_match_key,route_number_normalized,attributes,geom,
      geometry_loaded_at,fetched_at,source_url
    ) values (
      v_inventory_id,(v_props->>'OBJECTID')::bigint,v_props->>'NLF_ID',v_county,
      v_props->>'JURISDICTION_CD',v_props->>'ROUTE_TYPE',v_props->>'ROUTE_NBR',
      v_props->>'ROUTE_SUFFIX',v_props->>'ROUTE_EXTENSION_CD',v_props->>'CARDINALITY_CD',
      v_props->>'DIRECTION_OF_TRAVEL_CD',v_props->>'STREET_PREFIX_DIR_CD',
      v_props->>'STREET_NAME',v_props->>'STREET_SUFFIX_CD',v_props->>'STREET_DIR_SUFFIX_CD',
      v_props->>'SEGMENT_DESCRIPTION_TXT',nullif(v_props->>'SEGMENT_LENGTH_NBR','')::numeric,
      nullif(v_props->>'CTL_BEGIN_NBR','')::numeric,nullif(v_props->>'CTL_END_NBR','')::numeric,
      v_props->>'TRUCK_ROUTE_IND',nullif(v_props->>'ROADWAY_CLASS','')::integer,
      v_props->>'SURFACE_TYPE_LEFT_CD',v_props->>'SURFACE_TYPE_RIGHT_CD',
      coalesce(v_official_name,nullif(pg_catalog.btrim(v_props->>'STREET_NAME'),'')),
      pg_catalog.regexp_replace(pg_catalog.lower(coalesce(v_official_name,v_props->>'STREET_NAME','')),'[^a-z0-9]+','-','g'),
      nullif(pg_catalog.ltrim(coalesce(v_props->>'ROUTE_NBR',''),'0'),''),v_props,v_geom,
      case when v_geom is null then null else now() end,now(),
      'https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0'
    )
    on conflict(roadway_inventory_id) do update set
      objectid=excluded.objectid,nlf_id=excluded.nlf_id,county_code=excluded.county_code,
      jurisdiction_code=excluded.jurisdiction_code,route_type=excluded.route_type,
      route_number=excluded.route_number,route_suffix=excluded.route_suffix,
      route_extension_code=excluded.route_extension_code,cardinality_code=excluded.cardinality_code,
      direction_of_travel_code=excluded.direction_of_travel_code,
      street_prefix_direction=excluded.street_prefix_direction,street_name=excluded.street_name,
      street_suffix=excluded.street_suffix,street_direction_suffix=excluded.street_direction_suffix,
      segment_description=excluded.segment_description,segment_length_miles=excluded.segment_length_miles,
      ctl_begin=excluded.ctl_begin,ctl_end=excluded.ctl_end,
      truck_route_indicator=excluded.truck_route_indicator,roadway_class=excluded.roadway_class,
      surface_type_left=excluded.surface_type_left,surface_type_right=excluded.surface_type_right,
      official_name=excluded.official_name,street_match_key=excluded.street_match_key,
      route_number_normalized=excluded.route_number_normalized,attributes=excluded.attributes,
      geom=excluded.geom,geometry_loaded_at=excluded.geometry_loaded_at,
      fetched_at=now(),source_url=excluded.source_url,
      source_active=true;
    v_rows:=v_rows+1;
  end loop;
  update public.brinesearch_road_source_datasets
  set fetched_at=now(),updated_at=now()
  where source_key='oh_odot_tims_road_inventory';
  return pg_catalog.jsonb_build_object(
    'source','oh_odot_tims_road_inventory','county_code',v_county,
    'offset',v_offset,'page_size',v_limit,'source_rows',v_source_rows,
    'rows',v_rows,'rejected_rows',v_source_rows-v_rows,'has_more',v_has_more,
    'page_digest',pg_catalog.md5(coalesce((v_body->'features')::text,'[]'))
  );
end
$$;

create or replace function public.brinesearch_issue97_refresh_oh_identities(
  p_county_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_county text:=nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(p_county_code,''))), '');
  v_dataset uuid:=private_verification.brinesearch_issue97_uuid('dataset:oh_odot_tims_road_inventory');
  v_identity_count integer:=0;
  v_name_count integer:=0;
  v_mapping_count integer:=0;
begin
  if v_county is not null and not exists(
    select 1 from public.brinesearch_road_graph_counties c
    where c.state_code='OH' and c.source_county_code=v_county and c.active
  ) then raise exception 'County is outside the issue #97 Ohio footprint'; end if;

  with name_counts as (
    select c.nlf_id,c.county_code,c.official_name,count(*) as uses
    from public.brinesearch_odot_road_catalog c
    join public.brinesearch_road_graph_counties gc
      on gc.state_code='OH' and gc.source_county_code=c.county_code and gc.active
    where c.nlf_id is not null and c.source_active
      and (v_county is null or c.county_code=v_county)
      and nullif(pg_catalog.btrim(c.official_name),'') is not null
    group by c.nlf_id,c.county_code,c.official_name
  ), preferred as (
    select distinct on(nlf_id) nlf_id,county_code,official_name
    from name_counts order by nlf_id,uses desc,official_name
  ), source_rows as (
    select
      c.nlf_id,c.county_code,gc.county_name,
      (array_agg(c.route_type order by c.objectid))[1] as route_type,
      (array_agg(c.jurisdiction_code order by c.objectid))[1] as jurisdiction_code,
      (array_agg(c.route_number order by c.objectid))[1] as route_number,
      (array_agg(c.route_suffix order by c.objectid))[1] as route_suffix,
      (array_agg(c.route_extension_code order by c.objectid))[1] as route_extension,
      min(nullif(coalesce(c.attributes->>'TWP_CODE_LEFT',c.attributes->>'TWP_CODE_RIGHT'),'')) as township,
      min(nullif(coalesce(c.attributes->>'MUNI_CODE_LEFT',c.attributes->>'MUNI_CODE_RIGHT'),'')) as municipality,
      bool_or(coalesce(c.truck_route_indicator,'N')='Y') as official_truck_route,
      coalesce(p.official_name,c.nlf_id) as display_name,
      array_agg(distinct c.roadway_inventory_id::text) as source_record_ids,
      pg_catalog.md5(pg_catalog.string_agg(
        c.roadway_inventory_id||':'||pg_catalog.md5(c.attributes::text),',' order by c.roadway_inventory_id
      )) as digest,
      max(case when (c.attributes->>'LAST_MODIFIED_DATE') ~ '^[0-9]+$'
        then pg_catalog.to_timestamp((c.attributes->>'LAST_MODIFIED_DATE')::numeric/1000.0) end) as source_timestamp,
      pg_catalog.jsonb_build_object(
        'nlf_id',c.nlf_id,'segment_count',count(*),
        'geometry_segment_count',count(*) filter(where c.geom is not null),
        'source_table','public.brinesearch_odot_road_catalog'
      ) as attributes
    from public.brinesearch_odot_road_catalog c
    join public.brinesearch_road_graph_counties gc
      on gc.state_code='OH' and gc.source_county_code=c.county_code and gc.active
    left join preferred p on p.nlf_id=c.nlf_id
    where c.nlf_id is not null and c.source_active
      and (v_county is null or c.county_code=v_county)
    group by c.nlf_id,c.county_code,gc.county_name,p.official_name
  )
  insert into public.brinesearch_authoritative_road_identities(
    id,dataset_id,source_identity_key,state_code,county_code,county_name,
    township,municipality,route_system,route_number,route_suffix,route_extension,display_name,normalized_name,
    road_class,public_access_status,drivable_status,maintainer,truck_status,
    source_record_ids,attributes,source_digest,source_timestamp,active,last_seen_at
  )
  select
    private_verification.brinesearch_issue97_uuid('OH:ODOT:NLF:'||s.nlf_id),v_dataset,
    'OH:ODOT:NLF:'||s.nlf_id,'OH',s.county_code,s.county_name,s.township,s.municipality,s.route_type,
    nullif(pg_catalog.ltrim(coalesce(s.route_number,''),'0'),''),nullif(s.route_suffix,'*'),
    nullif(s.route_extension,'*'),s.display_name,
    pg_catalog.regexp_replace(pg_catalog.lower(s.display_name),'[^a-z0-9]+',' ','g'),
    case s.route_type when 'IR' then 'interstate' when 'US' then 'us_route'
      when 'SR' then 'state_route' when 'CR' then 'county' when 'TR' then 'township'
      when 'MR' then 'local' when 'RA' then 'ramp' when 'BK' then 'trail' else 'other' end,
    case when s.jurisdiction_code='P' then 'private'
      when s.jurisdiction_code in ('S','C','T','M','F') then 'public' else 'held' end,
    case when s.route_type='BK' then 'non_drivable'
      when s.route_type in ('IR','US','SR','CR','TR','MR','RA')
        and s.jurisdiction_code in ('S','C','T','M','F','P') then 'drivable' else 'held' end,
    case s.jurisdiction_code when 'S' then 'Ohio Department of Transportation'
      when 'C' then 'County' when 'T' then 'Township' when 'M' then 'Municipality'
      when 'F' then 'Federal' when 'P' then 'Private' else 'Unknown' end,
    case when s.official_truck_route then 'official_truck_route' end,s.source_record_ids,
    s.attributes,s.digest,s.source_timestamp,true,now()
  from source_rows s
  on conflict(source_identity_key) do update set
    county_code=excluded.county_code,county_name=excluded.county_name,
    township=excluded.township,municipality=excluded.municipality,
    route_system=excluded.route_system,route_number=excluded.route_number,
    route_suffix=excluded.route_suffix,route_extension=excluded.route_extension,
    display_name=excluded.display_name,normalized_name=excluded.normalized_name,
    road_class=excluded.road_class,public_access_status=excluded.public_access_status,
    drivable_status=excluded.drivable_status,maintainer=excluded.maintainer,
    truck_status=excluded.truck_status,source_record_ids=excluded.source_record_ids,
    attributes=excluded.attributes,source_digest=excluded.source_digest,
    source_timestamp=excluded.source_timestamp,active=true,last_seen_at=now();
  get diagnostics v_identity_count=row_count;

  insert into public.brinesearch_authoritative_road_names(
    identity_id,source_dataset_id,source_record_id,name_type,road_name,normalized_name,provenance
  )
  select distinct
    private_verification.brinesearch_issue97_uuid('OH:ODOT:NLF:'||c.nlf_id),v_dataset,
    c.roadway_inventory_id::text,'official',c.official_name,
    pg_catalog.regexp_replace(pg_catalog.lower(c.official_name),'[^a-z0-9]+',' ','g'),
    pg_catalog.jsonb_build_object('nlf_id',c.nlf_id,'objectid',c.objectid,'source','ODOT TIMS Road Inventory')
  from public.brinesearch_odot_road_catalog c
  join public.brinesearch_road_graph_counties gc
    on gc.state_code='OH' and gc.source_county_code=c.county_code and gc.active
  where c.nlf_id is not null and c.source_active
    and nullif(pg_catalog.btrim(c.official_name),'') is not null
    and (v_county is null or c.county_code=v_county)
  on conflict(identity_id,source_dataset_id,source_record_id,name_type,road_name) do update
  set normalized_name=excluded.normalized_name,provenance=excluded.provenance,
      active=true,last_seen_at=now(),updated_at=now();
  get diagnostics v_name_count=row_count;

  return pg_catalog.jsonb_build_object(
    'source','oh_odot_tims_road_inventory','county_code',v_county,
    'identities_touched',v_identity_count,'names_touched',v_name_count,
    'verified_mappings_touched',v_mapping_count
  );
end
$$;

create or replace function public.brinesearch_issue97_ingest_wv_network_page(
  p_county_code text,
  p_offset integer default 0,
  p_page_size integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_county text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_county_code,'')));
  v_source_county text;
  v_county_name text;
  v_offset integer:=greatest(0,coalesce(p_offset,0));
  v_limit integer:=greatest(1,least(coalesce(p_page_size,1000),2000));
  v_dataset uuid:=private_verification.brinesearch_issue97_uuid('dataset:wv_wvdot_publication_lrs');
  v_url text;
  v_response extensions.http_response;
  v_body jsonb;
  v_feature jsonb;
  v_props jsonb;
  v_geom extensions.geometry;
  v_identity uuid;
  v_identity_key text;
  v_segment_key text;
  v_label text;
  v_sign text;
  v_supp text;
  v_access text;
  v_drivable text;
  v_from_measure numeric;
  v_to_measure numeric;
  v_z_level integer;
  v_rows integer:=0;
  v_source_rows integer:=0;
  v_has_more boolean:=false;
begin
  select source_county_code,county_name into v_source_county,v_county_name
  from public.brinesearch_road_graph_counties
  where state_code='WV' and county_code=v_county and active;
  if not found then raise exception 'County is outside the issue #97 West Virginia footprint'; end if;
  v_url:='https://gis.transportation.wv.gov/arcgis/rest/services/Roads_And_Highways/Publication_LRS/MapServer/89/query'
    ||'?where=CO_CountyID%3D%27'||v_source_county||'%27'
    ||'&outFields=*&returnGeometry=true&returnM=true&returnZ=true&outSR=4326'
    ||'&orderByFields=OBJECTID'
    ||'&resultOffset='||v_offset||'&resultRecordCount='||v_limit||'&f=json';
  v_response:=extensions.http_get(v_url);
  if v_response.status<>200 then raise exception 'WVDOT request failed with HTTP %',v_response.status; end if;
  v_body:=v_response.content::jsonb;
  if v_body ? 'error' then raise exception 'WVDOT response contained an ArcGIS error'; end if;
  v_source_rows:=pg_catalog.jsonb_array_length(coalesce(v_body->'features','[]'::jsonb));
  v_has_more:=coalesce(
    nullif(v_body->>'exceededTransferLimit','')::boolean,
    nullif(v_body->'properties'->>'exceededTransferLimit','')::boolean,
    v_source_rows=v_limit
  );
  for v_feature in select value from pg_catalog.jsonb_array_elements(coalesce(v_body->'features','[]'::jsonb))
  loop
    v_props:=v_feature->'attributes';
    if nullif(v_props->>'CO_ROUTEID','') is null
       or pg_catalog.jsonb_typeof(v_feature->'geometry'->'paths')<>'array' then continue; end if;
    begin
      select
        extensions.st_force2d(extensions.st_multi(extensions.st_collectionextract(
          extensions.st_collect(q.path_geom),2
        ))),
        (array_agg(q.path_from order by q.path_number))[1],
        (array_agg(q.path_to order by q.path_number desc))[1],
        case when max(q.max_abs_z)>0.01 then pg_catalog.round(avg(q.avg_z))::integer end
      into v_geom,v_from_measure,v_to_measure,v_z_level
      from (
        select path_number,
          extensions.st_makeline(
            extensions.st_setsrid(extensions.st_makepoint(
              (coordinate->>0)::double precision,(coordinate->>1)::double precision
            ),4326) order by point_number
          ) as path_geom,
          (array_agg(nullif(coordinate->>3,'')::numeric order by point_number))[1] as path_from,
          (array_agg(nullif(coordinate->>3,'')::numeric order by point_number desc))[1] as path_to,
          max(pg_catalog.abs(coalesce(nullif(coordinate->>2,'')::numeric,0))) as max_abs_z,
          avg(coalesce(nullif(coordinate->>2,'')::numeric,0)) as avg_z
        from pg_catalog.jsonb_array_elements(v_feature->'geometry'->'paths')
          with ordinality path(path_value,path_number)
        cross join lateral pg_catalog.jsonb_array_elements(path.path_value)
          with ordinality point(coordinate,point_number)
        group by path_number
        having count(*)>=2
      ) q;
    exception when others then continue;
    end;
    if v_geom is null or v_from_measure is null or v_to_measure is null
       or extensions.st_isempty(v_geom) or extensions.st_dimension(v_geom)<>1 then continue; end if;
    v_identity_key:='WV:WVDOT:ROUTE_ID:'||(v_props->>'CO_ROUTEID');
    v_identity:=private_verification.brinesearch_issue97_uuid(v_identity_key);
    v_segment_key:='WV:WVDOT:SEGMENT:'||(v_props->>'OBJECTID');
    v_label:=coalesce(nullif(pg_catalog.btrim(v_props->>'CO_RouteLabel'),''),'WVDOT route '||(v_props->>'CO_ROUTEID'));
    v_sign:=coalesce(v_props->>'CO_SignSystem','');
    v_supp:=coalesce(v_props->>'CO_SuppCode','');
    v_access:=case
      when v_sign in ('R','T','9') or v_supp in ('21','23','24','51','99') then 'held'
      when v_sign in ('0','1','2','3','4','6','7','8') then 'public'
      else 'held' end;
    v_drivable:=case
      when v_sign in ('R','T') or v_supp in ('21','51','99') then 'non_drivable'
      when v_sign='9' or v_supp in ('23','24') then 'held'
      when v_sign in ('0','1','2','3','4','6','7','8') then 'drivable'
      else 'held' end;
    insert into public.brinesearch_authoritative_road_identities(
      id,dataset_id,source_identity_key,state_code,county_code,county_name,
      route_system,route_number,route_suffix,route_fraction,route_extension,
      display_name,normalized_name,road_class,public_access_status,drivable_status,
      maintainer,source_record_ids,attributes,source_digest,source_timestamp,active,last_seen_at
    ) values (
      v_identity,v_dataset,v_identity_key,'WV',v_county,v_county_name,v_sign,
      v_props->>'CO_RouteNumber',nullif(v_props->>'CO_RouteDirection','00'),
      nullif(v_props->>'CO_SubRoute','00'),nullif(v_supp,'00'),v_label,
      pg_catalog.regexp_replace(pg_catalog.lower(v_label),'[^a-z0-9]+',' ','g'),
      case when v_supp in ('17','23','24') then 'ramp' else case v_sign when '1' then 'interstate' when '2' then 'us_route' when '3' then 'state_route'
        when '4' then 'county' when '6' then 'park' when '7' then 'local'
        when '8' then 'local' when '0' then 'local' when 'T' then 'trail'
        when 'R' then 'rail' else 'other' end end,
      v_access,v_drivable,'West Virginia Division of Highways',array[v_props->>'OBJECTID'],
      v_props||pg_catalog.jsonb_build_object(
        'source_geometry_zm',v_feature->'geometry',
        'source_geometry_has_z',coalesce((v_body->>'hasZ')::boolean,true),
        'source_geometry_has_m',coalesce((v_body->>'hasM')::boolean,true),
        'source_average_z',v_z_level,
        'measure_direction_preserved',true
      ),pg_catalog.md5(v_props::text||(v_feature->'geometry')::text),
      case when (v_props->>'SYSTEM_MOD_DATE') ~ '^[0-9]+$'
        then pg_catalog.to_timestamp((v_props->>'SYSTEM_MOD_DATE')::numeric/1000.0) end,
      true,now()
    )
    on conflict(source_identity_key) do update set
      county_code=excluded.county_code,county_name=excluded.county_name,
      route_system=excluded.route_system,route_number=excluded.route_number,
      route_suffix=excluded.route_suffix,route_fraction=excluded.route_fraction,
      route_extension=excluded.route_extension,display_name=excluded.display_name,
      normalized_name=excluded.normalized_name,road_class=excluded.road_class,
      public_access_status=excluded.public_access_status,drivable_status=excluded.drivable_status,
      source_record_ids=array(select distinct x from unnest(
        public.brinesearch_authoritative_road_identities.source_record_ids||excluded.source_record_ids
      ) x),attributes=excluded.attributes,source_digest=excluded.source_digest,
      source_timestamp=excluded.source_timestamp,active=true,last_seen_at=now();
    insert into public.brinesearch_authoritative_road_names(
      identity_id,source_dataset_id,source_record_id,name_type,road_name,normalized_name,
      source_segment_key,from_measure,to_measure,provenance
    ) values (
      v_identity,v_dataset,v_props->>'OBJECTID','official',v_label,
      pg_catalog.regexp_replace(pg_catalog.lower(v_label),'[^a-z0-9]+',' ','g'),
      v_segment_key,v_from_measure,v_to_measure,
      pg_catalog.jsonb_build_object('route_id',v_props->>'CO_ROUTEID','source','WVDOT Publication LRS')
    ) on conflict(identity_id,source_dataset_id,source_record_id,name_type,road_name) do update
      set source_segment_key=excluded.source_segment_key,from_measure=excluded.from_measure,
          to_measure=excluded.to_measure,provenance=excluded.provenance,
          active=true,last_seen_at=now(),updated_at=now();
    insert into public.brinesearch_authoritative_external_road_segments(
      id,dataset_id,identity_id,source_segment_key,source_record_id,state_code,
      county_code,county_name,from_measure,to_measure,route_direction,z_level,
      public_access_status,drivable_status,geom,attributes,source_digest,
      source_timestamp,active,fetched_at
    ) values (
      private_verification.brinesearch_issue97_uuid(v_segment_key),v_dataset,v_identity,
      v_segment_key,v_props->>'OBJECTID','WV',v_county,v_county_name,
      v_from_measure,v_to_measure,
      v_props->>'CO_RouteDirection',null,v_access,v_drivable,v_geom,
      v_props||pg_catalog.jsonb_build_object(
        'source_geometry_zm',v_feature->'geometry',
        'source_geometry_has_z',coalesce((v_body->>'hasZ')::boolean,true),
        'source_geometry_has_m',coalesce((v_body->>'hasM')::boolean,true),
        'source_average_z',v_z_level,
        'measure_direction_preserved',true
      ),
      pg_catalog.md5(v_props::text||(v_feature->'geometry')::text),
      case when (v_props->>'SYSTEM_MOD_DATE') ~ '^[0-9]+$'
        then pg_catalog.to_timestamp((v_props->>'SYSTEM_MOD_DATE')::numeric/1000.0) end,
      true,now()
    ) on conflict(source_segment_key) do update set
      identity_id=excluded.identity_id,county_code=excluded.county_code,county_name=excluded.county_name,
      from_measure=excluded.from_measure,to_measure=excluded.to_measure,
      route_direction=excluded.route_direction,z_level=excluded.z_level,
      public_access_status=excluded.public_access_status,
      drivable_status=excluded.drivable_status,geom=excluded.geom,attributes=excluded.attributes,
      source_digest=excluded.source_digest,source_timestamp=excluded.source_timestamp,
      active=true,fetched_at=now();
    v_rows:=v_rows+1;
  end loop;
  update public.brinesearch_road_source_datasets set fetched_at=now(),updated_at=now()
  where id=v_dataset;
  return pg_catalog.jsonb_build_object(
    'source','wv_wvdot_publication_lrs','county_code',v_county,
    'source_county_code',v_source_county,'offset',v_offset,'page_size',v_limit,
    'source_rows',v_source_rows,'rows',v_rows,'rejected_rows',v_source_rows-v_rows,
    'has_more',v_has_more,
    'page_digest',pg_catalog.md5(coalesce((v_body->'features')::text,'[]'))
  );
end
$$;

create or replace function public.brinesearch_issue97_ingest_wv_names_page(
  p_source_key text,
  p_county_code text,
  p_offset integer default 0,
  p_page_size integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_source text:=pg_catalog.lower(pg_catalog.btrim(coalesce(p_source_key,'')));
  v_county text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_county_code,'')));
  v_source_county text;
  v_dataset uuid;
  v_layer integer;
  v_name_type text;
  v_offset integer:=greatest(0,coalesce(p_offset,0));
  v_limit integer:=greatest(1,least(coalesce(p_page_size,1000),2000));
  v_url text;
  v_response extensions.http_response;
  v_body jsonb;
  v_feature jsonb;
  v_props jsonb;
  v_identity uuid;
  v_name text;
  v_rows integer:=0;
  v_source_rows integer:=0;
  v_has_more boolean:=false;
begin
  select source_county_code into v_source_county
  from public.brinesearch_road_graph_counties
  where state_code='WV' and county_code=v_county and active;
  if not found then raise exception 'County is outside the issue #97 West Virginia footprint'; end if;
  select case v_source
    when 'wv_wvdot_street_name_doh' then 117
    when 'wv_wvdot_street_name_sams' then 118
    when 'wv_wvdot_alternate_route_name' then 4
    else null end,
    case v_source when 'wv_wvdot_street_name_doh' then 'local'
      when 'wv_wvdot_street_name_sams' then '911' else 'alternate' end,
    d.id
  into v_layer,v_name_type,v_dataset
  from public.brinesearch_road_source_datasets d where d.source_key=v_source;
  if v_layer is null then raise exception 'Unsupported WVDOT name source'; end if;
  v_url:='https://gis.transportation.wv.gov/arcgis/rest/services/Roads_And_Highways/Publication_LRS/MapServer/'||v_layer||'/query'
    ||'?where=ROUTE_ID%20LIKE%20%27'||v_source_county||'%25%27'
    ||'&outFields=*&returnGeometry=false&orderByFields=OBJECTID&resultOffset='||v_offset
    ||'&resultRecordCount='||v_limit||'&f=json';
  v_response:=extensions.http_get(v_url);
  if v_response.status<>200 then raise exception 'WVDOT name request failed with HTTP %',v_response.status; end if;
  v_body:=v_response.content::jsonb;
  if v_body ? 'error' then raise exception 'WVDOT name response contained an ArcGIS error'; end if;
  v_source_rows:=pg_catalog.jsonb_array_length(coalesce(v_body->'features','[]'::jsonb));
  v_has_more:=coalesce(
    nullif(v_body->>'exceededTransferLimit','')::boolean,
    nullif(v_body->'properties'->>'exceededTransferLimit','')::boolean,
    v_source_rows=v_limit
  );
  for v_feature in select value from pg_catalog.jsonb_array_elements(coalesce(v_body->'features','[]'::jsonb))
  loop
    v_props:=v_feature->'attributes';
    v_name:=coalesce(
      nullif(pg_catalog.btrim(v_props->>'STREET_NAME'),''),
      nullif(pg_catalog.btrim(v_props->>'ALT_ROUTE_NAME'),''),
      nullif(pg_catalog.btrim(v_props->>'ROUTE_NAME'),''),
      nullif(pg_catalog.btrim(v_props->>'ALTERNATE_NAME'),'')
    );
    if v_name is null or nullif(v_props->>'ROUTE_ID','') is null then continue; end if;
    v_identity:=private_verification.brinesearch_issue97_uuid('WV:WVDOT:ROUTE_ID:'||(v_props->>'ROUTE_ID'));
    if not exists(select 1 from public.brinesearch_authoritative_road_identities where id=v_identity) then continue; end if;
    insert into public.brinesearch_authoritative_road_names(
      identity_id,source_dataset_id,source_record_id,name_type,road_name,normalized_name,
      from_measure,to_measure,valid_from,valid_to,provenance
    ) values (
      v_identity,v_dataset,coalesce(v_props->>'OBJECTID',v_props->>'STREET_NAME_ID',pg_catalog.md5(v_props::text)),
      v_name_type,v_name,pg_catalog.regexp_replace(pg_catalog.lower(v_name),'[^a-z0-9]+',' ','g'),
      nullif(v_props->>'FROM_MEASURE','')::numeric,nullif(v_props->>'TO_MEASURE','')::numeric,
      case when (v_props->>'RH_FROM_DATE') ~ '^[0-9]+$' then pg_catalog.to_timestamp((v_props->>'RH_FROM_DATE')::numeric/1000.0) end,
      case when (v_props->>'RH_TO_DATE') ~ '^[0-9]+$' then pg_catalog.to_timestamp((v_props->>'RH_TO_DATE')::numeric/1000.0) end,
      pg_catalog.jsonb_build_object('route_id',v_props->>'ROUTE_ID','source_key',v_source,'attributes',v_props)
    ) on conflict(identity_id,source_dataset_id,source_record_id,name_type,road_name) do update set
      from_measure=excluded.from_measure,to_measure=excluded.to_measure,
      valid_from=excluded.valid_from,valid_to=excluded.valid_to,
      provenance=excluded.provenance,active=true,last_seen_at=now(),updated_at=now();
    v_rows:=v_rows+1;
  end loop;
  update public.brinesearch_road_source_datasets set fetched_at=now(),updated_at=now()
  where id=v_dataset;
  return pg_catalog.jsonb_build_object(
    'source',v_source,'county_code',v_county,'offset',v_offset,
    'page_size',v_limit,'source_rows',v_source_rows,'rows',v_rows,
    'rejected_rows',v_source_rows-v_rows,'has_more',v_has_more,
    'page_digest',pg_catalog.md5(coalesce((v_body->'features')::text,'[]'))
  );
end
$$;

create or replace function public.brinesearch_issue97_ingest_pa_page(
  p_source_key text,
  p_county_code text,
  p_offset integer default 0,
  p_page_size integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_source text:=pg_catalog.lower(pg_catalog.btrim(coalesce(p_source_key,'')));
  v_county text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_county_code,'')));
  v_source_county text;
  v_county_name text;
  v_dataset uuid;
  v_layer integer;
  v_offset integer:=greatest(0,coalesce(p_offset,0));
  v_limit integer:=greatest(1,least(coalesce(p_page_size,1000),2000));
  v_url text;
  v_response extensions.http_response;
  v_body jsonb;
  v_feature jsonb;
  v_props jsonb;
  v_geom extensions.geometry;
  v_identity uuid;
  v_identity_key text;
  v_segment_key text;
  v_display text;
  v_source_name text;
  v_internal_id text;
  v_internal_route text;
  v_signed text;
  v_signed_index integer;
  v_signed_type_fields constant text[]:=array['TRAF_RT_NO','TRAF_RT__3','TRAF_RT__6'];
  v_signed_number_fields constant text[]:=array['TRAF_RT__1','TRAF_RT__4','TRAF_RT__7'];
  v_signed_suffix_fields constant text[]:=array['TRAF_RT__2','TRAF_RT__5','TRAF_RT__8'];
  v_access text;
  v_drivable text;
  v_rows integer:=0;
  v_source_rows integer:=0;
  v_has_more boolean:=false;
begin
  select source_county_code,county_name into v_source_county,v_county_name
  from public.brinesearch_road_graph_counties
  where state_code='PA' and county_code=v_county and active;
  if not found then raise exception 'County is outside the issue #97 Pennsylvania footprint'; end if;
  select case v_source when 'pa_penndot_state_roads' then 4
    when 'pa_penndot_local_roads' then 3
    when 'pa_penndot_at_grade_intersections' then 23 else null end,d.id
  into v_layer,v_dataset
  from public.brinesearch_road_source_datasets d where d.source_key=v_source;
  if v_layer is null then raise exception 'Unsupported PennDOT source'; end if;
  v_url:='https://mapservices.pasda.psu.edu/server/rest/services/pasda/PennDOT/MapServer/'||v_layer||'/query'
    ||'?where=CTY_CODE%3D%27'||v_source_county||'%27&outFields=*'
    ||'&returnGeometry=true&returnM=false&returnZ=false&outSR=4326'
    ||'&orderByFields=OBJECTID'
    ||'&resultOffset='||v_offset||'&resultRecordCount='||v_limit||'&f=geojson';
  v_response:=extensions.http_get(v_url);
  if v_response.status<>200 then raise exception 'PennDOT request failed with HTTP %',v_response.status; end if;
  v_body:=v_response.content::jsonb;
  if v_body ? 'error' then raise exception 'PennDOT response contained an ArcGIS error'; end if;
  v_source_rows:=pg_catalog.jsonb_array_length(coalesce(v_body->'features','[]'::jsonb));
  v_has_more:=coalesce(
    nullif(v_body->>'exceededTransferLimit','')::boolean,
    nullif(v_body->'properties'->>'exceededTransferLimit','')::boolean,
    v_source_rows=v_limit
  );

  for v_feature in select value from pg_catalog.jsonb_array_elements(coalesce(v_body->'features','[]'::jsonb))
  loop
    v_props:=v_feature->'properties';
    if v_feature->'geometry' is null then continue; end if;
    begin
      v_geom:=extensions.st_force2d(extensions.st_setsrid(extensions.st_geomfromgeojson((v_feature->'geometry')::text),4326));
    exception when others then continue;
    end;

    if v_source='pa_penndot_at_grade_intersections' then
      if extensions.geometrytype(v_geom)<>'POINT' then continue; end if;
      v_segment_key:='PA:PENNDOT:AT_GRADE:'||coalesce(v_props->>'NODE_ID',v_props->>'OBJECTID');
      insert into public.brinesearch_authoritative_road_nodes(
        id,dataset_id,source_node_key,source_record_id,state_code,county_code,
        county_name,node_type,geom,attributes,source_digest,active,fetched_at
      ) values (
        private_verification.brinesearch_issue97_uuid(v_segment_key),v_dataset,v_segment_key,
        coalesce(v_props->>'OBJECTID',v_props->>'NODE_ID'),'PA',v_county,v_county_name,
        'at_grade_intersection',v_geom,v_props,
        pg_catalog.md5(v_props::text||extensions.st_asgeojson(v_geom,15)),true,now()
      ) on conflict(source_node_key) do update set
        county_code=excluded.county_code,county_name=excluded.county_name,geom=excluded.geom,
        attributes=excluded.attributes,source_digest=excluded.source_digest,active=true,fetched_at=now();
      v_rows:=v_rows+1;
      continue;
    end if;

    if extensions.st_isempty(v_geom) or extensions.st_dimension(v_geom)<>1 then continue; end if;
    if v_source='pa_penndot_state_roads' then
      v_internal_id:=coalesce(nullif(v_props->>'NLF_ID',''),nullif(v_props->>'GPID',''),v_props->>'OBJECTID');
      v_identity_key:='PA:PENNDOT:STATE:'||v_source_county||':NLF:'||v_internal_id;
      v_source_name:=nullif(pg_catalog.btrim(v_props->>'STREET_NAM'),'');
      v_display:=coalesce(
        v_source_name,
        nullif(pg_catalog.btrim(v_props->>'STREET_N_1'),''),
        'PennDOT internal road '||v_internal_id
      );
      v_internal_route:=nullif(pg_catalog.btrim(v_props->>'T_RT_NO'),'');
      v_signed:=null;
      v_segment_key:='PA:PENNDOT:STATE:SEGMENT:'||(v_props->>'OBJECTID');
      v_access:=case when coalesce(v_props->>'SEG_STATUS','A')='A' then 'public' else 'held' end;
      v_drivable:=case when coalesce(v_props->>'SEG_STATUS','A')='A' then 'drivable' else 'held' end;
    else
      v_internal_id:=coalesce(
        nullif(nullif(v_props->>'LR_ID',''),'0'),
        nullif(nullif(v_props->>'RS_ID',''),'0'),
        nullif(nullif(v_props->>'ID',''),'0'),
        nullif(v_props->>'LR_RT_NO',''),v_props->>'OBJECTID'
      );
      v_identity_key:='PA:PENNDOT:LOCAL:'||v_source_county||':'
        ||coalesce(v_props->>'MUN_ID','UNKNOWN')||':'||v_internal_id||':'||coalesce(v_props->>'LR_RT_NO','UNKNOWN');
      v_source_name:=nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ',
        nullif(v_props->>'LR_NAME',''),nullif(v_props->>'LR_TYPE','')
      )), '');
      v_display:=coalesce(v_source_name,'PennDOT local road '||v_internal_id);
      v_internal_route:=nullif(pg_catalog.btrim(v_props->>'LR_RT_NO'),'');
      v_signed:=null;
      v_segment_key:='PA:PENNDOT:LOCAL:SEGMENT:'||(v_props->>'OBJECTID');
      -- Layer 3 is PennDOT's inventory of identified public roads not
      -- PennDOT-maintained. A missing display label is not access evidence.
      v_access:='public';
      v_drivable:='drivable';
    end if;
    v_identity:=private_verification.brinesearch_issue97_uuid(v_identity_key);
    insert into public.brinesearch_authoritative_road_identities(
      id,dataset_id,source_identity_key,state_code,county_code,county_name,
      municipality,route_system,route_number,display_name,normalized_name,road_class,
      public_access_status,drivable_status,maintainer,surface,truck_status,
      source_record_ids,attributes,source_digest,source_timestamp,active,last_seen_at
    ) values (
      v_identity,v_dataset,v_identity_key,'PA',v_county,v_county_name,
      nullif(coalesce(v_props->>'MUNICIPAL1',v_props->>'MUNICIPAL_'),''),
      case when v_source='pa_penndot_state_roads' then 'PennDOT NLF' else 'PennDOT local LRS' end,
      v_internal_route,v_display,pg_catalog.regexp_replace(pg_catalog.lower(v_display),'[^a-z0-9]+',' ','g'),
      case when v_source='pa_penndot_state_roads' and (
          pg_catalog.upper(v_display) like 'RAMP %'
          or (v_internal_route ~ '^8[0-9]{3}$' and coalesce(v_props->>'FAC_TYPE','') in ('7','8','9'))
        ) then 'ramp'
        when v_source='pa_penndot_state_roads' then 'state_route' else 'local' end,
      v_access,v_drivable,'Pennsylvania Department of Transportation',
      nullif(coalesce(v_props->>'SURF_TYPE',v_props->>'SURFACE_TY'),''),
      case when coalesce(v_props->>'TRUCK_DAIL','0')<>'0' then 'truck_data_present' end,
      array[v_props->>'OBJECTID'],v_props,
      pg_catalog.md5(v_props::text||extensions.st_asgeojson(v_geom,15)),
      case when (coalesce(v_props->>'GIS_UPDATE',v_props->>'GIS_GEOMET')) ~ '^[0-9]+$'
        then pg_catalog.to_timestamp((coalesce(v_props->>'GIS_UPDATE',v_props->>'GIS_GEOMET'))::numeric/1000.0) end,
      true,now()
    ) on conflict(source_identity_key) do update set
      county_code=excluded.county_code,county_name=excluded.county_name,
      municipality=coalesce(excluded.municipality,public.brinesearch_authoritative_road_identities.municipality),
      route_system=excluded.route_system,
      route_number=coalesce(excluded.route_number,public.brinesearch_authoritative_road_identities.route_number),
      display_name=case when public.brinesearch_authoritative_road_identities.display_name like 'PennDOT % road %'
        then excluded.display_name else public.brinesearch_authoritative_road_identities.display_name end,
      normalized_name=case when public.brinesearch_authoritative_road_identities.display_name like 'PennDOT % road %'
        then excluded.normalized_name else public.brinesearch_authoritative_road_identities.normalized_name end,
      road_class=excluded.road_class,public_access_status=excluded.public_access_status,
      drivable_status=excluded.drivable_status,maintainer=excluded.maintainer,
      surface=coalesce(excluded.surface,public.brinesearch_authoritative_road_identities.surface),
      truck_status=coalesce(excluded.truck_status,public.brinesearch_authoritative_road_identities.truck_status),
      source_record_ids=array(select distinct x from unnest(
        public.brinesearch_authoritative_road_identities.source_record_ids||excluded.source_record_ids
      ) x),attributes=excluded.attributes,source_digest=excluded.source_digest,
      source_timestamp=excluded.source_timestamp,active=true,last_seen_at=now();
    -- Identifier-only fallbacks are useful identity labels, but they are not
    -- source-backed road names and must never seed search or name-change events.
    if v_source_name is not null then
      insert into public.brinesearch_authoritative_road_names(
        identity_id,source_dataset_id,source_record_id,name_type,road_name,normalized_name,
        source_segment_key,from_measure,to_measure,provenance
      ) values (
        v_identity,v_dataset,v_props->>'OBJECTID','official',v_source_name,
        pg_catalog.regexp_replace(pg_catalog.lower(v_source_name),'[^a-z0-9]+',' ','g'),v_segment_key,
        nullif(coalesce(v_props->>'NLF_CNTL_B',v_props->>'CUM_OFFSET'),'')::numeric/5280.0,
        nullif(coalesce(v_props->>'NLF_CNTL_E',v_props->>'CUM_OFFS_1'),'')::numeric/5280.0,
        pg_catalog.jsonb_build_object('source_key',v_source,'internal_identity',v_internal_id,
          'measure_unit','mile','source_measure_unit','foot','attributes',v_props)
      ) on conflict(identity_id,source_dataset_id,source_record_id,name_type,road_name) do update set
        source_segment_key=excluded.source_segment_key,from_measure=excluded.from_measure,
        to_measure=excluded.to_measure,provenance=excluded.provenance,
        active=true,last_seen_at=now(),updated_at=now();
    end if;
    if v_source='pa_penndot_state_roads' then
      if nullif(pg_catalog.btrim(v_props->>'STREET_N_1'),'') is not null then
        insert into public.brinesearch_authoritative_road_names(
          identity_id,source_dataset_id,source_record_id,name_type,road_name,normalized_name,source_segment_key,provenance
        ) values(v_identity,v_dataset,(v_props->>'OBJECTID')||':name1','local',pg_catalog.btrim(v_props->>'STREET_N_1'),
          pg_catalog.regexp_replace(pg_catalog.lower(v_props->>'STREET_N_1'),'[^a-z0-9]+',' ','g'),v_segment_key,
          pg_catalog.jsonb_build_object('field','STREET_N_1','source_key',v_source))
        on conflict(identity_id,source_dataset_id,source_record_id,name_type,road_name) do update
          set source_segment_key=excluded.source_segment_key,provenance=excluded.provenance,
              active=true,last_seen_at=now(),updated_at=now();
      end if;
      if nullif(pg_catalog.btrim(v_props->>'STREET_N_2'),'') is not null then
        insert into public.brinesearch_authoritative_road_names(
          identity_id,source_dataset_id,source_record_id,name_type,road_name,normalized_name,source_segment_key,provenance
        ) values(v_identity,v_dataset,(v_props->>'OBJECTID')||':name2','local',pg_catalog.btrim(v_props->>'STREET_N_2'),
          pg_catalog.regexp_replace(pg_catalog.lower(v_props->>'STREET_N_2'),'[^a-z0-9]+',' ','g'),v_segment_key,
          pg_catalog.jsonb_build_object('field','STREET_N_2','source_key',v_source))
        on conflict(identity_id,source_dataset_id,source_record_id,name_type,road_name) do update
          set source_segment_key=excluded.source_segment_key,provenance=excluded.provenance,
              active=true,last_seen_at=now(),updated_at=now();
      end if;
      for v_signed_index in 1..3 loop
        v_signed:=case
          when nullif(pg_catalog.btrim(v_props->>(v_signed_type_fields[v_signed_index])),'') is not null
           and nullif(pg_catalog.ltrim(pg_catalog.btrim(coalesce(
             v_props->>(v_signed_number_fields[v_signed_index]),''
           )),'0'),'') is not null
          then pg_catalog.upper(pg_catalog.btrim(v_props->>(v_signed_type_fields[v_signed_index])))||'-'
            ||pg_catalog.ltrim(pg_catalog.btrim(v_props->>(v_signed_number_fields[v_signed_index])),'0')
            ||coalesce(nullif(pg_catalog.btrim(coalesce(
              v_props->>(v_signed_suffix_fields[v_signed_index]),''
            )),''),'')
        end;
        if v_signed is not null then
          insert into public.brinesearch_authoritative_road_names(
            identity_id,source_dataset_id,source_record_id,name_type,road_name,normalized_name,
            source_segment_key,provenance
          ) values(
            v_identity,v_dataset,(v_props->>'OBJECTID')||':signed:'||v_signed_index,
            'signed',v_signed,
            pg_catalog.regexp_replace(pg_catalog.lower(v_signed),'[^a-z0-9]+',' ','g'),v_segment_key,
            pg_catalog.jsonb_build_object(
              'fields',pg_catalog.jsonb_build_array(
                v_signed_type_fields[v_signed_index],v_signed_number_fields[v_signed_index],
                v_signed_suffix_fields[v_signed_index]
              ),'explicitly_signed',true,'source_key',v_source
            )
          ) on conflict(identity_id,source_dataset_id,source_record_id,name_type,road_name) do update
            set source_segment_key=excluded.source_segment_key,provenance=excluded.provenance,
                active=true,last_seen_at=now(),updated_at=now();
        end if;
      end loop;
      if v_internal_route is not null then
        insert into public.brinesearch_authoritative_road_names(
          identity_id,source_dataset_id,source_record_id,name_type,road_name,normalized_name,source_segment_key,provenance
        ) values(v_identity,v_dataset,(v_props->>'OBJECTID')||':internal','internal',v_internal_route,
          pg_catalog.regexp_replace(pg_catalog.lower(v_internal_route),'[^a-z0-9]+',' ','g'),v_segment_key,
          pg_catalog.jsonb_build_object('field','T_RT_NO','explicitly_signed',false,'source_key',v_source))
        on conflict(identity_id,source_dataset_id,source_record_id,name_type,road_name) do update
          set source_segment_key=excluded.source_segment_key,provenance=excluded.provenance,
              active=true,last_seen_at=now(),updated_at=now();
      end if;
    end if;
    insert into public.brinesearch_authoritative_external_road_segments(
      id,dataset_id,identity_id,source_segment_key,source_record_id,state_code,
      county_code,county_name,municipality,from_measure,to_measure,route_direction,
      z_level,bridge_status,tunnel_status,public_access_status,drivable_status,
      geom,attributes,source_digest,source_timestamp,active,fetched_at
    ) values (
      private_verification.brinesearch_issue97_uuid(v_segment_key),v_dataset,v_identity,
      v_segment_key,v_props->>'OBJECTID','PA',v_county,v_county_name,
      nullif(coalesce(v_props->>'MUNICIPAL1',v_props->>'MUNICIPAL_'),''),
      nullif(coalesce(v_props->>'NLF_CNTL_B',v_props->>'CUM_OFFSET'),'')::numeric/5280.0,
      nullif(coalesce(v_props->>'NLF_CNTL_E',v_props->>'CUM_OFFS_1'),'')::numeric/5280.0,
      v_props->>'ROUTE_DIR',case when coalesce(v_props->>'ELEMENTLEV','')~'^-?[0-9]+$'
        then (v_props->>'ELEMENTLEV')::integer end,
      case when coalesce(v_props->>'IS_STRUCTU','0') not in ('0','')
          or coalesce(nullif(v_props->>'BRIDGE_COU',''),'0')::numeric>0 then 'bridge'
        when (v_props ? 'IS_STRUCTU' or v_props ? 'BRIDGE_COU') then 'surface' end,
      case when pg_catalog.upper(coalesce(v_props->>'TUNNEL_IND','')) in ('Y','1','TRUE') then 'tunnel'
        when pg_catalog.upper(coalesce(v_props->>'TUNNEL_IND','')) in ('N','0','FALSE') then 'surface' end,
      v_access,v_drivable,v_geom,v_props,
      pg_catalog.md5(v_props::text||extensions.st_asgeojson(v_geom,15)),
      case when (coalesce(v_props->>'GIS_UPDATE',v_props->>'GIS_GEOMET')) ~ '^[0-9]+$'
        then pg_catalog.to_timestamp((coalesce(v_props->>'GIS_UPDATE',v_props->>'GIS_GEOMET'))::numeric/1000.0) end,
      true,now()
    ) on conflict(source_segment_key) do update set
      identity_id=excluded.identity_id,county_code=excluded.county_code,county_name=excluded.county_name,
      municipality=excluded.municipality,from_measure=excluded.from_measure,to_measure=excluded.to_measure,
      route_direction=excluded.route_direction,z_level=excluded.z_level,
      bridge_status=excluded.bridge_status,tunnel_status=excluded.tunnel_status,
      public_access_status=excluded.public_access_status,drivable_status=excluded.drivable_status,
      geom=excluded.geom,attributes=excluded.attributes,source_digest=excluded.source_digest,
      source_timestamp=excluded.source_timestamp,active=true,fetched_at=now();
    v_rows:=v_rows+1;
  end loop;
  update public.brinesearch_road_source_datasets set fetched_at=now(),updated_at=now()
  where id=v_dataset;
  return pg_catalog.jsonb_build_object(
    'source',v_source,'county_code',v_county,'source_county_code',v_source_county,
    'offset',v_offset,'page_size',v_limit,'source_rows',v_source_rows,
    'rows',v_rows,'rejected_rows',v_source_rows-v_rows,'has_more',v_has_more,
    'page_digest',pg_catalog.md5(coalesce((v_body->'features')::text,'[]'))
  );
end
$$;

create or replace function private_verification.brinesearch_issue97_join_name_fields(
  p_attributes jsonb,
  p_fields text[]
)
returns text
language sql
immutable
set search_path=''
as $$
  select nullif(pg_catalog.btrim(pg_catalog.regexp_replace(
    pg_catalog.string_agg(nullif(pg_catalog.btrim(p_attributes->>field_name),''),' '
      order by field_order),E'\\s+',' ','g'
  )), '')
  from unnest(p_fields) with ordinality fields(field_name,field_order)
$$;

revoke all on function private_verification.brinesearch_issue97_join_name_fields(jsonb,text[])
from public,anon,authenticated,service_role;

create or replace function public.brinesearch_issue97_ingest_supplemental_page(
  p_run_id uuid,
  p_offset integer,
  p_page_size integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_run record;
  v_offset integer:=greatest(0,coalesce(p_offset,0));
  v_limit integer:=greatest(1,least(coalesce(p_page_size,1000),2000));
  v_source_county text;
  v_where text;
  v_oid_field text;
  v_url text;
  v_response extensions.http_response;
  v_body jsonb;
  v_feature jsonb;
  v_props jsonb;
  v_geom extensions.geometry;
  v_record_id text;
  v_stable_id text;
  v_feature_key text;
  v_name text;
  v_names jsonb;
  v_rows integer:=0;
  v_source_rows integer:=0;
  v_has_more boolean:=false;
begin
  select r.*,d.source_key,d.source_url,d.source_version,d.state_code as dataset_state
  into v_run
  from public.brinesearch_road_source_ingest_runs r
  join public.brinesearch_road_source_datasets d on d.id=r.dataset_id and d.active
  join public.brinesearch_road_source_dataset_counties scope
    on scope.dataset_id=d.id and scope.state_code=r.state_code
   and scope.county_code=r.county_code and scope.active and scope.ingest_enabled
  where r.id=p_run_id and r.status='loading'
  for update of r;
  if not found then raise exception 'Active supplemental ingest run not found' using errcode='P0002'; end if;
  if v_run.source_key not in (
    'oh_ogrip_lbrs_centerlines','pa_allegheny_ng911_centerlines',
    'pa_bradford_ng911_centerlines','pa_butler_centerlines',
    'pa_fayette_ng911_centerlines','pa_indiana_ng911_centerlines',
    'pa_washington_ng911_centerlines'
  ) then raise exception 'Run is not a supported supplemental centerline source' using errcode='22023'; end if;

  select c.source_county_code into strict v_source_county
  from public.brinesearch_road_graph_counties c
  where c.state_code=v_run.state_code and c.county_code=v_run.county_code;
  if v_run.source_key='oh_ogrip_lbrs_centerlines' then
    v_where:='laddcounty='''||v_source_county||''' OR raddcounty='''||v_source_county||'''';
    v_oid_field:='objectid';
  else
    v_where:='1=1';
    v_oid_field:=case v_run.source_key
      when 'pa_bradford_ng911_centerlines' then 'OBJECTID_12'
      when 'pa_fayette_ng911_centerlines' then 'OBJECTID_12'
      else 'OBJECTID' end;
  end if;
  v_url:=v_run.source_url||'/query?where='||extensions.urlencode(v_where)
    ||'&outFields=*&returnGeometry=true&returnM=false&returnZ=false&outSR=4326'
    ||'&orderByFields='||v_oid_field
    ||'&resultOffset='||v_offset||'&resultRecordCount='||v_limit||'&f=geojson';
  v_response:=extensions.http_get(v_url);
  if v_response.status<>200 then raise exception 'Supplemental source request failed with HTTP %',v_response.status; end if;
  v_body:=v_response.content::jsonb;
  if v_body ? 'error' then raise exception 'Supplemental source response contained an ArcGIS error'; end if;
  v_source_rows:=pg_catalog.jsonb_array_length(coalesce(v_body->'features','[]'::jsonb));
  v_has_more:=coalesce(
    nullif(v_body->>'exceededTransferLimit','')::boolean,
    nullif(v_body->'properties'->>'exceededTransferLimit','')::boolean,
    v_source_rows=v_limit
  );

  for v_feature in
    select value from pg_catalog.jsonb_array_elements(coalesce(v_body->'features','[]'::jsonb))
  loop
    v_props:=v_feature->'properties';
    if v_feature->'geometry' is null then continue; end if;
    begin
      v_geom:=extensions.st_force2d(extensions.st_multi(extensions.st_collectionextract(
        extensions.st_setsrid(extensions.st_geomfromgeojson((v_feature->'geometry')::text),4326),2
      )));
    exception when others then continue;
    end;
    if v_geom is null or extensions.st_isempty(v_geom) or extensions.st_dimension(v_geom)<>1
       or not extensions.st_isvalid(v_geom) or not extensions.st_issimple(v_geom) then continue; end if;

    v_record_id:=case v_run.source_key
      when 'oh_ogrip_lbrs_centerlines' then coalesce(v_props->>'objectid',v_props->>'OBJECTID')
      when 'pa_allegheny_ng911_centerlines' then v_props->>'OBJECTID'
      when 'pa_bradford_ng911_centerlines' then v_props->>'OBJECTID_12'
      when 'pa_butler_centerlines' then v_props->>'OBJECTID'
      when 'pa_fayette_ng911_centerlines' then v_props->>'OBJECTID_12'
      when 'pa_indiana_ng911_centerlines' then v_props->>'OBJECTID'
      when 'pa_washington_ng911_centerlines' then v_props->>'OBJECTID'
    end;
    if nullif(v_record_id,'') is null then continue; end if;
    v_stable_id:=case v_run.source_key
      when 'oh_ogrip_lbrs_centerlines' then case
        when nullif(v_props->>'seg_id','') is not null
          and (v_props->>'seg_id' like 'RCL_%' or v_props->>'seg_id' like '%@%')
        then 'SEG:'||(v_props->>'seg_id')
        else 'OID:'||v_run.source_version||':'||v_record_id end
      when 'pa_allegheny_ng911_centerlines' then
        'FEATURE:'||coalesce(nullif(v_props->>'FEATURE_KE',''),v_run.source_version||':'||v_record_id)
      when 'pa_bradford_ng911_centerlines' then
        'NGUID:'||coalesce(nullif(v_props->>'RCL_NGUID',''),v_run.source_version||':'||v_record_id)
      when 'pa_butler_centerlines' then 'OID:'||v_run.source_version||':'||v_record_id
      when 'pa_fayette_ng911_centerlines' then
        'NGUID:'||coalesce(nullif(v_props->>'RCL_NGUID',''),v_run.source_version||':'||v_record_id)
      when 'pa_indiana_ng911_centerlines' then
        'NGUID:'||coalesce(nullif(v_props->>'RCL_NGUID',''),v_run.source_version||':'||v_record_id)
      when 'pa_washington_ng911_centerlines' then
        'NGUID:'||coalesce(nullif(v_props->>'RCL_NGUID',''),v_run.source_version||':'||v_record_id)
    end;
    v_feature_key:=v_run.source_key||':'||v_stable_id;
    v_names:='[]'::jsonb;
    if v_run.source_key='oh_ogrip_lbrs_centerlines' then
      v_name:=private_verification.brinesearch_issue97_join_name_fields(
        v_props,array['str_pre','str_name','str_type','str_suffix']);
      if v_name is not null then v_names:=v_names||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('type','local','name',v_name,'fields',
          pg_catalog.jsonb_build_array('str_pre','str_name','str_type','str_suffix'))); end if;
    elsif v_run.source_key='pa_allegheny_ng911_centerlines' then
      v_name:=nullif(pg_catalog.btrim(v_props->>'FULL_NAME'),'');
      if v_name is not null then v_names:=v_names||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('type','911','name',v_name,'field','FULL_NAME')); end if;
    elsif v_run.source_key='pa_bradford_ng911_centerlines' then
      v_name:=coalesce(nullif(pg_catalog.btrim(v_props->>'StreetName'),''),
        private_verification.brinesearch_issue97_join_name_fields(v_props,
          array['StN_PreMod','StN_PreDir','StN_PreTyp','St_Name','StN_PosTyp','StN_PosDir','StN_PosMod']));
      if v_name is not null then v_names:=v_names||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('type','911','name',v_name)); end if;
      v_name:=coalesce(nullif(pg_catalog.btrim(v_props->>'Alias'),''),
        private_verification.brinesearch_issue97_join_name_fields(v_props,array['Lst_PreDir','LSt_Name','LSt_Type','LSt_PosDir']));
      if v_name is not null then v_names:=v_names||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('type','legacy','name',v_name)); end if;
    elsif v_run.source_key='pa_butler_centerlines' then
      v_name:=nullif(pg_catalog.btrim(v_props->>'FULLNAME'),'');
      if v_name is not null then v_names:=v_names||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('type','911','name',v_name,'field','FULLNAME')); end if;
    elsif v_run.source_key='pa_fayette_ng911_centerlines' then
      v_name:=private_verification.brinesearch_issue97_join_name_fields(v_props,
        array['St_PreMod','St_PreDir','St_PreTyp','St_PreSep','St_Name','St_PosTyp','St_PosDir','St_PosMod']);
      if v_name is null then v_name:=nullif(pg_catalog.btrim(v_props->>'St_Name'),''); end if;
      if v_name is not null then v_names:=v_names||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('type','911','name',v_name)); end if;
      v_name:=coalesce(nullif(pg_catalog.btrim(v_props->>'AKA'),''),
        private_verification.brinesearch_issue97_join_name_fields(v_props,array['Lst_PreDir','LSt_Name','LSt_Type','LSt_PosDir']));
      if v_name is not null then v_names:=v_names||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('type','legacy','name',v_name)); end if;
    elsif v_run.source_key='pa_indiana_ng911_centerlines' then
      v_name:=private_verification.brinesearch_issue97_join_name_fields(v_props,
        array['ST_PREMOD','ST_PREDIR','ST_PRETYP','ST_PRESEP','ST_NAME','ST_POSTYP','ST_POSDIR','ST_POSMOD']);
      if v_name is null then v_name:=nullif(pg_catalog.btrim(v_props->>'ST_NAME'),''); end if;
      if v_name is not null then v_names:=v_names||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('type','911','name',v_name)); end if;
      v_name:=nullif(pg_catalog.btrim(v_props->>'ALIAS'),'');
      if v_name is not null then v_names:=v_names||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('type','alternate','name',v_name)); end if;
    elsif v_run.source_key='pa_washington_ng911_centerlines' then
      v_name:=private_verification.brinesearch_issue97_join_name_fields(v_props,
        array['St_PreMod','St_PreDir','St_PreTyp','St_PreSep','St_Name','St_PosTyp','St_PosDir','St_PosMod']);
      if v_name is not null then v_names:=v_names||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('type','911','name',v_name)); end if;
      v_name:=private_verification.brinesearch_issue97_join_name_fields(v_props,
        array['Lst_PreDir','LSt_Name','LSt_Type','LSt_PosDir']);
      if v_name is not null then v_names:=v_names||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('type','legacy','name',v_name)); end if;
    end if;

    insert into public.brinesearch_authoritative_supplemental_centerlines(
      id,dataset_id,source_feature_key,source_record_id,state_code,county_code,county_name,
      municipality_left,municipality_right,township_left,township_right,name_events,
      geom,attributes,source_digest,source_timestamp,last_ingest_run_id,active,fetched_at
    ) values (
      private_verification.brinesearch_issue97_uuid('supplemental:'||v_run.dataset_id::text||':'||v_feature_key),
      v_run.dataset_id,v_feature_key,v_record_id,v_run.state_code,v_run.county_code,
      (select county_name from public.brinesearch_road_graph_counties
        where state_code=v_run.state_code and county_code=v_run.county_code),
      nullif(coalesce(v_props->>'l_dotmuni',v_props->>'IncMuni_L',v_props->>'LMUNI'),''),
      nullif(coalesce(v_props->>'r_dotmuni',v_props->>'IncMuni_R',v_props->>'RMUNI'),''),
      nullif(coalesce(v_props->>'l_twp',v_props->>'L_TWP'),''),
      nullif(coalesce(v_props->>'r_twp',v_props->>'R_TWP'),''),
      v_names,v_geom,v_props,pg_catalog.md5(v_props::text||extensions.st_asgeojson(v_geom,15)),
      case when coalesce(v_props->>'DateUpdate',v_props->>'DATEMODIFI')~'^[0-9]+$'
        then pg_catalog.to_timestamp(coalesce(v_props->>'DateUpdate',v_props->>'DATEMODIFI')::numeric/1000.0) end,
      p_run_id,true,now()
    ) on conflict(dataset_id,source_feature_key) do update set
      source_record_id=excluded.source_record_id,county_code=excluded.county_code,
      county_name=excluded.county_name,municipality_left=excluded.municipality_left,
      municipality_right=excluded.municipality_right,township_left=excluded.township_left,
      township_right=excluded.township_right,name_events=excluded.name_events,
      geom=excluded.geom,attributes=excluded.attributes,source_digest=excluded.source_digest,
      source_timestamp=excluded.source_timestamp,last_ingest_run_id=excluded.last_ingest_run_id,
      active=true,fetched_at=now();
    v_rows:=v_rows+1;
  end loop;
  return pg_catalog.jsonb_build_object(
    'source',v_run.source_key,'county_code',v_run.county_code,'offset',v_offset,
    'page_size',v_limit,'source_rows',v_source_rows,'rows',v_rows,
    'rejected_rows',v_source_rows-v_rows,'has_more',v_has_more,
    'page_digest',pg_catalog.md5(coalesce((v_body->'features')::text,'[]'))
  );
end
$$;

revoke all on function public.brinesearch_issue97_ingest_supplemental_page(uuid,integer,integer)
from public,anon,authenticated,service_role;

create or replace function public.brinesearch_issue97_refresh_supplemental_aliases(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_run record;
  v_mapping_count integer:=0;
  v_name_count integer:=0;
begin
  select r.*,d.source_key into v_run
  from public.brinesearch_road_source_ingest_runs r
  join public.brinesearch_road_source_datasets d on d.id=r.dataset_id
  where r.id=p_run_id and r.status='loading' and d.topology_role='supplemental_aliases'
  for update of r;
  if not found then raise exception 'Loading supplemental ingest run not found' using errcode='P0002'; end if;
  if v_run.source_key not in (
    'oh_ogrip_lbrs_centerlines',
    'pa_allegheny_ng911_centerlines','pa_bradford_ng911_centerlines',
    'pa_butler_centerlines','pa_fayette_ng911_centerlines',
    'pa_indiana_ng911_centerlines','pa_washington_ng911_centerlines'
  ) then
    raise exception 'Supplemental centerline alias refresh is not applicable to source %',v_run.source_key
      using errcode='22023';
  end if;

  update public.brinesearch_authoritative_supplemental_centerlines set active=false
  where dataset_id=v_run.dataset_id and state_code=v_run.state_code
    and county_code=v_run.county_code and active
    and last_ingest_run_id is distinct from p_run_id;
  update public.brinesearch_supplemental_centerline_identity_mappings m set
    active=false,mapping_status='retired',updated_at=now()
  where m.active and exists(
    select 1 from public.brinesearch_authoritative_supplemental_centerlines c
    where c.id=m.centerline_id and c.dataset_id=v_run.dataset_id
      and c.state_code=v_run.state_code and c.county_code=v_run.county_code
  );
  update public.brinesearch_authoritative_road_names n set active=false,updated_at=now()
  where n.source_dataset_id=v_run.dataset_id and n.active
    and exists(select 1 from public.brinesearch_authoritative_road_identities i
      where i.id=n.identity_id and i.state_code=v_run.state_code and i.county_code=v_run.county_code);

  if v_run.state_code='OH' then
    insert into public.brinesearch_supplemental_centerline_identity_mappings(
      centerline_id,identity_id,mapping_status,mapping_method,source_segment_keys,
      evidence,ingest_run_id,active
    )
    with candidate_geometry as (
      select c.id as centerline_id,s.identity_id,
        array_agg(distinct s.source_segment_key order by s.source_segment_key) as source_segment_keys,
        (array_agg(c.geom order by c.id))[1] as source_geom,
        extensions.st_unaryunion(extensions.st_collect(extensions.st_transform(s.geom,3857)))
          as target_geom
      from public.brinesearch_authoritative_supplemental_centerlines c
      join public.brinesearch_authoritative_road_segments s
        on s.state_code='OH' and s.county_code=c.county_code and s.active
       and extensions.st_dwithin(c.geom::extensions.geography,s.geom::extensions.geography,0.25)
      where c.dataset_id=v_run.dataset_id and c.county_code=v_run.county_code
        and c.active and c.last_ingest_run_id=p_run_id
      group by c.id,s.identity_id
    ), exact_matches as (
      select centerline_id,identity_id,source_segment_keys,
        greatest(
          extensions.st_distance(
            extensions.st_startpoint(extensions.st_linemerge(extensions.st_transform(source_geom,3857))),target_geom),
          extensions.st_distance(
            extensions.st_endpoint(extensions.st_linemerge(extensions.st_transform(source_geom,3857))),target_geom)
        ) as max_endpoint_distance_m,
        extensions.st_length(extensions.st_intersection(
          extensions.st_transform(source_geom,3857),extensions.st_buffer(target_geom,0.25)
        ))/nullif(extensions.st_length(extensions.st_transform(source_geom,3857)),0) as source_coverage
      from candidate_geometry
      where extensions.geometrytype(
        extensions.st_linemerge(extensions.st_transform(source_geom,3857)))='LINESTRING'
    )
    select centerline_id,identity_id,'verified','exact_geometry_coverage',source_segment_keys,
      pg_catalog.jsonb_build_object('max_endpoint_distance_m',max_endpoint_distance_m,
        'source_coverage',source_coverage,'buffer_tolerance_m',0.25,'name_used_for_mapping',false,
        'many_to_many_preserved',true),p_run_id,true
    from exact_matches where source_coverage>=0.98 and max_endpoint_distance_m<=0.25
    on conflict(centerline_id,identity_id) do update set
      mapping_status=excluded.mapping_status,mapping_method=excluded.mapping_method,
      source_segment_keys=excluded.source_segment_keys,evidence=excluded.evidence,
      ingest_run_id=excluded.ingest_run_id,active=true,updated_at=now();
  else
    insert into public.brinesearch_supplemental_centerline_identity_mappings(
      centerline_id,identity_id,mapping_status,mapping_method,source_segment_keys,
      evidence,ingest_run_id,active
    )
    with candidate_geometry as (
      select c.id as centerline_id,s.identity_id,
        array_agg(distinct s.source_segment_key order by s.source_segment_key) as source_segment_keys,
        (array_agg(c.geom order by c.id))[1] as source_geom,
        extensions.st_unaryunion(
          extensions.st_collect(extensions.st_transform(s.geom,3857))
        ) as target_geom
      from public.brinesearch_authoritative_supplemental_centerlines c
      join public.brinesearch_authoritative_road_segments s
        on s.state_code='PA' and s.county_code=c.county_code and s.active
       and extensions.st_dwithin(c.geom::extensions.geography,s.geom::extensions.geography,1)
      join public.brinesearch_authoritative_road_identities i on i.id=s.identity_id and i.active
      join public.brinesearch_road_source_datasets target_dataset
        on target_dataset.id=i.dataset_id and target_dataset.source_key='pa_penndot_local_roads'
      where c.dataset_id=v_run.dataset_id and c.county_code=v_run.county_code
        and c.active and c.last_ingest_run_id=p_run_id
        and (
          nullif(c.municipality_left,'') is not null
            and pg_catalog.regexp_replace(pg_catalog.upper(c.municipality_left),'[^A-Z0-9]+','','g')
              =pg_catalog.regexp_replace(pg_catalog.upper(coalesce(i.municipality,'')),'[^A-Z0-9]+','','g')
          or nullif(c.municipality_right,'') is not null
            and pg_catalog.regexp_replace(pg_catalog.upper(c.municipality_right),'[^A-Z0-9]+','','g')
              =pg_catalog.regexp_replace(pg_catalog.upper(coalesce(i.municipality,'')),'[^A-Z0-9]+','','g')
        )
      group by c.id,s.identity_id,c.geom
    ), candidate_coverage as (
      select centerline_id,identity_id,source_segment_keys,
        extensions.st_length(extensions.st_intersection(
          extensions.st_transform(source_geom,3857),extensions.st_buffer(target_geom,1)
        ))/nullif(extensions.st_length(extensions.st_transform(source_geom,3857)),0) as source_coverage,
        extensions.st_length(extensions.st_intersection(
          target_geom,extensions.st_buffer(extensions.st_transform(source_geom,3857),1)
        ))/nullif(extensions.st_length(target_geom),0) as target_coverage
      from candidate_geometry
    ), eligible as (
      select *,count(*) over(partition by centerline_id) as candidate_identity_count
      from candidate_coverage where source_coverage>=0.95 and target_coverage>=0.90
    )
    select centerline_id,identity_id,
      case when candidate_identity_count=1 then 'verified' else 'ambiguous' end,
      case when candidate_identity_count=1 then 'exact_geometry_coverage' else 'held_for_review' end,
      source_segment_keys,pg_catalog.jsonb_build_object(
        'source_coverage',source_coverage,'target_coverage',target_coverage,
        'buffer_tolerance_m',1,'candidate_identity_count',candidate_identity_count,
        'municipality_required',true,'name_used_for_mapping',false,
        'source_endpoint_snapping_forbidden',true
      ),p_run_id,true
    from eligible
    on conflict(centerline_id,identity_id) do update set
      mapping_status=excluded.mapping_status,mapping_method=excluded.mapping_method,
      source_segment_keys=excluded.source_segment_keys,evidence=excluded.evidence,
      ingest_run_id=excluded.ingest_run_id,active=true,updated_at=now();
  end if;
  get diagnostics v_mapping_count=row_count;

  insert into public.brinesearch_authoritative_road_names(
    identity_id,source_dataset_id,source_record_id,name_type,road_name,normalized_name,
    source_segment_key,from_measure,to_measure,provenance,active,last_seen_at
  )
  select m.identity_id,v_run.dataset_id,
    c.source_feature_key||':'||segment_key||':'||coalesce(event->>'type','local')||':'||
      pg_catalog.md5(event->>'name'),
    case event->>'type' when '911' then '911' when 'legacy' then 'legacy'
      when 'alternate' then 'alternate' else 'local' end,
    event->>'name',pg_catalog.regexp_replace(pg_catalog.lower(event->>'name'),'[^a-z0-9]+',' ','g'),
    segment_key,
    case when s.from_measure is not null and s.to_measure is not null then
      s.from_measure+(s.to_measure-s.from_measure)*least(overlap.start_fraction,overlap.end_fraction)
      else s.from_measure end,
    case when s.from_measure is not null and s.to_measure is not null then
      s.from_measure+(s.to_measure-s.from_measure)*greatest(overlap.start_fraction,overlap.end_fraction)
      else s.to_measure end,
    pg_catalog.jsonb_build_object(
      'supplemental_source_feature_key',c.source_feature_key,
      'supplemental_source_record_id',c.source_record_id,
      'supplemental_source_digest',c.source_digest,
      'geometry_match',m.evidence,'source_name_event',event,
      'target_overlap',extensions.st_asgeojson(extensions.st_transform(overlap.geom,4326),15)::jsonb,
      'target_overlap_fraction',pg_catalog.jsonb_build_array(
        least(overlap.start_fraction,overlap.end_fraction),
        greatest(overlap.start_fraction,overlap.end_fraction)),
      'municipality_left',c.municipality_left,'municipality_right',c.municipality_right,
      'topology_authority',false,'source_endpoint_snapping_forbidden',true,
      'ingest_run_id',p_run_id
    ),true,now()
  from public.brinesearch_authoritative_supplemental_centerlines c
  join public.brinesearch_supplemental_centerline_identity_mappings m
    on m.centerline_id=c.id and m.active and m.mapping_status='verified'
  cross join lateral pg_catalog.jsonb_array_elements(c.name_events) event
  cross join lateral unnest(m.source_segment_keys) segment_key
  join public.brinesearch_authoritative_road_segments s
    on s.identity_id=m.identity_id and s.source_segment_key=segment_key and s.active
  cross join lateral (
    select overlap_line.geom,
      case when extensions.geometrytype(extensions.st_linemerge(extensions.st_transform(s.geom,3857)))='LINESTRING'
        then extensions.st_linelocatepoint(
          extensions.st_linemerge(extensions.st_transform(s.geom,3857)),
          extensions.st_startpoint(overlap_line.geom)
        ) else 0 end as start_fraction,
      case when extensions.geometrytype(extensions.st_linemerge(extensions.st_transform(s.geom,3857)))='LINESTRING'
        then extensions.st_linelocatepoint(
          extensions.st_linemerge(extensions.st_transform(s.geom,3857)),
          extensions.st_endpoint(overlap_line.geom)
        ) else 1 end as end_fraction
    from (
      select (d).geom
      from extensions.st_dump(extensions.st_collectionextract(extensions.st_intersection(
        extensions.st_transform(s.geom,3857),
        extensions.st_buffer(extensions.st_transform(c.geom,3857),
          case when c.state_code='OH' then 0.25 else 1 end)
      ),2)) d
      order by extensions.st_length((d).geom) desc limit 1
    ) overlap_line
  ) overlap
  where c.dataset_id=v_run.dataset_id and c.state_code=v_run.state_code
    and c.county_code=v_run.county_code and c.active
    and nullif(pg_catalog.btrim(event->>'name'),'') is not null
  on conflict(identity_id,source_dataset_id,source_record_id,name_type,road_name) do update set
    normalized_name=excluded.normalized_name,source_segment_key=excluded.source_segment_key,
    from_measure=excluded.from_measure,to_measure=excluded.to_measure,
    provenance=excluded.provenance,active=true,last_seen_at=now(),updated_at=now();
  get diagnostics v_name_count=row_count;
  return pg_catalog.jsonb_build_object('run_id',p_run_id,'mappings',v_mapping_count,
    'name_events_materialized',v_name_count,'name_matching_used',false);
end
$$;

revoke all on function public.brinesearch_issue97_refresh_supplemental_aliases(uuid)
from public,anon,authenticated,service_role;

create or replace function public.brinesearch_issue97_begin_ingest(
  p_source_key text,
  p_county_code text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_source text:=pg_catalog.lower(pg_catalog.btrim(coalesce(p_source_key,'')));
  v_county text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_county_code,'')));
  v_dataset record;
  v_run_id uuid;
  v_started_at timestamptz;
begin
  select id,state_code,topology_role into v_dataset
  from public.brinesearch_road_source_datasets
  where source_key=v_source and active;
  if not found then raise exception 'Unknown or inactive authoritative source' using errcode='22023'; end if;
  if not exists(
    select 1 from public.brinesearch_road_graph_counties c
    where c.state_code=v_dataset.state_code and c.county_code=v_county and c.active
  ) then raise exception 'County is outside the source footprint' using errcode='22023'; end if;
  if not exists(
    select 1 from public.brinesearch_road_source_dataset_counties scope
    where scope.dataset_id=v_dataset.id and scope.state_code=v_dataset.state_code
      and scope.county_code=v_county and scope.active and scope.ingest_enabled
  ) then raise exception 'Authoritative source is not enabled for this county' using errcode='22023'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:ingest:'||v_dataset.id::text||':'||v_county)
  );
  update public.brinesearch_road_source_ingest_runs
  set status='superseded',completed_at=now(),
      details=details||pg_catalog.jsonb_build_object('superseded_by_new_run',true)
  where dataset_id=v_dataset.id and state_code=v_dataset.state_code
    and county_code=v_county and status='loading';
  insert into public.brinesearch_road_source_ingest_runs(
    dataset_id,state_code,county_code,status,details
  ) values (
    v_dataset.id,v_dataset.state_code,v_county,'loading',
    pg_catalog.jsonb_build_object(
      'source_key',v_source,'topology_role',v_dataset.topology_role,
      'coverage_contract','all deterministic OBJECTID pages must complete before finalization'
    )
  ) returning id,started_at into v_run_id,v_started_at;
  return pg_catalog.jsonb_build_object(
    'run_id',v_run_id,'source_key',v_source,'state_code',v_dataset.state_code,
    'county_code',v_county,'started_at',v_started_at,'status','loading'
  );
end
$$;

create or replace function public.brinesearch_issue97_finalize_ingest(
  p_run_id uuid,
  p_page_count integer,
  p_source_row_count integer,
  p_ingested_row_count integer,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_run record;
  v_lock record;
  v_source text;
  v_role text;
  v_source_county text;
  v_retired_segments integer:=0;
  v_retired_nodes integer:=0;
  v_retired_names integer:=0;
  v_retired_identities integer:=0;
  v_content_digest text;
  v_supplemental_result jsonb;
begin
  select r.dataset_id,r.county_code into v_lock
  from public.brinesearch_road_source_ingest_runs r where r.id=p_run_id;
  if not found then raise exception 'Authoritative ingest run not found' using errcode='P0002'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:ingest:'||v_lock.dataset_id::text||':'||v_lock.county_code)
  );
  select r.*,d.source_key,d.topology_role into v_run
  from public.brinesearch_road_source_ingest_runs r
  join public.brinesearch_road_source_datasets d on d.id=r.dataset_id
  where r.id=p_run_id
  for update of r;
  if not found then raise exception 'Authoritative ingest run not found' using errcode='P0002'; end if;
  if v_run.status<>'loading' then
    raise exception 'Authoritative ingest run is not loading' using errcode='55000';
  end if;
  v_source:=v_run.source_key;
  v_role:=v_run.topology_role;
  if coalesce(p_page_count,0)<1 or coalesce(p_source_row_count,0)<0
     or coalesce(p_ingested_row_count,0)<0
     or (v_role in ('primary_network','at_grade_nodes')
       and coalesce(p_ingested_row_count,0)<>coalesce(p_source_row_count,0))
     or (v_role='primary_network' and coalesce(p_source_row_count,0)=0) then
    update public.brinesearch_road_source_ingest_runs set
      status='failed',completed_at=now(),page_count=greatest(coalesce(p_page_count,0),0),
      source_row_count=greatest(coalesce(p_source_row_count,0),0),
      ingested_row_count=greatest(coalesce(p_ingested_row_count,0),0),
      details=details||coalesce(p_details,'{}'::jsonb)||pg_catalog.jsonb_build_object(
        'coverage_complete',false,
        'failure','incomplete source coverage; stale rows were not retired'
      )
    where id=p_run_id;
    return pg_catalog.jsonb_build_object(
      'run_id',p_run_id,'status','failed','coverage_complete',false,
      'source_rows',greatest(coalesce(p_source_row_count,0),0),
      'ingested_rows',greatest(coalesce(p_ingested_row_count,0),0)
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:ingest:'||v_run.dataset_id::text||':'||v_run.county_code)
  );

  if v_source='oh_odot_tims_road_inventory' then
    select source_county_code into v_source_county
    from public.brinesearch_road_graph_counties
    where state_code='OH' and county_code=v_run.county_code;
    update public.brinesearch_odot_road_catalog
    set source_active=false
    where county_code=v_source_county and source_active and fetched_at<v_run.started_at;
    get diagnostics v_retired_segments=row_count;
    perform public.brinesearch_issue97_refresh_oh_identities(v_source_county);
  else
    update public.brinesearch_authoritative_external_road_segments
    set active=false
    where dataset_id=v_run.dataset_id and state_code=v_run.state_code
      and county_code=v_run.county_code and active and fetched_at<v_run.started_at;
    get diagnostics v_retired_segments=row_count;
    update public.brinesearch_authoritative_road_nodes
    set active=false
    where dataset_id=v_run.dataset_id and state_code=v_run.state_code
      and county_code=v_run.county_code and active and fetched_at<v_run.started_at;
    get diagnostics v_retired_nodes=row_count;
  end if;

  update public.brinesearch_authoritative_road_names n set active=false,updated_at=now()
  where n.source_dataset_id=v_run.dataset_id and n.active and n.last_seen_at<v_run.started_at
    and exists(select 1 from public.brinesearch_authoritative_road_identities i
      where i.id=n.identity_id and i.state_code=v_run.state_code and i.county_code=v_run.county_code);
  get diagnostics v_retired_names=row_count;

  if v_role='primary_network' then
    update public.brinesearch_authoritative_road_identities i set active=false,last_seen_at=now()
    where i.dataset_id=v_run.dataset_id and i.state_code=v_run.state_code
      and i.county_code=v_run.county_code and i.active
      and not exists(
        select 1 from public.brinesearch_authoritative_road_segments s
        where s.identity_id=i.id and s.active
      );
    get diagnostics v_retired_identities=row_count;

    if v_run.state_code in ('WV','PA') then
      with aggregate_segments as (
        select s.identity_id,
          array_agg(distinct s.source_record_id order by s.source_record_id) as source_record_ids,
          pg_catalog.md5(pg_catalog.string_agg(
            s.source_segment_key||':'||s.source_digest,',' order by s.source_segment_key
          )) as source_digest,
          max(s.source_timestamp) as source_timestamp,
          count(*)::integer as segment_count,
          case
            when count(distinct s.public_access_status)=1 then min(s.public_access_status)
            else 'held'
          end as resolved_access,
          case
            when count(distinct s.drivable_status)=1 then min(s.drivable_status)
            else 'held'
          end as resolved_drivable
        from public.brinesearch_authoritative_external_road_segments s
        where s.dataset_id=v_run.dataset_id and s.state_code=v_run.state_code
          and s.county_code=v_run.county_code and s.active
        group by s.identity_id
      )
      update public.brinesearch_authoritative_road_identities i set
        source_record_ids=a.source_record_ids,source_digest=a.source_digest,
        source_timestamp=a.source_timestamp,active=true,last_seen_at=now(),
        public_access_status=a.resolved_access,drivable_status=a.resolved_drivable,
        attributes=i.attributes||pg_catalog.jsonb_build_object(
          'active_segment_count',a.segment_count,
          'identity_digest_method','ordered active source-segment digest',
          'identity_access_rule','held whenever active segment classifications disagree'
        )
      from aggregate_segments a where i.id=a.identity_id;
    end if;
  end if;

  -- WV SAMS and alternate-name layers write authoritative measured name events
  -- directly. Only physical supplemental centerline feeds use the geometry
  -- equivalence materializer below; routing WV through it would retire the
  -- just-ingested names because those feeds have no centerline landing rows.
  if v_source in (
    'oh_ogrip_lbrs_centerlines',
    'pa_allegheny_ng911_centerlines','pa_bradford_ng911_centerlines',
    'pa_butler_centerlines','pa_fayette_ng911_centerlines',
    'pa_indiana_ng911_centerlines','pa_washington_ng911_centerlines'
  ) then
    v_supplemental_result:=public.brinesearch_issue97_refresh_supplemental_aliases(p_run_id);
  end if;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(x.digest,',' order by x.digest),''))
  into v_content_digest
  from (
    select s.source_digest as digest
    from public.brinesearch_authoritative_external_road_segments s
    where s.dataset_id=v_run.dataset_id and s.active
    union all
    select n.source_digest from public.brinesearch_authoritative_road_nodes n
    where n.dataset_id=v_run.dataset_id and n.active
    union all
    select c.source_digest
    from public.brinesearch_authoritative_supplemental_centerlines c
    where c.dataset_id=v_run.dataset_id and c.active
    union all
    select pg_catalog.md5(m.centerline_id::text||':'||m.identity_id::text||':'||
      m.mapping_status||':'||m.source_segment_keys::text||':'||m.evidence::text)
    from public.brinesearch_supplemental_centerline_identity_mappings m
    join public.brinesearch_authoritative_supplemental_centerlines c on c.id=m.centerline_id
    where c.dataset_id=v_run.dataset_id and c.active and m.active
    union all
    select pg_catalog.md5(c.roadway_inventory_id||':'||c.attributes::text)
    from public.brinesearch_odot_road_catalog c
    where v_source='oh_odot_tims_road_inventory' and c.source_active
    union all
    select pg_catalog.md5(n.identity_id::text||':'||n.source_record_id||':'||n.road_name||':'||n.provenance::text)
    from public.brinesearch_authoritative_road_names n
    where n.source_dataset_id=v_run.dataset_id and n.active
  ) x;
  update public.brinesearch_road_source_datasets
  set fetched_at=now(),content_digest=v_content_digest,updated_at=now()
  where id=v_run.dataset_id;
  update public.brinesearch_road_source_ingest_runs set
    status='complete',completed_at=now(),page_count=p_page_count,
    source_row_count=p_source_row_count,ingested_row_count=p_ingested_row_count,
    details=details||coalesce(p_details,'{}'::jsonb)||pg_catalog.jsonb_build_object(
      'coverage_complete',true,'retired_segments',v_retired_segments,
      'retired_nodes',v_retired_nodes,'retired_names',v_retired_names,
      'retired_identities',v_retired_identities,'content_digest',v_content_digest,
      'supplemental_materialization',coalesce(v_supplemental_result,'{}'::jsonb)
    )
  where id=p_run_id;
  return pg_catalog.jsonb_build_object(
    'run_id',p_run_id,'status','complete','coverage_complete',true,
    'source_rows',p_source_row_count,'ingested_rows',p_ingested_row_count,
    'retired_segments',v_retired_segments,'retired_nodes',v_retired_nodes,
    'retired_names',v_retired_names,'retired_identities',v_retired_identities,
    'content_digest',v_content_digest
  );
end
$$;

create or replace function public.brinesearch_issue97_fail_ingest(
  p_run_id uuid,
  p_reason text,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_result jsonb; v_lock record;
begin
  select dataset_id,county_code into v_lock
  from public.brinesearch_road_source_ingest_runs where id=p_run_id;
  if not found then raise exception 'Loading authoritative ingest run not found' using errcode='P0002'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:ingest:'||v_lock.dataset_id::text||':'||v_lock.county_code)
  );
  update public.brinesearch_road_source_ingest_runs set
    status='failed',completed_at=now(),
    details=details||coalesce(p_details,'{}'::jsonb)||pg_catalog.jsonb_build_object(
      'coverage_complete',false,'failure',coalesce(nullif(pg_catalog.btrim(p_reason),''),'unspecified')
    )
  where id=p_run_id and status='loading'
  returning pg_catalog.jsonb_build_object('run_id',id,'status',status,'details',details) into v_result;
  if v_result is null then raise exception 'Loading authoritative ingest run not found' using errcode='P0002'; end if;
  return v_result;
end
$$;

revoke all on function public.brinesearch_issue97_ingest_oh_page(text,integer,integer)
from public,anon,authenticated;
revoke all on function public.brinesearch_issue97_refresh_oh_identities(text)
from public,anon,authenticated;
revoke all on function public.brinesearch_issue97_ingest_wv_network_page(text,integer,integer)
from public,anon,authenticated;
revoke all on function public.brinesearch_issue97_ingest_wv_names_page(text,text,integer,integer)
from public,anon,authenticated;
revoke all on function public.brinesearch_issue97_ingest_pa_page(text,text,integer,integer)
from public,anon,authenticated;
revoke all on function public.brinesearch_issue97_begin_ingest(text,text)
from public,anon,authenticated;
revoke all on function public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb)
from public,anon,authenticated;
revoke all on function public.brinesearch_issue97_fail_ingest(uuid,text,jsonb)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_ingest_oh_page(text,integer,integer) to service_role;
grant execute on function public.brinesearch_issue97_refresh_oh_identities(text) to service_role;
grant execute on function public.brinesearch_issue97_ingest_wv_network_page(text,integer,integer) to service_role;
grant execute on function public.brinesearch_issue97_ingest_wv_names_page(text,text,integer,integer) to service_role;
grant execute on function public.brinesearch_issue97_ingest_pa_page(text,text,integer,integer) to service_role;
grant execute on function public.brinesearch_issue97_begin_ingest(text,text) to service_role;
grant execute on function public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb) to service_role;
grant execute on function public.brinesearch_issue97_fail_ingest(uuid,text,jsonb) to service_role;
revoke all on sequence public.brinesearch_authoritative_road_names_id_seq from service_role;

comment on function public.brinesearch_issue97_ingest_oh_page(text,integer,integer) is
  'Issue #97 service-only controlled ODOT page loader. Reuses brinesearch_odot_road_catalog; never callable by the browser.';
comment on function public.brinesearch_issue97_ingest_wv_network_page(text,integer,integer) is
  'Issue #97 service-only controlled WVDOT Publication LRS page loader. Exact ROUTE_ID remains the identity.';
comment on function public.brinesearch_issue97_ingest_pa_page(text,text,integer,integer) is
  'Issue #97 service-only controlled PennDOT state/local/at-grade page loader. Internal NLF and signed T_RT_NO remain separate fields.';
comment on function public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb) is
  'Issue #97 full-coverage ingest finalizer. Stale source rows retire only after every deterministic page succeeds; identity provenance is then aggregated in stable source-key order.';

-- Service orchestration is run-bound. The browser and service role cannot call
-- the source-specific page loaders directly, so an old/superseded run cannot
-- keep writing rows into a newer snapshot. Every page stores its exact response
-- digest and contiguous offset receipt before the run may be finalized.
create or replace function public.brinesearch_issue97_begin_ingest(
  p_source_key text,
  p_county_code text,
  p_expected_source_rows integer,
  p_source_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_run_id uuid;
begin
  if p_expected_source_rows is null or p_expected_source_rows<0 then
    raise exception 'Expected source row count must be a nonnegative integer' using errcode='22023';
  end if;
  if p_source_snapshot is null or pg_catalog.jsonb_typeof(p_source_snapshot)<>'object'
     or nullif(p_source_snapshot->>'query_url','') is null
     or nullif(p_source_snapshot->>'source_version','') is null
     or nullif(p_source_snapshot->>'count_checked_at','') is null then
    raise exception 'Source snapshot requires query_url, source_version and count_checked_at' using errcode='22023';
  end if;
  v_result:=public.brinesearch_issue97_begin_ingest(p_source_key,p_county_code);
  v_run_id:=(v_result->>'run_id')::uuid;
  update public.brinesearch_road_source_ingest_runs set details=details||pg_catalog.jsonb_build_object(
    'run_bound',true,'expected_source_rows',p_expected_source_rows,
    'source_snapshot',p_source_snapshot,'page_contract','contiguous deterministic OBJECTID offsets'
  ) where id=v_run_id;
  return v_result||pg_catalog.jsonb_build_object(
    'expected_source_rows',p_expected_source_rows,'source_snapshot',p_source_snapshot,'run_bound',true
  );
end
$$;

create or replace function public.brinesearch_issue97_ingest_page(
  p_run_id uuid,
  p_offset integer,
  p_page_size integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_run record;
  v_lock record;
  v_previous record;
  v_source_county text;
  v_offset integer:=coalesce(p_offset,-1);
  v_limit integer:=greatest(1,least(coalesce(p_page_size,1000),2000));
  v_result jsonb;
  v_source_rows integer;
  v_ingested_rows integer;
  v_rejected_rows integer;
  v_has_more boolean;
  v_digest text;
begin
  select r.dataset_id,r.county_code into v_lock
  from public.brinesearch_road_source_ingest_runs r where r.id=p_run_id;
  if not found then raise exception 'Authoritative ingest run not found' using errcode='P0002'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:ingest:'||v_lock.dataset_id::text||':'||v_lock.county_code)
  );
  select r.*,d.source_key,d.topology_role into v_run
  from public.brinesearch_road_source_ingest_runs r
  join public.brinesearch_road_source_datasets d on d.id=r.dataset_id and d.active
  where r.id=p_run_id
  for update of r;
  if not found then raise exception 'Authoritative ingest run not found' using errcode='P0002'; end if;
  if v_run.status<>'loading' or coalesce((v_run.details->>'run_bound')::boolean,false) is not true then
    raise exception 'Authoritative ingest run is not an active run-bound load' using errcode='55000';
  end if;
  if v_offset<0 then raise exception 'Page offset must be nonnegative' using errcode='22023'; end if;

  select p.* into v_previous
  from public.brinesearch_road_source_ingest_pages p
  where p.run_id=p_run_id order by p.page_offset desc limit 1;
  if not found then
    if v_offset<>0 then raise exception 'The first authoritative page must start at offset 0' using errcode='22023'; end if;
  else
    if not v_previous.has_more then
      raise exception 'The authoritative source already returned its terminal page' using errcode='22023';
    end if;
    if v_limit<>v_previous.requested_limit
       or v_offset<>v_previous.page_offset+v_previous.requested_limit then
      raise exception 'Authoritative pages must use one size and contiguous offsets' using errcode='22023';
    end if;
  end if;

  if v_run.source_key='oh_odot_tims_road_inventory' then
    select c.source_county_code into strict v_source_county
    from public.brinesearch_road_graph_counties c
    where c.state_code='OH' and c.county_code=v_run.county_code;
    v_result:=public.brinesearch_issue97_ingest_oh_page(v_source_county,v_offset,v_limit);
  elsif v_run.source_key='wv_wvdot_publication_lrs' then
    v_result:=public.brinesearch_issue97_ingest_wv_network_page(v_run.county_code,v_offset,v_limit);
  elsif v_run.source_key in (
    'wv_wvdot_street_name_doh','wv_wvdot_street_name_sams','wv_wvdot_alternate_route_name'
  ) then
    v_result:=public.brinesearch_issue97_ingest_wv_names_page(
      v_run.source_key,v_run.county_code,v_offset,v_limit
    );
  elsif v_run.source_key in (
    'pa_penndot_state_roads','pa_penndot_local_roads','pa_penndot_at_grade_intersections'
  ) then
    v_result:=public.brinesearch_issue97_ingest_pa_page(
      v_run.source_key,v_run.county_code,v_offset,v_limit
    );
  elsif v_run.source_key in (
    'oh_ogrip_lbrs_centerlines','pa_allegheny_ng911_centerlines',
    'pa_bradford_ng911_centerlines','pa_butler_centerlines',
    'pa_fayette_ng911_centerlines','pa_indiana_ng911_centerlines',
    'pa_washington_ng911_centerlines'
  ) then
    v_result:=public.brinesearch_issue97_ingest_supplemental_page(
      p_run_id,v_offset,v_limit
    );
  else
    raise exception 'No controlled page loader exists for source %',v_run.source_key using errcode='22023';
  end if;

  begin
    v_source_rows:=(v_result->>'source_rows')::integer;
    v_ingested_rows:=(v_result->>'rows')::integer;
    v_rejected_rows:=(v_result->>'rejected_rows')::integer;
    v_has_more:=(v_result->>'has_more')::boolean;
    v_digest:=v_result->>'page_digest';
  exception when others then
    raise exception 'Controlled page loader returned an invalid receipt' using errcode='P0001';
  end;
  if (v_result->>'source') is distinct from v_run.source_key
     or (v_result->>'county_code') is distinct from
       (case when v_run.source_key='oh_odot_tims_road_inventory'
          then v_source_county else v_run.county_code end)
     or (v_result->>'offset')::integer<>v_offset
     or (v_result->>'page_size')::integer<>v_limit
     or v_source_rows<0 or v_ingested_rows<0 or v_rejected_rows<0
     or v_ingested_rows+v_rejected_rows<>v_source_rows
     or v_digest is null or v_digest!~'^[0-9a-f]{32}$' then
    raise exception 'Controlled page loader receipt did not match its run contract' using errcode='P0001';
  end if;
  if v_has_more and v_source_rows<>v_limit then
    raise exception 'A nonterminal authoritative page was incomplete' using errcode='P0001';
  end if;
  if exists(select 1 from public.brinesearch_road_source_dataset_counties scope
      where scope.dataset_id=v_run.dataset_id and scope.state_code=v_run.state_code
        and scope.county_code=v_run.county_code and scope.active and scope.required_for_graph)
     and v_rejected_rows<>0 then
    raise exception 'Required authoritative page contained % rejected rows',v_rejected_rows using errcode='P0001';
  end if;

  insert into public.brinesearch_road_source_ingest_pages(
    run_id,page_offset,requested_limit,source_row_count,ingested_row_count,
    rejected_row_count,has_more,page_digest,result
  ) values (
    p_run_id,v_offset,v_limit,v_source_rows,v_ingested_rows,v_rejected_rows,
    v_has_more,v_digest,v_result
  );
  update public.brinesearch_road_source_ingest_runs set
    page_count=page_count+1,source_row_count=source_row_count+v_source_rows,
    ingested_row_count=ingested_row_count+v_ingested_rows,
    details=details||pg_catalog.jsonb_build_object(
      'last_page_offset',v_offset,'last_page_digest',v_digest,'last_page_has_more',v_has_more
    )
  where id=p_run_id;
  return v_result||pg_catalog.jsonb_build_object('run_id',p_run_id,'run_bound',true);
end
$$;

create or replace function public.brinesearch_issue97_finalize_ingest(
  p_run_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_run record;
  v_lock record;
  v_page_count integer;
  v_source_rows integer;
  v_ingested_rows integer;
  v_rejected_rows integer;
  v_terminal_count integer;
  v_page_digest text;
  v_result jsonb;
begin
  select r.dataset_id,r.county_code into v_lock
  from public.brinesearch_road_source_ingest_runs r where r.id=p_run_id;
  if not found then raise exception 'Authoritative ingest run not found' using errcode='P0002'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:ingest:'||v_lock.dataset_id::text||':'||v_lock.county_code)
  );
  select r.*,d.topology_role into v_run
  from public.brinesearch_road_source_ingest_runs r
  join public.brinesearch_road_source_datasets d on d.id=r.dataset_id
  where r.id=p_run_id for update of r;
  if not found then raise exception 'Authoritative ingest run not found' using errcode='P0002'; end if;
  if v_run.status<>'loading' or coalesce((v_run.details->>'run_bound')::boolean,false) is not true then
    raise exception 'Authoritative ingest run is not an active run-bound load' using errcode='55000';
  end if;
  if exists(
    with ordered as (
      select p.*,pg_catalog.lag(p.page_offset+p.requested_limit)
        over(order by p.page_offset) as expected_offset,
        pg_catalog.row_number() over(order by p.page_offset) as ordinal
      from public.brinesearch_road_source_ingest_pages p where p.run_id=p_run_id
    )
    select 1 from ordered where (ordinal=1 and page_offset<>0)
      or (ordinal>1 and page_offset<>expected_offset)
  ) then
    return public.brinesearch_issue97_fail_ingest(
      p_run_id,'authoritative ingest page coverage is not contiguous',
      pg_catalog.jsonb_build_object('coverage_receipts_verified',false)
    );
  end if;

  select count(*)::integer,coalesce(sum(source_row_count),0)::integer,
    coalesce(sum(ingested_row_count),0)::integer,coalesce(sum(rejected_row_count),0)::integer,
    count(*) filter(where not has_more)::integer,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      page_offset::text||':'||page_digest,',' order by page_offset
    ),''))
  into v_page_count,v_source_rows,v_ingested_rows,v_rejected_rows,v_terminal_count,v_page_digest
  from public.brinesearch_road_source_ingest_pages where run_id=p_run_id;
  if v_page_count<1 or v_terminal_count<>1
     or exists(select 1 from public.brinesearch_road_source_ingest_pages p
       where p.run_id=p_run_id and not p.has_more
         and p.page_offset<>(select max(x.page_offset) from public.brinesearch_road_source_ingest_pages x
           where x.run_id=p_run_id))
     or v_source_rows<>coalesce((v_run.details->>'expected_source_rows')::integer,-1)
     or (exists(select 1 from public.brinesearch_road_source_dataset_counties scope
          where scope.dataset_id=v_run.dataset_id and scope.state_code=v_run.state_code
            and scope.county_code=v_run.county_code and scope.active and scope.required_for_graph)
       and v_rejected_rows<>0)
     or (v_run.topology_role in ('official_names','supplemental_aliases')
       and v_source_rows>0 and v_ingested_rows=0) then
    return public.brinesearch_issue97_fail_ingest(
      p_run_id,'authoritative ingest page coverage/count contract failed',
      pg_catalog.jsonb_build_object(
        'coverage_receipts_verified',false,'page_count',v_page_count,
        'source_row_count',v_source_rows,'ingested_row_count',v_ingested_rows,
        'rejected_row_count',v_rejected_rows,'terminal_count',v_terminal_count
      )
    );
  end if;
  v_result:=public.brinesearch_issue97_finalize_ingest(
    p_run_id,v_page_count,v_source_rows,v_ingested_rows,
    coalesce(p_details,'{}'::jsonb)||pg_catalog.jsonb_build_object(
      'run_bound',true,'page_set_digest',v_page_digest,
      'rejected_source_rows',v_rejected_rows,'coverage_receipts_verified',true
    )
  );
  if v_result->>'status'<>'complete' then
    return v_result;
  end if;
  return v_result||pg_catalog.jsonb_build_object(
    'page_set_digest',v_page_digest,'rejected_source_rows',v_rejected_rows,'run_bound',true
  );
end
$$;

revoke execute on function public.brinesearch_issue97_ingest_oh_page(text,integer,integer) from service_role;
revoke execute on function public.brinesearch_issue97_ingest_wv_network_page(text,integer,integer) from service_role;
revoke execute on function public.brinesearch_issue97_ingest_wv_names_page(text,text,integer,integer) from service_role;
revoke execute on function public.brinesearch_issue97_ingest_pa_page(text,text,integer,integer) from service_role;
revoke execute on function public.brinesearch_issue97_begin_ingest(text,text) from service_role;
revoke execute on function public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb) from service_role;
revoke all on function public.brinesearch_issue97_begin_ingest(text,text,integer,jsonb)
from public,anon,authenticated;
revoke all on function public.brinesearch_issue97_ingest_page(uuid,integer,integer)
from public,anon,authenticated;
revoke all on function public.brinesearch_issue97_finalize_ingest(uuid,jsonb)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_begin_ingest(text,text,integer,jsonb) to service_role;
grant execute on function public.brinesearch_issue97_ingest_page(uuid,integer,integer) to service_role;
grant execute on function public.brinesearch_issue97_finalize_ingest(uuid,jsonb) to service_role;

comment on function public.brinesearch_issue97_ingest_page(uuid,integer,integer) is
  'Issue #97 run-bound page dispatcher. It records exact page digests, rejects gaps/late writes and is the only service-callable source loader.';
comment on function public.brinesearch_issue97_finalize_ingest(uuid,jsonb) is
  'Issue #97 receipt-derived finalizer. Caller-supplied counts cannot activate a partial authoritative snapshot.';

create or replace function public.brinesearch_issue97_refresh_exact_mappings()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_rows integer:=0;
  v_verified integer:=0;
  v_held integer:=0;
begin
  -- Recompute only machine-owned exact mappings. A reviewed/manual mapping is
  -- never displaced. Ambiguous exact evidence remains a visible candidate and
  -- cannot trip the one-verified-mapping invariant.
  update public.brinesearch_road_identity_mappings set
    mapping_status='retired',verified_at=null,updated_at=now(),
    evidence=evidence||pg_catalog.jsonb_build_object('retired_by_refresh',true)
  where mapping_method in ('exact_source_record_id','exact_route_designation')
    and mapping_status in ('verified','candidate');

  with exact_designations as (
    -- PA's T_RT_NO is an internal RMS identifier, not a signed route. Only an
    -- explicit PennDOT signed-name event may enter the PA designation branch.
    select i.id as identity_id,i.source_identity_key,i.state_code,i.county_name,
      i.township,i.road_class,
      pg_catalog.regexp_replace(pg_catalog.upper(pg_catalog.regexp_replace(
        coalesce(i.route_number,'')||coalesce(i.route_suffix,'')||
        coalesce(i.route_fraction,'')||coalesce(i.route_extension,''),
        '[^0-9A-Z]','','g')),'^0+','') as route_token,
      pg_catalog.jsonb_build_object(
        'route_number',i.route_number,'route_suffix',i.route_suffix,
        'route_fraction',i.route_fraction,'route_extension',i.route_extension,
        'designation_source','identity_exact_components'
      ) as component_evidence
    from public.brinesearch_authoritative_road_identities i
    where i.active and i.state_code<>'PA'
      and i.road_class in ('interstate','us_route','state_route','county','township')
    union all
    select i.id,i.source_identity_key,i.state_code,i.county_name,i.township,
      case
        when pg_catalog.upper(n.road_name) ~ '^I[- ]' then 'interstate'
        when pg_catalog.upper(n.road_name) ~ '^US[- ]' then 'us_route'
        when pg_catalog.upper(n.road_name) ~ '^PA[- ]' then 'state_route'
      end,
      pg_catalog.regexp_replace(pg_catalog.upper(pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(n.road_name,'^[A-Za-z]+[- ]*','','g'),
        '[^0-9A-Z]','','g')),'^0+',''),
      pg_catalog.jsonb_build_object(
        'designation_source','explicit_penndot_signed_event',
        'name_event_id',n.id,'source_record_id',n.source_record_id,
        'signed_name',n.road_name
      )
    from public.brinesearch_authoritative_road_identities i
    join public.brinesearch_authoritative_road_names n
      on n.identity_id=i.id and n.active and n.name_type='signed'
    where i.active and i.state_code='PA'
      and pg_catalog.upper(n.road_name) ~ '^(I|US|PA)[- ][0-9]'
  ), raw_candidates as (
    select i.id as identity_id,r.id as road_id,0 as priority,
      'exact_source_record_id'::text as method,
      pg_catalog.jsonb_build_object(
        'road_source_record_id',r.source_record_id,
        'source_identity_key',i.source_identity_key,
        'state_and_jurisdiction_checked',true,'no_name_matching',true
      ) as evidence
    from public.brinesearch_authoritative_road_identities i
    join public.brinesearch_roads r on (
      r.source_record_id=i.source_identity_key
      or (i.state_code='OH'
        and pg_catalog.split_part(coalesce(r.source_record_id,''),'|',1)
          =pg_catalog.split_part(pg_catalog.replace(i.source_identity_key,'OH:ODOT:NLF:',''),':',1)
        and (select count(*) from public.brinesearch_authoritative_road_identities sibling
          where sibling.active and sibling.state_code='OH'
            and sibling.source_identity_key like 'OH:ODOT:NLF:'||
              pg_catalog.split_part(pg_catalog.replace(i.source_identity_key,'OH:ODOT:NLF:',''),':',1)||'%')=1)
      or (i.state_code='WV' and pg_catalog.split_part(coalesce(r.source_record_id,''),'|',1)
        =pg_catalog.replace(i.source_identity_key,'WV:WVDOT:ROUTE_ID:',''))
    )
    where i.active and r.verification_status='verified'
      and (r.state=i.state_code or (r.state is null and r.road_type in ('interstate','us_route')))
      and (r.road_type in ('interstate','us_route','state_route')
        or pg_catalog.lower(coalesce(r.county,''))=pg_catalog.lower(i.county_name))
    union all
    select d.identity_id,r.id,1,'exact_route_designation',
      pg_catalog.jsonb_build_object(
        'route_class',d.road_class,'route_token',d.route_token,
        'state_code',d.state_code,'county_name',d.county_name,'township',d.township,
        'source_identity_key',d.source_identity_key,
        'designation_not_name',true,'no_fuzzy_or_spatial_matching',true
      )||d.component_evidence
    from exact_designations d
    join public.brinesearch_roads r on r.road_type=d.road_class
      and pg_catalog.regexp_replace(
        pg_catalog.upper(pg_catalog.regexp_replace(coalesce(r.route_number,''),'[^0-9A-Z]','','g')),
        '^0+',''
      )=d.route_token
      and (d.road_class in ('interstate','us_route')
        or (r.state=d.state_code and d.road_class='state_route')
        or (r.state=d.state_code and d.road_class='county'
          and pg_catalog.lower(coalesce(r.county,''))=pg_catalog.lower(d.county_name))
        or (r.state=d.state_code and d.road_class='township'
          and pg_catalog.lower(coalesce(r.county,''))=pg_catalog.lower(d.county_name)
          and nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(d.township,''))),'') is not null
          and pg_catalog.lower(pg_catalog.btrim(coalesce(r.township,'')))
            =pg_catalog.lower(pg_catalog.btrim(d.township)))
      )
    where r.verification_status='verified' and d.route_token<>''
  ), deduplicated as (
    select distinct on(identity_id,road_id)
      identity_id,road_id,method,evidence,priority
    from raw_candidates
    order by identity_id,road_id,priority,method
  ), eligible as (
    select d.*,count(*) over(partition by d.identity_id) as candidate_count
    from deduplicated d
    where not exists(
      select 1 from public.brinesearch_road_identity_mappings manual
      where manual.identity_id=d.identity_id and manual.mapping_status<>'retired'
        and manual.mapping_method not in ('exact_source_record_id','exact_route_designation')
    )
  )
  insert into public.brinesearch_road_identity_mappings(
    id,identity_id,road_id,mapping_status,mapping_method,evidence,verified_at
  )
  select
    private_verification.brinesearch_issue97_uuid('map:'||e.identity_id::text||':'||e.road_id::text),
    e.identity_id,e.road_id,case when e.candidate_count=1 then 'verified' else 'candidate' end,
    e.method,e.evidence||pg_catalog.jsonb_build_object(
      'exact_candidate_count',e.candidate_count,
      'ambiguity_held',e.candidate_count>1
    ),case when e.candidate_count=1 then now() else null end
  from eligible e
  on conflict(identity_id,road_id) do update set
    mapping_status=excluded.mapping_status,mapping_method=excluded.mapping_method,
    evidence=excluded.evidence,verified_at=excluded.verified_at,updated_at=now()
  where public.brinesearch_road_identity_mappings.mapping_method
    in ('exact_source_record_id','exact_route_designation');
  get diagnostics v_rows=row_count;
  select count(*) filter(where mapping_status='verified'),
    count(*) filter(where mapping_status='candidate')
  into v_verified,v_held
  from public.brinesearch_road_identity_mappings
  where mapping_method in ('exact_source_record_id','exact_route_designation')
    and mapping_status in ('verified','candidate');
  return pg_catalog.jsonb_build_object(
    'exact_mappings_touched',v_rows,'verified_exact_mappings',v_verified,
    'ambiguous_exact_candidates_held',v_held,
    'pa_internal_route_auto_mapping_forbidden',true,
    'all_route_components_must_match',true
  );
end
$$;

revoke all on function public.brinesearch_issue97_refresh_exact_mappings()
from public,anon,authenticated,service_role;

-- v2 supersedes the conservative bootstrap definition above. It retains exact
-- authoritative interior vertices (required by the Noble Street occurrence),
-- holds structure/level conflicts, projects PennDOT at-grade nodes to nearby
-- source roads, preserves line overlaps with different vertexization, supports
-- deterministic cross-county ownership, and keeps historical builds immutable.
create or replace function public.brinesearch_issue97_rebuild_county_graph(
  p_state_code text,
  p_county_code text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_state text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_state_code,'')));
  v_county text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_county_code,'')));
  v_county_name text;
  v_incomplete_sources text;
  v_source_digest text;
  v_registry_digest text;
  v_source_run_vector jsonb;
  v_build uuid:=pg_catalog.gen_random_uuid();
  v_segment_count integer:=0;
  v_identity_count integer:=0;
  v_point_count integer:=0;
  v_shared_count integer:=0;
  v_held_count integer:=0;
  v_membership_count integer:=0;
  v_graph_digest text;
  v_scope record;
begin
  select county_name into v_county_name
  from public.brinesearch_road_graph_counties
  where state_code=v_state and county_code=v_county and active;
  if not found then raise exception 'County is outside the active issue #97 graph footprint'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:graph:'||v_state||':'||v_county)
  );

  -- Freeze every active source scope while this build captures its own county
  -- and adjacent boundary segments. The deterministic order prevents a
  -- cross-county deadlock and ensures no page can mutate the source vector
  -- after the completeness check.
  for v_scope in
    select scope.dataset_id,scope.county_code
    from public.brinesearch_road_source_dataset_counties scope
    where scope.active and scope.ingest_enabled
    order by scope.dataset_id,scope.state_code,scope.county_code
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('brinesearch:issue97:ingest:'||v_scope.dataset_id::text||':'||v_scope.county_code)
    );
  end loop;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
  );

  with latest as (
    select d.source_key,
      (select case when private_verification.brinesearch_issue97_ingest_run_verified(r.id)
        then 'complete' else 'incomplete' end
       from public.brinesearch_road_source_ingest_runs r
       where r.dataset_id=d.id and r.state_code=v_state and r.county_code=v_county
       order by r.started_at desc,r.id desc limit 1) as status
    from public.brinesearch_road_source_datasets d
    join public.brinesearch_road_source_dataset_counties scope
      on scope.dataset_id=d.id and scope.state_code=v_state
     and scope.county_code=v_county and scope.active and scope.required_for_graph
    where d.state_code=v_state and d.active
  )
  select pg_catalog.string_agg(source_key,',' order by source_key)
  into v_incomplete_sources from latest where status is distinct from 'complete';
  if v_incomplete_sources is not null then
    raise exception 'Complete authoritative ingest runs are required before rebuild: %',v_incomplete_sources
      using errcode='55000';
  end if;

  if v_state='OH' then perform public.brinesearch_issue97_refresh_oh_identities(v_county); end if;
  perform public.brinesearch_issue97_refresh_exact_mappings();

  drop table if exists pg_temp.tmp_issue97_target_segments;
  drop table if exists pg_temp.tmp_issue97_segments;
  drop table if exists pg_temp.tmp_issue97_vertices;
  drop table if exists pg_temp.tmp_issue97_at_grade;
  drop table if exists pg_temp.tmp_issue97_point_candidates;
  drop table if exists pg_temp.tmp_issue97_point_raw;
  drop table if exists pg_temp.tmp_issue97_point_identity;
  drop table if exists pg_temp.tmp_issue97_point_nodes;
  drop table if exists pg_temp.tmp_issue97_pair_shared;
  drop table if exists pg_temp.tmp_issue97_shared;
  drop table if exists pg_temp.tmp_issue97_point_values;
  drop table if exists pg_temp.tmp_issue97_shared_values;
  drop table if exists pg_temp.tmp_issue97_name_changes;

  create temporary table tmp_issue97_target_segments on commit drop as
  select s.*
  from public.brinesearch_authoritative_road_segments s
  join public.brinesearch_authoritative_road_identities i on i.id=s.identity_id
  where s.state_code=v_state and s.county_code=v_county and s.active and i.active
    and s.drivable_status in ('drivable','non_drivable')
    and s.public_access_status in ('public','private','access')
    and i.drivable_status in ('drivable','non_drivable')
    and i.public_access_status in ('public','private','access');
  create index tmp_issue97_target_segments_geom_idx
    on tmp_issue97_target_segments using gist(geom);
  if not exists(select 1 from tmp_issue97_target_segments) then
    raise exception 'No loaded drivable authoritative segments exist for % %',v_state,v_county;
  end if;

  -- Pull only adjacent out-of-county segments. A boundary occurrence is owned
  -- by the lexicographically first participating county and is still visible
  -- from every member identity. Ingestion orchestration rebuilds every affected
  -- owner county when a boundary source changes.
  create temporary table tmp_issue97_segments on commit drop as
  select * from tmp_issue97_target_segments;
  insert into tmp_issue97_segments
  select s.*
  from public.brinesearch_authoritative_road_segments s
  join public.brinesearch_authoritative_road_identities i on i.id=s.identity_id
  where (s.state_code<>v_state or s.county_code<>v_county) and s.active and i.active
    and s.drivable_status in ('drivable','non_drivable')
    and s.public_access_status in ('public','private','access')
    and i.drivable_status in ('drivable','non_drivable')
    and i.public_access_status in ('public','private','access')
    and exists(select 1 from tmp_issue97_target_segments t
      where extensions.st_dwithin(s.geom::extensions.geography,t.geom::extensions.geography,1));
  create index tmp_issue97_segments_geom_idx on tmp_issue97_segments using gist(geom);
  create index tmp_issue97_segments_identity_idx on tmp_issue97_segments(identity_id);
  select count(*),count(distinct identity_id),
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      source_segment_key||':'||source_digest,',' order by source_segment_key
    ),''))
  into v_segment_count,v_identity_count,v_source_digest from tmp_issue97_segments;

  -- Boundary segments bring their own county snapshots into this generation.
  -- Every applicable required feed for every touched scope must still be the
  -- latest receipt-verified run while the ingest locks above are held.
  with touched as (
    select distinct state_code,county_code from tmp_issue97_segments
  ), required as (
    select d.id as dataset_id,d.source_key,t.state_code,t.county_code
    from touched t
    join public.brinesearch_road_source_dataset_counties scope
      on scope.state_code=t.state_code and scope.county_code=t.county_code
     and scope.active and scope.required_for_graph
    join public.brinesearch_road_source_datasets d on d.id=scope.dataset_id and d.active
  ), latest as (
    select required.*,run.id as run_id
    from required
    left join lateral (
      select r.id from public.brinesearch_road_source_ingest_runs r
      where r.dataset_id=required.dataset_id and r.state_code=required.state_code
        and r.county_code=required.county_code
      order by r.started_at desc,r.id desc limit 1
    ) run on true
  )
  select pg_catalog.string_agg(source_key||':'||state_code||':'||county_code,','
    order by source_key,state_code,county_code)
  into v_incomplete_sources
  from latest
  where run_id is null
     or not private_verification.brinesearch_issue97_ingest_run_verified(run_id);
  if v_incomplete_sources is not null then
    raise exception 'Boundary source scopes are not receipt-verified: %',v_incomplete_sources
      using errcode='55000';
  end if;

  with touched as (
    select distinct state_code,county_code from tmp_issue97_segments
  ), required as (
    select d.id as dataset_id,d.source_key,t.state_code,t.county_code
    from touched t
    join public.brinesearch_road_source_dataset_counties scope
      on scope.state_code=t.state_code and scope.county_code=t.county_code
     and scope.active and scope.required_for_graph
    join public.brinesearch_road_source_datasets d on d.id=scope.dataset_id and d.active
  ), latest as (
    select required.*,run.id as run_id,run.details->>'page_set_digest' as page_set_digest,
      run.source_row_count,run.ingested_row_count,run.completed_at
    from required
    join lateral (
      select r.* from public.brinesearch_road_source_ingest_runs r
      where r.dataset_id=required.dataset_id and r.state_code=required.state_code
        and r.county_code=required.county_code
      order by r.started_at desc,r.id desc limit 1
    ) run on true
  )
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'dataset_id',dataset_id,'source_key',source_key,'state_code',state_code,
    'county_code',county_code,'run_id',run_id,'page_set_digest',page_set_digest,
    'source_row_count',source_row_count,'ingested_row_count',ingested_row_count,
    'completed_at',completed_at
  ) order by source_key,state_code,county_code)
  into v_source_run_vector from latest;

  select pg_catalog.md5(
    'segments:'||coalesce(v_source_digest,'')||
    '|identities:'||coalesce(identity_digest,'')||
    '|names:'||coalesce(name_digest,'')||
    '|nodes:'||coalesce(node_digest,'')||
    '|mappings:'||coalesce(mapping_digest,'')
  )
  into v_registry_digest
  from lateral (
    select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      i.id::text||':'||i.source_identity_key||':'||i.source_digest||':'||
      i.public_access_status||':'||i.drivable_status||':'||i.active::text,
      ',' order by i.id
    ),'')) as identity_digest
    from public.brinesearch_authoritative_road_identities i
    where i.id in (select distinct identity_id from tmp_issue97_segments)
  ) identities
  cross join lateral (
    select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      n.identity_id::text||':'||n.source_dataset_id::text||':'||n.source_record_id||':'||
      n.name_type||':'||n.road_name||':'||coalesce(n.source_segment_key,'')||':'||
      coalesce(n.from_measure::text,'')||':'||coalesce(n.to_measure::text,'')||':'||n.provenance::text,
      ',' order by n.identity_id,n.source_dataset_id,n.source_record_id,n.name_type,n.road_name
    ),'')) as name_digest
    from public.brinesearch_authoritative_road_names n
    where n.active and n.identity_id in (select distinct identity_id from tmp_issue97_segments)
  ) names
  cross join lateral (
    select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      n.source_node_key||':'||n.source_digest,',' order by n.source_node_key
    ),'')) as node_digest
    from public.brinesearch_authoritative_road_nodes n
    where n.active and exists(select 1 from tmp_issue97_segments s
      where extensions.st_dwithin(n.geom::extensions.geography,s.geom::extensions.geography,1))
  ) nodes
  cross join lateral (
    select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      m.identity_id::text||':'||m.road_id::text||':'||m.mapping_status||':'||
      m.mapping_method||':'||m.evidence::text,',' order by m.identity_id,m.road_id
    ),'')) as mapping_digest
    from public.brinesearch_road_identity_mappings m
    where m.identity_id in (select distinct identity_id from tmp_issue97_segments)
  ) mappings;
  v_source_digest:=pg_catalog.md5(
    'source-run-vector:'||coalesce(v_source_run_vector::text,'[]')||
    '|registry:'||coalesce(v_registry_digest,'')
  );

  insert into public.brinesearch_road_graph_builds(
    id,state_code,county_code,county_name,algorithm_version,source_revision_digest,
    status,source_segment_count,identity_count,created_by,details
  ) values (
    v_build,v_state,v_county,v_county_name,'issue97-authoritative-topology-v2',
    v_source_digest,'staging',v_segment_count,v_identity_count,auth.uid(),
    pg_catalog.jsonb_build_object(
      'point_rule','exact authoritative network vertex or projected PennDOT at-grade node',
      'grade_rule','structure/tunnel conflicts and non-terminal level conflicts are held',
      'shared_rule','positive-length PostGIS line intersection; vertexization may differ',
      'history_rule','builds and published anchor provenance are immutable',
      'boundary_rule','first participating county owns one physical occurrence',
      'identity_rule','source identities only; names never create or merge topology',
      'source_run_vector',coalesce(v_source_run_vector,'[]'::jsonb),
      'registry_digest',v_registry_digest,'source_vector_version','issue97-v1'
    )
  );

  create temporary table tmp_issue97_vertices on commit drop as
  with points as (
    select s.id as segment_id,s.identity_id,s.source_segment_key,s.state_code,s.county_code,
      extensions.st_x((p).geom) as raw_lng,extensions.st_y((p).geom) as raw_lat,
      zm.source_z,zm.source_m,
      extensions.st_snaptogrid((p).geom,0.0000001) as geom,
      extensions.st_dwithin((p).geom::extensions.geography,
        extensions.st_boundary(s.geom)::extensions.geography,0.03) as is_endpoint
    from tmp_issue97_segments s
    cross join lateral extensions.st_dumppoints(s.geom) p
    left join lateral (
      select
        case when coalesce(coord->>2,'')~'^-?[0-9]+(?:\.[0-9]+)?$'
          then (coord->>2)::numeric end as source_z,
        case when coalesce(coord->>3,'')~'^-?[0-9]+(?:\.[0-9]+)?$'
          then (coord->>3)::numeric end as source_m
      from pg_catalog.jsonb_array_elements(
        coalesce(s.attributes->'source_geometry_zm'->'paths','[]'::jsonb)
      ) with ordinality source_path(path_value,path_number)
      cross join lateral pg_catalog.jsonb_array_elements(source_path.path_value)
        with ordinality source_point(coord,point_number)
      where coalesce(coord->>0,'')~'^-?[0-9]+(?:\.[0-9]+)?$'
        and coalesce(coord->>1,'')~'^-?[0-9]+(?:\.[0-9]+)?$'
        and pg_catalog.abs((coord->>0)::double precision-extensions.st_x((p).geom))<0.000000001
        and pg_catalog.abs((coord->>1)::double precision-extensions.st_y((p).geom))<0.000000001
      order by source_path.path_number,source_point.point_number limit 1
    ) zm on true
  )
  select segment_id,identity_id,source_segment_key,state_code,county_code,
    pg_catalog.round(extensions.st_x(geom)::numeric,7) as lng,
    pg_catalog.round(extensions.st_y(geom)::numeric,7) as lat,
    extensions.st_setsrid(extensions.st_makepoint(
      pg_catalog.round(extensions.st_x(geom)::numeric,7)::double precision,
      pg_catalog.round(extensions.st_y(geom)::numeric,7)::double precision
    ),4326) as geom,pg_catalog.bool_or(is_endpoint) as is_endpoint,
    min(raw_lng) as raw_lng,min(raw_lat) as raw_lat,
    min(source_z) as source_z_min,max(source_z) as source_z_max,
    min(source_m) as source_m_min,max(source_m) as source_m_max
  from points where geom is not null
  group by segment_id,identity_id,source_segment_key,state_code,county_code,
    pg_catalog.round(extensions.st_x(geom)::numeric,7),
    pg_catalog.round(extensions.st_y(geom)::numeric,7);
  create index tmp_issue97_vertices_xy_idx on tmp_issue97_vertices(lng,lat);

  create temporary table tmp_issue97_at_grade on commit drop as
  with scoped as (
    select n.*,
      extensions.st_snaptogrid(n.geom,0.0000001) as snapped_geom
    from public.brinesearch_authoritative_road_nodes n
    where n.active and n.node_type='at_grade_intersection'
      and exists(select 1 from tmp_issue97_target_segments t
        where extensions.st_dwithin(n.geom::extensions.geography,t.geom::extensions.geography,1))
  )
  select
    pg_catalog.round(extensions.st_x(n.snapped_geom)::numeric,7) as lng,
    pg_catalog.round(extensions.st_y(n.snapped_geom)::numeric,7) as lat,
    extensions.st_setsrid(extensions.st_makepoint(
      pg_catalog.round(extensions.st_x(n.snapped_geom)::numeric,7)::double precision,
      pg_catalog.round(extensions.st_y(n.snapped_geom)::numeric,7)::double precision
    ),4326) as geom,
    array_agg(distinct v.identity_id order by v.identity_id) as identity_ids,
    array_agg(distinct n.source_node_key order by n.source_node_key) as node_keys,
    min(v.state_code||':'||v.county_code) as owner_scope,
    pg_catalog.jsonb_agg(distinct pg_catalog.jsonb_build_object(
      'node_key',n.source_node_key,'segment_key',v.source_segment_key,
      'source_vertex',pg_catalog.jsonb_build_array(v.raw_lng,v.raw_lat,v.source_z_min,v.source_m_min)
    )) as coordinate_evidence
  from scoped n
  join tmp_issue97_vertices v
    on extensions.st_dwithin(n.geom::extensions.geography,v.geom::extensions.geography,1)
  join tmp_issue97_segments seg on seg.id=v.segment_id
  where (
    -- Local-road termini may not carry a PennDOT state-route tuple. They are
    -- accepted only when the source endpoint is effectively coincident with the
    -- authoritative at-grade node, never merely because it lies within 1 m.
    (v.is_endpoint and extensions.st_dwithin(
      n.geom::extensions.geography,v.geom::extensions.geography,0.03
    ))
    or (
      seg.state_code='PA' and (
        -- Base roadway tuple on layer 23: T_RT_NO + SEG_NO.
        (
          nullif(pg_catalog.ltrim(coalesce(n.attributes->>'T_RT_NO',''),'0'),'') is not null
          and nullif(pg_catalog.ltrim(coalesce(
            seg.attributes->>'T_RT_NO',seg.attributes->>'LR_RT_NO',''
          ),'0'),'')=nullif(pg_catalog.ltrim(coalesce(n.attributes->>'T_RT_NO',''),'0'),'')
          and (nullif(coalesce(n.attributes->>'SEG_NO',''),'') is null
            or nullif(pg_catalog.ltrim(coalesce(seg.attributes->>'SEG_NO',''),'0'),'')
              =nullif(pg_catalog.ltrim(coalesce(n.attributes->>'SEG_NO',''),'0'),''))
        )
        or
        -- Intersecting roadway tuple on layer 23: ST_RT_IXN + SEG_IXN.
        (
          nullif(pg_catalog.ltrim(coalesce(n.attributes->>'ST_RT_IXN',''),'0'),'') is not null
          and nullif(pg_catalog.ltrim(coalesce(
            seg.attributes->>'T_RT_NO',seg.attributes->>'LR_RT_NO',''
          ),'0'),'')=nullif(pg_catalog.ltrim(coalesce(n.attributes->>'ST_RT_IXN',''),'0'),'')
          and (nullif(coalesce(n.attributes->>'SEG_IXN',''),'') is null
            or nullif(pg_catalog.ltrim(coalesce(seg.attributes->>'SEG_NO',''),'0'),'')
              =nullif(pg_catalog.ltrim(coalesce(n.attributes->>'SEG_IXN',''),'0'),''))
        )
      )
    )
  )
  group by pg_catalog.round(extensions.st_x(n.snapped_geom)::numeric,7),
    pg_catalog.round(extensions.st_y(n.snapped_geom)::numeric,7)
  having count(distinct v.identity_id)>=2;

  create temporary table tmp_issue97_point_candidates on commit drop as
  with exact_points as (
    select v.lng,v.lat,v.geom,
      array_agg(distinct v.identity_id order by v.identity_id) as identity_ids,
      '{}'::text[] as node_keys,min(v.state_code||':'||v.county_code) as owner_scope,
      false as has_at_grade,'exact_authoritative_source_vertex'::text as source_method,
      count(distinct v.identity_id) filter(where v.source_z_min is not null)::integer as source_z_identity_count,
      max(v.source_z_max)-min(v.source_z_min) as source_z_span,
      pg_catalog.jsonb_agg(distinct pg_catalog.jsonb_build_object(
        'identity_id',v.identity_id,'segment_key',v.source_segment_key,
        'source_vertex',pg_catalog.jsonb_build_array(v.raw_lng,v.raw_lat,v.source_z_min,v.source_m_min)
      )) as coordinate_evidence
    from tmp_issue97_vertices v
    group by v.lng,v.lat,v.geom
    having count(distinct v.identity_id)>=2
  ), official_points as (
    select a.lng,a.lat,a.geom,a.identity_ids,a.node_keys,a.owner_scope,
      true as has_at_grade,'penndot_at_grade_node_projection'::text as source_method,
      0::integer as source_z_identity_count,null::numeric as source_z_span,a.coordinate_evidence
    from tmp_issue97_at_grade a
  )
  select 'point:'||p.lng::text||':'||p.lat::text as candidate_key,p.*
  from official_points p where p.owner_scope=v_state||':'||v_county
  union all
  select 'point:'||p.lng::text||':'||p.lat::text,p.*
  from exact_points p where p.owner_scope=v_state||':'||v_county
    and not exists(select 1 from official_points a
      where extensions.st_dwithin(a.geom::extensions.geography,p.geom::extensions.geography,1));
  create unique index tmp_issue97_point_candidates_key_idx
    on tmp_issue97_point_candidates(candidate_key);

  create temporary table tmp_issue97_point_raw on commit drop as
  select p.candidate_key,p.geom as point_geom,p.lng,p.lat,p.has_at_grade,p.source_method,
    p.node_keys,p.source_z_identity_count,p.source_z_span,p.coordinate_evidence,
    s.id as segment_id,s.identity_id,s.source_segment_key,s.state_code,s.county_code,
    s.township,s.municipality,s.from_measure,s.to_measure,s.bridge_status,s.tunnel_status,s.z_level,
    s.geom as segment_geom,v.source_z_min,v.source_z_max,v.source_m_min,v.source_m_max,
    extensions.st_dwithin(p.geom::extensions.geography,
      extensions.st_boundary(s.geom)::extensions.geography,
      case when p.has_at_grade then 1 else 0.03 end) as endpoint_touch
  from tmp_issue97_point_candidates p
  cross join lateral unnest(p.identity_ids) member(identity_id)
  join tmp_issue97_segments s on s.identity_id=member.identity_id
    and extensions.st_dwithin(p.geom::extensions.geography,s.geom::extensions.geography,
      case when p.has_at_grade then 1 else 0.03 end)
  left join tmp_issue97_vertices v on v.segment_id=s.id and (
    (not p.has_at_grade and v.lng=p.lng and v.lat=p.lat)
    or (p.has_at_grade and extensions.st_dwithin(
      p.geom::extensions.geography,v.geom::extensions.geography,1
    ))
  );

  create temporary table tmp_issue97_point_identity on commit drop as
  select r.candidate_key,r.identity_id,
    array_agg(distinct r.source_segment_key order by r.source_segment_key) as source_segment_keys,
    count(distinct r.segment_id)::integer as touching_segment_count,
    count(distinct r.segment_id) filter(where r.endpoint_touch)::integer as endpoint_segment_count,
    pg_catalog.bool_or(not r.endpoint_touch) as has_interior_touch,
    not pg_catalog.bool_or(not r.endpoint_touch) as endpoint_only,
    (not pg_catalog.bool_or(not r.endpoint_touch) and count(distinct r.segment_id)=1) as is_identity_terminus,
    pg_catalog.bool_or(r.z_level is not null or r.bridge_status is not null
      or r.tunnel_status is not null or r.source_z_min is not null) as has_grade_evidence,
    min(r.source_z_min) as source_z_min,max(r.source_z_max) as source_z_max
  from tmp_issue97_point_raw r group by r.candidate_key,r.identity_id;

  create temporary table tmp_issue97_point_nodes on commit drop as
  select p.candidate_key,p.lng,p.lat,p.geom,p.has_at_grade,p.source_method,p.node_keys,
    p.coordinate_evidence,p.source_z_identity_count,p.source_z_span,
    array_agg(distinct i.identity_id order by i.identity_id) as identity_ids,
    count(distinct i.identity_id)::integer as identity_count,
    count(distinct i.identity_id) filter(where i.is_identity_terminus)::integer as terminus_identity_count,
    count(distinct i.identity_id) filter(where i.endpoint_only)::integer as endpoint_only_identity_count,
    count(distinct i.identity_id) filter(where i.has_grade_evidence)::integer as grade_evidence_identity_count,
    count(distinct coalesce(r.bridge_status,'none'))::integer as bridge_variant_count,
    count(distinct coalesce(r.tunnel_status,'none'))::integer as tunnel_variant_count,
    count(distinct coalesce(r.z_level,0))::integer as level_variant_count,
    case when count(distinct nullif(r.township,''))=1 then min(nullif(r.township,'')) end as township,
    case when count(distinct nullif(r.municipality,''))=1 then min(nullif(r.municipality,'')) end as municipality,
    pg_catalog.bool_or(ri.road_class='ramp' or ri.route_extension in ('17','RAMP')) as has_ramp,
    count(distinct ri.normalized_name)::integer as distinct_name_count,
    case
      when count(distinct i.identity_id)>=3 then 'multiway'
      when pg_catalog.bool_or(ri.road_class='ramp' or ri.route_extension in ('17','RAMP')) then 'ramp'
      when count(distinct i.identity_id)=2
        and count(distinct i.identity_id) filter(where i.is_identity_terminus)=2 then 'continuation'
      when count(distinct i.identity_id) filter(where i.is_identity_terminus)=1 then 't_junction'
      else 'intersection'
    end as junction_type,
    case
      when count(distinct coalesce(r.bridge_status,'none'))>1 then true
      when count(distinct coalesce(r.tunnel_status,'none'))>1 then true
      when count(distinct coalesce(r.z_level,0))>1
        and count(distinct i.identity_id) filter(where i.is_identity_terminus)
          <count(distinct i.identity_id) then true
      when p.source_z_span is not null and p.source_z_span>1.5 then true
      else false
    end as grade_conflict,
    (p.has_at_grade
      or count(distinct i.identity_id) filter(where i.endpoint_only)=count(distinct i.identity_id)
      -- An exact authoritative source vertex with at least one terminating
      -- identity is a supported T-junction. Explicit level/structure conflicts
      -- are still held by grade_conflict below; missing grade metadata alone is
      -- not evidence that the physical source node is an overpass.
      or count(distinct i.identity_id) filter(where i.is_identity_terminus)>=1
    ) as topology_supported
  from tmp_issue97_point_candidates p
  join tmp_issue97_point_identity i on i.candidate_key=p.candidate_key
  join public.brinesearch_authoritative_road_identities ri on ri.id=i.identity_id
  join tmp_issue97_point_raw r on r.candidate_key=p.candidate_key and r.identity_id=i.identity_id
  group by p.candidate_key,p.lng,p.lat,p.geom,p.has_at_grade,p.source_method,p.node_keys,
    p.coordinate_evidence,p.source_z_identity_count,p.source_z_span
  having count(distinct i.identity_id)>=2;

  -- Positive-length line intersection detects the same physical shared section
  -- even when the agencies place different intermediate vertices on it.
  create temporary table tmp_issue97_pair_shared on commit drop as
  with intersections as (
    select array[least(a.identity_id,b.identity_id),greatest(a.identity_id,b.identity_id)] as identity_ids,
      array[a.source_segment_key,b.source_segment_key] as segment_keys,
      least(a.state_code||':'||a.county_code,b.state_code||':'||b.county_code) as owner_scope,
      (coalesce(a.bridge_status,'none')<>coalesce(b.bridge_status,'none')
        or coalesce(a.tunnel_status,'none')<>coalesce(b.tunnel_status,'none')
        or coalesce(a.z_level,0)<>coalesce(b.z_level,0)
        or (coalesce(a.attributes->>'source_average_z','')~'^-?[0-9]+(?:\.[0-9]+)?$'
          and coalesce(b.attributes->>'source_average_z','')~'^-?[0-9]+(?:\.[0-9]+)?$'
          and pg_catalog.abs((a.attributes->>'source_average_z')::numeric
            -(b.attributes->>'source_average_z')::numeric)>1.5)) as grade_conflict,
      (d).geom as geom
    from tmp_issue97_segments a
    join tmp_issue97_segments b on a.identity_id::text<b.identity_id::text
      and extensions.st_intersects(a.geom,b.geom)
    cross join lateral (
      select extensions.st_collectionextract(extensions.st_intersection(
        extensions.st_snaptogrid(a.geom,0.0000001),
        extensions.st_snaptogrid(b.geom,0.0000001)
      ),2) as geom
    ) x
    cross join lateral extensions.st_dump(x.geom) d
    where not extensions.st_isempty(x.geom)
      and extensions.st_length((d).geom::extensions.geography)>0.02
  ), merged as (
    select identity_ids,owner_scope,grade_conflict,
      array_agg(distinct k order by k) as segment_keys,
      extensions.st_linemerge(extensions.st_unaryunion(extensions.st_collect(geom))) as geom
    from intersections cross join lateral unnest(segment_keys) k
    group by identity_ids,owner_scope,grade_conflict
  )
  select identity_ids,segment_keys,owner_scope,grade_conflict,(d).geom as geom
  from merged cross join lateral extensions.st_dump(extensions.st_collectionextract(geom,2)) d
  where extensions.st_length((d).geom::extensions.geography)>0.02;

  create temporary table tmp_issue97_shared on commit drop as
  -- Pairwise overlaps are only evidence. Node their combined linework first,
  -- then label each atomic edge with every identity that covers it. This
  -- produces maximal constant-membership sections: an A/B overlap containing
  -- a shorter A/B/C overlap becomes A/B, A/B/C, A/B instead of one long A/B
  -- card laid underneath a second, contradictory A/B/C card.
  with noded_network as (
    select extensions.st_node(extensions.st_collect(geom)) as geom
    from tmp_issue97_pair_shared
    where owner_scope=v_state||':'||v_county
  ), atomic_edges as (
    select (d).geom,
      pg_catalog.md5(least(
        extensions.st_asewkb((d).geom)::text,
        extensions.st_asewkb(extensions.st_reverse((d).geom))::text
      )) as atomic_key
    from noded_network n
    cross join lateral extensions.st_dump(
      extensions.st_collectionextract(n.geom,2)
    ) d
    where extensions.st_length((d).geom::extensions.geography)>0.02
  ), pair_coverage as (
    select a.atomic_key,a.geom,p.identity_ids,p.segment_keys,p.owner_scope,p.grade_conflict
    from atomic_edges a
    join tmp_issue97_pair_shared p
      on p.owner_scope=v_state||':'||v_county
      and extensions.st_intersects(a.geom,p.geom)
      and extensions.st_length(
        extensions.st_collectionextract(extensions.st_intersection(a.geom,p.geom),2)
          ::extensions.geography
      )>=extensions.st_length(a.geom::extensions.geography)-0.01
  ), atomic_labels as (
    select atomic_key,(array_agg(geom order by extensions.st_asewkb(geom)::text))[1] as geom,
      min(owner_scope) as owner_scope,pg_catalog.bool_or(grade_conflict) as grade_conflict
    from pair_coverage
    group by atomic_key
  ), atomic_identities as (
    select atomic_key,array_agg(distinct identity_id order by identity_id) as identity_ids
    from pair_coverage
    cross join lateral unnest(identity_ids) member(identity_id)
    group by atomic_key
  ), labeled_edges as (
    select l.geom,l.owner_scope,l.grade_conflict,i.identity_ids
    from atomic_labels l join atomic_identities i using(atomic_key)
    where pg_catalog.array_length(i.identity_ids,1)>=2
  ), merged_labels as (
    select identity_ids,owner_scope,grade_conflict,
      extensions.st_linemerge(
        extensions.st_unaryunion(extensions.st_collect(geom))
      ) as geom
    from labeled_edges
    group by identity_ids,owner_scope,grade_conflict
  ), dumped as (
    select identity_ids,owner_scope,grade_conflict,(d).geom as geom
    from merged_labels
    cross join lateral extensions.st_dump(
      extensions.st_collectionextract(geom,2)
    ) d
  )
  select pg_catalog.md5(least(
      extensions.st_asewkb(geom)::text,
      extensions.st_asewkb(extensions.st_reverse(geom))::text
    )) as geom_key,
    geom,identity_ids,grade_conflict,owner_scope
  from dumped
  where extensions.st_length(geom::extensions.geography)>0.02;

  -- Shared geometry is one logical connection card with two anchors. Do not
  -- duplicate every internal/start/end vertex as separate point occurrences;
  -- retain a point only when an additional road participates there.
  delete from tmp_issue97_point_nodes p
  where exists(
    select 1 from tmp_issue97_shared s
    where extensions.st_dwithin(p.geom::extensions.geography,s.geom::extensions.geography,0.05)
      and not exists(select 1 from unnest(p.identity_ids) x(id)
        where not (x.id=any(s.identity_ids)))
  );

  insert into public.brinesearch_road_junctions(
    id,logical_junction_id,build_id,stable_junction_key,display_id,state_code,county_code,county_name,
    township,municipality,junction_type,geom,source_method,source_provenance,
    confidence,verification_status,graph_digest
  )
  select
    private_verification.brinesearch_issue97_uuid('build:'||v_build::text||':'||p.candidate_key),
    private_verification.brinesearch_issue97_uuid(
      'junction:point:'||v_state||':'||p.lng::text||':'||p.lat::text
    ),
    v_build,'junction:point:'||v_state||':'||p.lng::text||':'||p.lat::text,
    v_state||'-'||v_county||'-JCT-'||pg_catalog.upper(pg_catalog.substr(
      pg_catalog.md5(p.lng::text||':'||p.lat::text),1,8)),
    v_state,v_county,v_county_name,p.township,p.municipality,p.junction_type,p.geom,
    p.source_method,pg_catalog.jsonb_build_object(
      'identity_ids',pg_catalog.to_jsonb(p.identity_ids),
      'at_grade_node_keys',pg_catalog.to_jsonb(p.node_keys),
      'has_penndot_at_grade_node',p.has_at_grade,
      'bridge_variant_count',p.bridge_variant_count,
      'tunnel_variant_count',p.tunnel_variant_count,
      'level_variant_count',p.level_variant_count,
      'source_z_identity_count',p.source_z_identity_count,
      'source_z_span',p.source_z_span,
      'source_exact_coordinate_evidence',p.coordinate_evidence,
      'endpoint_only_identity_count',p.endpoint_only_identity_count,
      'terminus_identity_count',p.terminus_identity_count,
      'grade_evidence_identity_count',p.grade_evidence_identity_count,
      'topology_supported',p.topology_supported,
      'grade_conflict',p.grade_conflict,
      'interior_vertex_rule','requires a terminus plus explicit compatible grade evidence',
      'raw_geometric_crossings_forbidden',true,
      'algorithm','issue97-authoritative-topology-v2'
    ),case when p.grade_conflict or not p.topology_supported then 'held'
      when p.has_at_grade then 'authoritative_at_grade' else 'authoritative' end,
    case when p.grade_conflict or not p.topology_supported then 'held' else 'verified' end,
    pg_catalog.md5(v_source_digest||':'||p.candidate_key||':'||p.identity_ids::text||':'||
      p.grade_conflict::text||':'||p.topology_supported::text)
  from tmp_issue97_point_nodes p;

  insert into public.brinesearch_road_junctions(
    id,logical_junction_id,build_id,stable_junction_key,display_id,state_code,county_code,county_name,
    junction_type,geom,source_method,source_provenance,confidence,
    verification_status,graph_digest
  )
  select
    private_verification.brinesearch_issue97_uuid('build:'||v_build::text||':shared:'||s.geom_key||':'||s.identity_ids::text),
    private_verification.brinesearch_issue97_uuid(
      'junction:shared:'||v_state||':'||s.identity_ids::text||':'||s.geom_key
    ),
    v_build,'junction:shared:'||v_state||':'||s.identity_ids::text||':'||s.geom_key,
    v_state||'-'||v_county||'-SHARED-'||pg_catalog.upper(pg_catalog.substr(
      pg_catalog.md5(s.identity_ids::text||':'||s.geom_key),1,8)),
    v_state,v_county,v_county_name,'shared_segment',s.geom,
    'authoritative_line_overlap',pg_catalog.jsonb_build_object(
      'identity_ids',pg_catalog.to_jsonb(s.identity_ids),
      'source_segment_keys_by_identity',(
        select pg_catalog.jsonb_object_agg(coverage.identity_id::text,
          pg_catalog.to_jsonb(coverage.source_segment_keys) order by coverage.identity_id::text)
        from (
          select seg.identity_id,
            array_agg(distinct seg.source_segment_key order by seg.source_segment_key)
              as source_segment_keys
          from tmp_issue97_segments seg
          where seg.identity_id=any(s.identity_ids)
            and extensions.st_intersects(seg.geom,s.geom)
            and extensions.st_length(
              extensions.st_collectionextract(extensions.st_intersection(seg.geom,s.geom),2)
                ::extensions.geography
            )>0.02
          group by seg.identity_id
        ) coverage
      ),
      'different_vertexization_supported',true,'point_collapse_forbidden',true,
      'endpoint_events',pg_catalog.jsonb_build_array('concurrency_begin','concurrency_end'),
      'grade_conflict',s.grade_conflict,'algorithm','issue97-authoritative-topology-v2'
    ),case when s.grade_conflict then 'held' else 'authoritative' end,
    case when s.grade_conflict then 'held' else 'verified' end,
    pg_catalog.md5(v_source_digest||':'||s.geom_key||':'||s.identity_ids::text||':'||s.grade_conflict::text)
  from tmp_issue97_shared s;

  -- A source-scoped name transition is an event on one physical road identity,
  -- not a guessed intersection and not a second road. It is emitted only when
  -- two exact source segments of that identity share an endpoint and carry
  -- different active, segment-scoped authoritative names.
  create temporary table tmp_issue97_name_changes on commit drop as
  with changes as (
    select a.identity_id,a.state_code,a.county_code,
      a.source_segment_key as left_segment_key,b.source_segment_key as right_segment_key,
      na.id as left_name_event_id,nb.id as right_name_event_id,
      na.road_name as left_name,nb.road_name as right_name,
      (d).geom as raw_geom,
      case when a.from_measure is not null and a.to_measure is not null
        and extensions.geometrytype(extensions.st_linemerge(a.geom))='LINESTRING' then
        a.from_measure+(a.to_measure-a.from_measure)*extensions.st_linelocatepoint(
          extensions.st_linemerge(a.geom),extensions.st_closestpoint(a.geom,(d).geom)
        ) end as left_measure,
      case when b.from_measure is not null and b.to_measure is not null
        and extensions.geometrytype(extensions.st_linemerge(b.geom))='LINESTRING' then
        b.from_measure+(b.to_measure-b.from_measure)*extensions.st_linelocatepoint(
          extensions.st_linemerge(b.geom),extensions.st_closestpoint(b.geom,(d).geom)
        ) end as right_measure
    from tmp_issue97_segments a
    join tmp_issue97_segments b on b.identity_id=a.identity_id and a.id::text<b.id::text
      and extensions.st_dwithin(
        extensions.st_boundary(a.geom)::extensions.geography,
        extensions.st_boundary(b.geom)::extensions.geography,0.03
      )
    cross join lateral extensions.st_dump(extensions.st_collectionextract(
      extensions.st_intersection(extensions.st_boundary(a.geom),extensions.st_boundary(b.geom)),1
    )) d
    join lateral (
      select n.id,n.road_name,n.normalized_name
      from public.brinesearch_authoritative_road_names n
      where n.identity_id=a.identity_id and n.source_segment_key=a.source_segment_key
        and n.active and (n.valid_from is null or n.valid_from<=now())
        and (n.valid_to is null or n.valid_to>now())
      order by case n.name_type when 'official' then 0 when 'signed' then 1 else 2 end,n.id limit 1
    ) na on true
    join lateral (
      select n.id,n.road_name,n.normalized_name
      from public.brinesearch_authoritative_road_names n
      where n.identity_id=b.identity_id and n.source_segment_key=b.source_segment_key
        and n.active and (n.valid_from is null or n.valid_from<=now())
        and (n.valid_to is null or n.valid_to>now())
      order by case n.name_type when 'official' then 0 when 'signed' then 1 else 2 end,n.id limit 1
    ) nb on true
    where na.normalized_name<>nb.normalized_name
      and least(a.state_code||':'||a.county_code,b.state_code||':'||b.county_code)=v_state||':'||v_county
  ), grouped as (
    select identity_id,
      pg_catalog.round(extensions.st_x(raw_geom)::numeric,7) as lng,
      pg_catalog.round(extensions.st_y(raw_geom)::numeric,7) as lat,
      (array_agg(raw_geom order by extensions.st_asewkb(raw_geom)::text))[1] as raw_geom,
      array_agg(distinct left_segment_key order by left_segment_key)||
        array_agg(distinct right_segment_key order by right_segment_key) as source_segment_keys,
      min(left_name) as left_name,min(right_name) as right_name,
      array_agg(distinct left_name_event_id order by left_name_event_id)||
        array_agg(distinct right_name_event_id order by right_name_event_id) as name_event_ids,
      min(left_measure) as left_measure,min(right_measure) as right_measure
    from changes group by identity_id,
      pg_catalog.round(extensions.st_x(raw_geom)::numeric,7),
      pg_catalog.round(extensions.st_y(raw_geom)::numeric,7)
  )
  select g.*,
    extensions.st_setsrid(extensions.st_makepoint(g.lng::double precision,g.lat::double precision),4326) as geom,
    case when g.left_measure is not null and g.right_measure is not null
      and pg_catalog.abs(g.left_measure-g.right_measure)<=0.001
      then (g.left_measure+g.right_measure)/2 end as source_measure
  from grouped g;

  insert into public.brinesearch_road_junctions(
    id,logical_junction_id,build_id,stable_junction_key,display_id,state_code,county_code,county_name,
    junction_type,geom,source_method,source_provenance,confidence,verification_status,graph_digest
  )
  select
    private_verification.brinesearch_issue97_uuid('build:'||v_build::text||':name-change:'||
      n.identity_id::text||':'||n.lng::text||':'||n.lat::text),
    private_verification.brinesearch_issue97_uuid('junction:name-change:'||v_state||':'||
      n.identity_id::text||':'||n.lng::text||':'||n.lat::text),
    v_build,'junction:name-change:'||v_state||':'||n.identity_id::text||':'||n.lng::text||':'||n.lat::text,
    v_state||'-'||v_county||'-NAME-'||pg_catalog.upper(pg_catalog.substr(
      pg_catalog.md5(n.identity_id::text||':'||n.lng::text||':'||n.lat::text),1,8)),
    v_state,v_county,v_county_name,'name_change',n.geom,'authoritative_segment_name_transition',
    pg_catalog.jsonb_build_object(
      'identity_id',n.identity_id,'source_segment_keys',pg_catalog.to_jsonb(n.source_segment_keys),
      'name_event_ids',pg_catalog.to_jsonb(n.name_event_ids),
      'left_name',n.left_name,'right_name',n.right_name,
      'source_exact_coordinate',extensions.st_asgeojson(n.raw_geom,15)::jsonb,
      'name_matching_used_for_topology',false,'algorithm','issue97-authoritative-topology-v2'
    ),'authoritative','verified',pg_catalog.md5(v_source_digest||':name-change:'||
      n.identity_id::text||':'||n.lng::text||':'||n.lat::text||':'||n.source_segment_keys::text)
  from tmp_issue97_name_changes n;

  insert into public.brinesearch_road_junction_anchors(
    id,junction_id,anchor_key,anchor_role,geom,anchor_digest
  )
  select private_verification.brinesearch_issue97_uuid('anchor:'||j.id::text||':point'),
    j.id,'point','point',j.geom,pg_catalog.md5(extensions.st_asgeojson(j.geom,15))
  from public.brinesearch_road_junctions j
  where j.build_id=v_build and j.junction_type<>'shared_segment';
  insert into public.brinesearch_road_junction_anchors(
    id,junction_id,anchor_key,anchor_role,geom,anchor_digest
  )
  select private_verification.brinesearch_issue97_uuid('anchor:'||j.id::text||':start'),
    j.id,'start','shared_start',extensions.st_startpoint(extensions.st_linemerge(j.geom)),
    pg_catalog.md5(extensions.st_asgeojson(extensions.st_startpoint(extensions.st_linemerge(j.geom)),15))
  from public.brinesearch_road_junctions j where j.build_id=v_build and j.junction_type='shared_segment'
  union all
  select private_verification.brinesearch_issue97_uuid('anchor:'||j.id::text||':end'),
    j.id,'end','shared_end',extensions.st_endpoint(extensions.st_linemerge(j.geom)),
    pg_catalog.md5(extensions.st_asgeojson(extensions.st_endpoint(extensions.st_linemerge(j.geom)),15))
  from public.brinesearch_road_junctions j where j.build_id=v_build and j.junction_type='shared_segment';

  create temporary table tmp_issue97_point_values on commit drop as
  select p.candidate_key,i.identity_id,i.source_segment_keys,i.is_identity_terminus,
    choice.source_segment_key as chosen_segment_key,choice.fraction,
    case when choice.from_measure is not null and choice.to_measure is not null
      then choice.from_measure+(choice.to_measure-choice.from_measure)*choice.fraction end as source_measure,
    case
      when choice.from_measure is not null and choice.to_measure is not null
        then (choice.from_measure+(choice.to_measure-choice.from_measure)*choice.fraction)*1609.344
      when totals.segment_count=1 then choice.fraction*choice.length_m
      else null
    end as distance_along_road_m,
    case when choice.from_measure is not null and choice.to_measure is not null then 'authoritative_linear_measure'
      when totals.segment_count=1 then 'single_source_feature_geometry'
      else 'ambiguous' end as measure_method
  from tmp_issue97_point_nodes p
  join tmp_issue97_point_identity i on i.candidate_key=p.candidate_key
  left join lateral (
    select s.source_segment_key,s.state_code,s.from_measure,s.to_measure,
      extensions.st_length(s.geom::extensions.geography) as length_m,
      case when extensions.geometrytype(extensions.st_linemerge(s.geom))='LINESTRING'
        then extensions.st_linelocatepoint(
          extensions.st_linemerge(s.geom),extensions.st_closestpoint(s.geom,p.geom)
        ) else 0 end as fraction
    from tmp_issue97_segments s
    where s.identity_id=i.identity_id
      and extensions.st_dwithin(s.geom::extensions.geography,p.geom::extensions.geography,
        case when p.has_at_grade then 1 else 0.03 end)
    order by s.from_measure nulls last,s.source_segment_key limit 1
  ) choice on true
  left join lateral (
    select count(*)::integer as segment_count from tmp_issue97_segments s
    where s.identity_id=i.identity_id
  ) totals on true;

  insert into public.brinesearch_road_junction_memberships(
    id,junction_id,identity_id,road_id,source_segment_keys,road_name_at_junction,
    aliases_at_junction,membership_role,source_measure,distance_along_road_m,
    approach_data,provenance
  )
  select private_verification.brinesearch_issue97_uuid('membership:'||j.id::text||':'||i.id::text),
    j.id,i.id,map.road_id,v.source_segment_keys,coalesce(primary_name.road_name,i.display_name),
    coalesce(alias_names.aliases,'{}'::text[]),
    case when j.junction_type='ramp' and i.road_class='ramp' then 'ramp'
      when j.junction_type='continuation' then 'continuation'
      when j.junction_type='name_change' then 'name_change'
      when v.is_identity_terminus then 'terminus' else 'approach' end,
    v.source_measure,v.distance_along_road_m,
    pg_catalog.jsonb_build_object(
      'identity_terminus',v.is_identity_terminus,'measure_method',v.measure_method,
      'chosen_source_segment_key',v.chosen_segment_key
    ),pg_catalog.jsonb_build_object(
      'source_identity_key',i.source_identity_key,'source_digest',i.source_digest,
      'aliases_are_location_valid',true
    )
  from tmp_issue97_point_values v
  join tmp_issue97_point_nodes p on p.candidate_key=v.candidate_key
  join public.brinesearch_road_junctions j on j.build_id=v_build
    and j.stable_junction_key='junction:point:'||v_state||':'||p.lng::text||':'||p.lat::text
  join public.brinesearch_authoritative_road_identities i on i.id=v.identity_id
  left join lateral (
    select m.road_id from public.brinesearch_road_identity_mappings m
    where m.identity_id=i.id and m.mapping_status='verified' order by m.updated_at desc,m.id limit 1
  ) map on true
  left join lateral (
    select n.road_name from public.brinesearch_authoritative_road_names n
    where n.identity_id=i.id and n.active
      and (n.valid_from is null or n.valid_from<=now()) and (n.valid_to is null or n.valid_to>now())
      and (n.source_segment_key=v.chosen_segment_key or (
        n.source_segment_key is null and (
          n.from_measure is null and n.to_measure is null
          or v.source_measure is not null
            and least(n.from_measure,n.to_measure)<=v.source_measure
            and greatest(n.from_measure,n.to_measure)>=v.source_measure
        )
      ))
    order by (n.source_segment_key=v.chosen_segment_key) desc nulls last,
      case n.name_type when 'official' then 0 when 'signed' then 1 when 'local' then 2
        when '911' then 3 else 4 end,n.road_name,n.id limit 1
  ) primary_name on true
  left join lateral (
    select array_agg(distinct n.road_name order by n.road_name) as aliases
    from public.brinesearch_authoritative_road_names n
    where n.identity_id=i.id and n.active
      and (n.valid_from is null or n.valid_from<=now()) and (n.valid_to is null or n.valid_to>now())
      and (n.source_segment_key=v.chosen_segment_key or (
        n.source_segment_key is null and (
          n.from_measure is null and n.to_measure is null
          or v.source_measure is not null
            and least(n.from_measure,n.to_measure)<=v.source_measure
            and greatest(n.from_measure,n.to_measure)>=v.source_measure
        )
      ))
  ) alias_names on true;

  create temporary table tmp_issue97_shared_values on commit drop as
  select s.geom_key,s.geom,s.identity_ids,member.identity_id,
    coalesce(member_segments.source_segment_keys,'{}'::text[]) as source_segment_keys,
    choice.source_segment_key as chosen_segment_key,choice.fraction,
    case when choice.from_measure is not null and choice.to_measure is not null
      then choice.from_measure+(choice.to_measure-choice.from_measure)*choice.fraction end as source_measure,
    case
      when choice.from_measure is not null and choice.to_measure is not null
        then (choice.from_measure+(choice.to_measure-choice.from_measure)*choice.fraction)*1609.344
      when totals.segment_count=1 then choice.fraction*choice.length_m else null end as distance_along_road_m,
    case when choice.from_measure is not null and choice.to_measure is not null then 'authoritative_linear_measure'
      when totals.segment_count=1 then 'single_source_feature_geometry' else 'ambiguous' end as measure_method
  from tmp_issue97_shared s
  cross join lateral unnest(s.identity_ids) member(identity_id)
  left join lateral (
    select array_agg(distinct seg.source_segment_key order by seg.source_segment_key)
      as source_segment_keys
    from tmp_issue97_segments seg
    where seg.identity_id=member.identity_id
      and extensions.st_intersects(seg.geom,s.geom)
      and extensions.st_length(
        extensions.st_collectionextract(extensions.st_intersection(seg.geom,s.geom),2)
          ::extensions.geography
      )>0.02
  ) member_segments on true
  left join lateral (
    select seg.source_segment_key,seg.state_code,seg.from_measure,seg.to_measure,
      extensions.st_length(seg.geom::extensions.geography) as length_m,
      case when extensions.geometrytype(extensions.st_linemerge(seg.geom))='LINESTRING'
        then extensions.st_linelocatepoint(extensions.st_linemerge(seg.geom),
          extensions.st_closestpoint(seg.geom,extensions.st_startpoint(extensions.st_linemerge(s.geom))))
        else 0 end as fraction
    from tmp_issue97_segments seg where seg.identity_id=member.identity_id
      and extensions.st_intersects(seg.geom,s.geom)
      and extensions.st_length(
        extensions.st_collectionextract(extensions.st_intersection(seg.geom,s.geom),2)
          ::extensions.geography
      )>0.02
    order by extensions.st_length(
        extensions.st_collectionextract(extensions.st_intersection(seg.geom,s.geom),2)
          ::extensions.geography
      ) desc,seg.from_measure nulls last,seg.source_segment_key limit 1
  ) choice on true
  left join lateral (
    select count(*)::integer as segment_count from tmp_issue97_segments seg
    where seg.identity_id=member.identity_id
  ) totals on true;

  insert into public.brinesearch_road_junction_memberships(
    id,junction_id,identity_id,road_id,source_segment_keys,road_name_at_junction,
    aliases_at_junction,membership_role,source_measure,distance_along_road_m,
    approach_data,provenance
  )
  select private_verification.brinesearch_issue97_uuid('membership:'||j.id::text||':'||i.id::text),
    j.id,i.id,map.road_id,v.source_segment_keys,coalesce(primary_name.road_name,i.display_name),
    coalesce(alias_names.aliases,'{}'::text[]),'shared',v.source_measure,v.distance_along_road_m,
    pg_catalog.jsonb_build_object(
      'shared_start',extensions.st_asgeojson(extensions.st_startpoint(extensions.st_linemerge(v.geom)),15)::jsonb,
      'shared_end',extensions.st_asgeojson(extensions.st_endpoint(extensions.st_linemerge(v.geom)),15)::jsonb,
      'measure_method',v.measure_method,'chosen_source_segment_key',v.chosen_segment_key
    ),pg_catalog.jsonb_build_object(
      'source_identity_key',i.source_identity_key,'source_digest',i.source_digest,
      'aliases_are_location_valid',true
    )
  from tmp_issue97_shared_values v
  join public.brinesearch_road_junctions j on j.build_id=v_build
    and j.stable_junction_key='junction:shared:'||v_state||':'||v.identity_ids::text||':'||v.geom_key
  join public.brinesearch_authoritative_road_identities i on i.id=v.identity_id
  left join lateral (
    select m.road_id from public.brinesearch_road_identity_mappings m
    where m.identity_id=i.id and m.mapping_status='verified' order by m.updated_at desc,m.id limit 1
  ) map on true
  left join lateral (
    select n.road_name from public.brinesearch_authoritative_road_names n
    where n.identity_id=i.id and n.active
      and (n.valid_from is null or n.valid_from<=now()) and (n.valid_to is null or n.valid_to>now())
      and (n.source_segment_key=v.chosen_segment_key or (
        n.source_segment_key is null and (
          n.from_measure is null and n.to_measure is null
          or v.source_measure is not null
            and least(n.from_measure,n.to_measure)<=v.source_measure
            and greatest(n.from_measure,n.to_measure)>=v.source_measure
        )
      ))
    order by (n.source_segment_key=v.chosen_segment_key) desc nulls last,
      case n.name_type when 'official' then 0 when 'signed' then 1 when 'local' then 2
        when '911' then 3 else 4 end,n.road_name,n.id limit 1
  ) primary_name on true
  left join lateral (
    select array_agg(distinct n.road_name order by n.road_name) as aliases
    from public.brinesearch_authoritative_road_names n
    where n.identity_id=i.id and n.active
      and (n.valid_from is null or n.valid_from<=now()) and (n.valid_to is null or n.valid_to>now())
      and (n.source_segment_key=v.chosen_segment_key or (
        n.source_segment_key is null and (
          n.from_measure is null and n.to_measure is null
          or v.source_measure is not null
            and least(n.from_measure,n.to_measure)<=v.source_measure
            and greatest(n.from_measure,n.to_measure)>=v.source_measure
        )
      ))
  ) alias_names on true;

  insert into public.brinesearch_road_junction_memberships(
    id,junction_id,identity_id,road_id,source_segment_keys,road_name_at_junction,
    aliases_at_junction,membership_role,source_measure,distance_along_road_m,
    approach_data,provenance
  )
  select private_verification.brinesearch_issue97_uuid('membership:'||j.id::text||':'||n.identity_id::text||':name-change'),
    j.id,n.identity_id,map.road_id,n.source_segment_keys,
    n.left_name||' → '||n.right_name,array[n.left_name,n.right_name],
    'name_change',n.source_measure,
    case when n.source_measure is not null then n.source_measure*1609.344 end,
    pg_catalog.jsonb_build_object(
      'left_name',n.left_name,'right_name',n.right_name,
      'left_measure',n.left_measure,'right_measure',n.right_measure,
      'measure_method',case when n.source_measure is null then 'ambiguous' else 'authoritative_linear_measure' end
    ),pg_catalog.jsonb_build_object(
      'name_event_ids',pg_catalog.to_jsonb(n.name_event_ids),
      'source_identity_key',i.source_identity_key,'source_digest',i.source_digest,
      'aliases_are_location_valid',true
    )
  from tmp_issue97_name_changes n
  join public.brinesearch_road_junctions j on j.build_id=v_build
    and j.stable_junction_key='junction:name-change:'||v_state||':'||n.identity_id::text||':'||n.lng::text||':'||n.lat::text
  join public.brinesearch_authoritative_road_identities i on i.id=n.identity_id
  left join lateral (
    select m.road_id from public.brinesearch_road_identity_mappings m
    where m.identity_id=n.identity_id and m.mapping_status='verified'
    order by m.updated_at desc,m.id limit 1
  ) map on true;

  -- A junction digest is local to the physical occurrence. Unrelated source
  -- edits elsewhere in the county must not churn every published anchor, but
  -- a membership/name/measure/provenance change at this junction must.
  with membership_digests as (
    select m.junction_id,pg_catalog.md5(coalesce(pg_catalog.string_agg(
      m.identity_id::text||':'||coalesce(m.road_id::text,'')||':'||
      m.source_segment_keys::text||':'||m.road_name_at_junction||':'||
      m.aliases_at_junction::text||':'||m.membership_role||':'||
      coalesce(m.source_measure::text,'')||':'||coalesce(m.distance_along_road_m::text,'')||':'||
      m.approach_data::text||':'||m.provenance::text,
      ',' order by m.identity_id,m.membership_role,m.id
    ),'')) as membership_digest
    from public.brinesearch_road_junction_memberships m
    join public.brinesearch_road_junctions j on j.id=m.junction_id
    where j.build_id=v_build group by m.junction_id
  )
  update public.brinesearch_road_junctions j set
    graph_digest=pg_catalog.md5(
      j.stable_junction_key||':'||j.junction_type||':'||j.source_method||':'||
      j.verification_status||':'||j.confidence||':'||j.source_provenance::text||':'||
      coalesce(m.membership_digest,'')
    ),updated_at=now()
  from membership_digests m where j.id=m.junction_id and j.build_id=v_build;

  select count(*) filter(where junction_type<>'shared_segment'),
    count(*) filter(where junction_type='shared_segment'),
    count(*) filter(where verification_status='held')
  into v_point_count,v_shared_count,v_held_count
  from public.brinesearch_road_junctions where build_id=v_build;
  select count(*) into v_membership_count
  from public.brinesearch_road_junction_memberships m
  join public.brinesearch_road_junctions j on j.id=m.junction_id where j.build_id=v_build;
  if exists(
    select 1 from public.brinesearch_road_junctions j
    left join public.brinesearch_road_junction_memberships m on m.junction_id=j.id
    where j.build_id=v_build group by j.id,j.junction_type
    having count(m.id)<case when j.junction_type='name_change' then 1 else 2 end
  ) then raise exception 'Issue #97 graph validation found a junction with fewer than two memberships'; end if;
  if exists(
    select 1 from public.brinesearch_road_junction_memberships m
    join public.brinesearch_road_junctions j on j.id=m.junction_id
    join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
    where j.build_id=v_build and (
      i.drivable_status not in ('drivable','non_drivable')
      or i.public_access_status not in ('public','private','access')
    )
  ) then raise exception 'Issue #97 graph validation admitted a held/non-drivable identity'; end if;
  if exists(
    select 1 from public.brinesearch_road_junctions p
    where p.build_id=v_build and p.junction_type not in ('shared_segment','name_change')
      and exists(select 1 from public.brinesearch_road_junctions s
        where s.build_id=v_build and s.junction_type='shared_segment'
          and extensions.st_dwithin(p.geom::extensions.geography,s.geom::extensions.geography,0.05)
          and not exists(select 1 from public.brinesearch_road_junction_memberships pm
            where pm.junction_id=p.id and not exists(
              select 1 from public.brinesearch_road_junction_memberships sm
              where sm.junction_id=s.id and sm.identity_id=pm.identity_id)))
  ) then raise exception 'Issue #97 graph validation found a duplicate point inside a shared occurrence'; end if;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    j.stable_junction_key||':'||j.graph_digest,',' order by j.stable_junction_key
  ),'')) into v_graph_digest
  from public.brinesearch_road_junctions j where j.build_id=v_build;
  update public.brinesearch_road_graph_builds set
    status='validated',point_junction_count=v_point_count,shared_segment_count=v_shared_count,
    membership_count=v_membership_count,graph_digest=v_graph_digest,
    completed_at=now(),details=details||pg_catalog.jsonb_build_object(
      'held_junction_count',v_held_count,'historical_rows_retained',true,
      'activation_required',true,'activation_status','awaiting_review'
    )
  where id=v_build;
  return pg_catalog.jsonb_build_object(
    'build_id',v_build,'status','validated','active',false,
    'state_code',v_state,'county_code',v_county,
    'source_segment_count',v_segment_count,'identity_count',v_identity_count,
    'point_junction_count',v_point_count,'shared_segment_count',v_shared_count,
    'held_junction_count',v_held_count,'membership_count',v_membership_count,
    'graph_digest',v_graph_digest,'algorithm_version','issue97-authoritative-topology-v2'
  );
end
$$;

revoke all on function public.brinesearch_issue97_rebuild_county_graph(text,text)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_rebuild_county_graph(text,text)
to service_role;

comment on function public.brinesearch_issue97_rebuild_county_graph(text,text) is
  'Issue #97 service-only immutable v2 graph rebuild. It produces a validated generation only; a separate impact-aware activation is mandatory.';

create or replace function public.brinesearch_issue97_activate_graph_build(
  p_build_id uuid,
  p_approved_impact_digest text default null,
  p_review_details jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_build record;
  v_old_build uuid;
  v_impacts jsonb:='[]'::jsonb;
  v_stale_sources jsonb:='[]'::jsonb;
  v_impact_count integer:=0;
  v_impact_digest text;
  v_source_entry jsonb;
  v_latest_run uuid;
  v_recomputed_graph_digest text;
  v_recomputed_point_count integer;
  v_recomputed_shared_count integer;
  v_recomputed_membership_count integer;
begin
  select b.* into v_build from public.brinesearch_road_graph_builds b
  where b.id=p_build_id for update;
  if not found then raise exception 'Validated graph build not found' using errcode='P0002'; end if;
  if v_build.status<>'validated' then
    raise exception 'Only a validated graph build can be activated' using errcode='55000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:graph:'||v_build.state_code||':'||v_build.county_code)
  );
  select b.id into v_old_build from public.brinesearch_road_graph_builds b
  where b.state_code=v_build.state_code and b.county_code=v_build.county_code
    and b.status='active' order by b.activated_at desc,b.id limit 1 for update;

  for v_source_entry in
    select value from pg_catalog.jsonb_array_elements(
      coalesce(v_build.details->'source_run_vector','[]'::jsonb)
    )
  loop
    select r.id into v_latest_run
    from public.brinesearch_road_source_ingest_runs r
    where r.dataset_id=(v_source_entry->>'dataset_id')::uuid
      and r.state_code=v_source_entry->>'state_code'
      and r.county_code=v_source_entry->>'county_code'
    order by r.started_at desc,r.id desc limit 1;
    if v_latest_run is distinct from (v_source_entry->>'run_id')::uuid
       or not private_verification.brinesearch_issue97_ingest_run_verified(v_latest_run) then
      v_stale_sources:=v_stale_sources||pg_catalog.jsonb_build_array(
        v_source_entry||pg_catalog.jsonb_build_object('latest_run_id',v_latest_run)
      );
    end if;
  end loop;
  if pg_catalog.jsonb_array_length(v_stale_sources)>0 then
    update public.brinesearch_road_graph_builds set details=details||pg_catalog.jsonb_build_object(
      'activation_status','blocked_stale_source_vector','stale_source_scopes',v_stale_sources
    ) where id=p_build_id;
    return pg_catalog.jsonb_build_object(
      'build_id',p_build_id,'activated',false,'reason','source_vector_is_no_longer_current',
      'stale_source_scopes',v_stale_sources
    );
  end if;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      j.stable_junction_key||':'||j.graph_digest,',' order by j.stable_junction_key
    ),'')),count(*) filter(where j.junction_type<>'shared_segment')::integer,
    count(*) filter(where j.junction_type='shared_segment')::integer
  into v_recomputed_graph_digest,v_recomputed_point_count,v_recomputed_shared_count
  from public.brinesearch_road_junctions j where j.build_id=p_build_id;
  select count(*)::integer into v_recomputed_membership_count
  from public.brinesearch_road_junction_memberships m
  join public.brinesearch_road_junctions j on j.id=m.junction_id
  where j.build_id=p_build_id;
  if v_recomputed_graph_digest is distinct from v_build.graph_digest
     or v_recomputed_point_count is distinct from v_build.point_junction_count
     or v_recomputed_shared_count is distinct from v_build.shared_segment_count
     or v_recomputed_membership_count is distinct from v_build.membership_count then
    raise exception 'Validated graph build contents changed before activation' using errcode='55000';
  end if;

  perform j.id from public.brinesearch_road_junctions j
  where j.build_id=p_build_id order by j.id for share;
  perform a.id from public.brinesearch_road_junction_anchors a
  join public.brinesearch_road_junctions j on j.id=a.junction_id
  where j.build_id=p_build_id order by a.id for share of a,j;
  perform m.id from public.brinesearch_road_junction_memberships m
  join public.brinesearch_road_junctions j on j.id=m.junction_id
  where j.build_id=p_build_id order by m.id for share of m,j;

  with referenced as (
      select distinct pr.entry_junction_anchor_id as old_anchor_id,'published_route'::text as reference_kind,
        pr.pad_id::text as reference_id
      from public.brinesearch_pad_roads pr
      where pr.junction_build_id in (
          select b.id from public.brinesearch_road_graph_builds b
          where b.state_code=v_build.state_code and b.county_code=v_build.county_code
        ) and pr.entry_junction_anchor_id is not null
      union
      select distinct rs.entry_junction_anchor_id,'route_review',rs.review_id::text
      from public.brinesearch_route_review_segments rs
      where rs.junction_build_id in (
          select b.id from public.brinesearch_road_graph_builds b
          where b.state_code=v_build.state_code and b.county_code=v_build.county_code
        ) and rs.entry_junction_anchor_id is not null
    ), compared as (
      select r.reference_kind,r.reference_id,oa.id as old_anchor_id,
        oj.stable_junction_key,oa.anchor_role,oa.anchor_digest as old_anchor_digest,
        oj.graph_digest as old_junction_digest,na.id as new_anchor_id,
        na.anchor_digest as new_anchor_digest,nj.graph_digest as new_junction_digest,
        case when nj.id is null then 'junction_missing'
          when na.id is null then 'anchor_missing'
          when na.anchor_digest<>oa.anchor_digest then 'anchor_changed'
          when nj.graph_digest<>oj.graph_digest then 'junction_digest_changed'
          else null end as impact_reason
      from referenced r
      join public.brinesearch_road_junction_anchors oa on oa.id=r.old_anchor_id
      join public.brinesearch_road_junctions oj on oj.id=oa.junction_id
      left join public.brinesearch_road_junctions nj
        on nj.build_id=p_build_id and nj.stable_junction_key=oj.stable_junction_key
      left join public.brinesearch_road_junction_anchors na
        on na.junction_id=nj.id and na.anchor_role=oa.anchor_role
    )
    select count(*)::integer,coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'reference_kind',reference_kind,'reference_id',reference_id,
      'old_anchor_id',old_anchor_id,'new_anchor_id',new_anchor_id,
      'stable_junction_key',stable_junction_key,'anchor_role',anchor_role,
      'reason',impact_reason,'old_anchor_digest',old_anchor_digest,
      'new_anchor_digest',new_anchor_digest,'old_junction_digest',old_junction_digest,
      'new_junction_digest',new_junction_digest
    ) order by reference_kind,reference_id,stable_junction_key,anchor_role),'[]'::jsonb)
  into v_impact_count,v_impacts from compared where impact_reason is not null;
  v_impact_digest:=pg_catalog.md5(v_impacts::text);

  if v_impact_count>0 and (
    p_approved_impact_digest is distinct from v_impact_digest
    or p_review_details is null or pg_catalog.jsonb_typeof(p_review_details)<>'object'
    or nullif(p_review_details->>'reviewed_by','') is null
    or nullif(p_review_details->>'reviewed_at','') is null
    or nullif(p_review_details->>'evidence','') is null
  ) then
    update public.brinesearch_road_graph_builds set details=details||pg_catalog.jsonb_build_object(
      'activation_status','blocked_referenced_route_impacts',
      'activation_impact_count',v_impact_count,'activation_impact_digest',v_impact_digest,
      'activation_impacts',v_impacts
    ) where id=p_build_id;
    return pg_catalog.jsonb_build_object(
      'build_id',p_build_id,'activated',false,'reason','referenced_route_impacts_require_review',
      'impact_count',v_impact_count,'impact_digest',v_impact_digest,'impacts',v_impacts
    );
  end if;

  update public.brinesearch_road_graph_builds set status='retired'
  where id=v_old_build and v_old_build is not null;
  update public.brinesearch_road_graph_builds set
    status='active',activated_at=now(),details=details||pg_catalog.jsonb_build_object(
      'activation_status','active','prior_build_id',v_old_build,
      'activation_impact_count',v_impact_count,'activation_impact_digest',v_impact_digest,
      'activation_review',coalesce(p_review_details,'{}'::jsonb)
    ) where id=p_build_id;
  return pg_catalog.jsonb_build_object(
    'build_id',p_build_id,'activated',true,'prior_build_id',v_old_build,
    'impact_count',v_impact_count,'impact_digest',v_impact_digest
  );
end
$$;

revoke all on function public.brinesearch_issue97_activate_graph_build(uuid,text,jsonb)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_activate_graph_build(uuid,text,jsonb)
to service_role;

comment on function public.brinesearch_issue97_activate_graph_build(uuid,text,jsonb) is
  'Issue #97 atomic graph activation. Published-route anchor drift is enumerated and requires an exact reviewed impact digest before activation.';

-- Bounded editor reads. These functions expose curated identity and junction
-- summaries; raw statewide source geometries remain service-role only.
create or replace function public.brinesearch_authoritative_road_registry()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_sources jsonb; v_counties jsonb;
begin
  if auth.uid() is null or not public.is_brinesearch_editor(auth.uid()) then
    raise exception 'Road Manager editor access is required' using errcode='42501';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'source_key',d.source_key,'state_code',d.state_code,'source_agency',d.source_agency,
    'source_dataset',d.source_dataset,'source_layer',d.source_layer,
    'source_version',d.source_version,'source_url',d.source_url,
    'authority_rank',d.authority_rank,'topology_role',d.topology_role,
    'source_timestamp',d.source_timestamp,'fetched_at',d.fetched_at,
    'content_digest',d.content_digest,'provenance',d.provenance
  ) order by d.state_code,d.authority_rank desc,d.source_key),'[]'::jsonb)
  into v_sources from public.brinesearch_road_source_datasets d where d.active;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'state_code',c.state_code,'county_code',c.county_code,'county_name',c.county_name,
    'county_geoid',c.county_geoid,'source_county_code',c.source_county_code,
    'source_county_code_kind',c.source_county_code_kind,
    'active_build_id',b.id,'active_graph_digest',b.graph_digest,
    'active_graph_algorithm',b.algorithm_version,'graph_activated_at',b.activated_at,
    'point_junction_count',coalesce(b.point_junction_count,0),
    'shared_segment_count',coalesce(b.shared_segment_count,0)
  ) order by c.state_code,c.county_name,c.county_code),'[]'::jsonb)
  into v_counties
  from public.brinesearch_road_graph_counties c
  left join public.brinesearch_road_graph_builds b on b.state_code=c.state_code
    and b.county_code=c.county_code and b.status='active'
    and private_verification.brinesearch_issue97_graph_build_sources_current(b.id)
  where c.active;
  return pg_catalog.jsonb_build_object(
    'states',pg_catalog.jsonb_build_array('OH','WV','PA'),
    'county_count',pg_catalog.jsonb_array_length(v_counties),
    'dataset_count',pg_catalog.jsonb_array_length(v_sources),
    'counties',v_counties,'sources',v_sources,
    'topology_contract','authoritative source node/vertex/overlap only; no name, nearest-road or crossing guesses'
  );
end
$$;

revoke all on function public.brinesearch_authoritative_road_registry() from public,anon;
grant execute on function public.brinesearch_authoritative_road_registry() to authenticated;

create or replace function public.brinesearch_authoritative_road_search(
  p_query text default null,
  p_state_code text default null,
  p_county_code text default null,
  p_road_class text default null,
  p_access_status text default null,
  p_mapping_status text default null,
  p_cursor jsonb default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_query text:=pg_catalog.regexp_replace(
    pg_catalog.lower(pg_catalog.btrim(coalesce(p_query,''))),'[^a-z0-9]+',' ','g'
  );
  v_state text:=nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(p_state_code,''))),'');
  v_county text:=nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(p_county_code,''))),'');
  v_class text:=nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_road_class,''))),'');
  v_access text:=nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_access_status,''))),'');
  v_mapping text:=nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_mapping_status,''))),'');
  v_after_name text:=coalesce(p_cursor->>'normalized_name','');
  v_after_id uuid;
  v_limit integer:=greatest(1,least(coalesce(p_limit,50),100));
  v_rows jsonb:='[]'::jsonb;
  v_next jsonb:=null;
  v_has_more boolean:=false;
begin
  if auth.uid() is null or not public.is_brinesearch_editor(auth.uid()) then
    raise exception 'Road Manager editor access is required' using errcode='42501';
  end if;
  if v_state is not null and v_state not in ('OH','WV','PA') then
    raise exception 'State must be OH, WV or PA' using errcode='22023';
  end if;
  if v_county is not null and v_state is null then
    raise exception 'County filter requires an explicit state' using errcode='22023';
  end if;
  if v_county is not null and not exists(
    select 1 from public.brinesearch_road_graph_counties c
    where c.state_code=v_state and c.county_code=v_county and c.active
  ) then
    raise exception 'County is outside the active issue #97 graph footprint' using errcode='22023';
  end if;
  if v_query<>'' and pg_catalog.length(v_query)<2 then
    raise exception 'Official-road search requires at least two characters' using errcode='22023';
  end if;
  if pg_catalog.length(v_query)=2 and v_county is null then
    raise exception 'Two-character official-road search requires a county filter' using errcode='22023';
  end if;
  if v_access is not null and v_access not in ('public','private','access','unknown','held') then
    raise exception 'Invalid access filter' using errcode='22023';
  end if;
  if v_mapping is not null and v_mapping not in ('canonical','candidate','source_only') then
    raise exception 'Invalid mapping filter' using errcode='22023';
  end if;
  if p_cursor is not null then
    if pg_catalog.jsonb_typeof(p_cursor)<>'object'
       or nullif(p_cursor->>'normalized_name','') is null
       or nullif(p_cursor->>'id','') is null then
      raise exception 'Invalid official-road search cursor' using errcode='22023';
    end if;
    begin v_after_id:=(p_cursor->>'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Invalid official-road search cursor' using errcode='22023';
    end;
  end if;

  with candidates as (
    select i.*,
      map.road_id,map.mapping_status as exact_mapping_status,map.mapping_method,
      map.evidence as mapping_evidence,map.canonical_road_type,
      case when map.mapping_status='verified' then 'canonical'
        when map.mapping_status='candidate' then 'candidate' else 'source_only' end as identity_kind
    from public.brinesearch_authoritative_road_identities i
    left join lateral (
      select m.road_id,m.mapping_status,m.mapping_method,m.evidence,r.road_type as canonical_road_type
      from public.brinesearch_road_identity_mappings m
      join public.brinesearch_roads r on r.id=m.road_id
      where m.identity_id=i.id and m.mapping_status in ('verified','candidate')
      order by case m.mapping_status when 'verified' then 0 else 1 end,m.updated_at desc,m.id
      limit 1
    ) map on true
    where i.active
      and private_verification.brinesearch_issue97_dataset_scope_current(
        i.dataset_id,i.state_code,i.county_code
      )
      and (v_state is null or i.state_code=v_state)
      and (v_county is null or i.county_code=v_county)
      and (v_class is null or i.road_class=v_class)
      and (v_access is null or i.public_access_status=v_access)
      and (v_mapping is null or case when map.mapping_status='verified' then 'canonical'
        when map.mapping_status='candidate' then 'candidate' else 'source_only' end=v_mapping)
      and (v_query='' or i.normalized_name like '%'||v_query||'%'
        or exists(select 1 from public.brinesearch_authoritative_road_names q
          where q.identity_id=i.id and q.active
            and private_verification.brinesearch_issue97_dataset_scope_current(
              q.source_dataset_id,i.state_code,i.county_code
            )
            and (q.valid_from is null or q.valid_from<=now())
            and (q.valid_to is null or q.valid_to>now())
            and q.normalized_name like '%'||v_query||'%')
        or pg_catalog.lower(coalesce(i.route_system,'')||' '||coalesce(i.route_number,''))
          like '%'||v_query||'%')
      and (v_after_id is null or (i.normalized_name,i.id)>(v_after_name,v_after_id))
    order by i.normalized_name,i.id
    limit v_limit+1
  ), page as (
    select * from candidates order by normalized_name,id limit v_limit
  ), enriched as (
    select p.*,d.source_key,d.source_agency,d.source_dataset,d.source_layer,d.source_version,
      d.source_url,d.fetched_at as dataset_fetched_at,
      d.source_timestamp as dataset_source_timestamp,coalesce(names.names,'[]'::jsonb) as names
    from page p
    join public.brinesearch_road_source_datasets d on d.id=p.dataset_id and d.active
    left join lateral (
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'name',x.road_name,'type',x.name_type,'source_record_id',x.source_record_id,
        'from_measure',x.from_measure,'to_measure',x.to_measure,'provenance',x.provenance
      ) order by x.name_type,x.road_name,x.source_record_id) as names
      from (
        select distinct on(n.name_type,n.road_name,n.from_measure,n.to_measure)
          n.name_type,n.road_name,n.source_record_id,n.from_measure,n.to_measure,n.provenance
        from public.brinesearch_authoritative_road_names n
        where n.identity_id=p.id and n.active
          and private_verification.brinesearch_issue97_dataset_scope_current(
            n.source_dataset_id,p.state_code,p.county_code
          )
          and (n.valid_from is null or n.valid_from<=now())
          and (n.valid_to is null or n.valid_to>now())
        order by n.name_type,n.road_name,n.from_measure,n.to_measure,n.source_record_id
        limit 12
      ) x
    ) names on true
  )
  select
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'identity_id',p.id,'identity_kind',p.identity_kind,'canonical_road_id',p.road_id,
      'mapping_status',coalesce(p.exact_mapping_status,'unmapped'),'mapping_method',p.mapping_method,
      'mapping_evidence',coalesce(p.mapping_evidence,'{}'::jsonb),
      'source_identity_key',p.source_identity_key,'state_code',p.state_code,
      'county_code',p.county_code,'county_name',p.county_name,'township',p.township,
      'municipality',p.municipality,'display_name',p.display_name,'names',p.names,
      'route_system',p.route_system,'route_number',p.route_number,'route_suffix',p.route_suffix,
      'route_fraction',p.route_fraction,'route_extension',p.route_extension,
      'road_class',p.road_class,'public_access_status',p.public_access_status,
      'drivable_status',p.drivable_status,'maintainer',p.maintainer,'surface',p.surface,
      'truck_status',p.truck_status,
      'source_record_ids',to_jsonb(p.source_record_ids[1:25]),
      'source_record_count',coalesce(pg_catalog.cardinality(p.source_record_ids),0),
      'source_records_truncated',coalesce(pg_catalog.cardinality(p.source_record_ids),0)>25,
      'source_digest',p.source_digest,'source_timestamp',p.source_timestamp,
      'source',pg_catalog.jsonb_build_object(
        'source_key',p.source_key,'agency',p.source_agency,'dataset',p.source_dataset,
        'layer',p.source_layer,'version',p.source_version,'url',p.source_url,
        'fetched_at',p.dataset_fetched_at,'source_timestamp',p.dataset_source_timestamp
      ),'route_selectable',p.identity_kind='canonical'
        and private_verification.brinesearch_issue97_identity_route_usable(
          p.public_access_status,p.drivable_status,p.canonical_road_type
        )
    ) order by p.normalized_name,p.id),'[]'::jsonb),
    exists(select 1 from candidates offset v_limit),
    (select pg_catalog.jsonb_build_object('normalized_name',q.normalized_name,'id',q.id)
     from page q order by q.normalized_name desc,q.id desc limit 1)
  into v_rows,v_has_more,v_next
  from enriched p;
  if not v_has_more then v_next:=null; end if;
  return pg_catalog.jsonb_build_object(
    'results',v_rows,'has_more',v_has_more,'next_cursor',v_next,'limit',v_limit,
    'filters',pg_catalog.jsonb_build_object(
      'query',nullif(v_query,''),'state_code',v_state,'county_code',v_county,
      'road_class',v_class,'access_status',v_access,'mapping_status',v_mapping
    )
  );
end
$$;

revoke all on function public.brinesearch_authoritative_road_search(text,text,text,text,text,text,jsonb,integer)
from public,anon;
grant execute on function public.brinesearch_authoritative_road_search(text,text,text,text,text,text,jsonb,integer)
to authenticated;

create or replace function public.brinesearch_authoritative_road_detail(p_identity_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_brinesearch_editor(auth.uid()) then
    raise exception 'Road Manager editor access is required' using errcode='42501';
  end if;
  select pg_catalog.jsonb_build_object(
    'identity_id',i.id,'source_identity_key',i.source_identity_key,
    'state_code',i.state_code,'county_code',i.county_code,'county_name',i.county_name,
    'township',i.township,'municipality',i.municipality,'display_name',i.display_name,
    'route_system',i.route_system,'route_number',i.route_number,'route_suffix',i.route_suffix,
    'route_fraction',i.route_fraction,'route_extension',i.route_extension,
    'road_class',i.road_class,'public_access_status',i.public_access_status,
    'drivable_status',i.drivable_status,'maintainer',i.maintainer,'surface',i.surface,
    'truck_status',i.truck_status,'source_digest',i.source_digest,
    'source_timestamp',i.source_timestamp,
    'attributes',pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'nlf_id',i.attributes->'nlf_id','component_seed',i.attributes->'component_seed',
      'component_ctl_begin',i.attributes->'component_ctl_begin',
      'component_ctl_end',i.attributes->'component_ctl_end',
      'segment_count',i.attributes->'segment_count',
      'geometry_segment_count',i.attributes->'geometry_segment_count',
      'township_codes',i.attributes->'township_codes',
      'municipality_codes',i.attributes->'municipality_codes',
      'jurisdiction_code',i.attributes->'jurisdiction_code',
      'held_reason',i.attributes->'held_reason',
      'active_segment_count',i.attributes->'active_segment_count',
      'identity_digest_method',i.attributes->'identity_digest_method'
    )),
    'source',pg_catalog.jsonb_build_object(
      'source_key',d.source_key,'agency',d.source_agency,'dataset',d.source_dataset,
      'layer',d.source_layer,'version',d.source_version,'url',d.source_url,
      'fetched_at',d.fetched_at,'source_timestamp',d.source_timestamp,'provenance',d.provenance
    ),
    'names',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name',n.road_name,'type',n.name_type,'source_record_id',n.source_record_id,
      'source_segment_key',n.source_segment_key,'from_measure',n.from_measure,
      'to_measure',n.to_measure,'valid_from',n.valid_from,'valid_to',n.valid_to,
      'provenance',n.provenance
    ) order by n.from_measure nulls first,n.to_measure nulls last,n.name_type,n.road_name,n.id)
      from (select x.* from public.brinesearch_authoritative_road_names x
        where x.identity_id=i.id and x.active
          and private_verification.brinesearch_issue97_dataset_scope_current(
            x.source_dataset_id,i.state_code,i.county_code
          )
          and (x.valid_from is null or x.valid_from<=now())
          and (x.valid_to is null or x.valid_to>now())
        order by x.from_measure nulls first,x.to_measure nulls last,x.name_type,x.road_name,x.id
        limit 250) n),'[]'::jsonb),
    'name_event_count',(select count(*) from public.brinesearch_authoritative_road_names n
      where n.identity_id=i.id and n.active
        and private_verification.brinesearch_issue97_dataset_scope_current(
          n.source_dataset_id,i.state_code,i.county_code
        )
        and (n.valid_from is null or n.valid_from<=now())
        and (n.valid_to is null or n.valid_to>now())),
    'name_events_truncated',(select count(*)>250 from public.brinesearch_authoritative_road_names n
      where n.identity_id=i.id and n.active
        and private_verification.brinesearch_issue97_dataset_scope_current(
          n.source_dataset_id,i.state_code,i.county_code
        )
        and (n.valid_from is null or n.valid_from<=now())
        and (n.valid_to is null or n.valid_to>now())),
    'canonical_mappings',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'road_id',m.road_id,'canonical_name',r.canonical_name,'status',m.mapping_status,
      'method',m.mapping_method,'evidence',m.evidence,'verified_at',m.verified_at
    ) order by case m.mapping_status when 'verified' then 0 else 1 end,r.canonical_name)
      from public.brinesearch_road_identity_mappings m
      join public.brinesearch_roads r on r.id=m.road_id where m.identity_id=i.id),'[]'::jsonb),
    'segment_summary',coalesce((select pg_catalog.jsonb_build_object(
      'count',count(*),'from_measure',min(s.from_measure),'to_measure',max(s.to_measure),
      'geometry_available',pg_catalog.bool_or(s.geom is not null),
      'source_record_ids',coalesce((select pg_catalog.jsonb_agg(ids.source_record_id order by ids.source_record_id)
        from (select distinct sx.source_record_id
          from public.brinesearch_authoritative_road_segments sx
          where sx.identity_id=i.id and sx.active
          order by sx.source_record_id limit 100) ids),'[]'::jsonb),
      'source_record_count',count(distinct s.source_record_id),
      'source_records_truncated',count(distinct s.source_record_id)>100
    ) from public.brinesearch_authoritative_road_segments s where s.identity_id=i.id and s.active),
      pg_catalog.jsonb_build_object('count',0,'geometry_available',false))
  ) into v_result
  from public.brinesearch_authoritative_road_identities i
  join public.brinesearch_road_source_datasets d on d.id=i.dataset_id
  where i.id=p_identity_id and i.active
    and private_verification.brinesearch_issue97_dataset_scope_current(
      i.dataset_id,i.state_code,i.county_code
    );
  if v_result is null then raise exception 'Authoritative road identity not found' using errcode='P0002'; end if;
  return v_result;
end
$$;

revoke all on function public.brinesearch_authoritative_road_detail(uuid) from public,anon;
grant execute on function public.brinesearch_authoritative_road_detail(uuid) to authenticated;

create or replace function public.brinesearch_authoritative_road_connections(
  p_identity_id uuid,
  p_cursor jsonb default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_after_distance numeric;
  v_after_key text:=coalesce(p_cursor->>'junction_key','');
  v_limit integer:=greatest(1,least(coalesce(p_limit,50),100));
  v_rows jsonb:='[]'::jsonb;
  v_next jsonb:=null;
  v_has_more boolean:=false;
  v_order_status text;
begin
  if auth.uid() is null or not public.is_brinesearch_editor(auth.uid()) then
    raise exception 'Road Manager editor access is required' using errcode='42501';
  end if;
  if not exists(select 1 from public.brinesearch_authoritative_road_identities i where i.id=p_identity_id and i.active) then
    raise exception 'Authoritative road identity not found' using errcode='P0002';
  end if;
  if p_cursor is not null then
    if pg_catalog.jsonb_typeof(p_cursor)<>'object' or nullif(p_cursor->>'junction_key','') is null then
      raise exception 'Invalid connection cursor' using errcode='22023';
    end if;
    begin v_after_distance:=nullif(p_cursor->>'distance_along_road_m','')::numeric;
    exception when invalid_text_representation then
      raise exception 'Invalid connection cursor' using errcode='22023';
    end;
  end if;

  select case when count(*)=0 then 'none'
    when count(*) filter(where m.distance_along_road_m is null)>0 then 'ambiguous'
    else 'authoritative_measure' end
  into v_order_status
  from public.brinesearch_road_junction_memberships m
  join public.brinesearch_road_junctions j on j.id=m.junction_id
    and j.verification_status in ('verified','held')
  join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
    and private_verification.brinesearch_issue97_graph_build_sources_current(b.id)
  where m.identity_id=p_identity_id;

  with scoped as (
    select j.*,b.algorithm_version,b.source_revision_digest,b.activated_at,
      own.distance_along_road_m,own.source_measure,own.membership_role as own_role
    from public.brinesearch_road_junction_memberships own
    join public.brinesearch_road_junctions j on j.id=own.junction_id
      and j.verification_status in ('verified','held')
    join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
      and private_verification.brinesearch_issue97_graph_build_sources_current(b.id)
    where own.identity_id=p_identity_id
      and (p_cursor is null or (
        (coalesce(own.distance_along_road_m,1e30::numeric),j.stable_junction_key)>
        (coalesce(v_after_distance,1e30::numeric),v_after_key)
      ))
    order by own.distance_along_road_m nulls last,j.stable_junction_key
    limit v_limit+1
  ), page as (
    select * from scoped order by distance_along_road_m nulls last,stable_junction_key limit v_limit
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'junction_id',p.id,'junction_key',p.stable_junction_key,'display_id',p.display_id,
    'junction_type',p.junction_type,'state_code',p.state_code,'county_code',p.county_code,
    'county_name',p.county_name,'township',p.township,'municipality',p.municipality,
    'distance_along_road_m',p.distance_along_road_m,'source_measure',p.source_measure,
    'membership_role',p.own_role,'source_method',p.source_method,
    'confidence',p.confidence,'verification_status',p.verification_status,
    'junction_digest',p.graph_digest,'source_provenance',p.source_provenance,
    'shared_geometry',case when p.junction_type='shared_segment'
      then extensions.st_asgeojson(p.geom,15)::jsonb else null end,
    'build',pg_catalog.jsonb_build_object(
      'build_id',p.build_id,'algorithm_version',p.algorithm_version,
      'source_revision_digest',p.source_revision_digest,'activated_at',p.activated_at
    ),
    'anchors',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'anchor_id',a.id,'anchor_key',a.anchor_key,'anchor_role',a.anchor_role,
      'coordinate',pg_catalog.jsonb_build_array(extensions.st_x(a.geom),extensions.st_y(a.geom)),
      'anchor_digest',a.anchor_digest
    ) order by a.anchor_role,a.id) from public.brinesearch_road_junction_anchors a
      where a.junction_id=p.id),'[]'::jsonb),
    'memberships',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
	      'membership_id',m.id,'identity_id',m.identity_id,'source_identity_key',i.source_identity_key,
	      'display_name',m.road_name_at_junction,'aliases',to_jsonb(m.aliases_at_junction),
	      'route_system',i.route_system,'route_number',i.route_number,
	      'route_suffix',i.route_suffix,'route_fraction',i.route_fraction,
	      'route_extension',i.route_extension,
	      'road_class',i.road_class,'public_access_status',i.public_access_status,
	      'drivable_status',i.drivable_status,'canonical_road_id',map.road_id,
      'identity_kind',case when map.mapping_status='verified' then 'canonical'
        when map.mapping_status='candidate' then 'candidate' else 'source_only' end,
	      'mapping_status',coalesce(map.mapping_status,'unmapped'),'membership_role',m.membership_role,
	      'source_measure',m.source_measure,'distance_along_road_m',m.distance_along_road_m,
	      'source_segment_keys',to_jsonb(m.source_segment_keys),'provenance',m.provenance,
	      'source_digest',i.source_digest,'identity_source_timestamp',i.source_timestamp,
	      'source',pg_catalog.jsonb_build_object(
	        'source_key',d.source_key,'agency',d.source_agency,'dataset',d.source_dataset,
	        'layer',d.source_layer,'version',d.source_version,'url',d.source_url,
	        'fetched_at',d.fetched_at,'source_timestamp',d.source_timestamp,
	        'provenance',d.provenance
	      )
	    ) order by m.road_name_at_junction,m.identity_id)
	      from public.brinesearch_road_junction_memberships m
	      join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id and i.active
	      join public.brinesearch_road_source_datasets d on d.id=i.dataset_id
      left join lateral (select x.road_id,x.mapping_status from public.brinesearch_road_identity_mappings x
        where x.identity_id=i.id and x.mapping_status in ('verified','candidate')
        order by case x.mapping_status when 'verified' then 0 else 1 end limit 1) map on true
      where m.junction_id=p.id),'[]'::jsonb)
  ) order by p.distance_along_road_m nulls last,p.stable_junction_key),'[]'::jsonb),
  exists(select 1 from scoped offset v_limit),
  (select pg_catalog.jsonb_build_object(
    'distance_along_road_m',q.distance_along_road_m,'junction_key',q.stable_junction_key
  ) from page q order by q.distance_along_road_m desc nulls first,q.stable_junction_key desc limit 1)
  into v_rows,v_has_more,v_next
  from page p;
  if not v_has_more then v_next:=null; end if;
  return pg_catalog.jsonb_build_object(
    'identity_id',p_identity_id,'order_status',v_order_status,
    'connections',v_rows,'has_more',v_has_more,'next_cursor',v_next,'limit',v_limit
  );
end
$$;

revoke all on function public.brinesearch_authoritative_road_connections(uuid,jsonb,integer)
from public,anon;
grant execute on function public.brinesearch_authoritative_road_connections(uuid,jsonb,integer)
to authenticated;

create or replace function public.brinesearch_authoritative_road_connection_pair(
  p_left_identity_id uuid,
  p_right_identity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_rows jsonb;
begin
  if auth.uid() is null or not public.is_brinesearch_editor(auth.uid()) then
    raise exception 'Road Manager editor access is required' using errcode='42501';
  end if;
  if p_left_identity_id is null or p_right_identity_id is null
     or p_left_identity_id=p_right_identity_id then
    raise exception 'Two different authoritative identities are required' using errcode='22023';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'junction_id',j.id,'junction_key',j.stable_junction_key,'junction_type',j.junction_type,
    'display_id',j.display_id,'state_code',j.state_code,'county_code',j.county_code,
    'county_name',j.county_name,'source_method',j.source_method,
    'source_provenance',j.source_provenance,'junction_digest',j.graph_digest,
    'build_id',j.build_id,'anchors',coalesce((select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'anchor_id',a.id,'anchor_key',a.anchor_key,'anchor_role',a.anchor_role,
        'coordinate',pg_catalog.jsonb_build_array(extensions.st_x(a.geom),extensions.st_y(a.geom)),
        'anchor_digest',a.anchor_digest
      ) order by a.anchor_role,a.id) from public.brinesearch_road_junction_anchors a
      where a.junction_id=j.id),'[]'::jsonb)
  ) order by j.state_code,j.county_code,j.stable_junction_key),'[]'::jsonb)
  into v_rows
  from public.brinesearch_road_junctions j
  join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
    and private_verification.brinesearch_issue97_graph_build_sources_current(b.id)
  where j.verification_status='verified'
    and exists(select 1 from public.brinesearch_road_junction_memberships l
      where l.junction_id=j.id and l.identity_id=p_left_identity_id)
    and exists(select 1 from public.brinesearch_road_junction_memberships r
      where r.junction_id=j.id and r.identity_id=p_right_identity_id);
  return pg_catalog.jsonb_build_object(
    'left_identity_id',p_left_identity_id,'right_identity_id',p_right_identity_id,
    'connection_count',pg_catalog.jsonb_array_length(v_rows),'connections',v_rows
  );
end
$$;

revoke all on function public.brinesearch_authoritative_road_connection_pair(uuid,uuid)
from public,anon;
grant execute on function public.brinesearch_authoritative_road_connection_pair(uuid,uuid)
to authenticated;

comment on function public.brinesearch_authoritative_road_search(text,text,text,text,text,text,jsonb,integer) is
  'Issue #97 bounded all-official-road search. Names are discovery-only; results retain source-scoped identity and mapping status.';
comment on function public.brinesearch_authoritative_road_connections(uuid,jsonb,integer) is
  'Issue #97 junction-centric connection detail with exact anchors, all memberships, aliases and provenance. Ambiguous ordering is explicit.';

create or replace function public.brinesearch_authoritative_identities_for_road(p_road_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_rows jsonb;
begin
  if auth.uid() is null or not public.is_brinesearch_editor(auth.uid()) then
    raise exception 'Road Manager editor access is required' using errcode='42501';
  end if;
  if not exists(select 1 from public.brinesearch_roads r where r.id=p_road_id) then
    raise exception 'Road Manager road not found' using errcode='P0002';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'identity_id',i.id,'source_identity_key',i.source_identity_key,
    'display_name',i.display_name,'state_code',i.state_code,'county_code',i.county_code,
    'county_name',i.county_name,'road_class',i.road_class,
    'public_access_status',i.public_access_status,'drivable_status',i.drivable_status,
    'mapping_status',m.mapping_status,'mapping_method',m.mapping_method,
    'mapping_evidence',m.evidence,'source_key',d.source_key,'source_agency',d.source_agency
  ) order by case m.mapping_status when 'verified' then 0 else 1 end,i.state_code,i.county_code,i.display_name,i.id),'[]'::jsonb)
  into v_rows
  from public.brinesearch_road_identity_mappings m
  join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id and i.active
  join public.brinesearch_road_source_datasets d on d.id=i.dataset_id and d.active
  where m.road_id=p_road_id and m.mapping_status in ('verified','candidate');
  return pg_catalog.jsonb_build_object('road_id',p_road_id,'identities',v_rows);
end
$$;

revoke all on function public.brinesearch_authoritative_identities_for_road(uuid) from public,anon;
grant execute on function public.brinesearch_authoritative_identities_for_road(uuid) to authenticated;

create or replace function public.brinesearch_authoritative_road_connections_for_canonical(
  p_road_id uuid,
  p_cursor jsonb default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_after_state text:=coalesce(p_cursor->>'state_code','');
  v_after_county text:=coalesce(p_cursor->>'county_code','');
  v_after_distance numeric;
  v_after_key text:=coalesce(p_cursor->>'junction_key','');
  v_limit integer:=greatest(1,least(coalesce(p_limit,50),100));
  v_rows jsonb:='[]'::jsonb;
  v_next jsonb:=null;
  v_has_more boolean:=false;
begin
  if auth.uid() is null or not public.is_brinesearch_editor(auth.uid()) then
    raise exception 'Road Manager editor access is required' using errcode='42501';
  end if;
  if not exists(select 1 from public.brinesearch_roads r where r.id=p_road_id) then
    raise exception 'Road Manager road not found' using errcode='P0002';
  end if;
  if p_cursor is not null then
    if pg_catalog.jsonb_typeof(p_cursor)<>'object'
       or nullif(p_cursor->>'state_code','') is null
       or nullif(p_cursor->>'county_code','') is null
       or nullif(p_cursor->>'junction_key','') is null then
      raise exception 'Invalid canonical connection cursor' using errcode='22023';
    end if;
    begin v_after_distance:=nullif(p_cursor->>'distance_along_road_m','')::numeric;
    exception when invalid_text_representation then
      raise exception 'Invalid canonical connection cursor' using errcode='22023';
    end;
  end if;

  with grouped as (
    select j.*,b.algorithm_version,b.source_revision_digest,b.activated_at,
      min(own.distance_along_road_m) as distance_along_road_m,
      min(own.source_measure) as source_measure,
      array_agg(distinct own.identity_id order by own.identity_id) as selected_identity_ids
    from public.brinesearch_road_identity_mappings map
    join public.brinesearch_authoritative_road_identities i
      on i.id=map.identity_id and i.active
    join public.brinesearch_road_junction_memberships own on own.identity_id=i.id
    join public.brinesearch_road_junctions j on j.id=own.junction_id
      and j.verification_status in ('verified','held')
    join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
      and private_verification.brinesearch_issue97_graph_build_sources_current(b.id)
    where map.road_id=p_road_id and map.mapping_status='verified'
    group by j.id,b.algorithm_version,b.source_revision_digest,b.activated_at
  ), scoped as (
    select * from grouped
    where p_cursor is null or (
      (state_code,county_code,coalesce(distance_along_road_m,1e30::numeric),stable_junction_key)>
      (v_after_state,v_after_county,coalesce(v_after_distance,1e30::numeric),v_after_key)
    )
    order by state_code,county_code,distance_along_road_m nulls last,stable_junction_key
    limit v_limit+1
  ), page as (
    select * from scoped
    order by state_code,county_code,distance_along_road_m nulls last,stable_junction_key
    limit v_limit
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'junction_id',p.id,'junction_key',p.stable_junction_key,'display_id',p.display_id,
    'junction_type',p.junction_type,'state_code',p.state_code,'county_code',p.county_code,
    'county_name',p.county_name,'township',p.township,'municipality',p.municipality,
    'distance_along_road_m',p.distance_along_road_m,'source_measure',p.source_measure,
    'selected_identity_ids',pg_catalog.to_jsonb(p.selected_identity_ids),
    'source_method',p.source_method,'confidence',p.confidence,
    'verification_status',p.verification_status,'junction_digest',p.graph_digest,
    'source_provenance',p.source_provenance,
    'build',pg_catalog.jsonb_build_object(
      'build_id',p.build_id,'algorithm_version',p.algorithm_version,
      'source_revision_digest',p.source_revision_digest,'activated_at',p.activated_at
    ),
    'anchors',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'anchor_id',a.id,'anchor_key',a.anchor_key,'anchor_role',a.anchor_role,
      'coordinate',pg_catalog.jsonb_build_array(extensions.st_x(a.geom),extensions.st_y(a.geom)),
      'anchor_digest',a.anchor_digest
    ) order by a.anchor_role,a.id) from public.brinesearch_road_junction_anchors a
      where a.junction_id=p.id),'[]'::jsonb),
    'memberships',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
	      'membership_id',m.id,'identity_id',m.identity_id,'source_identity_key',i.source_identity_key,
	      'display_name',m.road_name_at_junction,'aliases',pg_catalog.to_jsonb(m.aliases_at_junction),
	      'route_system',i.route_system,'route_number',i.route_number,
	      'route_suffix',i.route_suffix,'route_fraction',i.route_fraction,
	      'route_extension',i.route_extension,
	      'road_class',i.road_class,'public_access_status',i.public_access_status,
      'drivable_status',i.drivable_status,'canonical_road_id',mapped.road_id,
      'identity_kind',case when mapped.mapping_status='verified' then 'canonical'
        when mapped.mapping_status='candidate' then 'candidate' else 'source_only' end,
      'mapping_status',coalesce(mapped.mapping_status,'unmapped'),
	      'membership_role',m.membership_role,'source_measure',m.source_measure,
	      'distance_along_road_m',m.distance_along_road_m,
	      'source_segment_keys',pg_catalog.to_jsonb(m.source_segment_keys),'provenance',m.provenance,
	      'source_digest',i.source_digest,'identity_source_timestamp',i.source_timestamp,
	      'source',pg_catalog.jsonb_build_object(
	        'source_key',d.source_key,'agency',d.source_agency,'dataset',d.source_dataset,
	        'layer',d.source_layer,'version',d.source_version,'url',d.source_url,
	        'fetched_at',d.fetched_at,'source_timestamp',d.source_timestamp,
	        'provenance',d.provenance
	      )
	    ) order by m.road_name_at_junction,m.identity_id)
	      from public.brinesearch_road_junction_memberships m
	      join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
	      join public.brinesearch_road_source_datasets d on d.id=i.dataset_id
      left join lateral (
        select x.road_id,x.mapping_status from public.brinesearch_road_identity_mappings x
        where x.identity_id=i.id and x.mapping_status in ('verified','candidate')
        order by case x.mapping_status when 'verified' then 0 else 1 end,x.updated_at desc limit 1
      ) mapped on true where m.junction_id=p.id),'[]'::jsonb)
  ) order by p.state_code,p.county_code,p.distance_along_road_m nulls last,p.stable_junction_key),'[]'::jsonb),
  exists(select 1 from scoped offset v_limit),
  (select pg_catalog.jsonb_build_object(
    'state_code',q.state_code,'county_code',q.county_code,
    'distance_along_road_m',q.distance_along_road_m,'junction_key',q.stable_junction_key
  ) from page q order by q.state_code desc,q.county_code desc,
    q.distance_along_road_m desc nulls first,q.stable_junction_key desc limit 1)
  into v_rows,v_has_more,v_next from page p;
  if not v_has_more then v_next:=null; end if;
  return pg_catalog.jsonb_build_object(
    'road_id',p_road_id,'connections',v_rows,'has_more',v_has_more,
    'next_cursor',v_next,'limit',v_limit
  );
end
$$;

revoke all on function public.brinesearch_authoritative_road_connections_for_canonical(uuid,jsonb,integer)
from public,anon;
grant execute on function public.brinesearch_authoritative_road_connections_for_canonical(uuid,jsonb,integer)
to authenticated;

comment on function public.brinesearch_authoritative_road_connections_for_canonical(uuid,jsonb,integer) is
  'Issue #97 canonical Road Manager Connections read. Multiple exact source identities map to one canonical road without duplicate physical junction cards.';

-- Canonical #69 routes persist the exact authoritative anchor used to cross
-- from the previous (different) road. Nullable provenance is expected on the
-- first occurrence and on explicit same-road splits.
alter table public.brinesearch_road_junctions
  add constraint brinesearch_road_junctions_id_build_issue97_unique unique(id,build_id);
alter table public.brinesearch_road_junction_anchors
  add constraint brinesearch_road_junction_anchors_id_junction_issue97_unique unique(id,junction_id);

alter table public.brinesearch_pad_roads
  add column if not exists entry_junction_id uuid,
  add column if not exists entry_junction_anchor_id uuid,
  add column if not exists junction_build_id uuid,
  add column if not exists junction_digest text;
alter table public.brinesearch_route_review_segments
  add column if not exists entry_junction_id uuid,
  add column if not exists entry_junction_anchor_id uuid,
  add column if not exists junction_build_id uuid,
  add column if not exists junction_digest text;

alter table public.brinesearch_pad_roads
  add constraint brinesearch_pad_roads_entry_junction_issue97_fk
    foreign key(entry_junction_id) references public.brinesearch_road_junctions(id) on delete restrict,
  add constraint brinesearch_pad_roads_entry_anchor_issue97_fk
    foreign key(entry_junction_anchor_id) references public.brinesearch_road_junction_anchors(id) on delete restrict,
  add constraint brinesearch_pad_roads_junction_build_issue97_fk
    foreign key(junction_build_id) references public.brinesearch_road_graph_builds(id) on delete restrict,
  add constraint brinesearch_pad_roads_anchor_junction_issue97_fk
    foreign key(entry_junction_anchor_id,entry_junction_id)
    references public.brinesearch_road_junction_anchors(id,junction_id) on delete restrict,
  add constraint brinesearch_pad_roads_junction_build_pair_issue97_fk
    foreign key(entry_junction_id,junction_build_id)
    references public.brinesearch_road_junctions(id,build_id) on delete restrict,
  add constraint brinesearch_pad_roads_junction_provenance_issue97 check (
    (entry_junction_anchor_id is null and entry_junction_id is null
      and junction_build_id is null and junction_digest is null)
    or
    (entry_junction_anchor_id is not null and entry_junction_id is not null
      and junction_build_id is not null and junction_digest ~ '^[0-9a-f]{32}$')
  );
alter table public.brinesearch_route_review_segments
  add constraint brinesearch_route_segments_entry_junction_issue97_fk
    foreign key(entry_junction_id) references public.brinesearch_road_junctions(id) on delete restrict,
  add constraint brinesearch_route_segments_entry_anchor_issue97_fk
    foreign key(entry_junction_anchor_id) references public.brinesearch_road_junction_anchors(id) on delete restrict,
  add constraint brinesearch_route_segments_junction_build_issue97_fk
    foreign key(junction_build_id) references public.brinesearch_road_graph_builds(id) on delete restrict,
  add constraint brinesearch_route_segments_anchor_junction_issue97_fk
    foreign key(entry_junction_anchor_id,entry_junction_id)
    references public.brinesearch_road_junction_anchors(id,junction_id) on delete restrict,
  add constraint brinesearch_route_segments_junction_build_pair_issue97_fk
    foreign key(entry_junction_id,junction_build_id)
    references public.brinesearch_road_junctions(id,build_id) on delete restrict,
  add constraint brinesearch_route_segments_junction_provenance_issue97 check (
    (entry_junction_anchor_id is null and entry_junction_id is null
      and junction_build_id is null and junction_digest is null)
    or
    (entry_junction_anchor_id is not null and entry_junction_id is not null
      and junction_build_id is not null and junction_digest ~ '^[0-9a-f]{32}$')
  );

create index if not exists brinesearch_pad_roads_entry_anchor_issue97_idx
on public.brinesearch_pad_roads(entry_junction_anchor_id)
where entry_junction_anchor_id is not null;
create index if not exists brinesearch_route_segments_entry_anchor_issue97_idx
on public.brinesearch_route_review_segments(entry_junction_anchor_id)
where entry_junction_anchor_id is not null;

create or replace function private_verification.brinesearch_issue97_identity_route_usable(
  p_access_status text,
  p_drivable_status text,
  p_canonical_road_type text
)
returns boolean
language sql
immutable
set search_path=''
as $$
  select p_drivable_status='drivable' and (
    p_access_status='public'
    or (p_canonical_road_type='access' and p_access_status in ('access','private'))
  )
$$;

revoke all on function private_verification.brinesearch_issue97_identity_route_usable(text,text,text)
from public,anon,authenticated,service_role;

create or replace function public.brinesearch_route_step_boundary_candidates(
  p_left_road_id uuid,
  p_right_road_id uuid,
  p_near_coordinate jsonb default null,
  p_limit integer default 8
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_left record;
  v_right record;
  v_left_geom extensions.geometry;
  v_right_geom extensions.geometry;
  v_near extensions.geometry:=null;
  v_candidates jsonb:='[]'::jsonb;
  v_count integer:=0;
  v_pair_count integer:=0;
  v_held_count integer:=0;
  v_limit integer:=greatest(1,least(coalesce(p_limit,8),20));
  v_lng double precision;
  v_lat double precision;
  v_split extensions.geometry;
  v_distance double precision;
begin
  if auth.uid() is null or not public.is_brinesearch_owner(auth.uid()) then
    raise exception 'Owner access is required to resolve route intersections' using errcode='42501';
  end if;
  select r.* into v_left from public.brinesearch_roads r where r.id=p_left_road_id;
  select r.* into v_right from public.brinesearch_roads r where r.id=p_right_road_id;
  if v_left.id is null or v_right.id is null then raise exception 'Road Manager road not found'; end if;
  if coalesce(v_left.candidate_only,false) or coalesce(v_right.candidate_only,false) then
    raise exception 'Candidate-only roads cannot define a published route boundary';
  end if;
  if coalesce(v_left.geometry_status,'') not in (
       'official_centerline_loaded','field_confirmed_centerline','owner_verified_complete'
     ) or coalesce(v_right.geometry_status,'') not in (
       'official_centerline_loaded','field_confirmed_centerline','owner_verified_complete'
     ) then
    return pg_catalog.jsonb_build_object(
      'resolved',false,'reason','road_geometry_not_complete',
      'left_road_id',p_left_road_id,'right_road_id',p_right_road_id,'candidates','[]'::jsonb
    );
  end if;
  if v_left.centerline_geojson is null or v_right.centerline_geojson is null then
    return pg_catalog.jsonb_build_object(
      'resolved',false,'reason','road_geometry_missing',
      'left_road_id',p_left_road_id,'right_road_id',p_right_road_id,'candidates','[]'::jsonb
    );
  end if;
  begin
    v_left_geom:=extensions.st_setsrid(extensions.st_geomfromgeojson(v_left.centerline_geojson::text),4326);
    v_right_geom:=extensions.st_setsrid(extensions.st_geomfromgeojson(v_right.centerline_geojson::text),4326);
  exception when others then
    return pg_catalog.jsonb_build_object(
      'resolved',false,'reason','road_geometry_invalid',
      'left_road_id',p_left_road_id,'right_road_id',p_right_road_id,'candidates','[]'::jsonb
    );
  end;
  if extensions.st_isempty(v_left_geom) or extensions.st_isempty(v_right_geom)
     or extensions.geometrytype(v_left_geom) not in ('LINESTRING','MULTILINESTRING')
     or extensions.geometrytype(v_right_geom) not in ('LINESTRING','MULTILINESTRING')
     or not extensions.st_isvalid(v_left_geom) or not extensions.st_isvalid(v_right_geom)
     or not extensions.st_issimple(v_left_geom) or not extensions.st_issimple(v_right_geom)
     or not extensions.st_coveredby(v_left_geom,extensions.st_makeenvelope(-180,-90,180,90,4326))
     or not extensions.st_coveredby(v_right_geom,extensions.st_makeenvelope(-180,-90,180,90,4326)) then
    return pg_catalog.jsonb_build_object(
      'resolved',false,'reason','road_geometry_invalid',
      'left_road_id',p_left_road_id,'right_road_id',p_right_road_id,'candidates','[]'::jsonb
    );
  end if;
  if p_near_coordinate is not null then
    if pg_catalog.jsonb_typeof(p_near_coordinate)<>'array'
       or pg_catalog.jsonb_array_length(p_near_coordinate)<2 then
      raise exception 'Coordinate must be [longitude, latitude]';
    end if;
    begin
      v_lng:=(p_near_coordinate->>0)::double precision;
      v_lat:=(p_near_coordinate->>1)::double precision;
    exception when others then
      raise exception 'Coordinate must contain numeric longitude and latitude';
    end;
    if v_lng not between -180 and 180 or v_lat not between -90 and 90 then
      raise exception 'Coordinate is outside valid longitude/latitude bounds';
    end if;
    v_near:=extensions.st_setsrid(extensions.st_makepoint(v_lng,v_lat),4326);
  end if;

  -- Same-road occurrences keep #69's explicit split semantics and never invent
  -- a graph membership merely because the canonical road repeats.
  if p_left_road_id=p_right_road_id then
    if v_near is null then
      return pg_catalog.jsonb_build_object(
        'resolved',false,'reason','same_road_split_requires_explicit_point','same_road',true,
        'left_road_id',p_left_road_id,'right_road_id',p_right_road_id,'candidates','[]'::jsonb
      );
    end if;
    v_split:=extensions.st_closestpoint(v_left_geom,v_near);
    v_distance:=extensions.st_distance(v_near::extensions.geography,v_split::extensions.geography);
    if v_distance>50 then
      return pg_catalog.jsonb_build_object(
        'resolved',false,'reason','tap_too_far_from_same_road','same_road',true,
        'left_road_id',p_left_road_id,'right_road_id',p_right_road_id,
        'distance_m',pg_catalog.round(v_distance::numeric,2),'candidates','[]'::jsonb
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'resolved',true,'ambiguous',false,'same_road',true,
      'left_road_id',p_left_road_id,'right_road_id',p_right_road_id,
      'candidates',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'coordinate',pg_catalog.jsonb_build_array(extensions.st_x(v_split),extensions.st_y(v_split)),
        'kind','same_road_explicit_split','anchor_id',null,'distance_to_tap_m',
        pg_catalog.round(v_distance::numeric,2)
      ))
    );
  end if;

  select count(distinct j.id) into v_pair_count
  from public.brinesearch_road_junctions j
  join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
    and private_verification.brinesearch_issue97_graph_build_sources_current(b.id)
  where j.verification_status='verified'
    and exists(select 1 from public.brinesearch_road_junction_memberships ml
      join public.brinesearch_road_identity_mappings mapl
        on mapl.identity_id=ml.identity_id and mapl.mapping_status='verified'
      join public.brinesearch_authoritative_road_identities il on il.id=ml.identity_id
      where ml.junction_id=j.id and mapl.road_id=p_left_road_id
        and il.active and private_verification.brinesearch_issue97_identity_route_usable(
          il.public_access_status,il.drivable_status,v_left.road_type))
    and exists(select 1 from public.brinesearch_road_junction_memberships mr
      join public.brinesearch_road_identity_mappings mapr
        on mapr.identity_id=mr.identity_id and mapr.mapping_status='verified'
      join public.brinesearch_authoritative_road_identities ir on ir.id=mr.identity_id
      where mr.junction_id=j.id and mapr.road_id=p_right_road_id
        and ir.active and private_verification.brinesearch_issue97_identity_route_usable(
          ir.public_access_status,ir.drivable_status,v_right.road_type));

  select count(distinct j.id) into v_held_count
  from public.brinesearch_road_junctions j
  join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
    and private_verification.brinesearch_issue97_graph_build_sources_current(b.id)
  where j.verification_status='held'
    and exists(select 1 from public.brinesearch_road_junction_memberships m
      join public.brinesearch_road_identity_mappings x
        on x.identity_id=m.identity_id and x.mapping_status='verified'
      where m.junction_id=j.id and x.road_id=p_left_road_id)
    and exists(select 1 from public.brinesearch_road_junction_memberships m
      join public.brinesearch_road_identity_mappings x
        on x.identity_id=m.identity_id and x.mapping_status='verified'
      where m.junction_id=j.id and x.road_id=p_right_road_id);

  with eligible as (
    select distinct
      a.id as anchor_id,a.anchor_key,a.anchor_role,a.anchor_digest,a.geom,
      j.id as junction_id,j.stable_junction_key,j.display_id,j.junction_type,
      j.source_method,j.source_provenance,j.confidence,j.graph_digest,
      b.id as build_id,b.algorithm_version,b.source_revision_digest,b.activated_at,
      case when v_near is null then null::double precision
        else extensions.st_distance(a.geom::extensions.geography,v_near::extensions.geography) end as near_m
    from public.brinesearch_road_junction_anchors a
    join public.brinesearch_road_junctions j on j.id=a.junction_id and j.verification_status='verified'
    join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
      and private_verification.brinesearch_issue97_graph_build_sources_current(b.id)
    where extensions.st_dwithin(a.geom::extensions.geography,v_left_geom::extensions.geography,1)
      and extensions.st_dwithin(a.geom::extensions.geography,v_right_geom::extensions.geography,1)
      and exists(select 1 from public.brinesearch_road_junction_memberships ml
        join public.brinesearch_road_identity_mappings mapl
          on mapl.identity_id=ml.identity_id and mapl.mapping_status='verified'
        join public.brinesearch_authoritative_road_identities il on il.id=ml.identity_id
        where ml.junction_id=j.id and mapl.road_id=p_left_road_id
          and il.active and private_verification.brinesearch_issue97_identity_route_usable(
            il.public_access_status,il.drivable_status,v_left.road_type))
      and exists(select 1 from public.brinesearch_road_junction_memberships mr
        join public.brinesearch_road_identity_mappings mapr
          on mapr.identity_id=mr.identity_id and mapr.mapping_status='verified'
        join public.brinesearch_authoritative_road_identities ir on ir.id=mr.identity_id
        where mr.junction_id=j.id and mapr.road_id=p_right_road_id
          and ir.active and private_verification.brinesearch_issue97_identity_route_usable(
            ir.public_access_status,ir.drivable_status,v_right.road_type))
  )
  select count(*) filter(where v_near is null or near_m<=50) into v_count from eligible;

  with eligible as (
    select distinct
      a.id as anchor_id,a.anchor_key,a.anchor_role,a.anchor_digest,a.geom,
      j.id as junction_id,j.stable_junction_key,j.display_id,j.junction_type,
      j.source_method,j.source_provenance,j.confidence,j.graph_digest,
      b.id as build_id,b.algorithm_version,b.source_revision_digest,b.activated_at,
      case when v_near is null then null::double precision
        else extensions.st_distance(a.geom::extensions.geography,v_near::extensions.geography) end as near_m
    from public.brinesearch_road_junction_anchors a
    join public.brinesearch_road_junctions j on j.id=a.junction_id and j.verification_status='verified'
    join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
      and private_verification.brinesearch_issue97_graph_build_sources_current(b.id)
    where extensions.st_dwithin(a.geom::extensions.geography,v_left_geom::extensions.geography,1)
      and extensions.st_dwithin(a.geom::extensions.geography,v_right_geom::extensions.geography,1)
      and exists(select 1 from public.brinesearch_road_junction_memberships ml
        join public.brinesearch_road_identity_mappings mapl
          on mapl.identity_id=ml.identity_id and mapl.mapping_status='verified'
        join public.brinesearch_authoritative_road_identities il on il.id=ml.identity_id
        where ml.junction_id=j.id and mapl.road_id=p_left_road_id
          and il.active and private_verification.brinesearch_issue97_identity_route_usable(
            il.public_access_status,il.drivable_status,v_left.road_type))
      and exists(select 1 from public.brinesearch_road_junction_memberships mr
        join public.brinesearch_road_identity_mappings mapr
          on mapr.identity_id=mr.identity_id and mapr.mapping_status='verified'
        join public.brinesearch_authoritative_road_identities ir on ir.id=mr.identity_id
        where mr.junction_id=j.id and mapr.road_id=p_right_road_id
          and ir.active and private_verification.brinesearch_issue97_identity_route_usable(
            ir.public_access_status,ir.drivable_status,v_right.road_type))
  ), ranked as (
    select * from eligible where v_near is null or near_m<=50
    order by near_m asc nulls last,stable_junction_key,anchor_role,anchor_id limit v_limit
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'coordinate',pg_catalog.jsonb_build_array(extensions.st_x(geom),extensions.st_y(geom)),
    'kind','authoritative_junction_anchor','anchor_id',anchor_id,'anchor_key',anchor_key,
    'anchor_role',anchor_role,'anchor_digest',anchor_digest,
    'junction_id',junction_id,'junction_key',stable_junction_key,'display_id',display_id,
    'junction_type',junction_type,'junction_digest',graph_digest,'build_id',build_id,
    'source_method',source_method,'source_provenance',source_provenance,
    'confidence',confidence,'algorithm_version',algorithm_version,
    'source_revision_digest',source_revision_digest,'activated_at',activated_at,
    'distance_to_tap_m',case when near_m is null then null else pg_catalog.round(near_m::numeric,2) end
  ) order by near_m asc nulls last,stable_junction_key,anchor_role,anchor_id),'[]'::jsonb)
  into v_candidates from ranked;

  if v_count=0 then
    return pg_catalog.jsonb_build_object(
      'resolved',false,
      'reason',case when v_held_count>0 then 'junction_requires_review'
        when v_pair_count>0 then case when v_near is null
          then 'canonical_geometry_not_aligned_to_junction'
          else 'no_authoritative_junction_near_tap' end
        else 'junction_graph_unresolved' end,
      'left_road_id',p_left_road_id,'right_road_id',p_right_road_id,
      'candidate_count',0,'candidates','[]'::jsonb
    );
  end if;
  return pg_catalog.jsonb_build_object(
    'resolved',true,'ambiguous',v_count>1,'same_road',false,
    'left_road_id',p_left_road_id,'right_road_id',p_right_road_id,
    'candidate_count',v_count,'candidates_truncated',v_count>v_limit,'candidates',v_candidates
  );
end
$$;

revoke all on function public.brinesearch_route_step_boundary_candidates(uuid,uuid,jsonb,integer)
from public,anon;
grant execute on function public.brinesearch_route_step_boundary_candidates(uuid,uuid,jsonb,integer)
to authenticated;

comment on function public.brinesearch_route_step_boundary_candidates(uuid,uuid,jsonb,integer) is
  'Issue #97 owner boundary resolver. Different-road boundaries come only from active verified graph anchors; coincident vertices and raw crossings never substitute.';

-- Preserve the fully reviewed #69 clipping/publication implementation behind a
-- private compatibility name. The public entry point below makes graph-anchor
-- validation and server-derived boundary coordinates mandatory before #69 can
-- clip or persist any different-road transition.
alter function public.brinesearch_get_structured_route_steps(uuid)
  rename to brinesearch_get_structured_route_steps_issue69_legacy;
revoke all on function public.brinesearch_get_structured_route_steps_issue69_legacy(uuid)
from public,anon,authenticated;

create or replace function public.brinesearch_get_structured_route_steps(p_pad_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_result jsonb; v_steps jsonb;
begin
  if auth.uid() is null or not public.is_brinesearch_owner(auth.uid()) then
    raise exception 'Owner access is required to load structured route geometry' using errcode='42501';
  end if;
  v_result:=public.brinesearch_get_structured_route_steps_issue69_legacy(p_pad_id);
  select coalesce(pg_catalog.jsonb_agg(
    e.value||pg_catalog.jsonb_build_object(
      'entry_junction_id',pr.entry_junction_id,
      'entry_junction_anchor_id',pr.entry_junction_anchor_id,
      'junction_build_id',pr.junction_build_id,
      'junction_digest',pr.junction_digest,
      'entry_junction',case when pr.entry_junction_anchor_id is null then null else
        pg_catalog.jsonb_build_object(
          'junction_key',j.stable_junction_key,'display_id',j.display_id,
          'junction_type',j.junction_type,'source_method',j.source_method,
          'source_provenance',j.source_provenance,'confidence',j.confidence,
          'anchor_key',a.anchor_key,'anchor_role',a.anchor_role,
          'anchor_digest',a.anchor_digest,
          'coordinate',pg_catalog.jsonb_build_array(extensions.st_x(a.geom),extensions.st_y(a.geom)),
          'algorithm_version',b.algorithm_version,
          'source_revision_digest',b.source_revision_digest,'activated_at',b.activated_at
        ) end
    ) order by e.ordinality
  ),'[]'::jsonb) into v_steps
  from pg_catalog.jsonb_array_elements(coalesce(v_result->'steps','[]'::jsonb)) with ordinality e(value,ordinality)
  left join public.brinesearch_pad_roads pr
    on pr.route_step_id=(e.value->>'route_step_id')::uuid and pr.pad_id=p_pad_id
  left join public.brinesearch_road_junction_anchors a on a.id=pr.entry_junction_anchor_id
  left join public.brinesearch_road_junctions j on j.id=pr.entry_junction_id
  left join public.brinesearch_road_graph_builds b on b.id=pr.junction_build_id;
  v_result:=pg_catalog.jsonb_set(v_result,'{steps}',v_steps,true);
  v_result:=pg_catalog.jsonb_set(v_result,'{structured_route_steps}',v_steps,true);
  return v_result;
end
$$;

revoke all on function public.brinesearch_get_structured_route_steps(uuid) from public,anon;
grant execute on function public.brinesearch_get_structured_route_steps(uuid) to authenticated;

alter function public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint)
  rename to brinesearch_publish_structured_route_issue69_legacy;
revoke all on function public.brinesearch_publish_structured_route_issue69_legacy(uuid,uuid,jsonb,bigint)
from public,anon,authenticated;

-- The issue #69 publisher is reproduced under a private helper with its
-- former raw ST_DumpPoints proximity gate removed. The public issue #97
-- entry point below is now the sole graph/topology gate, while this helper
-- retains #69's reviewed locks, clipping, revisioning and safety behavior.
create or replace function private_verification.brinesearch_publish_structured_route_issue97_core(
  p_pad_id uuid,
  p_review_id uuid,
  p_steps jsonb,
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_pad record;
  v_review_id uuid;
  v_current_revision bigint;
  v_next_revision bigint;
  v_step jsonb;
  v_clip_result jsonb;
  v_canonical_steps jsonb:='[]'::jsonb;
  v_index integer:=0;
  v_count integer;
  v_road record;
  v_geometry extensions.geometry;
  v_master_geometry extensions.geometry;
  v_previous_master_geometry extensions.geometry:=null;
  v_start extensions.geometry;
  v_end extensions.geometry;
  v_previous_end extensions.geometry:=null;
  v_previous_road_id uuid:=null;
  v_step_id uuid;
  v_road_id uuid;
  v_seen_step_ids uuid[]:='{}'::uuid[];
  v_road_ids uuid[]:='{}'::uuid[];
  v_miles numeric;
  v_turn text;
  v_inbound_turn text;
  v_instruction text;
  v_sequence text;
  v_directions text;
  v_total numeric;
  v_public_steps jsonb;
  v_public_safety jsonb:='[]'::jsonb;
  v_safety_text text:='';
begin
  if v_actor is null or not public.is_brinesearch_owner(v_actor) then
    raise exception 'Owner access is required to publish structured routes' using errcode='42501';
  end if;
  if p_expected_revision is null then
    raise exception 'Expected route revision is required' using errcode='22023';
  end if;
  if p_steps is null or pg_catalog.jsonb_typeof(p_steps)<>'array'
     or pg_catalog.jsonb_array_length(p_steps)=0 then
    raise exception 'Structured route must contain at least one step' using errcode='22023';
  end if;
  if pg_catalog.jsonb_array_length(p_steps)>250
     or pg_catalog.pg_column_size(p_steps)>5242880 then
    raise exception 'Structured route exceeds the publication safety limit' using errcode='22023';
  end if;

  select p.* into v_pad
  from public.pads p
  where p.id=p_pad_id
  for update;
  if not found then raise exception 'Pad not found'; end if;
  v_current_revision:=v_pad.structured_route_revision;
  if p_expected_revision<>v_current_revision then
    raise exception 'Route changed after it was loaded; reload before publishing' using errcode='40001';
  end if;
  v_next_revision:=v_current_revision+1;
  v_count:=pg_catalog.jsonb_array_length(p_steps);

  -- Validate occurrence/order/turn identity first, then lock every referenced
  -- Road Manager row in deterministic UUID order before reading any geometry.
  for v_step in select value from pg_catalog.jsonb_array_elements(p_steps)
  loop
    v_index:=v_index+1;
    if pg_catalog.jsonb_typeof(v_step)<>'object' then
      raise exception 'Structured step % must be an object',v_index using errcode='22023';
    end if;
    begin
      if coalesce((v_step->>'step_order')::integer,0)<>v_index then
        raise exception 'Structured step order must be contiguous at step %',v_index using errcode='22023';
      end if;
      v_step_id:=nullif(v_step->>'route_step_id','')::uuid;
      v_road_id:=nullif(v_step->>'road_id','')::uuid;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'Step % has an invalid order, occurrence ID or Road Manager road ID',v_index using errcode='22023';
    end;
    if v_step_id is null or v_road_id is null then
      raise exception 'Step % requires an occurrence ID and Road Manager road ID',v_index using errcode='22023';
    end if;
    if v_step_id=any(v_seen_step_ids) then
      raise exception 'Step % repeats occurrence ID %',v_index,v_step_id using errcode='22023';
    end if;
    v_seen_step_ids:=pg_catalog.array_append(v_seen_step_ids,v_step_id);
    if not v_road_id=any(v_road_ids) then
      v_road_ids:=pg_catalog.array_append(v_road_ids,v_road_id);
    end if;

    v_turn:=nullif(v_step->>'turn_direction','');
    v_inbound_turn:=nullif(v_step->>'inbound_turn','');
    if v_index=1 and v_turn is not null then
      raise exception 'Step 1 must not have an outbound entry turn' using errcode='22023';
    end if;
    if v_index>1 and v_turn is null then
      raise exception 'Step % requires an outbound turn instruction',v_index using errcode='22023';
    end if;
    if v_index=v_count and v_inbound_turn is not null then
      raise exception 'Final outbound step is the reverse-route start and must not have an inbound entry turn' using errcode='22023';
    end if;
    if v_index<v_count and v_inbound_turn is null then
      raise exception 'Step % requires an explicit reverse-route turn instruction',v_index using errcode='22023';
    end if;
    if v_turn is not null and v_turn not in (
      'left','right','straight','slight_left','slight_right','merge_left','merge_right','arrive'
    ) then
      raise exception 'Step % has an invalid outbound turn instruction',v_index using errcode='22023';
    end if;
    if v_inbound_turn is not null and v_inbound_turn not in (
      'left','right','straight','slight_left','slight_right','merge_left','merge_right','arrive'
    ) then
      raise exception 'Step % has an invalid reverse-route turn instruction',v_index using errcode='22023';
    end if;
  end loop;

  if exists (
    select 1 from public.brinesearch_pad_roads pr
    where pr.route_step_id=any(v_seen_step_ids) and pr.pad_id<>p_pad_id
  ) then
    raise exception 'A route occurrence ID already belongs to another pad' using errcode='23505';
  end if;

  perform r.id
  from public.brinesearch_roads r
  where r.id=any(v_road_ids)
  order by r.id
  for share;
  if (select pg_catalog.count(*) from public.brinesearch_roads r where r.id=any(v_road_ids))
     <>pg_catalog.cardinality(v_road_ids) then
    raise exception 'One or more Road Manager road IDs do not exist' using errcode='22023';
  end if;

  perform f.id
  from private_verification.brinesearch_driver_safety_facts_issue69 f
  where f.pad_id=p_pad_id
    and f.publication_status in ('private_hold','verified_public')
    and (f.effective_from is null or f.effective_from<=current_date)
    and (f.effective_until is null or f.effective_until>=current_date)
  order by f.id
  for share;
  if exists (
    select 1
    from private_verification.brinesearch_driver_safety_facts_issue69 f
    where f.pad_id=p_pad_id and f.publication_status='private_hold'
      and (f.effective_from is null or f.effective_from<=current_date)
      and (f.effective_until is null or f.effective_until>=current_date)
  ) then
    raise exception 'Verified driver-safety context requires explicit release review before structured publishing'
      using errcode='55000';
  end if;

  -- Server-derive every traveled occurrence from road ID + exact boundaries.
  -- Client geometry, mileage, aliases, source and status are preview-only and
  -- never enter canonical rows.
  v_index:=0;
  for v_step in select value from pg_catalog.jsonb_array_elements(p_steps)
  loop
    v_index:=v_index+1;
    v_step_id:=(v_step->>'route_step_id')::uuid;
    v_road_id:=(v_step->>'road_id')::uuid;
    select r.* into strict v_road
    from public.brinesearch_roads r
    where r.id=v_road_id;

    v_clip_result:=public.brinesearch_route_step_clip(
      v_road_id,v_step->'start_coordinate',v_step->'end_coordinate'
    );
    if coalesce((v_clip_result->>'resolved')::boolean,false) is not true then
      raise exception 'Step % geometry unresolved: %',v_index,
        coalesce(v_clip_result->>'reason','unknown') using errcode='22023';
    end if;
    begin
      v_geometry:=extensions.st_setsrid(
        extensions.st_geomfromgeojson((v_clip_result->'clipped_geometry')::text),4326
      );
      v_start:=extensions.st_startpoint(v_geometry);
      v_end:=extensions.st_endpoint(v_geometry);
      v_master_geometry:=extensions.st_setsrid(
        extensions.st_geomfromgeojson(v_road.centerline_geojson::text),4326
      );
    exception when others then
      raise exception 'Step % server-derived geometry could not be parsed',v_index using errcode='22023';
    end;
    if extensions.geometrytype(v_geometry)<>'LINESTRING'
       or extensions.st_isempty(v_geometry)
       or extensions.st_npoints(v_geometry)<2
       or not extensions.st_isvalid(v_geometry)
       or not extensions.st_issimple(v_geometry)
       or extensions.st_equals(v_start,v_end) then
      raise exception 'Step % server-derived geometry is invalid',v_index using errcode='22023';
    end if;
    v_miles:=pg_catalog.round(
      (extensions.st_length(v_geometry::extensions.geography)/1609.344)::numeric,6
    );
    if v_miles<=0 then
      raise exception 'Step % server-derived mileage is zero',v_index using errcode='22023';
    end if;
    if v_previous_end is not null and not extensions.st_equals(v_previous_end,v_start) then
      raise exception 'Step % is not exactly continuous with the preceding occurrence',v_index using errcode='22023';
    end if;

    -- Different-road topology was already locked and validated by the public
    -- issue #97 publisher. Exact clipped-coordinate continuity remains mandatory.
    v_turn:=nullif(v_step->>'turn_direction','');
    v_inbound_turn:=nullif(v_step->>'inbound_turn','');
    v_canonical_steps:=v_canonical_steps||pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'route_step_id',v_step_id,
        'step_order',v_index,
        'road_id',v_road_id,
        'road_name',v_road.canonical_name,
        'aliases',pg_catalog.to_jsonb(coalesce(v_road.aliases,'{}'::text[])),
        'start_coordinate',v_clip_result->'start_coordinate',
        'end_coordinate',v_clip_result->'end_coordinate',
        'clipped_geometry',v_clip_result->'clipped_geometry',
        'miles',v_miles,
        'turn_direction',v_turn,
        'inbound_turn',v_inbound_turn,
        'private_step_note',nullif(v_step->>'note',''),
        'geometry_source','road_manager_clip_issue69',
        'geometry_source_record_id',v_road.source_record_id,
        'geometry_status','snapped_intersections',
        'road_geometry_digest',pg_catalog.md5(v_road.centerline_geojson::text),
        'road_geometry_checked_at',v_road.geometry_checked_at,
        'road_source_method',v_road.source_method
      )
    );
    v_previous_end:=v_end;
    v_previous_master_geometry:=v_master_geometry;
    v_previous_road_id:=v_road_id;
  end loop;

  if exists (
    select 1
    from private_verification.brinesearch_driver_safety_facts_issue69 f
    where f.pad_id=p_pad_id and f.publication_status='verified_public'
      and (f.effective_from is null or f.effective_from<=current_date)
      and (f.effective_until is null or f.effective_until>=current_date)
      and f.route_step_id is not null
      and not exists (
        select 1 from pg_catalog.jsonb_array_elements(v_canonical_steps) s(value)
        where (s.value->>'route_step_id')::uuid=f.route_step_id
          and (s.value->>'road_id')::uuid=f.road_id
      )
  ) then
    raise exception 'An occurrence-bound driver-safety fact no longer matches this route; reassign or retire it before publishing'
      using errcode='55000';
  end if;

  if p_review_id is not null then
    select rr.id into v_review_id
    from public.brinesearch_route_reviews rr
    where rr.id=p_review_id and rr.pad_id=p_pad_id
    for update;
    if not found then raise exception 'Route review does not belong to this pad'; end if;
  else
    select rr.id into v_review_id
    from public.brinesearch_route_reviews rr
    where rr.pad_id=p_pad_id
    for update;
    if not found then
      insert into public.brinesearch_route_reviews(
        pad_id,legacy_id,pad_name,company,state,pad_latitude,pad_longitude,
        source_quality,status,route_scope,candidate_kind,candidate_route,evidence,
        field_verification_status
      ) values (
        p_pad_id,v_pad.legacy_id,v_pad.pad_name,v_pad.company,v_pad.state,
        v_pad.latitude,v_pad.longitude,'sequence_only','owner_review','unknown',
        'none','[]'::jsonb,
        pg_catalog.jsonb_build_object('method','owner_structured_route_steps_issue69'),
        'pending'
      ) returning id into v_review_id;
    end if;
  end if;

  delete from public.brinesearch_pad_roads
  where pad_id=p_pad_id and route_group='primary' and route_variant_index=0;

  for v_step in select value from pg_catalog.jsonb_array_elements(v_canonical_steps)
  loop
    v_index:=(v_step->>'step_order')::integer;
    v_geometry:=extensions.st_setsrid(
      extensions.st_geomfromgeojson((v_step->'clipped_geometry')::text),4326
    );
    v_turn:=nullif(v_step->>'turn_direction','');
    v_instruction:=case
      when v_index=1 then 'Take '
      when v_turn='left' then 'Turn left on '
      when v_turn='right' then 'Turn right on '
      when v_turn='slight_left' then 'Slight left on '
      when v_turn='slight_right' then 'Slight right on '
      when v_turn='merge_left' then 'Merge left onto '
      when v_turn='merge_right' then 'Merge right onto '
      when v_turn='arrive' then 'Arrive via '
      else 'Continue on '
    end||(v_step->>'road_name');

    insert into public.brinesearch_pad_roads(
      pad_id,road_id,route_group,step_order,instruction,distance_miles,step_note,
      route_variant_index,turn_direction,distance_source,distance_status,
      source_details,match_confidence,route_step_id,step_geometry,step_aliases,
      geometry_source,geometry_source_record_id,geometry_status,geometry_version,
      inbound_turn,route_revision,published_review_id,road_geometry_digest,
      road_geometry_checked_at,road_source_method,created_by,updated_by
    ) values (
      p_pad_id,(v_step->>'road_id')::uuid,'primary',v_index,v_instruction,
      (v_step->>'miles')::numeric,nullif(v_step->>'private_step_note',''),0,v_turn,
      'clipped_step_geometry','map_measured',
      pg_catalog.jsonb_build_object(
        'method','owner_structured_route_steps_issue69',
        'published_at',pg_catalog.now(),
        'route_revision',v_next_revision,
        'road_geometry_digest',v_step->>'road_geometry_digest',
        'road_source_method',v_step->>'road_source_method'
      ),
      1,(v_step->>'route_step_id')::uuid,v_geometry,
      array(select value from pg_catalog.jsonb_array_elements_text(v_step->'aliases')),
      'road_manager_clip_issue69',nullif(v_step->>'geometry_source_record_id',''),
      'snapped_intersections',1,nullif(v_step->>'inbound_turn',''),
      v_next_revision,v_review_id,v_step->>'road_geometry_digest',
      nullif(v_step->>'road_geometry_checked_at','')::timestamptz,
      nullif(v_step->>'road_source_method',''),v_actor,v_actor
    );
  end loop;

  delete from public.brinesearch_route_review_segments where review_id=v_review_id;
  insert into public.brinesearch_route_review_segments(
    review_id,outbound_order,inbound_order,road_id,road_name,official_road_name,
    route_type,route_number,miles,outbound_turn,inbound_turn,source_level,
    source_agency,source_url,source_record_id,is_state_route,confidence,evidence,
    route_step_id,step_geometry,step_aliases,geometry_source,
    geometry_source_record_id,geometry_status,geometry_version,
    road_geometry_digest,road_geometry_checked_at,road_source_method
  )
  select
    v_review_id,pr.step_order,v_count-pr.step_order+1,pr.road_id,
    r.canonical_name,r.canonical_name,
    case r.road_type
      when 'interstate' then 'I' when 'us_route' then 'US'
      when 'state_route' then case lower(pg_catalog.btrim(coalesce(r.state,v_pad.state,'')))
        when 'ohio' then 'OH' when 'oh' then 'OH'
        when 'pennsylvania' then 'PA' when 'pa' then 'PA'
        when 'west virginia' then 'WV' when 'wv' then 'WV'
        else upper(nullif(pg_catalog.btrim(coalesce(r.state,v_pad.state,'')),'')) end
      when 'county' then 'CR' when 'township' then 'TR' else upper(r.road_type)
    end,
    r.route_number,pr.distance_miles,pr.turn_direction,pr.inbound_turn,
    'owner_verified',r.source_agency,r.source_url,r.source_record_id,
    r.road_type='state_route','owner_confirmed',
    pg_catalog.jsonb_build_object(
      'method','owner_structured_route_steps_issue69','route_revision',v_next_revision,
      'road_geometry_digest',pr.road_geometry_digest
    ),
    pr.route_step_id,pr.step_geometry,pr.step_aliases,pr.geometry_source,
    pr.geometry_source_record_id,pr.geometry_status,1,pr.road_geometry_digest,
    pr.road_geometry_checked_at,pr.road_source_method
  from public.brinesearch_pad_roads pr
  join public.brinesearch_roads r on r.id=pr.road_id
  where pr.pad_id=p_pad_id and pr.route_group='primary' and pr.route_variant_index=0
  order by pr.step_order;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'route_step_id',pr.route_step_id,
    'step_order',pr.step_order,
    'step_index',pr.step_order-1,
    'road_id',pr.road_id,
    'road_name',r.canonical_name,
    'aliases',pg_catalog.to_jsonb(pr.step_aliases),
    'start_coordinate',pg_catalog.jsonb_build_array(
      extensions.st_x(pr.start_point),extensions.st_y(pr.start_point)
    ),
    'end_coordinate',pg_catalog.jsonb_build_array(
      extensions.st_x(pr.end_point),extensions.st_y(pr.end_point)
    ),
    'clipped_geometry',extensions.st_asgeojson(pr.step_geometry,15)::jsonb,
    'miles',pr.distance_miles,
    'turn_direction',pr.turn_direction,
    'inbound_turn',pr.inbound_turn,
    'instruction',pr.instruction,
    'geometry_status',pr.geometry_status,
    'geometry_version',pr.geometry_version,
    'route_revision',pr.route_revision
  ) order by pr.step_order),'[]'::jsonb)
  into v_public_steps
  from public.brinesearch_pad_roads pr
  join public.brinesearch_roads r on r.id=pr.road_id
  where pr.pad_id=p_pad_id and pr.route_group='primary'
    and pr.route_variant_index=0 and pr.geometry_version=1;

  select
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(
      pg_catalog.jsonb_build_object(
        'safety_fact_id',f.id,
        'category',f.category,
        'driver_text',f.driver_text,
        'direction_scope',f.direction_scope,
        'route_step_id',f.route_step_id,
        'road_id',f.road_id,
        'effective_from',f.effective_from,
        'effective_until',f.effective_until,
        'source_revision',f.source_revision
      )
    ) order by f.display_order,f.id),'[]'::jsonb),
    coalesce(pg_catalog.string_agg('- '||f.driver_text,E'\n' order by f.display_order,f.id),'')
  into v_public_safety,v_safety_text
  from private_verification.brinesearch_driver_safety_facts_issue69 f
  where f.pad_id=p_pad_id and f.publication_status='verified_public'
    and f.verified_at is not null
    and (f.effective_from is null or f.effective_from<=current_date)
    and (f.effective_until is null or f.effective_until>=current_date);

  select
    pg_catalog.string_agg(r.canonical_name,' → ' order by pr.step_order),
    pg_catalog.string_agg(
      pr.step_order::text||'. '||pr.instruction||' — '||
      trim(trailing '.' from trim(
        trailing '0' from pg_catalog.to_char(pr.distance_miles,'FM999990.00')
      ))||' mi',
      E'\n' order by pr.step_order
    ),
    pg_catalog.sum(pr.distance_miles)
  into v_sequence,v_directions,v_total
  from public.brinesearch_pad_roads pr
  join public.brinesearch_roads r on r.id=pr.road_id
  where pr.pad_id=p_pad_id and pr.route_group='primary' and pr.route_variant_index=0;

  v_directions:='Road sequence reference:'||E'\n'||v_sequence||
    E'\n\nStep-by-step directions:\n'||v_directions;
  if v_safety_text<>'' then
    v_directions:=v_directions||E'\n\nDriver safety information:\n'||v_safety_text;
  end if;

  update public.brinesearch_route_reviews rr
  set structured_sequence_snapshot=v_sequence,
      source_directions_snapshot=v_directions,
      source_quality='clear',candidate_kind='none',state_route_name=null,
      state_route_distance_feet=null,no_guess_reason=null,
      candidate_route=v_public_steps,
      evidence=coalesce(rr.evidence,'{}'::jsonb)||pg_catalog.jsonb_build_object(
        'method','owner_structured_route_steps_issue69',
        'route_revision',v_next_revision,'published_at',pg_catalog.now(),
        'safety_revision',pg_catalog.md5(v_public_safety::text)
      ),
      measured_total_miles=v_total,status='approved',
      route_scope=case when exists(
        select 1 from public.brinesearch_pad_roads pr
        join public.brinesearch_roads r on r.id=pr.road_id
        where pr.pad_id=p_pad_id and pr.route_group='primary'
          and pr.route_variant_index=0
          and r.road_type in ('county','township','local','access')
      ) then 'local_roads' else 'state_route_only' end,
      field_verification_status='confirmed',reviewed_by=v_actor,
      reviewed_at=pg_catalog.now(),approved_at=pg_catalog.now(),updated_at=pg_catalog.now()
  where rr.id=v_review_id;

  update public.pads
  set structured_road_sequence=v_sequence,
      structured_route_steps=v_public_steps,
      structured_route_revision=v_next_revision,
      driver_safety_context=v_public_safety,
      directions_clear=v_directions,
      directions_clear_method='owner_structured_route_steps_issue69',
      directions_clear_updated_at=pg_catalog.now(),
      directions_clear_updated_by=v_actor,
      road_sequence_status='owner_verified',
      road_sequence_reviewed_date=current_date,
      number_of_road_steps=v_count,
      last_updated_by='BrineSearch Owner',last_updated_date=pg_catalog.now(),
      updated_by=v_actor,updated_at=pg_catalog.now()
  where id=p_pad_id;

  return public.brinesearch_get_structured_route_steps(p_pad_id);
end;
$$;

revoke all on function private_verification.brinesearch_publish_structured_route_issue97_core(uuid,uuid,jsonb,bigint)
from public,anon,authenticated,service_role;
drop function public.brinesearch_publish_structured_route_issue69_legacy(uuid,uuid,jsonb,bigint);

create or replace function public.brinesearch_publish_structured_route(
  p_pad_id uuid,
  p_review_id uuid,
  p_steps jsonb,
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_steps jsonb:=p_steps;
  v_count integer;
  v_index integer;
  v_step jsonb;
  v_previous_road_id uuid;
  v_road_id uuid;
  v_step_id uuid;
  v_anchor_id uuid;
  v_anchor record;
  v_left_geom extensions.geometry;
  v_right_geom extensions.geometry;
  v_left_road_type text;
  v_right_road_type text;
  v_coordinate jsonb;
  v_result jsonb;
  v_pad_rows_updated integer;
  v_review_rows_updated integer;
begin
  if v_actor is null or not public.is_brinesearch_owner(v_actor) then
    raise exception 'Owner access is required to publish structured routes' using errcode='42501';
  end if;
  if v_steps is null or pg_catalog.jsonb_typeof(v_steps)<>'array'
     or pg_catalog.jsonb_array_length(v_steps)=0 then
    raise exception 'Structured route must contain at least one step' using errcode='22023';
  end if;
  v_count:=pg_catalog.jsonb_array_length(v_steps);
  for v_index in 1..v_count loop
    v_step:=v_steps->(v_index-1);
    begin
      v_step_id:=nullif(v_step->>'route_step_id','')::uuid;
      v_road_id:=nullif(v_step->>'road_id','')::uuid;
      v_anchor_id:=nullif(coalesce(
        v_step->>'entry_junction_anchor_id',v_step->>'entryJunctionAnchorId',''
      ),'')::uuid;
    exception when invalid_text_representation then
      raise exception 'Step % has an invalid road, occurrence or junction anchor ID',v_index using errcode='22023';
    end;
    if v_step_id is null or v_road_id is null then
      raise exception 'Step % requires an occurrence ID and Road Manager road ID',v_index using errcode='22023';
    end if;
    if v_index=1 then
      if v_anchor_id is not null then
        raise exception 'Step 1 cannot have an entry junction anchor' using errcode='22023';
      end if;
      v_previous_road_id:=v_road_id;
      continue;
    end if;
    if v_previous_road_id=v_road_id then
      if v_anchor_id is not null then
        raise exception 'Step % repeats the same road and must use an explicit split, not a graph anchor',v_index using errcode='22023';
      end if;
      v_previous_road_id:=v_road_id;
      continue;
    end if;
    if v_anchor_id is null then
      raise exception 'Step % requires an authoritative entry junction anchor',v_index using errcode='22023';
    end if;

    select r.road_type into strict v_left_road_type
    from public.brinesearch_roads r where r.id=v_previous_road_id;
    select r.road_type into strict v_right_road_type
    from public.brinesearch_roads r where r.id=v_road_id;

    select
      a.id,a.geom,a.anchor_digest,a.anchor_role,j.id as junction_id,
      j.stable_junction_key,j.junction_type,j.graph_digest,j.source_method,
      j.source_provenance,b.id as build_id,b.algorithm_version,b.source_revision_digest
    into v_anchor
    from public.brinesearch_road_junction_anchors a
    join public.brinesearch_road_junctions j on j.id=a.junction_id and j.verification_status='verified'
    join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
      and private_verification.brinesearch_issue97_graph_build_sources_current(b.id)
    where a.id=v_anchor_id
      and exists(select 1 from public.brinesearch_road_junction_memberships ml
        join public.brinesearch_road_identity_mappings mapl
          on mapl.identity_id=ml.identity_id and mapl.mapping_status='verified'
        join public.brinesearch_authoritative_road_identities il on il.id=ml.identity_id
        where ml.junction_id=j.id and mapl.road_id=v_previous_road_id
          and il.active and private_verification.brinesearch_issue97_identity_route_usable(
            il.public_access_status,il.drivable_status,v_left_road_type))
      and exists(select 1 from public.brinesearch_road_junction_memberships mr
        join public.brinesearch_road_identity_mappings mapr
          on mapr.identity_id=mr.identity_id and mapr.mapping_status='verified'
        join public.brinesearch_authoritative_road_identities ir on ir.id=mr.identity_id
        where mr.junction_id=j.id and mapr.road_id=v_road_id
          and ir.active and private_verification.brinesearch_issue97_identity_route_usable(
            ir.public_access_status,ir.drivable_status,v_right_road_type))
    for share of a,j,b;
    if not found then
      raise exception 'Step % junction anchor is not active and verified for both exact Road Manager roads',v_index using errcode='22023';
    end if;

    -- Lock the exact memberships, mappings and identity state used by this
    -- publication. Rebuild/activation and mapping review cannot race the gate.
    perform m.id
    from public.brinesearch_road_junction_memberships m
    join public.brinesearch_road_identity_mappings map
      on map.identity_id=m.identity_id and map.mapping_status='verified'
    join public.brinesearch_authoritative_road_identities i
      on i.id=m.identity_id and i.active
    where m.junction_id=v_anchor.junction_id
      and ((map.road_id=v_previous_road_id
          and private_verification.brinesearch_issue97_identity_route_usable(
            i.public_access_status,i.drivable_status,v_left_road_type))
        or (map.road_id=v_road_id
          and private_verification.brinesearch_issue97_identity_route_usable(
            i.public_access_status,i.drivable_status,v_right_road_type)))
    order by m.id,map.id,i.id
    for share of m,map,i;
    if (select count(distinct map.road_id)
        from public.brinesearch_road_junction_memberships m
        join public.brinesearch_road_identity_mappings map
          on map.identity_id=m.identity_id and map.mapping_status='verified'
        join public.brinesearch_authoritative_road_identities i
          on i.id=m.identity_id and i.active
        where m.junction_id=v_anchor.junction_id
          and ((map.road_id=v_previous_road_id
              and private_verification.brinesearch_issue97_identity_route_usable(
                i.public_access_status,i.drivable_status,v_left_road_type))
            or (map.road_id=v_road_id
              and private_verification.brinesearch_issue97_identity_route_usable(
                i.public_access_status,i.drivable_status,v_right_road_type))))<>2 then
      raise exception 'Step % authoritative junction membership changed during publication',v_index using errcode='40001';
    end if;
    if (v_anchor.junction_type='shared_segment' and v_anchor.anchor_role not in ('shared_start','shared_end'))
       or (v_anchor.junction_type<>'shared_segment' and v_anchor.anchor_role<>'point') then
      raise exception 'Step % junction anchor role is invalid for its junction type',v_index using errcode='22023';
    end if;
    begin
      select extensions.st_setsrid(extensions.st_geomfromgeojson(r.centerline_geojson::text),4326)
      into strict v_left_geom from public.brinesearch_roads r where r.id=v_previous_road_id;
      select extensions.st_setsrid(extensions.st_geomfromgeojson(r.centerline_geojson::text),4326)
      into strict v_right_geom from public.brinesearch_roads r where r.id=v_road_id;
    exception when others then
      raise exception 'Step % canonical road geometry could not be validated against its junction',v_index using errcode='22023';
    end;
    if not extensions.st_dwithin(v_anchor.geom::extensions.geography,v_left_geom::extensions.geography,1)
       or not extensions.st_dwithin(v_anchor.geom::extensions.geography,v_right_geom::extensions.geography,1) then
      raise exception 'Step % canonical geometry is not aligned to the authoritative junction anchor',v_index using errcode='22023';
    end if;
    v_coordinate:=pg_catalog.jsonb_build_array(
      extensions.st_x(v_anchor.geom),extensions.st_y(v_anchor.geom)
    );
    -- JSON array indexes are zero-based: the right-hand occurrence receives
    -- the entry anchor, and both adjacent boundaries are server-derived from it.
    v_steps:=pg_catalog.jsonb_set(v_steps,array[(v_index-2)::text,'end_coordinate'],v_coordinate,true);
    v_steps:=pg_catalog.jsonb_set(v_steps,array[(v_index-1)::text,'start_coordinate'],v_coordinate,true);
    v_steps:=pg_catalog.jsonb_set(v_steps,array[(v_index-1)::text,'entry_junction_anchor_id'],
      pg_catalog.to_jsonb(v_anchor_id::text),true);
    v_previous_road_id:=v_road_id;
  end loop;

  v_result:=private_verification.brinesearch_publish_structured_route_issue97_core(
    p_pad_id,p_review_id,v_steps,p_expected_revision
  );

  -- Persist immutable graph provenance after #69 has replaced canonical route
  -- rows. The restrictive FKs make a future graph rebuild fail closed if it
  -- would delete any referenced anchor.
  for v_index in 2..v_count loop
    v_step:=v_steps->(v_index-1);
    v_step_id:=(v_step->>'route_step_id')::uuid;
    v_anchor_id:=nullif(v_step->>'entry_junction_anchor_id','')::uuid;
    if v_anchor_id is null then continue; end if;
    select a.id,a.anchor_digest,j.id as junction_id,j.graph_digest,
      j.stable_junction_key,j.junction_type,j.source_method,j.source_provenance,
      b.id as build_id,b.algorithm_version,b.source_revision_digest
    into strict v_anchor
    from public.brinesearch_road_junction_anchors a
    join public.brinesearch_road_junctions j on j.id=a.junction_id
    join public.brinesearch_road_graph_builds b on b.id=j.build_id
    where a.id=v_anchor_id;
    update public.brinesearch_pad_roads pr set
      entry_junction_id=v_anchor.junction_id,
      entry_junction_anchor_id=v_anchor_id,
      junction_build_id=v_anchor.build_id,
      junction_digest=v_anchor.graph_digest,
      source_details=coalesce(pr.source_details,'{}'::jsonb)||pg_catalog.jsonb_build_object(
        'entry_junction_id',v_anchor.junction_id,'entry_junction_anchor_id',v_anchor_id,
        'junction_key',v_anchor.stable_junction_key,'junction_type',v_anchor.junction_type,
        'junction_build_id',v_anchor.build_id,'junction_digest',v_anchor.graph_digest,
        'anchor_digest',v_anchor.anchor_digest,'junction_source_method',v_anchor.source_method,
        'junction_source_provenance',v_anchor.source_provenance,
        'graph_algorithm_version',v_anchor.algorithm_version,
        'graph_source_revision_digest',v_anchor.source_revision_digest
      )
    where pr.pad_id=p_pad_id and pr.route_step_id=v_step_id;
    get diagnostics v_pad_rows_updated=row_count;
    if v_pad_rows_updated<>1 then
      raise exception 'Step % canonical route row was not persisted exactly once',v_index using errcode='P0001';
    end if;
    update public.brinesearch_route_review_segments rs set
      entry_junction_id=v_anchor.junction_id,
      entry_junction_anchor_id=v_anchor_id,
      junction_build_id=v_anchor.build_id,
      junction_digest=v_anchor.graph_digest,
      evidence=coalesce(rs.evidence,'{}'::jsonb)||pg_catalog.jsonb_build_object(
        'entry_junction_id',v_anchor.junction_id,'entry_junction_anchor_id',v_anchor_id,
        'junction_key',v_anchor.stable_junction_key,'junction_type',v_anchor.junction_type,
        'junction_build_id',v_anchor.build_id,'junction_digest',v_anchor.graph_digest,
        'anchor_digest',v_anchor.anchor_digest,'junction_source_method',v_anchor.source_method,
        'junction_source_provenance',v_anchor.source_provenance,
        'graph_algorithm_version',v_anchor.algorithm_version,
        'graph_source_revision_digest',v_anchor.source_revision_digest
      )
    where rs.review_id=(v_result->>'review_id')::uuid and rs.route_step_id=v_step_id;
    get diagnostics v_review_rows_updated=row_count;
    if v_review_rows_updated<>1 then
      raise exception 'Step % review route row was not persisted exactly once',v_index using errcode='P0001';
    end if;
  end loop;
  return public.brinesearch_get_structured_route_steps(p_pad_id);
end
$$;

revoke all on function public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint)
from public,anon;
grant execute on function public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint)
to authenticated;

comment on function public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint) is
  'Issue #97 canonical #69 publisher gate. Every different-road boundary requires an active verified graph anchor; the server derives its coordinate and persists graph provenance.';

-- ---------------------------------------------------------------------------
-- Final issue #97 hardening overrides. These definitions are intentionally last
-- in the migration: the effective registry partitions reused ODOT NLF values by
-- authoritative physical connected component, and the effective builder keeps
-- graph generations side by side until a separately reviewed activation.

create table public.brinesearch_authoritative_segment_identity_assignments (
  dataset_id uuid not null references public.brinesearch_road_source_datasets(id),
  source_segment_key text not null,
  identity_id uuid not null references public.brinesearch_authoritative_road_identities(id),
  assignment_method text not null,
  evidence jsonb not null,
  source_digest text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(dataset_id,source_segment_key,identity_id),
  constraint brinesearch_segment_identity_assignment_method_issue97 check (
    assignment_method in ('source_identity','connected_component','verified_geometry_equivalence')
  )
);
create index brinesearch_segment_identity_assignments_segment_issue97_idx
on public.brinesearch_authoritative_segment_identity_assignments(dataset_id,source_segment_key,active);
create unique index brinesearch_segment_identity_assignments_one_active_issue97_idx
on public.brinesearch_authoritative_segment_identity_assignments(dataset_id,source_segment_key)
where active;
create index brinesearch_segment_identity_assignments_identity_issue97_idx
on public.brinesearch_authoritative_segment_identity_assignments(identity_id,active);
alter table public.brinesearch_authoritative_segment_identity_assignments enable row level security;
alter table public.brinesearch_authoritative_segment_identity_assignments force row level security;
revoke all on public.brinesearch_authoritative_segment_identity_assignments from public,anon,authenticated;
revoke all on public.brinesearch_authoritative_segment_identity_assignments from service_role;
grant select on public.brinesearch_authoritative_segment_identity_assignments to service_role;

alter table public.brinesearch_authoritative_road_identities
  add constraint brinesearch_authoritative_identities_id_dataset_issue97_unique unique(id,dataset_id),
  add constraint brinesearch_authoritative_identities_full_scope_issue97_unique
    unique(id,dataset_id,state_code,county_code),
  add constraint brinesearch_authoritative_identities_dataset_state_issue97_fk
    foreign key(dataset_id,state_code)
    references public.brinesearch_road_source_datasets(id,state_code);
alter table public.brinesearch_road_source_ingest_runs
  add constraint brinesearch_ingest_runs_dataset_state_issue97_fk
    foreign key(dataset_id,state_code)
    references public.brinesearch_road_source_datasets(id,state_code);
alter table public.brinesearch_authoritative_external_road_segments
  add constraint brinesearch_external_segments_identity_scope_issue97_fk
    foreign key(identity_id,dataset_id,state_code,county_code)
    references public.brinesearch_authoritative_road_identities(id,dataset_id,state_code,county_code);
alter table public.brinesearch_authoritative_road_nodes
  add constraint brinesearch_road_nodes_dataset_state_issue97_fk
    foreign key(dataset_id,state_code)
    references public.brinesearch_road_source_datasets(id,state_code);
alter table public.brinesearch_authoritative_segment_identity_assignments
  add constraint brinesearch_segment_assignments_identity_dataset_issue97_fk
    foreign key(identity_id,dataset_id)
    references public.brinesearch_authoritative_road_identities(id,dataset_id);
alter table public.brinesearch_road_graph_builds
  add constraint brinesearch_graph_build_id_scope_issue97_unique unique(id,state_code,county_code);
alter table public.brinesearch_road_junctions
  add constraint brinesearch_junction_build_scope_issue97_fk
    foreign key(build_id,state_code,county_code)
    references public.brinesearch_road_graph_builds(id,state_code,county_code);

create index brinesearch_authoritative_identities_dataset_scope_issue97_idx
on public.brinesearch_authoritative_road_identities(dataset_id,state_code,county_code,active);
create index brinesearch_authoritative_identities_page_issue97_idx
on public.brinesearch_authoritative_road_identities(normalized_name,id) where active;
create index brinesearch_authoritative_names_finalize_issue97_idx
on public.brinesearch_authoritative_road_names(source_dataset_id,active,last_seen_at,identity_id);
create index brinesearch_external_segments_finalize_issue97_idx
on public.brinesearch_authoritative_external_road_segments(dataset_id,state_code,county_code,active,fetched_at);
create index brinesearch_nodes_finalize_issue97_idx
on public.brinesearch_authoritative_road_nodes(dataset_id,state_code,county_code,active,fetched_at);
create index brinesearch_graph_build_scope_history_issue97_idx
on public.brinesearch_road_graph_builds(state_code,county_code,started_at desc,id);

create or replace function public.brinesearch_issue97_refresh_oh_identities(
  p_county_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_county text:=nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(p_county_code,''))),'');
  v_dataset uuid:=private_verification.brinesearch_issue97_uuid('dataset:oh_odot_tims_road_inventory');
  v_identity_count integer:=0;
  v_name_count integer:=0;
  v_assignment_count integer:=0;
begin
  if v_county is not null and not exists(
    select 1 from public.brinesearch_road_graph_counties c
    where c.state_code='OH' and c.source_county_code=v_county and c.active
  ) then raise exception 'County is outside the issue #97 Ohio footprint'; end if;

  drop table if exists pg_temp.tmp_issue97_oh_component_segments;
  create temporary table tmp_issue97_oh_component_segments on commit drop as
  with recursive valid_segments as (
    select c.*
    from public.brinesearch_odot_road_catalog c
    join public.brinesearch_road_graph_counties gc
      on gc.state_code='OH' and gc.source_county_code=c.county_code and gc.active
    where c.source_active and c.nlf_id is not null and c.geom is not null
      and not extensions.st_isempty(c.geom) and extensions.st_isvalid(c.geom)
      and extensions.st_issimple(c.geom) and extensions.st_dimension(c.geom)=1
      and extensions.st_coveredby(c.geom,extensions.st_makeenvelope(-180,-90,180,90,4326))
      and (v_county is null or c.county_code=v_county)
  ), endpoint_edges as (
    select a.roadway_inventory_id as left_id,b.roadway_inventory_id as right_id
    from valid_segments a
    join valid_segments b
      on a.roadway_inventory_id<b.roadway_inventory_id
     and a.county_code=b.county_code and a.nlf_id=b.nlf_id
     and coalesce(a.jurisdiction_code,'?')=coalesce(b.jurisdiction_code,'?')
     and coalesce(a.route_type,'?')=coalesce(b.route_type,'?')
    where (
      ((a.ctl_begin is not null and b.ctl_begin is not null
        and pg_catalog.abs(a.ctl_begin-b.ctl_begin)<=0.001
        and extensions.st_dwithin(extensions.st_startpoint(a.geom)::extensions.geography,
          extensions.st_startpoint(b.geom)::extensions.geography,0.75))
       or ((a.ctl_begin is null or b.ctl_begin is null)
        and extensions.st_dwithin(extensions.st_startpoint(a.geom)::extensions.geography,
          extensions.st_startpoint(b.geom)::extensions.geography,0.03)))
      or ((a.ctl_begin is not null and b.ctl_end is not null
        and pg_catalog.abs(a.ctl_begin-b.ctl_end)<=0.001
        and extensions.st_dwithin(extensions.st_startpoint(a.geom)::extensions.geography,
          extensions.st_endpoint(b.geom)::extensions.geography,0.75))
       or ((a.ctl_begin is null or b.ctl_end is null)
        and extensions.st_dwithin(extensions.st_startpoint(a.geom)::extensions.geography,
          extensions.st_endpoint(b.geom)::extensions.geography,0.03)))
      or ((a.ctl_end is not null and b.ctl_begin is not null
        and pg_catalog.abs(a.ctl_end-b.ctl_begin)<=0.001
        and extensions.st_dwithin(extensions.st_endpoint(a.geom)::extensions.geography,
          extensions.st_startpoint(b.geom)::extensions.geography,0.75))
       or ((a.ctl_end is null or b.ctl_begin is null)
        and extensions.st_dwithin(extensions.st_endpoint(a.geom)::extensions.geography,
          extensions.st_startpoint(b.geom)::extensions.geography,0.03)))
      or ((a.ctl_end is not null and b.ctl_end is not null
        and pg_catalog.abs(a.ctl_end-b.ctl_end)<=0.001
        and extensions.st_dwithin(extensions.st_endpoint(a.geom)::extensions.geography,
          extensions.st_endpoint(b.geom)::extensions.geography,0.75))
       or ((a.ctl_end is null or b.ctl_end is null)
        and extensions.st_dwithin(extensions.st_endpoint(a.geom)::extensions.geography,
          extensions.st_endpoint(b.geom)::extensions.geography,0.03)))
    )
    and not (
      coalesce(a.attributes->>'Z_LEVEL',a.attributes->>'ELEMENTLEV','')~'^-?[0-9]+$'
      and coalesce(b.attributes->>'Z_LEVEL',b.attributes->>'ELEMENTLEV','')~'^-?[0-9]+$'
      and coalesce(a.attributes->>'Z_LEVEL',a.attributes->>'ELEMENTLEV')::integer
        <>coalesce(b.attributes->>'Z_LEVEL',b.attributes->>'ELEMENTLEV')::integer
    )
  ), directed_edges as (
    select left_id as from_id,right_id as to_id from endpoint_edges
    union all
    select right_id,left_id from endpoint_edges
  ), component_walk(root_id,member_id) as (
    select roadway_inventory_id,roadway_inventory_id from valid_segments
    union
    select w.root_id,e.to_id
    from component_walk w join directed_edges e on e.from_id=w.member_id
  ), component_labels as (
    select member_id,min(root_id) as component_seed
    from component_walk group by member_id
  ), components as (
    select s.*,
      dense_rank() over(
        partition by s.county_code,s.nlf_id order by l.component_seed
      )::integer as component_number,
      l.component_seed
    from valid_segments s
    join component_labels l on l.member_id=s.roadway_inventory_id
  ), missing_geometry as (
    select c.*,null::integer as component_number,c.roadway_inventory_id as component_seed
    from public.brinesearch_odot_road_catalog c
    join public.brinesearch_road_graph_counties gc
      on gc.state_code='OH' and gc.source_county_code=c.county_code and gc.active
    where c.source_active and c.nlf_id is not null and (
        c.geom is null or extensions.st_isempty(c.geom) or not extensions.st_isvalid(c.geom)
        or not extensions.st_issimple(c.geom) or extensions.st_dimension(c.geom)<>1
        or not extensions.st_coveredby(c.geom,extensions.st_makeenvelope(-180,-90,180,90,4326))
      )
      and (v_county is null or c.county_code=v_county)
  ), unassigned_source_records as (
    select c.*,null::integer as component_number,c.roadway_inventory_id as component_seed
    from public.brinesearch_odot_road_catalog c
    join public.brinesearch_road_graph_counties gc
      on gc.state_code='OH' and gc.source_county_code=c.county_code and gc.active
    where c.source_active and c.nlf_id is null
      and (v_county is null or c.county_code=v_county)
  ), all_segments as (
    select * from components
    union all select * from missing_geometry
    union all select * from unassigned_source_records
  ), component_counts as (
    select county_code,nlf_id,count(distinct component_seed)::integer as component_count
    from all_segments group by county_code,nlf_id
  )
  select x.*,
    case when x.nlf_id is null then 'OH:ODOT:UNASSIGNED:'||x.roadway_inventory_id
      when cc.component_count=1 then 'OH:ODOT:NLF:'||x.nlf_id
      else 'OH:ODOT:NLF:'||x.nlf_id||':COMP:'||x.component_seed end as component_identity_key,
    private_verification.brinesearch_issue97_uuid(
      case when x.nlf_id is null then 'OH:ODOT:UNASSIGNED:'||x.roadway_inventory_id
        when cc.component_count=1 then 'OH:ODOT:NLF:'||x.nlf_id
        else 'OH:ODOT:NLF:'||x.nlf_id||':COMP:'||x.component_seed end
    ) as component_identity_id
  from all_segments x join component_counts cc
    on cc.county_code=x.county_code and cc.nlf_id is not distinct from x.nlf_id;
  create index tmp_issue97_oh_component_segments_identity_idx
    on tmp_issue97_oh_component_segments(component_identity_id);
  create index tmp_issue97_oh_component_segments_record_idx
    on tmp_issue97_oh_component_segments(roadway_inventory_id);

  with component_names as (
    select component_identity_id,official_name,count(*) as uses
    from tmp_issue97_oh_component_segments
    where nullif(pg_catalog.btrim(official_name),'') is not null
    group by component_identity_id,official_name
  ), preferred as (
    select distinct on(component_identity_id) component_identity_id,official_name
    from component_names order by component_identity_id,uses desc,official_name
  ), component_townships as (
    select s.component_identity_id,
      array_agg(distinct code order by code) filter(where code is not null) as township_codes
    from tmp_issue97_oh_component_segments s
    cross join lateral unnest(array[
      nullif(s.attributes->>'TWP_CODE',''),nullif(s.attributes->>'TWP_CODE_LEFT',''),
      nullif(s.attributes->>'TWP_CODE_RIGHT','')
    ]) code group by s.component_identity_id
  ), component_municipalities as (
    select s.component_identity_id,
      array_agg(distinct code order by code) filter(where code is not null) as municipality_codes
    from tmp_issue97_oh_component_segments s
    cross join lateral unnest(array[
      nullif(s.attributes->>'MUNI_CODE',''),nullif(s.attributes->>'MUNI_CODE_LEFT',''),
      nullif(s.attributes->>'MUNI_CODE_RIGHT','')
    ]) code group by s.component_identity_id
  ), source_rows as (
    select
      s.component_identity_id,s.component_identity_key,s.nlf_id,s.county_code,gc.county_name,
      s.component_seed,min(s.ctl_begin) as component_ctl_begin,max(s.ctl_end) as component_ctl_end,
      (array_agg(s.route_type order by s.ctl_begin,s.roadway_inventory_id))[1] as route_type,
      (array_agg(s.route_number order by s.ctl_begin,s.roadway_inventory_id))[1] as route_number,
      (array_agg(s.route_suffix order by s.ctl_begin,s.roadway_inventory_id))[1] as route_suffix,
      (array_agg(s.route_extension_code order by s.ctl_begin,s.roadway_inventory_id))[1] as route_extension,
      (array_agg(s.jurisdiction_code order by s.ctl_begin,s.roadway_inventory_id))[1] as jurisdiction_code,
      bool_or(coalesce(s.truck_route_indicator,'N')='Y') as official_truck_route,
      case when count(distinct nullif(pg_catalog.concat_ws('/',
        nullif(s.surface_type_left,''),nullif(s.surface_type_right,'')),'') )=1
        then min(nullif(pg_catalog.concat_ws('/',
          nullif(s.surface_type_left,''),nullif(s.surface_type_right,'')),'') ) end as surface,
      coalesce(p.official_name,s.nlf_id,'ODOT source segment '||s.component_seed) as display_name,
      array_agg(distinct s.roadway_inventory_id::text order by s.roadway_inventory_id::text) as source_record_ids,
      coalesce(t.township_codes,'{}'::text[]) as township_codes,
      coalesce(m.municipality_codes,'{}'::text[]) as municipality_codes,
      pg_catalog.md5(pg_catalog.string_agg(
        s.roadway_inventory_id||':'||pg_catalog.md5(s.attributes::text)||':'||
        coalesce(pg_catalog.md5(extensions.st_asewkb(s.geom)::text),'no-geometry'),
        ',' order by s.roadway_inventory_id
      )) as digest,
      max(case when (s.attributes->>'LAST_MODIFIED_DATE') ~ '^[0-9]+$'
        then pg_catalog.to_timestamp((s.attributes->>'LAST_MODIFIED_DATE')::numeric/1000.0) end) as source_timestamp,
      count(*)::integer as segment_count,count(*) filter(where s.geom is not null)::integer as geometry_segment_count
    from tmp_issue97_oh_component_segments s
    join public.brinesearch_road_graph_counties gc
      on gc.state_code='OH' and gc.source_county_code=s.county_code
    left join preferred p on p.component_identity_id=s.component_identity_id
    left join component_townships t on t.component_identity_id=s.component_identity_id
    left join component_municipalities m on m.component_identity_id=s.component_identity_id
    group by s.component_identity_id,s.component_identity_key,s.nlf_id,s.county_code,
      gc.county_name,s.component_seed,p.official_name,t.township_codes,m.municipality_codes
  )
  insert into public.brinesearch_authoritative_road_identities(
    id,dataset_id,source_identity_key,state_code,county_code,county_name,
    township,municipality,route_system,route_number,route_suffix,route_extension,display_name,normalized_name,
    road_class,public_access_status,drivable_status,maintainer,surface,truck_status,source_record_ids,
    attributes,source_digest,source_timestamp,active,last_seen_at
  )
  select
    s.component_identity_id,v_dataset,s.component_identity_key,'OH',s.county_code,s.county_name,
    case when pg_catalog.cardinality(s.township_codes)=1 then
      pg_catalog.initcap(pg_catalog.replace(pg_catalog.split_part(s.township_codes[1],'-',2),'_',' ')) end,
    case when pg_catalog.cardinality(s.municipality_codes)=1 then s.municipality_codes[1] end,
    s.route_type,nullif(pg_catalog.ltrim(coalesce(s.route_number,''),'0'),''),nullif(s.route_suffix,'*'),
    nullif(s.route_extension,'*'),s.display_name,
    pg_catalog.regexp_replace(pg_catalog.lower(s.display_name),'[^a-z0-9]+',' ','g'),
    case s.route_type when 'IR' then 'interstate' when 'US' then 'us_route'
      when 'SR' then 'state_route' when 'CR' then 'county' when 'TR' then 'township'
      when 'MR' then 'local' when 'RA' then 'ramp' when 'BK' then 'trail' else 'other' end,
    case when s.nlf_id is null then 'held'
      when s.route_type='BK' then 'held' when s.jurisdiction_code='P' then 'private'
      when s.jurisdiction_code in ('S','C','T','M','F') then 'public' else 'held' end,
    case when s.nlf_id is null then 'held'
      when s.geometry_segment_count=0 then 'held' when s.route_type='BK' then 'non_drivable'
      when s.route_type in ('IR','US','SR','CR','TR','MR','RA')
        and s.jurisdiction_code in ('S','C','T','M','F','P') then 'drivable' else 'held' end,
    case s.jurisdiction_code when 'S' then 'Ohio Department of Transportation'
      when 'C' then 'County' when 'T' then 'Township' when 'M' then 'Municipality'
      when 'F' then 'Federal' when 'P' then 'Private' else 'Unknown' end,
    s.surface,case when s.official_truck_route then 'official_truck_route' end,s.source_record_ids,
    pg_catalog.jsonb_build_object(
      'nlf_id',s.nlf_id,'component_seed',s.component_seed,
      'component_ctl_begin',s.component_ctl_begin,'component_ctl_end',s.component_ctl_end,
      'segment_count',s.segment_count,'geometry_segment_count',s.geometry_segment_count,
      'township_codes',to_jsonb(s.township_codes),'municipality_codes',to_jsonb(s.municipality_codes),
      'jurisdiction_code',s.jurisdiction_code,
      'component_method','jurisdiction and route-type partition; matching CTL endpoints within 0.75m, or exact endpoints within 0.03m when measures are absent; names excluded',
      'held_reason',case when s.nlf_id is null then 'missing authoritative NLF identity' end,
      'source_table','public.brinesearch_odot_road_catalog'
    ),s.digest,s.source_timestamp,true,now()
  from source_rows s
  on conflict(source_identity_key) do update set
    county_code=excluded.county_code,county_name=excluded.county_name,
    township=excluded.township,municipality=excluded.municipality,
    route_system=excluded.route_system,route_number=excluded.route_number,
    route_suffix=excluded.route_suffix,route_extension=excluded.route_extension,
    display_name=excluded.display_name,normalized_name=excluded.normalized_name,
    road_class=excluded.road_class,public_access_status=excluded.public_access_status,
    drivable_status=excluded.drivable_status,maintainer=excluded.maintainer,
    surface=excluded.surface,truck_status=excluded.truck_status,
    source_record_ids=excluded.source_record_ids,
    attributes=excluded.attributes,source_digest=excluded.source_digest,
    source_timestamp=excluded.source_timestamp,active=true,last_seen_at=now();
  get diagnostics v_identity_count=row_count;

  -- A source segment may never participate in two active authoritative identities.
  -- Retire the prior county assignment set before atomically publishing this
  -- deterministic component generation so the partial unique index cannot be
  -- bypassed by a changed component partition.
  update public.brinesearch_authoritative_segment_identity_assignments a
  set active=false,updated_at=now()
  where a.dataset_id=v_dataset and a.active
    and exists(select 1 from public.brinesearch_odot_road_catalog c
      where 'OH:ODOT:SEGMENT:'||c.roadway_inventory_id=a.source_segment_key
        and (v_county is null or c.county_code=v_county));

  insert into public.brinesearch_authoritative_segment_identity_assignments(
    dataset_id,source_segment_key,identity_id,assignment_method,evidence,source_digest,active,updated_at
  )
  select v_dataset,'OH:ODOT:SEGMENT:'||s.roadway_inventory_id,s.component_identity_id,
    'connected_component',pg_catalog.jsonb_build_object(
      'nlf_id',s.nlf_id,'component_seed',s.component_seed,'county_code',s.county_code,
      'method','jurisdiction and route-type partition; matching CTL endpoints within 0.75m, or exact endpoints within 0.03m when measures are absent',
      'names_used',false,'jurisdiction_code',s.jurisdiction_code,'route_type',s.route_type
    ),pg_catalog.md5(s.attributes::text||coalesce(extensions.st_asewkb(s.geom)::text,'')),true,now()
  from tmp_issue97_oh_component_segments s
  on conflict(dataset_id,source_segment_key,identity_id) do update set
    assignment_method=excluded.assignment_method,evidence=excluded.evidence,
    source_digest=excluded.source_digest,active=true,updated_at=now();
  get diagnostics v_assignment_count=row_count;

  insert into public.brinesearch_authoritative_road_names(
    identity_id,source_dataset_id,source_record_id,name_type,road_name,normalized_name,
    source_segment_key,from_measure,to_measure,provenance,active,last_seen_at
  )
  select s.component_identity_id,v_dataset,s.roadway_inventory_id::text,'official',s.official_name,
    pg_catalog.regexp_replace(pg_catalog.lower(s.official_name),'[^a-z0-9]+',' ','g'),
    'OH:ODOT:SEGMENT:'||s.roadway_inventory_id,s.ctl_begin,s.ctl_end,
    pg_catalog.jsonb_build_object(
      'nlf_id',s.nlf_id,'component_seed',s.component_seed,'objectid',s.objectid,
      'township_codes',pg_catalog.jsonb_build_array(
        s.attributes->>'TWP_CODE',s.attributes->>'TWP_CODE_LEFT',s.attributes->>'TWP_CODE_RIGHT'
      ),'municipality_codes',pg_catalog.jsonb_build_array(
        s.attributes->>'MUNI_CODE',s.attributes->>'MUNI_CODE_LEFT',s.attributes->>'MUNI_CODE_RIGHT'
      ),
      'source','ODOT TIMS Road Inventory'
    ),true,now()
  from tmp_issue97_oh_component_segments s
  where nullif(pg_catalog.btrim(s.official_name),'') is not null
  on conflict(identity_id,source_dataset_id,source_record_id,name_type,road_name) do update set
    normalized_name=excluded.normalized_name,source_segment_key=excluded.source_segment_key,
    from_measure=excluded.from_measure,to_measure=excluded.to_measure,
    provenance=excluded.provenance,active=true,last_seen_at=now(),updated_at=now();
  get diagnostics v_name_count=row_count;

  update public.brinesearch_authoritative_road_names n set active=false,updated_at=now()
  where n.source_dataset_id=v_dataset and n.active
    and exists(select 1 from public.brinesearch_authoritative_road_identities i
      where i.id=n.identity_id and i.state_code='OH' and (v_county is null or i.county_code=v_county))
    and not exists(select 1 from tmp_issue97_oh_component_segments s
      where s.component_identity_id=n.identity_id and s.roadway_inventory_id::text=n.source_record_id
        and s.official_name=n.road_name);
  update public.brinesearch_authoritative_road_identities i set active=false,last_seen_at=now()
  where i.dataset_id=v_dataset and i.state_code='OH' and (v_county is null or i.county_code=v_county)
    and i.active and not exists(select 1 from tmp_issue97_oh_component_segments s
      where s.component_identity_id=i.id);

  return pg_catalog.jsonb_build_object(
    'source','oh_odot_tims_road_inventory','county_code',v_county,
    'component_identities_touched',v_identity_count,'names_touched',v_name_count,
    'segment_assignments_touched',v_assignment_count,
    'identity_rule','NLF plus jurisdiction, route type, and physical connected component'
  );
end
$$;

revoke all on function public.brinesearch_issue97_refresh_oh_identities(text)
from public,anon,authenticated,service_role;

create or replace view public.brinesearch_authoritative_road_segments
with (security_invoker=true,security_barrier=true)
as
select
  private_verification.brinesearch_issue97_uuid('OH:ODOT:SEGMENT:'||c.roadway_inventory_id) as id,
  private_verification.brinesearch_issue97_uuid('dataset:oh_odot_tims_road_inventory') as dataset_id,
  a.identity_id,'OH:ODOT:SEGMENT:'||c.roadway_inventory_id as source_segment_key,
  c.roadway_inventory_id::text as source_record_id,'OH'::text as state_code,
  gc.county_code,gc.county_name,
  nullif(coalesce(c.attributes->>'TWP_CODE',c.attributes->>'TWP_CODE_LEFT',
    c.attributes->>'TWP_CODE_RIGHT',c.attributes->>'TOWNSHIP_CD'),'') as township,
  nullif(coalesce(c.attributes->>'MUNI_CODE',c.attributes->>'MUNI_CODE_LEFT',
    c.attributes->>'MUNI_CODE_RIGHT',c.attributes->>'MUNICIPAL_CD'),'') as municipality,
  c.ctl_begin::numeric as from_measure,c.ctl_end::numeric as to_measure,
  c.direction_of_travel_code as route_direction,
  case when coalesce(c.attributes->>'Z_LEVEL',c.attributes->>'ELEMENTLEV','')~'^-?[0-9]+$'
    then coalesce(c.attributes->>'Z_LEVEL',c.attributes->>'ELEMENTLEV')::integer end as z_level,
  case when pg_catalog.upper(coalesce(c.attributes->>'BRIDGE_IND','')) in ('Y','1','TRUE')
      or nullif(pg_catalog.btrim(coalesce(c.attributes->>'BRIDGE_FILE_NBR','')),'') is not null
      or nullif(pg_catalog.btrim(coalesce(c.attributes->>'STRUCTURE_FILE_NBR','')),'') is not null
    then 'bridge'
    when pg_catalog.upper(coalesce(c.attributes->>'BRIDGE_IND','')) in ('N','0','FALSE')
      and nullif(pg_catalog.btrim(coalesce(c.attributes->>'BRIDGE_FILE_NBR','')),'') is null
      and nullif(pg_catalog.btrim(coalesce(c.attributes->>'STRUCTURE_FILE_NBR','')),'') is null
    then 'surface' end as bridge_status,
  case when pg_catalog.upper(coalesce(c.attributes->>'TUNNEL_IND','')) in ('Y','1','TRUE') then 'tunnel'
    when pg_catalog.upper(coalesce(c.attributes->>'TUNNEL_IND','')) in ('N','0','FALSE') then 'surface' end as tunnel_status,
  case when c.route_type='BK' then 'held'
    when c.jurisdiction_code='P' then 'private'
    when c.route_type in ('IR','US','SR','CR','TR','MR','RA')
      and c.jurisdiction_code in ('S','C','T','M','F') then 'public' else 'held' end::text as public_access_status,
  case when c.route_type='BK' then 'non_drivable'
    when c.route_type in ('IR','US','SR','CR','TR','MR','RA')
      and c.jurisdiction_code in ('S','C','T','M','F','P') then 'drivable' else 'held' end::text as drivable_status,
  c.geom,c.attributes,
  pg_catalog.md5(c.attributes::text||coalesce(extensions.st_asewkb(c.geom)::text,'')) as source_digest,
  case when (c.attributes->>'LAST_MODIFIED_DATE') ~ '^[0-9]+$'
    then pg_catalog.to_timestamp((c.attributes->>'LAST_MODIFIED_DATE')::numeric/1000.0) end as source_timestamp,
  true as active,c.fetched_at
from public.brinesearch_odot_road_catalog c
join public.brinesearch_road_graph_counties gc
  on gc.state_code='OH' and gc.source_county_code=c.county_code and gc.active
join public.brinesearch_authoritative_segment_identity_assignments a
  on a.dataset_id=private_verification.brinesearch_issue97_uuid('dataset:oh_odot_tims_road_inventory')
 and a.source_segment_key='OH:ODOT:SEGMENT:'||c.roadway_inventory_id and a.active
where c.geom is not null and c.source_active
  and not extensions.st_isempty(c.geom) and extensions.st_isvalid(c.geom)
  and extensions.st_issimple(c.geom) and extensions.st_dimension(c.geom)=1
  and extensions.st_coveredby(c.geom,extensions.st_makeenvelope(-180,-90,180,90,4326))
union all
select s.id,s.dataset_id,s.identity_id,s.source_segment_key,s.source_record_id,
  s.state_code,s.county_code,s.county_name,s.township,s.municipality,
  s.from_measure,s.to_measure,s.route_direction,s.z_level,s.bridge_status,
  s.tunnel_status,s.public_access_status,s.drivable_status,s.geom,s.attributes,
  s.source_digest,s.source_timestamp,s.active,s.fetched_at
from public.brinesearch_authoritative_external_road_segments s;

revoke all on public.brinesearch_authoritative_road_segments from public,anon,authenticated,service_role;

comment on view public.brinesearch_authoritative_road_segments is
  'Issue #97 effective normalized registry. Ohio reuses ODOT rows and an exact segment-to-connected-component assignment; WV/PA use the external landing table.';
