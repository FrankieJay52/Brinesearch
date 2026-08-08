-- Idempotent candidate identity across matched and unmatched records.
create unique index if not exists public_data_match_candidates_identity_unique_idx
on private_verification.public_data_match_candidates
(source_record_id,coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid),result_category);

create or replace function private_verification.stage_live_odnr_wellpads_batch(
  p_after_object_id bigint default 0,
  p_limit integer default 50
) returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public,private_verification,extensions
as $fn$
declare
  v_source_id uuid;
  v_snapshot_source_id uuid;
  v_run_id uuid;
  v_base_url text;
  v_url text;
  v_content text;
  v_http_status integer;
  v_json jsonb;
  v_batch_count integer;
  v_last_object_id bigint;
  v_candidate_count integer;
  v_verified_count integer;
  v_new_count integer;
  v_duplicate_count integer;
  v_facility_count integer;
  v_operator_change_count integer;
  v_status_change_count integer;
  v_name_change_count integer;
  v_location_conflict_count integer;
begin
  if p_limit < 1 or p_limit > 50 then
    raise exception 'p_limit must be between 1 and 50';
  end if;

  select id,base_url into v_source_id,v_base_url
  from private_verification.public_data_sources
  where source_key='oh_odnr_live_wellpads';
  select id into v_snapshot_source_id
  from private_verification.public_data_sources
  where source_key='oh_odnr_wellpads_snapshot_20260804';
  if v_source_id is null or v_base_url is null then
    raise exception 'Live ODNR well-pad source is not registered';
  end if;

  v_url:=v_base_url||'/query?where=OBJECTID%3E'||coalesce(p_after_object_id,0)||
    '&outFields=OBJECTID,PADAUTO,NewPadID,PadName,PadNumber,PadStatus,PadStatus_desc,PAD_TYPE,Source,Date_Dig,LAT,LONG,CNTY,County,Operator,Permit,Comment,create_date,update_date'
    ||'&returnGeometry=false&orderByFields=OBJECTID&resultRecordCount='||p_limit||'&f=pjson';

  insert into private_verification.public_data_import_runs
    (source_id,state,import_mode,status,checkpoint,exact_endpoint,exact_query,started_at)
  values
    (v_source_id,'Ohio','live_api','running',jsonb_build_object('after_object_id',p_after_object_id,'batch_limit',p_limit),
     v_base_url||'/query',jsonb_build_object('where','OBJECTID > '||p_after_object_id,'orderByFields','OBJECTID','resultRecordCount',p_limit),now())
  returning id into v_run_id;

  select (r).status,(r).content into v_http_status,v_content
  from (select extensions.http_get(v_url) as r) q;
  if v_http_status<>200 then
    raise exception 'ODNR live well-pad HTTP status %',v_http_status;
  end if;
  v_json:=v_content::jsonb;
  if v_json ? 'error' then
    raise exception 'ODNR live well-pad ArcGIS error: %',v_json->'error';
  end if;

  create temporary table tmp_live_odnr_pad_batch on commit drop as
  select
    (a->>'OBJECTID')::bigint as object_id,
    nullif(a->>'PADAUTO','')::bigint as padauto,
    nullif(btrim(a->>'NewPadID'),'') as official_pad_id,
    nullif(btrim(a->>'PadName'),'') as official_name,
    nullif(a->>'PadNumber','')::bigint as pad_number,
    nullif(btrim(a->>'PadStatus'),'') as status_code,
    nullif(btrim(coalesce(a->>'PadStatus_desc',a->>'PadStatus')),'') as official_status,
    nullif(btrim(a->>'PAD_TYPE'),'') as pad_type,
    nullif(btrim(a->>'Source'),'') as source_method,
    nullif(a->>'Date_Dig','')::double precision as digitized_ms,
    nullif(a->>'LAT','')::double precision as latitude,
    nullif(a->>'LONG','')::double precision as longitude,
    nullif(a->>'CNTY','')::integer as county_code,
    nullif(btrim(a->>'County'),'') as source_county,
    nullif(btrim(a->>'Operator'),'') as operator_raw,
    nullif(a->>'Permit','')::bigint as permit_number,
    nullif(btrim(a->>'Comment'),'') as source_comment,
    nullif(a->>'create_date','')::double precision as created_ms,
    nullif(a->>'update_date','')::double precision as updated_ms,
    a as raw_attributes,
    case
      when upper(btrim(coalesce(nullif(a->>'PAD_TYPE','<Null>'),''))) in ('GATHERING AREA','WORK AREA') then 'facility'
      when upper(btrim(coalesce(nullif(a->>'PAD_TYPE','<Null>'),'')))='PROPOSED' then 'unknown'
      else 'pad'
    end as entity_type
  from jsonb_array_elements(coalesce(v_json->'features','[]'::jsonb)) f,
       lateral (select f->'attributes' as a) s;

  select count(*),max(object_id) into v_batch_count,v_last_object_id from tmp_live_odnr_pad_batch;
  if v_batch_count=0 then
    update private_verification.public_data_import_runs
    set status='completed',records_seen=0,records_inserted=0,records_changed=0,records_unchanged=0,
        checkpoint=jsonb_build_object('last_object_id',p_after_object_id,'batch_limit',p_limit),completed_at=now()
    where id=v_run_id;
    return jsonb_build_object('import_run_id',v_run_id,'records_staged',0,'message','No live ODNR pad records returned');
  end if;

  insert into private_verification.public_data_source_records
    (source_id,source_record_id,source_publication_date,entity_type,state,operator_raw,operator_normalized,official_name,
     official_status,county,township_or_municipality,latitude,longitude,raw_facts,normalized_facts,source_content_hash,
     first_seen_at,last_seen_at,retired_at,last_import_run_id)
  select
    v_source_id,'OBJECTID:'||b.object_id,
    case when b.updated_ms is null then null else to_timestamp(b.updated_ms/1000) end,
    b.entity_type,'Ohio',b.operator_raw,
    regexp_replace(upper(btrim(coalesce(b.operator_raw,''))),'[^A-Z0-9]+',' ','g'),b.official_name,b.official_status,b.source_county,null,
    b.latitude,b.longitude,b.raw_attributes,
    jsonb_strip_nulls(jsonb_build_object(
      'source_object_id',b.object_id,'source_identity_method','live FeatureServer OBJECTID','official_pad_id',b.official_pad_id,
      'padauto',b.padauto,'official_name',b.official_name,'operator',b.operator_raw,'state','Ohio','source_county',b.source_county,
      'county_code',b.county_code,'latitude',b.latitude,'longitude',b.longitude,'official_status',b.official_status,
      'status_code',b.status_code,'pad_type',nullif(nullif(b.pad_type,'<Null>'),''),'pad_number',b.pad_number,
      'permit_number',b.permit_number,'source_method',b.source_method,'source_comment',b.source_comment,
      'digitized_at',case when b.digitized_ms is null then null else to_jsonb(to_timestamp(b.digitized_ms/1000)) end,
      'source_created_at',case when b.created_ms is null then null else to_jsonb(to_timestamp(b.created_ms/1000)) end,
      'source_updated_at',case when b.updated_ms is null then null else to_jsonb(to_timestamp(b.updated_ms/1000)) end,
      'normalized_entity_type',b.entity_type)),
    md5(jsonb_build_object('object_id',b.object_id,'official_pad_id',b.official_pad_id,'name',b.official_name,'operator',b.operator_raw,
      'county',b.source_county,'latitude',b.latitude,'longitude',b.longitude,'status',b.official_status,'type',b.pad_type,
      'permit',b.permit_number,'updated_ms',b.updated_ms)::text),now(),now(),null,v_run_id
  from tmp_live_odnr_pad_batch b
  on conflict(source_id,source_record_id) do update set
    source_publication_date=excluded.source_publication_date,entity_type=excluded.entity_type,operator_raw=excluded.operator_raw,
    operator_normalized=excluded.operator_normalized,official_name=excluded.official_name,official_status=excluded.official_status,
    county=excluded.county,township_or_municipality=excluded.township_or_municipality,latitude=excluded.latitude,
    longitude=excluded.longitude,raw_facts=excluded.raw_facts,normalized_facts=excluded.normalized_facts,
    source_content_hash=excluded.source_content_hash,last_seen_at=now(),retired_at=null,last_import_run_id=excluded.last_import_run_id;

  create temporary table tmp_live_odnr_pad_geo on commit drop as
  select r.id as source_record_uuid,g.county as coordinate_county,g.township as coordinate_township
  from private_verification.public_data_source_records r
  left join lateral (
    select b.county,b.township
    from private_verification.ohio_township_boundaries_20260803 b
    where r.latitude is not null and r.longitude is not null
      and st_covers(b.geom,st_setsrid(st_makepoint(r.longitude,r.latitude),4326))
    order by b.county,b.township limit 1
  ) g on true
  where r.last_import_run_id=v_run_id;

  update private_verification.public_data_source_records r
  set township_or_municipality=g.coordinate_township,
      normalized_facts=jsonb_strip_nulls(r.normalized_facts||jsonb_build_object(
        'coordinate_county',g.coordinate_county,'coordinate_township',g.coordinate_township,
        'geography_method','Ohio township boundary point-in-polygon'))
  from tmp_live_odnr_pad_geo g where r.id=g.source_record_uuid;

  create temporary table tmp_live_odnr_pad_history on commit drop as
  select distinct on(l.id)
    l.id as source_record_uuid,h.id as historical_source_record_uuid,h.operator_raw as historical_operator,
    h.official_status as historical_status,h.official_name as historical_name,h.county as historical_county,
    h.latitude as historical_latitude,h.longitude as historical_longitude
  from private_verification.public_data_source_records l
  join private_verification.public_data_source_records h
    on h.source_id=v_snapshot_source_id
   and h.normalized_facts->>'official_pad_id'=l.normalized_facts->>'official_pad_id'
  where l.last_import_run_id=v_run_id
  order by l.id,
    (upper(regexp_replace(coalesce(h.official_name,''),'[^A-Z0-9]+','','g'))=
     upper(regexp_replace(coalesce(l.official_name,''),'[^A-Z0-9]+','','g'))) desc,
    case when h.latitude is null or h.longitude is null or l.latitude is null or l.longitude is null then 9999
      else 3959*2*asin(least(1::double precision,sqrt(power(sin(radians(h.latitude-l.latitude)/2),2)+
        cos(radians(l.latitude))*cos(radians(h.latitude))*power(sin(radians(h.longitude-l.longitude)/2),2)))) end,
    h.id;

  create temporary table tmp_live_odnr_pad_matches on commit drop as
  select distinct r.id as source_record_uuid,p.id as pad_id,'exact_official_pad_id'::text as match_method,0 as priority
  from private_verification.public_data_source_records r
  join public.pads p on p.extra_data->'official_pad_record'->>'pad_id'=r.normalized_facts->>'official_pad_id'
  where r.last_import_run_id=v_run_id and r.entity_type='pad'
  union all
  select distinct r.id,p.id,'historical_official_match',1
  from private_verification.public_data_source_records r
  join private_verification.public_data_source_records h
    on h.source_id=v_snapshot_source_id and h.normalized_facts->>'official_pad_id'=r.normalized_facts->>'official_pad_id'
  join private_verification.public_data_match_candidates hc
    on hc.source_record_id=h.id and hc.pad_id is not null and hc.result_category='VERIFIED_EXISTING_RECORD' and hc.review_status='confirmed'
  join public.pads p on p.id=hc.pad_id
  where r.last_import_run_id=v_run_id and r.entity_type='pad'
  union all
  select distinct r.id,p.id,'exact_name_county_operator',2
  from private_verification.public_data_source_records r
  join public.pads p
    on upper(regexp_replace(btrim(p.pad_name),'[^A-Z0-9]+','','g'))=upper(regexp_replace(btrim(r.official_name),'[^A-Z0-9]+','','g'))
   and upper(coalesce(btrim(p.county),''))=upper(coalesce(btrim(r.county),''))
   and private_verification.operator_match(p.company,r.operator_raw)
  where r.last_import_run_id=v_run_id and r.entity_type='pad';

  create temporary table tmp_live_odnr_pad_match_summary on commit drop as
  select r.id as source_record_uuid,count(distinct m.pad_id) as pad_count,
    (array_agg(m.pad_id order by m.priority) filter(where m.pad_id is not null))[1] as selected_pad_id,
    (array_agg(m.match_method order by m.priority) filter(where m.match_method is not null))[1] as selected_method,
    coalesce(jsonb_agg(distinct jsonb_build_object('pad_id',m.pad_id,'match_method',m.match_method)) filter(where m.pad_id is not null),'[]'::jsonb) as matches
  from private_verification.public_data_source_records r
  left join tmp_live_odnr_pad_matches m on m.source_record_uuid=r.id
  where r.last_import_run_id=v_run_id and r.entity_type='pad'
  group by r.id;

  insert into private_verification.public_data_match_candidates
    (source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
  select s.source_record_uuid,s.selected_pad_id,'VERIFIED_EXISTING_RECORD',s.selected_method,0.99,
    jsonb_build_array(jsonb_build_object('kind','official_source','value','ODNR live Well Pad Boundaries'),
      jsonb_build_object('kind','official_pad_id','value',r.normalized_facts->'official_pad_id'),
      jsonb_build_object('kind','source_object_id','value',r.normalized_facts->'source_object_id')),
    '[]'::jsonb,'confirmed',now(),now()
  from tmp_live_odnr_pad_match_summary s
  join private_verification.public_data_source_records r on r.id=s.source_record_uuid
  where s.pad_count=1
  on conflict(source_record_id,(coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),result_category) do update set
    match_method=excluded.match_method,confidence=excluded.confidence,evidence=excluded.evidence,conflicts=excluded.conflicts,
    review_status='confirmed',updated_at=now();

  insert into private_verification.public_data_match_candidates
    (source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
  select s.source_record_uuid,null,
    case when s.pad_count=0 then 'NEW_PAD_CANDIDATE' else 'POSSIBLE_DUPLICATE' end,
    case when s.pad_count=0 then 'live_official_pad_no_exact_saved_match' else 'multiple_strong_saved_matches' end,
    case when s.pad_count=0 then 0.70 else 0.50 end,
    jsonb_build_array(jsonb_build_object('kind','official_source','value','ODNR live Well Pad Boundaries'),
      jsonb_build_object('kind','official_pad_id','value',r.normalized_facts->'official_pad_id'),
      jsonb_build_object('kind','source_object_id','value',r.normalized_facts->'source_object_id'),
      jsonb_build_object('kind','live_match_count','value',s.pad_count)),
    case when s.pad_count>1 then s.matches else '[]'::jsonb end,'needs_owner_review',now(),now()
  from tmp_live_odnr_pad_match_summary s
  join private_verification.public_data_source_records r on r.id=s.source_record_uuid
  where s.pad_count<>1
  on conflict(source_record_id,(coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),result_category) do update set
    match_method=excluded.match_method,confidence=excluded.confidence,evidence=excluded.evidence,conflicts=excluded.conflicts,
    review_status='needs_owner_review',updated_at=now();

  insert into private_verification.public_data_match_candidates
    (source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
  select r.id,null,
    case when r.entity_type='facility' then 'NEW_FACILITY_CANDIDATE' else 'NEEDS_OWNER_REVIEW' end,
    case when r.entity_type='facility' then 'official_non_pad_facility_type' else 'official_proposed_type_requires_classification' end,
    case when r.entity_type='facility' then 0.99 else 0.50 end,
    jsonb_build_array(jsonb_build_object('kind','official_source','value','ODNR live Well Pad Boundaries'),
      jsonb_build_object('kind','official_pad_type','value',r.normalized_facts->'pad_type'),
      jsonb_build_object('kind','classification_note','value','Not automatically classified as a well pad')),
    '[]'::jsonb,'needs_owner_review',now(),now()
  from private_verification.public_data_source_records r
  where r.last_import_run_id=v_run_id and r.entity_type<>'pad'
  on conflict(source_record_id,(coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),result_category) do update set
    match_method=excluded.match_method,confidence=excluded.confidence,evidence=excluded.evidence,
    review_status='needs_owner_review',updated_at=now();

  insert into private_verification.public_data_match_candidates
    (source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
  select r.id,case when s.pad_count=1 then s.selected_pad_id else null end,'OPERATOR_CHANGE_OR_ALIAS','same_official_pad_id_operator_changed',0.99,
    jsonb_build_array(jsonb_build_object('kind','previous_official_operator','value',h.historical_operator),
      jsonb_build_object('kind','current_official_operator','value',r.operator_raw),
      jsonb_build_object('kind','official_pad_id','value',r.normalized_facts->'official_pad_id')),
    '[]'::jsonb,'needs_owner_review',now(),now()
  from private_verification.public_data_source_records r
  join tmp_live_odnr_pad_history h on h.source_record_uuid=r.id
  left join tmp_live_odnr_pad_match_summary s on s.source_record_uuid=r.id
  where r.last_import_run_id=v_run_id
    and upper(regexp_replace(coalesce(r.operator_raw,''),'[^A-Z0-9]+','','g'))<>
        upper(regexp_replace(coalesce(h.historical_operator,''),'[^A-Z0-9]+','','g'))
  on conflict(source_record_id,(coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),result_category) do update set
    evidence=excluded.evidence,confidence=excluded.confidence,review_status='needs_owner_review',updated_at=now();

  insert into private_verification.public_data_match_candidates
    (source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
  select r.id,case when s.pad_count=1 then s.selected_pad_id else null end,'STATUS_UPDATE','same_official_pad_id_status_changed',0.99,
    jsonb_build_array(jsonb_build_object('kind','previous_official_status','value',h.historical_status),
      jsonb_build_object('kind','current_official_status','value',r.official_status),
      jsonb_build_object('kind','official_pad_id','value',r.normalized_facts->'official_pad_id')),
    '[]'::jsonb,'needs_owner_review',now(),now()
  from private_verification.public_data_source_records r
  join tmp_live_odnr_pad_history h on h.source_record_uuid=r.id
  left join tmp_live_odnr_pad_match_summary s on s.source_record_uuid=r.id
  where r.last_import_run_id=v_run_id and upper(coalesce(r.official_status,''))<>upper(coalesce(h.historical_status,''))
  on conflict(source_record_id,(coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),result_category) do update set
    evidence=excluded.evidence,confidence=excluded.confidence,review_status='needs_owner_review',updated_at=now();

  insert into private_verification.public_data_match_candidates
    (source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
  select r.id,case when s.pad_count=1 then s.selected_pad_id else null end,'OFFICIAL_NAME_ALIAS','same_official_pad_id_name_changed',0.99,
    jsonb_build_array(jsonb_build_object('kind','previous_official_name','value',h.historical_name),
      jsonb_build_object('kind','current_official_name','value',r.official_name),
      jsonb_build_object('kind','official_pad_id','value',r.normalized_facts->'official_pad_id')),
    '[]'::jsonb,'needs_owner_review',now(),now()
  from private_verification.public_data_source_records r
  join tmp_live_odnr_pad_history h on h.source_record_uuid=r.id
  left join tmp_live_odnr_pad_match_summary s on s.source_record_uuid=r.id
  where r.last_import_run_id=v_run_id and
    upper(regexp_replace(coalesce(r.official_name,''),'[^A-Z0-9]+','','g'))<>
    upper(regexp_replace(coalesce(h.historical_name,''),'[^A-Z0-9]+','','g'))
  on conflict(source_record_id,(coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),result_category) do update set
    evidence=excluded.evidence,confidence=excluded.confidence,review_status='needs_owner_review',updated_at=now();

  insert into private_verification.public_data_match_candidates
    (source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
  select r.id,case when s.pad_count=1 then s.selected_pad_id else null end,'LOCATION_CONFLICT','source_county_conflicts_with_official_boundary',0.99,
    jsonb_build_array(jsonb_build_object('kind','source_county','value',r.county),
      jsonb_build_object('kind','coordinate_county','value',g.coordinate_county),
      jsonb_build_object('kind','coordinate_township','value',g.coordinate_township),
      jsonb_build_object('kind','coordinates','value',jsonb_build_array(r.latitude,r.longitude))),
    jsonb_build_array(jsonb_build_object('field','county','source_value',r.county,'coordinate_boundary_value',g.coordinate_county)),
    'needs_owner_review',now(),now()
  from private_verification.public_data_source_records r
  join tmp_live_odnr_pad_geo g on g.source_record_uuid=r.id
  left join tmp_live_odnr_pad_match_summary s on s.source_record_uuid=r.id
  where r.last_import_run_id=v_run_id and g.coordinate_county is not null and r.county is not null
    and upper(btrim(r.county))<>upper(btrim(g.coordinate_county))
  on conflict(source_record_id,(coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),result_category) do update set
    evidence=excluded.evidence,conflicts=excluded.conflicts,confidence=excluded.confidence,
    review_status='needs_owner_review',updated_at=now();

  select count(*) into v_candidate_count
  from private_verification.public_data_match_candidates
  where source_record_id in (select id from private_verification.public_data_source_records where last_import_run_id=v_run_id);
  select count(*) into v_verified_count from tmp_live_odnr_pad_match_summary where pad_count=1;
  select count(*) into v_new_count from tmp_live_odnr_pad_match_summary where pad_count=0;
  select count(*) into v_duplicate_count from tmp_live_odnr_pad_match_summary where pad_count>1;
  select count(*) into v_facility_count from private_verification.public_data_source_records where last_import_run_id=v_run_id and entity_type<>'pad';
  select count(*) into v_operator_change_count from private_verification.public_data_match_candidates
    where source_record_id in (select id from private_verification.public_data_source_records where last_import_run_id=v_run_id)
      and result_category='OPERATOR_CHANGE_OR_ALIAS';
  select count(*) into v_status_change_count from private_verification.public_data_match_candidates
    where source_record_id in (select id from private_verification.public_data_source_records where last_import_run_id=v_run_id)
      and result_category='STATUS_UPDATE';
  select count(*) into v_name_change_count from private_verification.public_data_match_candidates
    where source_record_id in (select id from private_verification.public_data_source_records where last_import_run_id=v_run_id)
      and result_category='OFFICIAL_NAME_ALIAS';
  select count(*) into v_location_conflict_count from private_verification.public_data_match_candidates
    where source_record_id in (select id from private_verification.public_data_source_records where last_import_run_id=v_run_id)
      and result_category='LOCATION_CONFLICT';

  update private_verification.public_data_import_runs
  set status='completed',request_count=1,records_seen=v_batch_count,records_inserted=v_batch_count,
      checkpoint=jsonb_build_object('last_object_id',v_last_object_id,'batch_limit',p_limit,
        'exceeded_transfer_limit',coalesce((v_json->>'exceededTransferLimit')::boolean,false)),completed_at=now()
  where id=v_run_id;
  update private_verification.public_data_sources
  set last_attempt_at=now(),last_success_at=now(),health_status='healthy',
      source_metadata=source_metadata||jsonb_build_object('last_object_id_staged',v_last_object_id,'last_batch_count',v_batch_count),updated_at=now()
  where id=v_source_id;

  return jsonb_build_object('import_run_id',v_run_id,'records_staged',v_batch_count,'last_object_id',v_last_object_id,
    'match_candidates',v_candidate_count,'verified_existing_records',v_verified_count,'new_pad_candidates',v_new_count,
    'possible_duplicates',v_duplicate_count,'non_pad_records',v_facility_count,'operator_changes',v_operator_change_count,
    'status_updates',v_status_change_count,'official_name_changes',v_name_change_count,'location_conflicts',v_location_conflict_count);
exception when others then
  if v_run_id is not null then
    update private_verification.public_data_import_runs
    set status='failed',request_count=1,errors=errors||jsonb_build_array(jsonb_build_object('message',sqlerrm)),completed_at=now()
    where id=v_run_id;
  end if;
  raise;
end
$fn$;

revoke all on function private_verification.stage_live_odnr_wellpads_batch(bigint,integer) from public,anon,authenticated;
grant execute on function private_verification.stage_live_odnr_wellpads_batch(bigint,integer) to service_role;
