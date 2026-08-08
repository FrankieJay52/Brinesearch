do $patch$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(
    'private_verification.stage_live_odnr_class_ii_disposals_batch(bigint,integer)'::regprocedure
  ) into v_def;
  v_old:='join private_verification.pad_api_tokens_20260803 t on t.api_digits=r.normalized_facts->>''api''';
  v_new:='join private_verification.pad_api_tokens_20260803 t on (t.api_digits=r.normalized_facts->>''api'' or t.api_base10=left(r.normalized_facts->>''api'',10))';
  if position(v_old in v_def)=0 then
    raise exception 'Expected Class II API join not found';
  end if;
  execute replace(v_def,v_old,v_new);
end
$patch$;

update private_verification.public_data_source_records
set normalized_facts=normalized_facts||jsonb_build_object(
  'api_base10',left(normalized_facts->>'api',10)
)
where source_id=(
  select id from private_verification.public_data_sources
  where source_key='oh_odnr_live_class_ii_disposal_wells'
)
and normalized_facts->>'api' is not null;

create temporary table tmp_class_ii_base_matches on commit drop as
select r.id source_record_uuid,t.pad_id,p.record_type
from private_verification.public_data_source_records r
join private_verification.pad_api_tokens_20260803 t
  on t.api_digits=r.normalized_facts->>'api'
  or t.api_base10=left(r.normalized_facts->>'api',10)
join public.pads p on p.id=t.pad_id
where r.source_id=(
  select id from private_verification.public_data_sources
  where source_key='oh_odnr_live_class_ii_disposal_wells'
);

create temporary table tmp_class_ii_base_summary on commit drop as
select r.id source_record_uuid,
  count(distinct m.pad_id) filter(where m.record_type='disposal') disposal_count,
  (array_agg(m.pad_id order by m.pad_id::text)
    filter(where m.record_type='disposal'))[1] selected_disposal_id,
  count(distinct m.pad_id) filter(where m.record_type<>'disposal') non_disposal_count,
  coalesce(jsonb_agg(distinct jsonb_build_object(
    'pad_id',m.pad_id,
    'record_type',m.record_type,
    'match_method','exact_api_base_or_full'
  )) filter(where m.pad_id is not null),'[]'::jsonb) matches
from private_verification.public_data_source_records r
left join tmp_class_ii_base_matches m on m.source_record_uuid=r.id
where r.source_id=(
  select id from private_verification.public_data_sources
  where source_key='oh_odnr_live_class_ii_disposal_wells'
)
group by r.id;

delete from private_verification.public_data_match_candidates c
using tmp_class_ii_base_summary s
where c.source_record_id=s.source_record_uuid
  and s.disposal_count=1
  and c.result_category in(
    'NEW_DISPOSAL_CANDIDATE','NEEDS_OWNER_REVIEW','POSSIBLE_DUPLICATE'
  );

insert into private_verification.public_data_match_candidates
(source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
select s.source_record_uuid,s.selected_disposal_id,
  'VERIFIED_EXISTING_RECORD',
  'exact_injection_api_base_or_full_to_saved_disposal',
  1.0,
  jsonb_build_array(
    jsonb_build_object('kind','exact_api','value',r.normalized_facts->'api'),
    jsonb_build_object('kind','exact_api_base10','value',r.normalized_facts->'api_base10'),
    jsonb_build_object('kind','official_status','value',r.official_status)
  ),
  '[]'::jsonb,'confirmed',now(),now()
from tmp_class_ii_base_summary s
join private_verification.public_data_source_records r on r.id=s.source_record_uuid
where s.disposal_count=1
on conflict(
  source_record_id,
  (coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),
  result_category
)
do update set
  match_method=excluded.match_method,
  confidence=excluded.confidence,
  evidence=excluded.evidence,
  conflicts=excluded.conflicts,
  review_status='confirmed',
  updated_at=now();

insert into private_verification.public_data_match_candidates
(source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
select s.source_record_uuid,null,
  'POSSIBLE_DUPLICATE',
  'exact_injection_api_base_or_full_attached_to_multiple_disposals',
  0.50,
  jsonb_build_array(
    jsonb_build_object('kind','exact_disposal_api_match_count','value',s.disposal_count)
  ),
  s.matches,'needs_owner_review',now(),now()
from tmp_class_ii_base_summary s
where s.disposal_count>1
on conflict(
  source_record_id,
  (coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),
  result_category
)
do update set
  evidence=excluded.evidence,
  conflicts=excluded.conflicts,
  review_status='needs_owner_review',
  updated_at=now();

insert into private_verification.public_data_match_candidates
(source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
select r.id,m.pad_id,
  'API_CONFLICT',
  'injection_api_base_or_full_attached_to_non_disposal_record',
  1.0,
  jsonb_build_array(
    jsonb_build_object('kind','official_injection_api','value',r.normalized_facts->'api'),
    jsonb_build_object('kind','official_injection_api_base10','value',r.normalized_facts->'api_base10')
  ),
  jsonb_build_array(jsonb_build_object(
    'field','record_type',
    'saved_pad_id',m.pad_id,
    'saved_record_type',m.record_type,
    'official_entity_type','injection'
  )),
  'needs_owner_review',now(),now()
from private_verification.public_data_source_records r
join tmp_class_ii_base_matches m
  on m.source_record_uuid=r.id and m.record_type<>'disposal'
on conflict(
  source_record_id,
  (coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),
  result_category
)
do update set
  evidence=excluded.evidence,
  conflicts=excluded.conflicts,
  review_status='needs_owner_review',
  updated_at=now();

delete from private_verification.public_data_match_candidates c
using tmp_class_ii_base_summary s
where c.source_record_id=s.source_record_uuid
  and c.pad_id is null
  and s.disposal_count=1
  and c.result_category in(
    'OPERATOR_CHANGE_OR_ALIAS','STATUS_UPDATE','LOCATION_CONFLICT'
  )
  and exists(
    select 1
    from private_verification.public_data_match_candidates x
    where x.source_record_id=c.source_record_id
      and x.pad_id=s.selected_disposal_id
      and x.result_category=c.result_category
  );

update private_verification.public_data_match_candidates c
set pad_id=s.selected_disposal_id,
    updated_at=now()
from tmp_class_ii_base_summary s
where c.source_record_id=s.source_record_uuid
  and c.pad_id is null
  and s.disposal_count=1
  and c.result_category in(
    'OPERATOR_CHANGE_OR_ALIAS','STATUS_UPDATE','LOCATION_CONFLICT'
  );

insert into private_verification.public_data_match_candidates
(source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
select s.source_record_uuid,s.selected_disposal_id,
  'STATUS_UPDATE',
  'current_class_ii_status_for_saved_disposal',
  1.0,
  jsonb_build_array(
    jsonb_build_object('kind','saved_operating_status','value',p.operating_status),
    jsonb_build_object('kind','current_official_status','value',r.official_status),
    jsonb_build_object('kind','api','value',r.normalized_facts->'api')
  ),
  '[]'::jsonb,'needs_owner_review',now(),now()
from tmp_class_ii_base_summary s
join private_verification.public_data_source_records r on r.id=s.source_record_uuid
join public.pads p on p.id=s.selected_disposal_id
where s.disposal_count=1
  and private_verification.normalize_identity_words(r.official_status)<>
      private_verification.normalize_identity_words(p.operating_status)
on conflict(
  source_record_id,
  (coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),
  result_category
)
do update set
  evidence=excluded.evidence,
  confidence=excluded.confidence,
  review_status='needs_owner_review',
  updated_at=now();

update private_verification.public_data_sources
set source_metadata=source_metadata||jsonb_build_object(
      'api_match_version','full-or-base10-v2'
    ),
    updated_at=now()
where source_key='oh_odnr_live_class_ii_disposal_wells';
