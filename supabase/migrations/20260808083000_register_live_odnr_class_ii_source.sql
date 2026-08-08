insert into private_verification.public_data_sources
(source_key,agency,source_name,source_type,state,official,base_url,active,refresh_strategy,rate_limit_notes,health_status,source_metadata)
values(
  'oh_odnr_live_class_ii_disposal_wells',
  'Ohio Department of Natural Resources - DOGRM',
  'ODNR Live Class II Disposal Wells Brine/Waste',
  'official_feature_layer_filter',
  'Ohio',true,
  'https://services5.arcgis.com/ajRlmtxbNBjZggOT/arcgis/rest/services/Oil_And_Gas_Wells/FeatureServer/3',
  true,
  'OBJECTID pagination filtered by WELL_TYP=SW_R; 25-50 records per checkpoint',
  'Preserve inactive/history; exact API is the primary saved-record match.',
  'not_checked',
  jsonb_build_object(
    'service_item_id','e03ec46046af49c49d879ab9be07f980',
    'layer_id',3,
    'filter','WELL_TYP = SW_R',
    'well_type_description','Class II Disposal Wells Brine/Waste',
    'viewer_item_id','5fd9c17bc933417d9bd8d7c1dff404aa'
  )
)
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
  source_metadata=private_verification.public_data_sources.source_metadata||excluded.source_metadata,
  updated_at=now();
