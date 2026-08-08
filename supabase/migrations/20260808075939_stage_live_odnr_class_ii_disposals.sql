create or replace function private_verification.stage_live_odnr_class_ii_disposals_batch(
 p_after_object_id bigint default 0,
 p_limit integer default 50
) returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public,private_verification,extensions
as $fn$
declare
 v_source_id uuid; v_run_id uuid; v_base_url text; v_url text; v_content text; v_http_status integer; v_json jsonb;
 v_batch_count integer; v_last_object_id bigint; v_verified integer; v_new integer; v_duplicates integer;
 v_name_candidates integer; v_api_conflicts integer; v_status_updates integer; v_operator_changes integer; v_location_conflicts integer;
begin
 if p_limit<1 or p_limit>50 then raise exception 'p_limit must be between 1 and 50'; end if;
 select id,base_url into v_source_id,v_base_url from private_verification.public_data_sources where source_key='oh_odnr_live_class_ii_disposal_wells';
 if v_source_id is null then raise exception 'Class II disposal source not registered'; end if;
 v_url:=v_base_url||'/query?where='||extensions.urlencode(('WELL_TYP=''SW_R'' AND OBJECTID>'||coalesce(p_after_object_id,0))::varchar)||
 '&outFields=OBJECTID,API_NO,MAPSYMBOL_DESCRIPTION,WELL_STATUS_DESCRIPTION,GIS_STATUS,COUNTY,TOWNSHIP,COMPANY_NAME,LAT83,LONG83,SLANT,PROPOSED_FORMATIONS,WELL_NAME,WELL_NO,TOTAL_DEPTH,PERMIT_ISSUED_DATE,COMP_DATE,PLUG_DATE,PRODFM1,PRODFM2,DEEPEST_FORMATION,WELL_STATUS,OPERATOR,LEASE_NAME,LOCATION_ID,WELL_TYP,PDF_LINK,WL_SYMBOL,OP_PHONE,OP_ADDRESS&returnGeometry=false&orderByFields=OBJECTID&resultRecordCount='||p_limit||'&f=pjson';
 insert into private_verification.public_data_import_runs(source_id,state,import_mode,status,checkpoint,exact_endpoint,exact_query,started_at)
 values(v_source_id,'Ohio','live_class_ii_disposals','running',jsonb_build_object('after_object_id',p_after_object_id,'batch_limit',p_limit),v_base_url||'/query',jsonb_build_object('where','WELL_TYP = SW_R AND OBJECTID > '||p_after_object_id,'limit',p_limit),now()) returning id into v_run_id;
 select (r).status,(r).content into v_http_status,v_content from(select extensions.http_get(v_url)r)q;
 if v_http_status<>200 then raise exception 'ODNR Class II HTTP status %',v_http_status; end if;
 v_json:=v_content::jsonb; if v_json?'error' then raise exception 'ODNR Class II ArcGIS error: %',v_json->'error'; end if;
 create temporary table tmp_live_class_ii on commit drop as
 select (a->>'OBJECTID')::bigint object_id,nullif(regexp_replace(a->>'API_NO','[^0-9]','','g'),'') api,
  nullif(btrim(a->>'MAPSYMBOL_DESCRIPTION'),'') map_symbol_description,nullif(btrim(a->>'WELL_STATUS_DESCRIPTION'),'') well_status_description,
  nullif(btrim(a->>'GIS_STATUS'),'') gis_status,nullif(btrim(a->>'COUNTY'),'') county,nullif(btrim(a->>'TOWNSHIP'),'') township,
  nullif(btrim(a->>'COMPANY_NAME'),'') company_name,nullif(btrim(a->>'OPERATOR'),'') operator_raw,
  nullif(a->>'LAT83','')::double precision latitude,nullif(a->>'LONG83','')::double precision longitude,
  nullif(btrim(a->>'SLANT'),'') slant,nullif(btrim(a->>'PROPOSED_FORMATIONS'),'') proposed_formations,
  nullif(btrim(a->>'WELL_NAME'),'') well_name,nullif(btrim(a->>'WELL_NO'),'') well_number,
  nullif(a->>'TOTAL_DEPTH','')::numeric total_depth,nullif(a->>'PERMIT_ISSUED_DATE','')::double precision permit_ms,
  nullif(a->>'COMP_DATE','')::double precision completion_ms,nullif(a->>'PLUG_DATE','')::double precision plug_ms,
  nullif(btrim(a->>'PRODFM1'),'') formation_1,nullif(btrim(a->>'PRODFM2'),'') formation_2,
  nullif(btrim(a->>'DEEPEST_FORMATION'),'') deepest_formation,nullif(btrim(a->>'WELL_STATUS'),'') status_code,
  nullif(btrim(a->>'LEASE_NAME'),'') lease_name,nullif(btrim(a->>'LOCATION_ID'),'') location_id,
  nullif(btrim(a->>'WELL_TYP'),'') well_type_code,nullif(btrim(a->>'PDF_LINK'),'') pdf_path,
  nullif(btrim(a->>'WL_SYMBOL'),'') map_symbol_code,nullif(btrim(a->>'OP_PHONE'),'') operator_phone,
  nullif(btrim(a->>'OP_ADDRESS'),'') operator_address,a raw_attributes
 from jsonb_array_elements(coalesce(v_json->'features','[]'::jsonb))f,lateral(select f->'attributes'a)s;
 select count(*),max(object_id) into v_batch_count,v_last_object_id from tmp_live_class_ii;
 if v_batch_count=0 then
  update private_verification.public_data_import_runs set status='completed',request_count=1,records_seen=0,records_inserted=0,checkpoint=jsonb_build_object('last_object_id',p_after_object_id,'batch_limit',p_limit),completed_at=now() where id=v_run_id;
  return jsonb_build_object('import_run_id',v_run_id,'records_staged',0,'message','No Class II disposal records returned');
 end if;
 insert into private_verification.public_data_source_records
 (source_id,source_record_id,entity_type,state,operator_raw,operator_normalized,official_name,official_status,county,township_or_municipality,latitude,longitude,raw_facts,normalized_facts,source_content_hash,first_seen_at,last_seen_at,last_import_run_id)
 select v_source_id,'OBJECTID:'||w.object_id,'injection','Ohio',coalesce(w.operator_raw,w.company_name),
  regexp_replace(upper(btrim(coalesce(w.operator_raw,w.company_name,''))),'[^A-Z0-9]+',' ','g'),w.well_name,
  coalesce(w.well_status_description,w.gis_status),w.county,w.township,w.latitude,w.longitude,w.raw_attributes,
  jsonb_strip_nulls(jsonb_build_object('source_object_id',w.object_id,'api',w.api,'injection_well_api',w.api,'permit_number',w.api,
   'uic_permit_number_available',false,'injection_class','Class II','well_type_code',w.well_type_code,
   'well_type_description','Class II Disposal Wells Brine/Waste','well_name',w.well_name,'well_number',w.well_number,
   'lease_name',w.lease_name,'operator',coalesce(w.operator_raw,w.company_name),'operator_phone',w.operator_phone,
   'operator_address',w.operator_address,'county',w.county,'township',w.township,'official_status',w.well_status_description,
   'gis_status',w.gis_status,'status_code',w.status_code,'map_symbol_description',w.map_symbol_description,
   'map_symbol_code',w.map_symbol_code,'latitude',w.latitude,'longitude',w.longitude,'slant',w.slant,'total_depth',w.total_depth,
   'permit_approved_at',case when w.permit_ms is null then null else to_jsonb(to_timestamp(w.permit_ms/1000))end,
   'completion_at',case when w.completion_ms is null then null else to_jsonb(to_timestamp(w.completion_ms/1000))end,
   'plugging_at',case when w.plug_ms is null then null else to_jsonb(to_timestamp(w.plug_ms/1000))end,
   'proposed_formations',w.proposed_formations,'injection_formation_1',w.formation_1,'injection_formation_2',w.formation_2,
   'deepest_formation',w.deepest_formation,'source_pdf_path',w.pdf_path,
   'state_injection_sequence',((regexp_match(w.well_name,'(?i)SWIW[[:space:]]*#?[[:space:]]*([0-9]+)'))[1]),
   'operational_priority',case when w.well_status_description='Active Injection' then 'active' when w.well_status_description in('Drilling','Well Drilled','Well Permitted') then 'development' else 'historical_or_inactive' end,
   'source_identity_method','live FeatureServer OBJECTID')),
  md5(jsonb_build_object('object_id',w.object_id,'api',w.api,'well_name',w.well_name,'operator',coalesce(w.operator_raw,w.company_name),'status',w.well_status_description,'county',w.county,'township',w.township,'latitude',w.latitude,'longitude',w.longitude,'depth',w.total_depth,'permit',w.permit_ms,'completion',w.completion_ms,'plug',w.plug_ms)::text),now(),now(),v_run_id
 from tmp_live_class_ii w
 on conflict(source_id,source_record_id) do update set operator_raw=excluded.operator_raw,operator_normalized=excluded.operator_normalized,official_name=excluded.official_name,official_status=excluded.official_status,county=excluded.county,township_or_municipality=excluded.township_or_municipality,latitude=excluded.latitude,longitude=excluded.longitude,raw_facts=excluded.raw_facts,normalized_facts=excluded.normalized_facts,source_content_hash=excluded.source_content_hash,last_seen_at=now(),retired_at=null,last_import_run_id=excluded.last_import_run_id;
 create temporary table tmp_class_ii_geo on commit drop as
 select r.id source_record_uuid,g.county coordinate_county,g.township coordinate_township
 from private_verification.public_data_source_records r left join lateral(
  select b.county,b.township from private_verification.ohio_township_boundaries_20260803 b
  where r.latitude is not null and r.longitude is not null and st_covers(b.geom,st_setsrid(st_makepoint(r.longitude,r.latitude),4326))
  order by b.county,b.township limit 1)g on true where r.last_import_run_id=v_run_id;
 update private_verification.public_data_source_records r set normalized_facts=jsonb_strip_nulls(r.normalized_facts||jsonb_build_object('coordinate_county',g.coordinate_county,'coordinate_township',g.coordinate_township,'geography_method','Ohio township boundary point-in-polygon')) from tmp_class_ii_geo g where r.id=g.source_record_uuid;
 create temporary table tmp_class_ii_saved_matches on commit drop as
 select r.id source_record_uuid,t.pad_id,p.record_type
 from private_verification.public_data_source_records r
 join private_verification.pad_api_tokens_20260803 t on t.api_digits=r.normalized_facts->>'api'
 join public.pads p on p.id=t.pad_id
 where r.last_import_run_id=v_run_id;
 create temporary table tmp_class_ii_saved_summary on commit drop as
 select r.id source_record_uuid,
  count(distinct m.pad_id)filter(where m.record_type='disposal') disposal_count,
  (array_agg(m.pad_id order by m.pad_id::text)filter(where m.record_type='disposal'))[1] selected_disposal_id,
  count(distinct m.pad_id)filter(where m.record_type<>'disposal') non_disposal_count,
  coalesce(jsonb_agg(distinct jsonb_build_object('pad_id',m.pad_id,'record_type',m.record_type,'match_method','exact_api'))filter(where m.pad_id is not null),'[]'::jsonb)matches
 from private_verification.public_data_source_records r left join tmp_class_ii_saved_matches m on m.source_record_uuid=r.id
 where r.last_import_run_id=v_run_id group by r.id;
 create temporary table tmp_class_ii_name_matches on commit drop as
 select distinct r.id source_record_uuid,p.id pad_id
 from private_verification.public_data_source_records r
 join public.pads p on p.record_type='disposal' and upper(coalesce(btrim(p.county),''))=upper(coalesce(btrim(r.county),''))
 cross join lateral regexp_split_to_table(coalesce(p.well_name,''),'[[:space:]]*\|[[:space:]]*')token
 where r.last_import_run_id=v_run_id and private_verification.normalize_identity_words(token)=private_verification.normalize_identity_words(r.official_name);
 create temporary table tmp_class_ii_name_summary on commit drop as
 select r.id source_record_uuid,count(distinct n.pad_id)name_count,(array_agg(n.pad_id order by n.pad_id::text)filter(where n.pad_id is not null))[1]selected_name_pad_id,
  coalesce(jsonb_agg(distinct jsonb_build_object('pad_id',n.pad_id,'match_method','exact_official_well_name_county'))filter(where n.pad_id is not null),'[]'::jsonb)matches
 from private_verification.public_data_source_records r left join tmp_class_ii_name_matches n on n.source_record_uuid=r.id where r.last_import_run_id=v_run_id group by r.id;
 insert into private_verification.public_data_match_candidates(source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
 select s.source_record_uuid,s.selected_disposal_id,'VERIFIED_EXISTING_RECORD','exact_injection_api_to_saved_disposal',1.0,jsonb_build_array(jsonb_build_object('kind','exact_api','value',r.normalized_facts->'api'),jsonb_build_object('kind','official_status','value',r.official_status)),'[]'::jsonb,'confirmed',now(),now()
 from tmp_class_ii_saved_summary s join private_verification.public_data_source_records r on r.id=s.source_record_uuid where s.disposal_count=1
 on conflict(source_record_id,(coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),result_category) do update set evidence=excluded.evidence,confidence=excluded.confidence,review_status='confirmed',updated_at=now();
 insert into private_verification.public_data_match_candidates(source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
 select s.source_record_uuid,null,'POSSIBLE_DUPLICATE','exact_injection_api_attached_to_multiple_disposals',0.50,jsonb_build_array(jsonb_build_object('kind','exact_disposal_api_match_count','value',s.disposal_count)),s.matches,'needs_owner_review',now(),now()
 from tmp_class_ii_saved_summary s where s.disposal_count>1
 on conflict(source_record_id,(coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),result_category) do update set evidence=excluded.evidence,conflicts=excluded.conflicts,review_status='needs_owner_review',updated_at=now();
 insert into private_verification.public_data_match_candidates(source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
 select r.id,m.pad_id,'API_CONFLICT','injection_api_attached_to_non_disposal_record',1.0,jsonb_build_array(jsonb_build_object('kind','official_injection_api','value',r.normalized_facts->'api')),
  jsonb_build_array(jsonb_build_object('field','record_type','saved_pad_id',m.pad_id,'saved_record_type',m.record_type,'official_entity_type','injection')),'needs_owner_review',now(),now()
 from private_verification.public_data_source_records r join tmp_class_ii_saved_matches m on m.source_record_uuid=r.id and m.record_type<>'disposal' where r.last_import_run_id=v_run_id
 on conflict(source_record_id,(coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),result_category) do update set evidence=excluded.evidence,conflicts=excluded.conflicts,review_status='needs_owner_review',updated_at=now();
 insert into private_verification.public_data_match_candidates(source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
 select s.source_record_uuid,n.selected_name_pad_id,'NEEDS_OWNER_REVIEW','exact_official_well_name_and_county',0.90,jsonb_build_array(jsonb_build_object('kind','exact_official_well_name','value',r.official_name),jsonb_build_object('kind','county','value',r.county)),'[]'::jsonb,'needs_owner_review',now(),now()
 from tmp_class_ii_saved_summary s join tmp_class_ii_name_summary n on n.source_record_uuid=s.source_record_uuid join private_verification.public_data_source_records r on r.id=s.source_record_uuid
 where s.disposal_count=0 and n.name_count=1
 on conflict(source_record_id,(coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),result_category) do update set evidence=excluded.evidence,confidence=excluded.confidence,review_status='needs_owner_review',updated_at=now();
 insert into private_verification.public_data_match_candidates(source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
 select s.source_record_uuid,null,'NEW_DISPOSAL_CANDIDATE','official_class_ii_well_no_exact_saved_disposal_api',0.70,jsonb_build_array(jsonb_build_object('kind','official_injection_api','value',r.normalized_facts->'api'),jsonb_build_object('kind','official_status','value',r.official_status),jsonb_build_object('kind','operational_priority','value',r.normalized_facts->'operational_priority'),jsonb_build_object('kind','exact_name_candidate_count','value',n.name_count)),case when n.name_count>1 then n.matches else '[]'::jsonb end,'needs_owner_review',now(),now()
 from tmp_class_ii_saved_summary s join tmp_class_ii_name_summary n on n.source_record_uuid=s.source_record_uuid join private_verification.public_data_source_records r on r.id=s.source_record_uuid where s.disposal_count=0 and n.name_count<>1
 on conflict(source_record_id,(coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),result_category) do update set evidence=excluded.evidence,conflicts=excluded.conflicts,review_status='needs_owner_review',updated_at=now();
 create temporary table tmp_class_ii_history on commit drop as
 select r.id source_record_uuid,h.operator historical_operator,h.well_status historical_status
 from private_verification.public_data_source_records r join private_verification.ohio_injection_20260803 h on h.api=r.normalized_facts->>'api' where r.last_import_run_id=v_run_id;
 insert into private_verification.public_data_match_candidates(source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
 select r.id,case when s.disposal_count=1 then s.selected_disposal_id when n.name_count=1 then n.selected_name_pad_id else null end,'OPERATOR_CHANGE_OR_ALIAS','same_injection_api_operator_changed',1.0,jsonb_build_array(jsonb_build_object('kind','previous_official_operator','value',h.historical_operator),jsonb_build_object('kind','current_official_operator','value',r.operator_raw),jsonb_build_object('kind','api','value',r.normalized_facts->'api')),'[]'::jsonb,'needs_owner_review',now(),now()
 from private_verification.public_data_source_records r join tmp_class_ii_history h on h.source_record_uuid=r.id join tmp_class_ii_saved_summary s on s.source_record_uuid=r.id join tmp_class_ii_name_summary n on n.source_record_uuid=r.id
 where private_verification.normalize_identity_text(r.operator_raw)<>private_verification.normalize_identity_text(h.historical_operator)
 on conflict(source_record_id,(coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),result_category) do update set evidence=excluded.evidence,confidence=excluded.confidence,review_status='needs_owner_review',updated_at=now();
 insert into private_verification.public_data_match_candidates(source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
 select r.id,case when s.disposal_count=1 then s.selected_disposal_id when n.name_count=1 then n.selected_name_pad_id else null end,'STATUS_UPDATE','current_class_ii_status_differs_from_saved_or_snapshot',1.0,jsonb_build_array(jsonb_build_object('kind','previous_official_status','value',h.historical_status),jsonb_build_object('kind','saved_operating_status','value',p.operating_status),jsonb_build_object('kind','current_official_status','value',r.official_status),jsonb_build_object('kind','api','value',r.normalized_facts->'api')),'[]'::jsonb,'needs_owner_review',now(),now()
 from private_verification.public_data_source_records r join tmp_class_ii_history h on h.source_record_uuid=r.id join tmp_class_ii_saved_summary s on s.source_record_uuid=r.id join tmp_class_ii_name_summary n on n.source_record_uuid=r.id left join public.pads p on p.id=case when s.disposal_count=1 then s.selected_disposal_id when n.name_count=1 then n.selected_name_pad_id else null end
 where private_verification.normalize_identity_words(r.official_status)<>private_verification.normalize_identity_words(h.historical_status) or (p.id is not null and private_verification.normalize_identity_words(r.official_status)<>private_verification.normalize_identity_words(p.operating_status))
 on conflict(source_record_id,(coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),result_category) do update set evidence=excluded.evidence,confidence=excluded.confidence,review_status='needs_owner_review',updated_at=now();
 insert into private_verification.public_data_match_candidates(source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
 select r.id,case when s.disposal_count=1 then s.selected_disposal_id when n.name_count=1 then n.selected_name_pad_id else null end,'LOCATION_CONFLICT','source_county_conflicts_with_official_boundary',0.99,jsonb_build_array(jsonb_build_object('kind','source_county','value',r.county),jsonb_build_object('kind','coordinate_county','value',g.coordinate_county),jsonb_build_object('kind','coordinate_township','value',g.coordinate_township),jsonb_build_object('kind','coordinates','value',jsonb_build_array(r.latitude,r.longitude))),jsonb_build_array(jsonb_build_object('field','county','source_value',r.county,'coordinate_boundary_value',g.coordinate_county)),'needs_owner_review',now(),now()
 from private_verification.public_data_source_records r join tmp_class_ii_geo g on g.source_record_uuid=r.id join tmp_class_ii_saved_summary s on s.source_record_uuid=r.id join tmp_class_ii_name_summary n on n.source_record_uuid=r.id where g.coordinate_county is not null and r.county is not null and upper(btrim(r.county))<>upper(btrim(g.coordinate_county))
 on conflict(source_record_id,(coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),result_category) do update set evidence=excluded.evidence,conflicts=excluded.conflicts,review_status='needs_owner_review',updated_at=now();
 select count(*) into v_verified from tmp_class_ii_saved_summary where disposal_count=1;
 select count(*) into v_new from private_verification.public_data_match_candidates where source_record_id in(select id from private_verification.public_data_source_records where last_import_run_id=v_run_id) and result_category='NEW_DISPOSAL_CANDIDATE';
 select count(*) into v_duplicates from private_verification.public_data_match_candidates where source_record_id in(select id from private_verification.public_data_source_records where last_import_run_id=v_run_id) and result_category='POSSIBLE_DUPLICATE';
 select count(*) into v_name_candidates from private_verification.public_data_match_candidates where source_record_id in(select id from private_verification.public_data_source_records where last_import_run_id=v_run_id) and result_category='NEEDS_OWNER_REVIEW';
 select count(*) into v_api_conflicts from private_verification.public_data_match_candidates where source_record_id in(select id from private_verification.public_data_source_records where last_import_run_id=v_run_id) and result_category='API_CONFLICT';
 select count(*) into v_status_updates from private_verification.public_data_match_candidates where source_record_id in(select id from private_verification.public_data_source_records where last_import_run_id=v_run_id) and result_category='STATUS_UPDATE';
 select count(*) into v_operator_changes from private_verification.public_data_match_candidates where source_record_id in(select id from private_verification.public_data_source_records where last_import_run_id=v_run_id) and result_category='OPERATOR_CHANGE_OR_ALIAS';
 select count(*) into v_location_conflicts from private_verification.public_data_match_candidates where source_record_id in(select id from private_verification.public_data_source_records where last_import_run_id=v_run_id) and result_category='LOCATION_CONFLICT';
 update private_verification.public_data_import_runs set status='completed',request_count=1,records_seen=v_batch_count,records_inserted=v_batch_count,checkpoint=jsonb_build_object('last_object_id',v_last_object_id,'batch_limit',p_limit,'exceeded_transfer_limit',coalesce((v_json->>'exceededTransferLimit')::boolean,false)),completed_at=now() where id=v_run_id;
 update private_verification.public_data_sources set last_attempt_at=now(),last_success_at=now(),health_status='healthy',source_metadata=source_metadata||jsonb_build_object('last_object_id_staged',v_last_object_id,'last_batch_count',v_batch_count),updated_at=now() where id=v_source_id;
 return jsonb_build_object('import_run_id',v_run_id,'records_staged',v_batch_count,'last_object_id',v_last_object_id,'verified_existing_disposals',v_verified,'new_disposal_candidates',v_new,'possible_duplicates',v_duplicates,'exact_name_review_candidates',v_name_candidates,'api_conflicts',v_api_conflicts,'status_updates',v_status_updates,'operator_changes',v_operator_changes,'location_conflicts',v_location_conflicts);
exception when others then
 if v_run_id is not null then update private_verification.public_data_import_runs set status='failed',request_count=1,errors=errors||jsonb_build_array(jsonb_build_object('message',sqlerrm)),completed_at=now() where id=v_run_id; end if;
 raise;
end
$fn$;

revoke all on function private_verification.stage_live_odnr_class_ii_disposals_batch(bigint,integer)
  from public,anon,authenticated;
grant execute on function private_verification.stage_live_odnr_class_ii_disposals_batch(bigint,integer)
  to service_role;
