-- Separate the August 4 MapServer snapshot from the newer hosted ODNR viewer.
-- No live pad, direction, road-manager, mileage, or navigation data is changed.
alter table private_verification.public_data_sources
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;

update private_verification.public_data_sources
set source_key='oh_odnr_wellpads_snapshot_20260804',
    source_name='ODNR Well Pads MapServer snapshot (2026-08-04)',
    source_type='official_gis_snapshot',
    base_url='https://gis2.ohiodnr.gov/ArcGIS/rest/services/DOG_Services/WellPads/MapServer/1',
    refresh_strategy='historical_snapshot_no_refresh',
    health_status='historical_snapshot_complete',
    source_metadata=source_metadata || jsonb_build_object(
      'snapshot_date','2026-08-04',
      'staged_feature_count',1008,
      'identity','snapshot OBJECTID',
      'superseded_for_current_refresh_by','oh_odnr_live_wellpads'
    ),
    updated_at=now()
where source_key='oh_odnr_wellpads';

insert into private_verification.public_data_sources
  (source_key,agency,source_name,source_type,state,official,base_url,active,refresh_strategy,rate_limit_notes,health_status,source_metadata)
values
  ('oh_odnr_live_wellpads','Ohio Department of Natural Resources - DOGRM','ODNR Live Well Pad Boundaries','official_feature_layer','Ohio',true,
   'https://services5.arcgis.com/ajRlmtxbNBjZggOT/arcgis/rest/services/Well_Pads/FeatureServer/3',true,
   'OBJECTID pagination, 25-50 features per checkpoint','Respect ArcGIS service limits; cache and resume by OBJECTID.','reachable',
   jsonb_build_object('service_item_id','4d80a28b571340b9934d73bb8328e568','layer_id',3,'viewer_item_id','5fd9c17bc933417d9bd8d7c1dff404aa','webmap_item_id','3784ce8d00c94f8f8d603164700de465','identity','service OBJECTID','discovered_from','Ohio Oil & Gas Wells Viewer')),
  ('oh_odnr_live_wells','Ohio Department of Natural Resources - DOGRM','ODNR Live Oil and Gas Wells','official_feature_layer','Ohio',true,
   'https://services5.arcgis.com/ajRlmtxbNBjZggOT/arcgis/rest/services/Oil_And_Gas_Wells/FeatureServer/3',true,
   'OBJECTID/API pagination with operator, county, status, API, and date filters','242k+ records; run controlled filters and checkpoints rather than one bulk request.','reachable',
   jsonb_build_object('service_item_id','e03ec46046af49c49d879ab9be07f980','layer_id',3,'viewer_item_id','5fd9c17bc933417d9bd8d7c1dff404aa','webmap_item_id','3784ce8d00c94f8f8d603164700de465','identity','API_NO with OBJECTID version evidence','discovered_from','Ohio Oil & Gas Wells Viewer')),
  ('oh_odnr_live_wellbores','Ohio Department of Natural Resources - DOGRM','ODNR Live Oil and Gas Wellbores','official_feature_layer','Ohio',true,
   'https://services5.arcgis.com/ajRlmtxbNBjZggOT/arcgis/rest/services/Oil_and_Gas_Well_Bores/FeatureServer/0',true,
   'Query only for staged APIs/wells requiring bore geometry','Do not use bore geometry as a driver navigation point.','not_checked',
   jsonb_build_object('layer_id',0,'viewer_item_id','5fd9c17bc933417d9bd8d7c1dff404aa','identity','service OBJECTID','coordinate_role','official wellbore geometry only')),
  ('oh_odnr_live_pad_entry_roads','Ohio Department of Natural Resources - DOGRM','ODNR Live Well Pad Entry Roads','official_feature_layer','Ohio',true,
   'https://services5.arcgis.com/ajRlmtxbNBjZggOT/arcgis/rest/services/Well_Pads/FeatureServer/2',true,
   'Staging-only access evidence; never auto-write directions or Road Manager','Coordination boundary: no route facts, mileage, road matches, or navigation changes.','reachable',
   jsonb_build_object('service_item_id','4d80a28b571340b9934d73bb8328e568','layer_id',2,'viewer_item_id','5fd9c17bc933417d9bd8d7c1dff404aa','identity','service OBJECTID','use','owner review evidence only'))
on conflict(source_key) do update set
  agency=excluded.agency,
  source_name=excluded.source_name,
  source_type=excluded.source_type,
  state=excluded.state,
  official=excluded.official,
  base_url=excluded.base_url,
  active=excluded.active,
  refresh_strategy=excluded.refresh_strategy,
  rate_limit_notes=excluded.rate_limit_notes,
  health_status=excluded.health_status,
  source_metadata=private_verification.public_data_sources.source_metadata || excluded.source_metadata,
  updated_at=now();
