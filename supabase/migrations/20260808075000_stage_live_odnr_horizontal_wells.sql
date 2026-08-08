alter table private_verification.public_data_candidate_well_links
  add column if not exists well_public_data_source_record_id uuid
  references private_verification.public_data_source_records(id) on delete cascade;
create index if not exists public_data_candidate_well_links_well_source_idx
  on private_verification.public_data_candidate_well_links(well_public_data_source_record_id)
  where well_public_data_source_record_id is not null;

create or replace function private_verification.normalize_identity_words(p_value text)
returns text language sql immutable parallel safe set search_path=pg_catalog
as $$select btrim(regexp_replace(upper(btrim(coalesce(p_value,''))),'[^A-Z0-9]+',' ','g'))$$;

create or replace function private_verification.stage_live_odnr_horizontal_wells_batch(
  p_after_object_id bigint default 0,
  p_limit integer default 50
) returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public,private_verification,extensions
as $fn$
declare
  v_source_id uuid;
  v_live_pad_source_id uuid;
  v_snapshot_pad_source_id uuid;
  v_run_id uuid;
  v_base_url text;
  v_url text;
  v_content text;
  v_http_status integer;
  v_json jsonb;
  v_batch_count integer;
  v_last_object_id bigint;
  v_exact_saved integer;
  v_new_wells integer;
  v_pad_links integer;
  v_operator_changes integer;
  v_status_changes integer;
  v_api_conflicts integer;
begin
  if p_limit<1 or p_limit>50 then raise exception 'p_limit must be between 1 and 50'; end if;
  select id,base_url into v_source_id,v_base_url
  from private_verification.public_data_sources where source_key='oh_odnr_live_wells';
  select id into v_live_pad_source_id
  from private_verification.public_data_sources where source_key='oh_odnr_live_wellpads';
  select id into v_snapshot_pad_source_id
  from private_verification.public_data_sources where source_key='oh_odnr_wellpads_snapshot_20260804';
  if v_source_id is null or v_live_pad_source_id is null then
    raise exception 'ODNR live well/pad sources are not registered';
  end if;

  v_url:=v_base_url||'/query?where='||
    extensions.urlencode(('SLANT=''H'' AND OBJECTID>'||coalesce(p_after_object_id,0))::varchar)||
    '&outFields=OBJECTID,API_NO,MAPSYMBOL_DESCRIPTION,WELL_STATUS_DESCRIPTION,GIS_STATUS,COUNTY,TOWNSHIP,COMPANY_NAME,LAT83,LONG83,BH_LAT83,BH_LONG83,TOE_LAT83,TOE_LONG83,HEEL_LAT83,HEEL_LONG83,SLANT,PROPOSED_FORMATIONS,WELL_NAME,WELL_NO,IP_GAS,IP_OIL,TOTAL_DEPTH,PERMIT_ISSUED_DATE,COMP_DATE,PLUG_DATE,PRODFM1,PRODFM2,DEEPEST_FORMATION,WELL_STATUS,OPERATOR,LEASE_NAME,LOCATION_ID,WELL_TYP,Last_Nonzero_Production_Year,Last_Production_Quarter,OrphanWellProgramStatus'
    ||'&returnGeometry=false&orderByFields=OBJECTID&resultRecordCount='||p_limit||'&f=pjson';

  insert into private_verification.public_data_import_runs
    (source_id,state,import_mode,status,checkpoint,exact_endpoint,exact_query,started_at)
  values(v_source_id,'Ohio','live_horizontal_wells','running',
    jsonb_build_object('after_object_id',p_after_object_id,'batch_limit',p_limit),v_base_url||'/query',
    jsonb_build_object('where','SLANT = H AND OBJECTID > '||p_after_object_id,'limit',p_limit),now())
  returning id into v_run_id;

  select (r).status,(r).content into v_http_status,v_content
  from(select extensions.http_get(v_url)r)q;
  if v_http_status<>200 then raise exception 'ODNR live wells HTTP status %',v_http_status; end if;
  v_json:=v_content::jsonb;
  if v_json?'error' then raise exception 'ODNR live wells ArcGIS error: %',v_json->'error'; end if;

  create temporary table tmp_live_odnr_well_batch on commit drop as
  select
    (a->>'OBJECTID')::bigint object_id,
    nullif(regexp_replace(a->>'API_NO','[^0-9]','','g'),'') api,
    nullif(btrim(a->>'MAPSYMBOL_DESCRIPTION'),'') map_symbol_description,
    nullif(btrim(a->>'WELL_STATUS_DESCRIPTION'),'') well_status_description,
    nullif(btrim(a->>'GIS_STATUS'),'') gis_status,
    nullif(btrim(a->>'COUNTY'),'') county,
    nullif(btrim(a->>'TOWNSHIP'),'') township,
    nullif(btrim(a->>'COMPANY_NAME'),'') company_name,
    nullif(btrim(a->>'OPERATOR'),'') operator_raw,
    nullif(a->>'LAT83','')::double precision latitude,
    nullif(a->>'LONG83','')::double precision longitude,
    nullif(a->>'BH_LAT83','')::double precision bottom_hole_latitude,
    nullif(a->>'BH_LONG83','')::double precision bottom_hole_longitude,
    nullif(a->>'TOE_LAT83','')::double precision toe_latitude,
    nullif(a->>'TOE_LONG83','')::double precision toe_longitude,
    nullif(a->>'HEEL_LAT83','')::double precision heel_latitude,
    nullif(a->>'HEEL_LONG83','')::double precision heel_longitude,
    nullif(btrim(a->>'SLANT'),'') slant,
    nullif(btrim(a->>'PROPOSED_FORMATIONS'),'') proposed_formations,
    nullif(btrim(a->>'WELL_NAME'),'') well_name,
    nullif(btrim(a->>'WELL_NO'),'') well_number,
    nullif(a->>'IP_GAS','')::numeric initial_gas,
    nullif(a->>'IP_OIL','')::numeric initial_oil,
    nullif(a->>'TOTAL_DEPTH','')::numeric total_depth,
    nullif(a->>'PERMIT_ISSUED_DATE','')::double precision permit_issued_ms,
    nullif(a->>'COMP_DATE','')::double precision completion_ms,
    nullif(a->>'PLUG_DATE','')::double precision plug_ms,
    nullif(btrim(a->>'PRODFM1'),'') producing_formation_1,
    nullif(btrim(a->>'PRODFM2'),'') producing_formation_2,
    nullif(btrim(a->>'DEEPEST_FORMATION'),'') deepest_formation,
    nullif(btrim(a->>'WELL_STATUS'),'') well_status_code,
    nullif(btrim(a->>'LEASE_NAME'),'') lease_name,
    nullif(btrim(a->>'LOCATION_ID'),'') location_id,
    nullif(btrim(a->>'WELL_TYP'),'') well_type_code,
    nullif(btrim(a->>'Last_Nonzero_Production_Year'),'') last_nonzero_production_year,
    nullif(btrim(a->>'Last_Production_Quarter'),'') last_production_quarter,
    nullif(btrim(a->>'OrphanWellProgramStatus'),'') orphan_program_status,
    a raw_attributes
  from jsonb_array_elements(coalesce(v_json->'features','[]'::jsonb))f,
       lateral(select f->'attributes'a)s;

  select count(*),max(object_id) into v_batch_count,v_last_object_id
  from tmp_live_odnr_well_batch;
  if v_batch_count=0 then
    update private_verification.public_data_import_runs
    set status='completed',request_count=1,records_seen=0,records_inserted=0,
        checkpoint=jsonb_build_object('last_object_id',p_after_object_id,'batch_limit',p_limit),completed_at=now()
    where id=v_run_id;
    return jsonb_build_object('import_run_id',v_run_id,'records_staged',0,'message','No horizontal well records returned');
  end if;

  insert into private_verification.public_data_source_records
    (source_id,source_record_id,entity_type,state,operator_raw,operator_normalized,official_name,official_status,county,
     township_or_municipality,latitude,longitude,raw_facts,normalized_facts,source_content_hash,
     first_seen_at,last_seen_at,last_import_run_id)
  select v_source_id,'OBJECTID:'||w.object_id,'well','Ohio',coalesce(w.operator_raw,w.company_name),
    regexp_replace(upper(btrim(coalesce(w.operator_raw,w.company_name,''))),'[^A-Z0-9]+',' ','g'),w.well_name,
    coalesce(w.well_status_description,w.gis_status),w.county,w.township,w.latitude,w.longitude,w.raw_attributes,
    jsonb_strip_nulls(jsonb_build_object(
      'source_object_id',w.object_id,'api',w.api,'permit_number',w.api,'well_name',w.well_name,'well_number',w.well_number,
      'lease_name',w.lease_name,'operator',coalesce(w.operator_raw,w.company_name),'company_name',w.company_name,
      'county',w.county,'township',w.township,'well_status',w.well_status_description,'gis_status',w.gis_status,
      'well_status_code',w.well_status_code,'well_type_code',w.well_type_code,
      'map_symbol_description',w.map_symbol_description,'slant',w.slant,
      'wellhead_latitude',w.latitude,'wellhead_longitude',w.longitude,
      'bottom_hole_latitude',w.bottom_hole_latitude,'bottom_hole_longitude',w.bottom_hole_longitude,
      'heel_latitude',w.heel_latitude,'heel_longitude',w.heel_longitude,
      'toe_latitude',w.toe_latitude,'toe_longitude',w.toe_longitude,
      'total_depth',w.total_depth,
      'permit_approved_at',case when w.permit_issued_ms is null then null else to_jsonb(to_timestamp(w.permit_issued_ms/1000))end,
      'completion_at',case when w.completion_ms is null then null else to_jsonb(to_timestamp(w.completion_ms/1000))end,
      'plugging_at',case when w.plug_ms is null then null else to_jsonb(to_timestamp(w.plug_ms/1000))end,
      'proposed_formations',w.proposed_formations,'producing_formation_1',w.producing_formation_1,
      'producing_formation_2',w.producing_formation_2,'deepest_formation',w.deepest_formation,
      'initial_gas',w.initial_gas,'initial_oil',w.initial_oil,
      'last_nonzero_production_year',w.last_nonzero_production_year,
      'last_production_quarter',w.last_production_quarter,
      'orphan_well_program_status',w.orphan_program_status,
      'source_identity_method','live FeatureServer OBJECTID')),
    md5(jsonb_build_object('object_id',w.object_id,'api',w.api,'well_name',w.well_name,
      'operator',coalesce(w.operator_raw,w.company_name),'status',w.well_status_description,'county',w.county,
      'township',w.township,'latitude',w.latitude,'longitude',w.longitude,
      'bottom_hole_latitude',w.bottom_hole_latitude,'bottom_hole_longitude',w.bottom_hole_longitude,
      'depth',w.total_depth,'permit',w.permit_issued_ms,'completion',w.completion_ms,'plug',w.plug_ms,
      'last_year',w.last_nonzero_production_year,'last_quarter',w.last_production_quarter)::text),
    now(),now(),v_run_id
  from tmp_live_odnr_well_batch w
  on conflict(source_id,source_record_id) do update set
    operator_raw=excluded.operator_raw,operator_normalized=excluded.operator_normalized,
    official_name=excluded.official_name,official_status=excluded.official_status,county=excluded.county,
    township_or_municipality=excluded.township_or_municipality,latitude=excluded.latitude,longitude=excluded.longitude,
    raw_facts=excluded.raw_facts,normalized_facts=excluded.normalized_facts,
    source_content_hash=excluded.source_content_hash,last_seen_at=now(),retired_at=null,
    last_import_run_id=excluded.last_import_run_id;

  create temporary table tmp_live_well_saved_matches on commit drop as
  select r.id well_source_uuid,t.pad_id
  from private_verification.public_data_source_records r
  join private_verification.pad_api_tokens_20260803 t on t.api_digits=r.normalized_facts->>'api'
  where r.last_import_run_id=v_run_id;

  create temporary table tmp_live_well_saved_summary on commit drop as
  select r.id well_source_uuid,count(distinct m.pad_id) pad_count,
    (array_agg(m.pad_id order by m.pad_id::text)filter(where m.pad_id is not null))[1] selected_pad_id,
    coalesce(jsonb_agg(distinct jsonb_build_object('pad_id',m.pad_id,'match_method','exact_api'))
      filter(where m.pad_id is not null),'[]'::jsonb)matches
  from private_verification.public_data_source_records r
  left join tmp_live_well_saved_matches m on m.well_source_uuid=r.id
  where r.last_import_run_id=v_run_id group by r.id;

  insert into private_verification.public_data_match_candidates
    (source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
  select s.well_source_uuid,s.selected_pad_id,'VERIFIED_EXISTING_RECORD','exact_api',1.0,
    jsonb_build_array(jsonb_build_object('kind','exact_api','value',r.normalized_facts->'api')),
    '[]'::jsonb,'confirmed',now(),now()
  from tmp_live_well_saved_summary s
  join private_verification.public_data_source_records r on r.id=s.well_source_uuid
  where s.pad_count=1
  on conflict(source_record_id,(coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),result_category)
  do update set match_method=excluded.match_method,confidence=excluded.confidence,evidence=excluded.evidence,
                review_status='confirmed',updated_at=now();

  insert into private_verification.public_data_match_candidates
    (source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
  select s.well_source_uuid,null,'POSSIBLE_DUPLICATE','exact_api_attached_to_multiple_saved_pads',0.50,
    jsonb_build_array(jsonb_build_object('kind','exact_api_match_count','value',s.pad_count)),
    s.matches,'needs_owner_review',now(),now()
  from tmp_live_well_saved_summary s where s.pad_count>1
  on conflict(source_record_id,(coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),result_category)
  do update set evidence=excluded.evidence,conflicts=excluded.conflicts,
                review_status='needs_owner_review',updated_at=now();

  create temporary table tmp_live_well_pad_links on commit drop as
  with pad_names as (
    select p.id pad_source_uuid,p.normalized_facts->>'official_pad_id' official_pad_id,p.official_name,
      p.operator_raw,coalesce(p.normalized_facts->>'coordinate_county',p.county) pad_county,
      p.latitude,p.longitude,
      private_verification.normalize_identity_words(p.official_name) current_name_words,
      private_verification.normalize_identity_words(h.official_name) historical_name_words
    from private_verification.public_data_source_records p
    left join private_verification.public_data_source_records h
      on h.source_id=v_snapshot_pad_source_id
     and h.normalized_facts->>'official_pad_id'=p.normalized_facts->>'official_pad_id'
    where p.source_id=v_live_pad_source_id and p.entity_type='pad'
  ), candidates as (
    select w.id well_source_uuid,p.pad_source_uuid,
      3959*2*asin(least(1::double precision,sqrt(
        power(sin(radians(w.latitude-p.latitude)/2),2)+
        cos(radians(p.latitude))*cos(radians(w.latitude))*
        power(sin(radians(w.longitude-p.longitude)/2),2)
      ))) distance_miles,
      row_number() over(partition by w.id,p.pad_source_uuid order by
        case when private_verification.normalize_identity_words(w.normalized_facts->>'lease_name')
          in(p.current_name_words,p.historical_name_words) then 0 else 1 end,p.pad_source_uuid) rn
    from private_verification.public_data_source_records w
    join pad_names p
      on regexp_replace(upper(btrim(coalesce(w.operator_raw,''))),'[^A-Z0-9]+','','g')=
         regexp_replace(upper(btrim(coalesce(p.operator_raw,''))),'[^A-Z0-9]+','','g')
     and upper(coalesce(btrim(w.county),''))=upper(coalesce(btrim(p.pad_county),''))
     and (
       private_verification.normalize_identity_words(w.normalized_facts->>'lease_name')=p.current_name_words
       or private_verification.normalize_identity_words(w.normalized_facts->>'lease_name')=p.historical_name_words
       or private_verification.normalize_identity_words(w.official_name)=p.current_name_words
       or private_verification.normalize_identity_words(w.official_name) like p.current_name_words||' %'
       or (p.historical_name_words<>'' and
           private_verification.normalize_identity_words(w.official_name) like p.historical_name_words||' %')
     )
    where w.last_import_run_id=v_run_id and w.latitude is not null and w.longitude is not null
      and p.latitude is not null and p.longitude is not null
  )
  select * from candidates where rn=1 and distance_miles<=0.75;

  create temporary table tmp_live_well_pad_summary on commit drop as
  select r.id well_source_uuid,count(distinct l.pad_source_uuid) pad_source_count,
    (array_agg(l.pad_source_uuid order by l.distance_miles)
      filter(where l.pad_source_uuid is not null))[1] selected_pad_source_uuid,
    min(l.distance_miles) min_distance_miles
  from private_verification.public_data_source_records r
  left join tmp_live_well_pad_links l on l.well_source_uuid=r.id
  where r.last_import_run_id=v_run_id group by r.id;

  insert into private_verification.public_data_candidate_well_links
    (pad_source_record_id,well_public_data_source_record_id,well_source,well_source_record_id,canonical_api,
     well_name,operator,county,township,well_status,latitude,longitude,distance_miles,link_method,confidence,
     evidence,conflicts,review_status,first_seen_at,last_seen_at)
  select l.pad_source_uuid,l.well_source_uuid,'ODNR Live Oil and Gas Wells',r.source_record_id,
    r.normalized_facts->>'api',r.official_name,r.operator_raw,r.county,r.township_or_municipality,
    r.official_status,r.latitude,r.longitude,l.distance_miles,
    'exact_pad_or_historical_alias_operator_county_with_coordinate_support',0.99,
    jsonb_build_array(jsonb_build_object('kind','exact_pad_or_alias_name','value',true),
      jsonb_build_object('kind','operator_consistent','value',true),
      jsonb_build_object('kind','county_consistent','value',true),
      jsonb_build_object('kind','distance_miles','value',round(l.distance_miles::numeric,4))),
    '[]'::jsonb,case when s.pad_source_count=1 then 'confirmed' else 'needs_owner_review' end,now(),now()
  from tmp_live_well_pad_links l
  join tmp_live_well_pad_summary s on s.well_source_uuid=l.well_source_uuid
  join private_verification.public_data_source_records r on r.id=l.well_source_uuid
  on conflict(pad_source_record_id,well_source,well_source_record_id) do update set
    well_public_data_source_record_id=excluded.well_public_data_source_record_id,
    canonical_api=excluded.canonical_api,well_name=excluded.well_name,operator=excluded.operator,
    county=excluded.county,township=excluded.township,well_status=excluded.well_status,
    latitude=excluded.latitude,longitude=excluded.longitude,distance_miles=excluded.distance_miles,
    link_method=excluded.link_method,confidence=excluded.confidence,evidence=excluded.evidence,
    conflicts=excluded.conflicts,review_status=excluded.review_status,last_seen_at=now();

  create temporary table tmp_live_well_existing_pad_links on commit drop as
  select s.well_source_uuid,s.selected_pad_source_uuid,pc.pad_id
  from tmp_live_well_pad_summary s
  join private_verification.public_data_match_candidates pc
    on pc.source_record_id=s.selected_pad_source_uuid
   and pc.result_category='VERIFIED_EXISTING_RECORD'
   and pc.review_status='confirmed' and pc.pad_id is not null
  where s.pad_source_count=1;

  insert into private_verification.public_data_match_candidates
    (source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
  select e.well_source_uuid,e.pad_id,'NEW_WELL_FOR_EXISTING_PAD',
    'official_live_well_linked_to_verified_pad_missing_saved_api',0.99,
    jsonb_build_array(jsonb_build_object('kind','official_api','value',r.normalized_facts->'api'),
      jsonb_build_object('kind','official_well_name','value',r.official_name),
      jsonb_build_object('kind','official_status','value',r.official_status)),
    '[]'::jsonb,'needs_owner_review',now(),now()
  from tmp_live_well_existing_pad_links e
  join private_verification.public_data_source_records r on r.id=e.well_source_uuid
  where not exists(
    select 1 from private_verification.pad_api_tokens_20260803 t
    where t.pad_id=e.pad_id and t.api_digits=r.normalized_facts->>'api'
  )
  on conflict(source_record_id,(coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),result_category)
  do update set evidence=excluded.evidence,confidence=excluded.confidence,
                review_status='needs_owner_review',updated_at=now();

  insert into private_verification.public_data_match_candidates
    (source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
  select e.well_source_uuid,e.pad_id,'API_CONFLICT',
    'official_live_pad_link_conflicts_with_saved_api_attachment',0.99,
    jsonb_build_array(jsonb_build_object('kind','official_api','value',r.normalized_facts->'api'),
      jsonb_build_object('kind','linked_pad_id','value',e.pad_id)),
    jsonb_build_array(jsonb_build_object('field','api_attachment','official_linked_pad_id',e.pad_id,
      'saved_pad_ids',s.matches)),
    'needs_owner_review',now(),now()
  from tmp_live_well_existing_pad_links e
  join private_verification.public_data_source_records r on r.id=e.well_source_uuid
  join tmp_live_well_saved_summary s on s.well_source_uuid=e.well_source_uuid
  where s.pad_count>0 and not exists(
    select 1 from tmp_live_well_saved_matches m
    where m.well_source_uuid=e.well_source_uuid and m.pad_id=e.pad_id
  )
  on conflict(source_record_id,(coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),result_category)
  do update set evidence=excluded.evidence,conflicts=excluded.conflicts,
                review_status='needs_owner_review',updated_at=now();

  create temporary table tmp_live_well_history on commit drop as
  select r.id well_source_uuid,h.operator historical_operator,h.well_status historical_status,
    h.well_name historical_name
  from private_verification.public_data_source_records r
  join private_verification.ohio_official_20260803 h on h.api=r.normalized_facts->>'api'
  where r.last_import_run_id=v_run_id;

  insert into private_verification.public_data_match_candidates
    (source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
  select r.id,coalesce(s.selected_pad_id,e.pad_id),'OPERATOR_CHANGE_OR_ALIAS','same_api_operator_changed',1.0,
    jsonb_build_array(jsonb_build_object('kind','previous_official_operator','value',h.historical_operator),
      jsonb_build_object('kind','current_official_operator','value',r.operator_raw),
      jsonb_build_object('kind','api','value',r.normalized_facts->'api')),
    '[]'::jsonb,'needs_owner_review',now(),now()
  from private_verification.public_data_source_records r
  join tmp_live_well_history h on h.well_source_uuid=r.id
  left join tmp_live_well_saved_summary s on s.well_source_uuid=r.id and s.pad_count=1
  left join tmp_live_well_existing_pad_links e on e.well_source_uuid=r.id
  where private_verification.normalize_identity_text(r.operator_raw)<>
        private_verification.normalize_identity_text(h.historical_operator)
  on conflict(source_record_id,(coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),result_category)
  do update set evidence=excluded.evidence,confidence=excluded.confidence,
                review_status='needs_owner_review',updated_at=now();

  insert into private_verification.public_data_match_candidates
    (source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
  select r.id,coalesce(s.selected_pad_id,e.pad_id),'STATUS_UPDATE','same_api_status_changed',1.0,
    jsonb_build_array(jsonb_build_object('kind','previous_official_status','value',h.historical_status),
      jsonb_build_object('kind','current_official_status','value',r.official_status),
      jsonb_build_object('kind','api','value',r.normalized_facts->'api')),
    '[]'::jsonb,'needs_owner_review',now(),now()
  from private_verification.public_data_source_records r
  join tmp_live_well_history h on h.well_source_uuid=r.id
  left join tmp_live_well_saved_summary s on s.well_source_uuid=r.id and s.pad_count=1
  left join tmp_live_well_existing_pad_links e on e.well_source_uuid=r.id
  where private_verification.normalize_identity_words(r.official_status)<>
        private_verification.normalize_identity_words(h.historical_status)
  on conflict(source_record_id,(coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),result_category)
  do update set evidence=excluded.evidence,confidence=excluded.confidence,
                review_status='needs_owner_review',updated_at=now();

  select count(*) into v_exact_saved from tmp_live_well_saved_summary where pad_count=1;
  select count(*) into v_pad_links from tmp_live_well_pad_summary where pad_source_count=1;
  select count(*) into v_new_wells
  from private_verification.public_data_match_candidates
  where source_record_id in(select id from private_verification.public_data_source_records where last_import_run_id=v_run_id)
    and result_category='NEW_WELL_FOR_EXISTING_PAD';
  select count(*) into v_operator_changes
  from private_verification.public_data_match_candidates
  where source_record_id in(select id from private_verification.public_data_source_records where last_import_run_id=v_run_id)
    and result_category='OPERATOR_CHANGE_OR_ALIAS';
  select count(*) into v_status_changes
  from private_verification.public_data_match_candidates
  where source_record_id in(select id from private_verification.public_data_source_records where last_import_run_id=v_run_id)
    and result_category='STATUS_UPDATE';
  select count(*) into v_api_conflicts
  from private_verification.public_data_match_candidates
  where source_record_id in(select id from private_verification.public_data_source_records where last_import_run_id=v_run_id)
    and result_category='API_CONFLICT';

  update private_verification.public_data_import_runs
  set status='completed',request_count=1,records_seen=v_batch_count,records_inserted=v_batch_count,
      checkpoint=jsonb_build_object('last_object_id',v_last_object_id,'batch_limit',p_limit,
        'exceeded_transfer_limit',coalesce((v_json->>'exceededTransferLimit')::boolean,false)),completed_at=now()
  where id=v_run_id;
  update private_verification.public_data_sources
  set last_attempt_at=now(),last_success_at=now(),health_status='healthy',
      source_metadata=source_metadata||jsonb_build_object(
        'horizontal_last_object_id_staged',v_last_object_id,
        'horizontal_last_batch_count',v_batch_count
      ),updated_at=now()
  where id=v_source_id;

  return jsonb_build_object('import_run_id',v_run_id,'records_staged',v_batch_count,
    'last_object_id',v_last_object_id,'exact_saved_api_matches',v_exact_saved,
    'unique_official_pad_links',v_pad_links,'new_wells_for_existing_pads',v_new_wells,
    'operator_changes',v_operator_changes,'status_changes',v_status_changes,
    'api_conflicts',v_api_conflicts);
exception when others then
  if v_run_id is not null then
    update private_verification.public_data_import_runs
    set status='failed',request_count=1,
        errors=errors||jsonb_build_array(jsonb_build_object('message',sqlerrm)),completed_at=now()
    where id=v_run_id;
  end if;
  raise;
end
$fn$;

revoke all on function private_verification.stage_live_odnr_horizontal_wells_batch(bigint,integer)
  from public,anon,authenticated;
grant execute on function private_verification.stage_live_odnr_horizontal_wells_batch(bigint,integer)
  to service_role;
