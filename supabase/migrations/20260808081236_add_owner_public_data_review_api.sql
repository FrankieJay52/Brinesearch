create or replace function public.public_data_review_summary()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private_verification,auth
as $fn$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_brinesearch_owner(auth.uid()) then
    raise exception 'Owner access required';
  end if;
  select jsonb_build_object(
    'total',count(*),
    'needs_owner_review',count(*) filter(where c.review_status='needs_owner_review'),
    'needs_field_confirmation',count(*) filter(where c.review_status='needs_field_confirmation'),
    'confirmed',count(*) filter(where c.review_status='confirmed'),
    'rejected',count(*) filter(where c.review_status='rejected'),
    'deferred',count(*) filter(where c.review_status='deferred'),
    'high_priority',count(*) filter(where c.review_priority>=90 and c.review_status in('needs_owner_review','needs_field_confirmation')),
    'driver_useful_high',count(*) filter(where c.driver_usefulness='high' and c.review_status in('needs_owner_review','needs_field_confirmation')),
    'new_pads',count(*) filter(where c.result_category='NEW_PAD_CANDIDATE'),
    'new_disposals',count(*) filter(where c.result_category='NEW_DISPOSAL_CANDIDATE'),
    'new_wells',count(*) filter(where c.result_category='NEW_WELL_FOR_EXISTING_PAD'),
    'operator_changes',count(*) filter(where c.result_category='OPERATOR_CHANGE_OR_ALIAS'),
    'status_updates',count(*) filter(where c.result_category='STATUS_UPDATE'),
    'name_aliases',count(*) filter(where c.result_category='OFFICIAL_NAME_ALIAS'),
    'api_conflicts',count(*) filter(where c.result_category='API_CONFLICT'),
    'location_conflicts',count(*) filter(where c.result_category='LOCATION_CONFLICT'),
    'possible_duplicates',count(*) filter(where c.result_category='POSSIBLE_DUPLICATE'),
    'facilities',count(*) filter(where c.result_category='NEW_FACILITY_CANDIDATE'),
    'sources',coalesce((
      select jsonb_agg(jsonb_build_object(
        'source_key',x.source_key,
        'source_name',x.source_name,
        'records',x.records,
        'last_success_at',x.last_success_at,
        'health_status',x.health_status
      ) order by x.source_key)
      from (
        select s.source_key,s.source_name,count(distinct r.id) records,
          s.last_success_at,s.health_status
        from private_verification.public_data_sources s
        left join private_verification.public_data_source_records r on r.source_id=s.id
        where s.active
        group by s.id
      ) x
    ),'[]'::jsonb)
  ) into v_result
  from private_verification.public_data_match_candidates c;
  return v_result;
end
$fn$;

create or replace function public.public_data_review_queue(
  p_review_status text default 'needs_owner_review',
  p_category text default null,
  p_source_key text default null,
  p_state text default null,
  p_entity_type text default null,
  p_usefulness text default null,
  p_search text default null,
  p_min_priority integer default 0,
  p_limit integer default 25,
  p_offset integer default 0
) returns table(
  candidate_id uuid,
  source_record_uuid uuid,
  source_key text,
  source_name text,
  source_url text,
  source_record_id text,
  state text,
  entity_type text,
  official_name text,
  official_operator text,
  official_status text,
  official_county text,
  official_township text,
  official_latitude double precision,
  official_longitude double precision,
  pad_id uuid,
  saved_data jsonb,
  result_category text,
  match_method text,
  confidence numeric,
  review_status text,
  review_priority smallint,
  driver_usefulness text,
  priority_reason text,
  evidence jsonb,
  conflicts jsonb,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path=pg_catalog,public,private_verification,auth
as $fn$
begin
  if auth.uid() is null or not public.is_brinesearch_owner(auth.uid()) then
    raise exception 'Owner access required';
  end if;
  return query
  select c.id,r.id,s.source_key,s.source_name,s.base_url,r.source_record_id,
    r.state,r.entity_type,r.official_name,r.operator_raw,r.official_status,
    r.county,r.township_or_municipality,r.latitude,r.longitude,c.pad_id,
    case when p.id is null then null else jsonb_strip_nulls(jsonb_build_object(
      'id',p.id,
      'legacy_id',p.legacy_id,
      'company',p.company,
      'state',p.state,
      'pad_name',p.pad_name,
      'record_type',p.record_type,
      'county',p.county,
      'township',p.township,
      'latitude',p.latitude,
      'longitude',p.longitude,
      'well_name',p.well_name,
      'api',p.api,
      'operating_status',p.operating_status,
      'verification_status',p.verification_status
    )) end,
    c.result_category,c.match_method,c.confidence,c.review_status,
    c.review_priority,c.driver_usefulness,c.priority_reason,
    c.evidence,c.conflicts,r.first_seen_at,r.last_seen_at,count(*) over()
  from private_verification.public_data_match_candidates c
  join private_verification.public_data_source_records r on r.id=c.source_record_id
  join private_verification.public_data_sources s on s.id=r.source_id
  left join public.pads p on p.id=c.pad_id
  where (p_review_status is null or p_review_status='all' or c.review_status=p_review_status)
    and (p_category is null or p_category='all' or c.result_category=p_category)
    and (p_source_key is null or p_source_key='all' or s.source_key=p_source_key)
    and (p_state is null or p_state='all' or r.state=p_state)
    and (p_entity_type is null or p_entity_type='all' or r.entity_type=p_entity_type)
    and (p_usefulness is null or p_usefulness='all' or c.driver_usefulness=p_usefulness)
    and c.review_priority>=greatest(0,least(coalesce(p_min_priority,0),100))
    and (
      p_search is null or btrim(p_search)=''
      or coalesce(r.official_name,'') ilike '%'||p_search||'%'
      or coalesce(r.operator_raw,'') ilike '%'||p_search||'%'
      or coalesce(r.county,'') ilike '%'||p_search||'%'
      or coalesce(r.township_or_municipality,'') ilike '%'||p_search||'%'
      or coalesce(r.normalized_facts->>'api','') ilike '%'||regexp_replace(p_search,'[^0-9]','','g')||'%'
      or coalesce(p.pad_name,'') ilike '%'||p_search||'%'
      or coalesce(p.company,'') ilike '%'||p_search||'%'
    )
  order by c.review_priority desc,c.updated_at desc,r.official_name
  limit greatest(1,least(coalesce(p_limit,25),100))
  offset greatest(coalesce(p_offset,0),0);
end
$fn$;

create or replace function public.public_data_review_detail(p_candidate_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private_verification,auth
as $fn$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_brinesearch_owner(auth.uid()) then
    raise exception 'Owner access required';
  end if;
  select jsonb_build_object(
    'candidate',to_jsonb(c),
    'source',jsonb_strip_nulls(jsonb_build_object(
      'source_key',s.source_key,
      'source_name',s.source_name,
      'agency',s.agency,
      'source_type',s.source_type,
      'official',s.official,
      'base_url',s.base_url,
      'health_status',s.health_status,
      'last_success_at',s.last_success_at,
      'source_record_id',r.source_record_id,
      'source_publication_date',r.source_publication_date,
      'first_seen_at',r.first_seen_at,
      'last_seen_at',r.last_seen_at,
      'retired_at',r.retired_at,
      'raw_facts',r.raw_facts,
      'normalized_facts',r.normalized_facts,
      'source_content_hash',r.source_content_hash
    )),
    'saved',case when p.id is null then null else jsonb_strip_nulls(jsonb_build_object(
      'id',p.id,
      'legacy_id',p.legacy_id,
      'company',p.company,
      'state',p.state,
      'pad_name',p.pad_name,
      'record_type',p.record_type,
      'county',p.county,
      'township',p.township,
      'latitude',p.latitude,
      'longitude',p.longitude,
      'well_name',p.well_name,
      'api',p.api,
      'operating_status',p.operating_status,
      'verification_status',p.verification_status,
      'extra_data',p.extra_data,
      'well_entries',p.well_entries
    )) end,
    'proposals',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at)
      from private_verification.public_data_proposals x
      where x.match_candidate_id=c.id
    ),'[]'::jsonb),
    'well_links',coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id',l.id,
        'pad_source_record_id',l.pad_source_record_id,
        'well_source_record_id',l.well_source_record_id,
        'canonical_api',l.canonical_api,
        'well_name',l.well_name,
        'operator',l.operator,
        'county',l.county,
        'township',l.township,
        'well_status',l.well_status,
        'latitude',l.latitude,
        'longitude',l.longitude,
        'distance_miles',l.distance_miles,
        'link_method',l.link_method,
        'confidence',l.confidence,
        'evidence',l.evidence,
        'conflicts',l.conflicts,
        'review_status',l.review_status
      )) order by l.canonical_api)
      from private_verification.public_data_candidate_well_links l
      where l.pad_source_record_id=r.id
         or l.well_public_data_source_record_id=r.id
    ),'[]'::jsonb),
    'review_history',coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at desc)
      from private_verification.public_data_review_events e
      where e.match_candidate_id=c.id
    ),'[]'::jsonb)
  ) into v_result
  from private_verification.public_data_match_candidates c
  join private_verification.public_data_source_records r on r.id=c.source_record_id
  join private_verification.public_data_sources s on s.id=r.source_id
  left join public.pads p on p.id=c.pad_id
  where c.id=p_candidate_id;
  if v_result is null then
    raise exception 'Public data candidate not found';
  end if;
  return v_result;
end
$fn$;

create or replace function public.public_data_review_decide(
  p_candidate_id uuid,
  p_decision text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private_verification,auth
as $fn$
declare
  v_reviewer uuid:=auth.uid();
  v_status text;
  v_before jsonb;
  v_candidate private_verification.public_data_match_candidates%rowtype;
begin
  if v_reviewer is null or not public.is_brinesearch_owner(v_reviewer) then
    raise exception 'Owner access required';
  end if;
  if p_decision not in(
    'keep_saved','save_as_alias','attach_official_record','add_new_well',
    'mark_operator_history','needs_field_check','reject','create_new_record',
    'reclassify_facility','defer','reopen'
  ) then
    raise exception 'Invalid public data review decision';
  end if;
  select * into v_candidate
  from private_verification.public_data_match_candidates
  where id=p_candidate_id
  for update;
  if not found then
    raise exception 'Public data candidate not found';
  end if;
  v_before:=jsonb_build_object(
    'review_status',v_candidate.review_status,
    'pad_id',v_candidate.pad_id,
    'result_category',v_candidate.result_category,
    'match_method',v_candidate.match_method,
    'confidence',v_candidate.confidence
  );
  v_status:=case
    when p_decision='needs_field_check' then 'needs_field_confirmation'
    when p_decision='reject' then 'rejected'
    when p_decision='defer' then 'deferred'
    when p_decision='reopen' then 'needs_owner_review'
    else 'confirmed'
  end;
  update private_verification.public_data_match_candidates
  set review_status=v_status,
      updated_at=now()
  where id=p_candidate_id;
  insert into private_verification.public_data_review_events(
    proposal_id,match_candidate_id,pad_id,decision,previous_value,
    proposed_value,evidence,reviewer_id,reviewer_note,created_at
  ) values(
    null,p_candidate_id,v_candidate.pad_id,p_decision,v_before,
    jsonb_build_object('review_status',v_status,'apply_live_changes',false),
    jsonb_build_object(
      'candidate_result_category',v_candidate.result_category,
      'candidate_match_method',v_candidate.match_method
    ),
    v_reviewer,nullif(btrim(p_note),''),now()
  );
  return public.public_data_review_detail(p_candidate_id);
end
$fn$;

revoke all on function public.public_data_review_summary() from public,anon;
revoke all on function public.public_data_review_queue(
  text,text,text,text,text,text,text,integer,integer,integer
) from public,anon;
revoke all on function public.public_data_review_detail(uuid) from public,anon;
revoke all on function public.public_data_review_decide(uuid,text,text) from public,anon;

grant execute on function public.public_data_review_summary()
  to authenticated,service_role;
grant execute on function public.public_data_review_queue(
  text,text,text,text,text,text,text,integer,integer,integer
) to authenticated,service_role;
grant execute on function public.public_data_review_detail(uuid)
  to authenticated,service_role;
grant execute on function public.public_data_review_decide(uuid,text,text)
  to authenticated,service_role;
