create table private_verification.well_cleanup_backup_20260809_v17311 as
select id as pad_id, legacy_id, company, pad_name, state, county, township,
       well_name, api, property_number, well_entries, extra_data, updated_at,
       now() as backed_up_at
from public.pads;
alter table private_verification.well_cleanup_backup_20260809_v17311 add primary key (pad_id);

create table private_verification.well_resolution_v17311 (
  pad_id uuid not null references public.pads(id) on delete cascade,
  legacy_id text not null,
  row_order integer not null,
  api_digits text,
  api_display text,
  well_name text,
  property_number text,
  official_match boolean not null default false,
  attachment_verified boolean not null default false,
  official_status text,
  official_operator text,
  official_county text,
  official_township text,
  official_source text,
  official_latitude double precision,
  official_longitude double precision,
  resolution_method text not null,
  saved_name text,
  saved_api text,
  saved_property text,
  added_from_official boolean not null default false,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (pad_id,row_order)
);
create index well_resolution_v17311_api_idx on private_verification.well_resolution_v17311(api_digits);

create temporary table tmp_well_corrections(legacy_id text, old_api text, new_api text, reason text) on commit drop;
insert into tmp_well_corrections values
 ('antero--farnsworth','34111145550000','34111245550000','Saved API digit typo; official Farnsworth-Ulrich 2HU record.'),
 ('ascent--duke','34067245010000','34067216900000','Saved 3H API replaced by current official Duke SHC HR 3H API.'),
 ('ascent--duke','34067245040000','34067216930000','Saved 1H API replaced by current official Duke W SHC HR 1H API.'),
 ('ascent--dwayne','34067244980000','34067216870000','Saved 6H API replaced by current official Dwayne E GRN HR 6H API.'),
 ('ascent--dwayne','34067244970000','34067216860000','Saved 2H API replaced by current official Dwayne W GRN HR 2H API.'),
 ('ascent--dwayne','34067244990000','34067216880000','Saved 4H API replaced by current official Dwayne GRN HR 4H API.'),
 ('ascent--liggett','34067268000000','34067217680000','Saved 1H API replaced by current official Liggett NW ATH HR 1H API.'),
 ('ascent--omaits','34081208010100','34081208010000','Saved sidetrack-style orphan API collapsed to current official Omaits 3H API.'),
 ('ascent--pickens','34067214520008','34067216520000','Malformed saved API aligned to official Pickens W SHC HR 3H record.'),
 ('ascent--reitz','34013206780000','34013208670000','Saved 1H API replaced by official Reitz Unit 1H API.'),
 ('ascent--reitz','34013206890000','34013208680000','Saved 5H API was attached to another official well; replaced by Reitz Unit 5H API.'),
 ('eog--rose','34019227880000','34019227880100','Saved Rose 0801 base API aligned to current producing 1H sidetrack API.'),
 ('gulfport--faye','34013225250000','34013215250000','Saved Faye 3A API digit typo corrected to official Faye 210215 3A API.'),
 ('gulfport--stutzman','34013206690100','34013206700100','Saved Stutzman 1-14H API replaced by current official producing 1-14H API.'),
 ('swn--dmc-east','34125274490000','37125274490000','Pennsylvania DMC East API had Ohio state prefix; corrected to PA API 37.');

create temporary table tmp_confirmed_well_assoc on commit drop as
with pad_matches as (
  select c.pad_id,c.source_record_id as pad_source_record_id
  from private_verification.public_data_match_candidates c
  join private_verification.public_data_source_records s on s.id=c.source_record_id
  where c.review_status='confirmed'
    and c.result_category='VERIFIED_EXISTING_RECORD'
    and c.pad_id is not null
    and s.entity_type='pad'
), raw as (
  select pm.pad_id,
         case when length(regexp_replace(l.canonical_api,'[^0-9]','','g'))=10
              then regexp_replace(l.canonical_api,'[^0-9]','','g')||'0000'
              else regexp_replace(l.canonical_api,'[^0-9]','','g') end as api_digits,
         nullif(regexp_replace(trim(coalesce(l.well_name,'')),'[[:space:]]+',' ','g'),'') as well_name,
         nullif(trim(l.well_status),'') as well_status,
         nullif(trim(l.operator),'') as operator,
         nullif(trim(l.county),'') as county,
         nullif(trim(l.township),'') as township,
         l.link_method,l.confidence
  from pad_matches pm
  join private_verification.public_data_candidate_well_links l using(pad_source_record_id)
  where l.review_status='confirmed'
    and nullif(regexp_replace(coalesce(l.canonical_api,''),'[^0-9]','','g'),'') is not null
), ranked as (
  select *,row_number() over(partition by pad_id,api_digits order by confidence desc,link_method) rn
  from raw where length(api_digits)=14
)
select * from ranked where rn=1;
create index on tmp_confirmed_well_assoc(pad_id,api_digits);

create temporary table tmp_official_well_source on commit drop as
with source_rows as (
  select
    case
      when length(regexp_replace(coalesce(s.normalized_facts->>'api',s.normalized_facts->>'api_base10'),'[^0-9]','','g'))=10
        then regexp_replace(coalesce(s.normalized_facts->>'api',s.normalized_facts->>'api_base10'),'[^0-9]','','g')||'0000'
      else regexp_replace(coalesce(s.normalized_facts->>'api',s.normalized_facts->>'api_base10'),'[^0-9]','','g')
    end api_digits,
    case when lower(coalesce(s.state,''))='west virginia' and nullif(trim(s.normalized_facts->>'well_number'),'') is not null
         then regexp_replace(trim(s.normalized_facts->>'well_number'),'[[:space:]]+',' ','g')
         else regexp_replace(trim(coalesce(s.official_name,s.normalized_facts->>'well_name')),'[[:space:]]+',' ','g') end well_name,
    nullif(trim(coalesce(s.official_status,s.normalized_facts->>'well_status')),'') well_status,
    nullif(trim(s.operator_raw),'') operator,
    nullif(trim(s.county),'') county,
    nullif(trim(s.township_or_municipality),'') township,
    s.latitude,s.longitude,
    case lower(coalesce(s.state,'')) when 'ohio' then 'Ohio official well record' when 'pennsylvania' then 'PA DEP official well record' when 'west virginia' then 'WV official well record' else 'Official public well record' end source_label,
    coalesce(s.last_seen_at,s.source_publication_date,s.first_seen_at) checked_at,
    1 priority
  from private_verification.public_data_source_records s
  where s.entity_type='well' and s.retired_at is null
    and (s.normalized_facts ? 'api' or s.normalized_facts ? 'api_base10')
  union all
  select
    case when length(regexp_replace(e->>'api','[^0-9]','','g'))=10 then regexp_replace(e->>'api','[^0-9]','','g')||'0000' else regexp_replace(e->>'api','[^0-9]','','g') end,
    regexp_replace(trim(e->>'well_name'),'[[:space:]]+',' ','g'),nullif(trim(e->>'well_status'),''),nullif(trim(e->>'operator'),''),nullif(trim(e->>'county'),''),nullif(trim(e->>'township'),''),
    case when coalesce(e->>'wellhead_latitude','') ~ '^-?[0-9]+([.][0-9]+)?$' then (e->>'wellhead_latitude')::double precision end,
    case when coalesce(e->>'wellhead_longitude','') ~ '^-?[0-9]+([.][0-9]+)?$' then (e->>'wellhead_longitude')::double precision end,
    coalesce(nullif(e->>'source',''),'Saved official well record'),p.updated_at,2
  from public.pads p cross join lateral jsonb_array_elements(coalesce(p.extra_data->'official_well_records','[]'::jsonb)) e
  where nullif(regexp_replace(coalesce(e->>'api',''),'[^0-9]','','g'),'') is not null
  union all
  select
    case when length(regexp_replace(u.canonical_api,'[^0-9]','','g'))=10 then regexp_replace(u.canonical_api,'[^0-9]','','g')||'0000' else regexp_replace(u.canonical_api,'[^0-9]','','g') end,
    regexp_replace(trim(u.well_name),'[[:space:]]+',' ','g'),nullif(trim(u.official_status),''),nullif(trim(u.operator),''),nullif(trim(u.county),''),nullif(trim(u.township),''),u.latitude,u.longitude,
    coalesce(nullif(u.source,''),'Official well snapshot'),null::timestamptz,3
  from private_verification.official_wells_unified_20260803 u where nullif(u.canonical_api,'') is not null
  union all
  select regexp_replace(i.api,'[^0-9]','','g'),regexp_replace(trim(i.well_name),'[[:space:]]+',' ','g'),nullif(trim(i.well_status),''),nullif(trim(i.operator),''),nullif(trim(i.county),''),nullif(trim(i.township),''),i.latitude,i.longitude,'Ohio Class II official snapshot',i.fetched_at,3
  from private_verification.ohio_injection_20260803 i where nullif(i.api,'') is not null
  union all
  select regexp_replace(w.api,'[^0-9]','','g')||'0000',
         regexp_replace(trim(coalesce(nullif(w.well_number,''),w.lease_name)),'[[:space:]]+',' ','g'),nullif(trim(w.status),''),nullif(trim(w.current_operator),''),nullif(trim(w.county),''),nullif(trim(w.tax_district),''),w.latitude,w.longitude,'WV official well snapshot',w.fetched_at,3
  from private_verification.wv_official_20260803 w where length(regexp_replace(coalesce(w.api,''),'[^0-9]','','g'))=10
  union all
  select '37'||lpad(regexp_replace(pa.permit_number,'[^0-9]','','g'),8,'0')||'0000',
         regexp_replace(trim(pa.well_name),'[[:space:]]+',' ','g'),nullif(trim(pa.well_status),''),nullif(trim(pa.operator),''),nullif(trim(pa.county),''),nullif(trim(pa.municipality),''),pa.latitude,pa.longitude,'PA DEP official well snapshot',pa.fetched_at,3
  from private_verification.pa_wells_20260803 pa where nullif(pa.permit_number,'') is not null
), ranked as (
  select *,row_number() over(partition by api_digits order by priority,
    case when lower(coalesce(well_status,'')) ~ '(producing|active|completed|drilled|drilling|plugged back)' then 0 else 1 end,
    checked_at desc nulls last, length(coalesce(well_name,'')) desc) rn
  from source_rows where length(api_digits)=14
)
select api_digits,well_name,well_status,operator,county,township,latitude,longitude,source_label,checked_at
from ranked where rn=1;
create unique index on tmp_official_well_source(api_digits);

create temporary table tmp_saved_slots on commit drop as
with b as (
  select p.id pad_id,p.legacy_id,p.state,
    regexp_split_to_array(nullif(trim(coalesce(p.well_name,'')),''),'\s*\|\s*') names,
    regexp_split_to_array(nullif(trim(coalesce(p.api,'')),''),'\s*\|\s*') apis,
    regexp_split_to_array(nullif(trim(coalesce(p.property_number,'')),''),'\s*\|\s*') props
  from public.pads p
), raw as (
  select b.pad_id,b.legacy_id,b.state,i as saved_order,
    nullif(trim(b.names[i]),'') saved_name,nullif(trim(b.apis[i]),'') saved_api,nullif(trim(b.props[i]),'') saved_property
  from b cross join lateral generate_series(1,greatest(coalesce(array_length(names,1),0),coalesce(array_length(apis,1),0),coalesce(array_length(props,1),0))) i
), prepared as (
  select r.*,
    regexp_replace(coalesce(r.saved_api,''),'[^0-9]','','g') raw_api_digits,
    regexp_replace(lower(coalesce(r.saved_name,'')),'[^a-z0-9]','','g') norm_name,
    case
      when r.saved_property in ('—','.','?','//') then null
      when r.saved_property ~ '^-?[0-9]{1,3}[.][0-9]+$' then null
      when r.saved_property ~ '^[0-9]{6,8}[.][^0-9]*$' then regexp_replace(r.saved_property,'[.].*$','')
      else r.saved_property end clean_property
  from raw r
), name_matches as (
  select p.pad_id,p.saved_order,a.api_digits,
         row_number() over(partition by p.pad_id,p.saved_order order by a.api_digits) rn,
         count(*) over(partition by p.pad_id,p.saved_order) candidate_count
  from prepared p join tmp_confirmed_well_assoc a on a.pad_id=p.pad_id
    and p.saved_api is null and p.saved_name is not null
    and regexp_replace(lower(coalesce(a.well_name,'')),'[^a-z0-9]','','g')=p.norm_name
), one_name_match as (
  select pad_id,saved_order,api_digits from name_matches where rn=1 and candidate_count=1
)
select p.pad_id,p.legacy_id,p.saved_order,p.saved_name,p.saved_api,p.clean_property saved_property,
  coalesce(c.new_api,n.api_digits,
    case when p.raw_api_digits='' then null when length(p.raw_api_digits)=10 then p.raw_api_digits||'0000' else p.raw_api_digits end) api_digits,
  c.reason correction_reason,
  case when c.new_api is not null then 'saved_api_corrected_to_official'
       when n.api_digits is not null then 'saved_name_matched_to_confirmed_official_api'
       when p.saved_api is not null then 'saved_api'
       else 'saved_name_only' end base_method
from prepared p
left join tmp_well_corrections c on c.legacy_id=p.legacy_id and c.old_api=p.raw_api_digits
left join one_name_match n on n.pad_id=p.pad_id and n.saved_order=p.saved_order
where p.saved_name is not null or p.saved_api is not null;

create temporary table tmp_saved_dedup on commit drop as
with ranked as (
 select s.*,
   row_number() over(partition by s.pad_id,s.api_digits order by (s.saved_property is not null) desc,(s.saved_name is not null) desc,s.saved_order) rn
 from tmp_saved_slots s where s.api_digits is not null
)
select * from ranked where rn=1
union all
select s.*,1 rn from tmp_saved_slots s where s.api_digits is null and s.saved_name is not null;
create index on tmp_saved_dedup(pad_id,api_digits);

create temporary table tmp_official_additions_raw on commit drop as
select a.pad_id,a.api_digits,a.well_name,a.well_status,a.operator,a.county,a.township,
       'confirmed official pad/well link'::text source_method,1 source_priority
from tmp_confirmed_well_assoc a
union all
select c.pad_id,
  case when nullif(regexp_replace(coalesce(s.normalized_facts->>'api',''),'[^0-9]','','g'),'') is not null then
         case when length(regexp_replace(s.normalized_facts->>'api','[^0-9]','','g'))=10 then regexp_replace(s.normalized_facts->>'api','[^0-9]','','g')||'0000' else regexp_replace(s.normalized_facts->>'api','[^0-9]','','g') end
       when nullif(regexp_replace(coalesce(s.normalized_facts->>'api_base10',''),'[^0-9]','','g'),'') is not null then regexp_replace(s.normalized_facts->>'api_base10','[^0-9]','','g')||'0000' end,
  regexp_replace(trim(coalesce(s.official_name,s.normalized_facts->>'well_name')),'[[:space:]]+',' ','g'),coalesce(s.official_status,s.normalized_facts->>'well_status'),s.operator_raw,s.county,s.township_or_municipality,
  c.match_method,2
from private_verification.public_data_match_candidates c join private_verification.public_data_source_records s on s.id=c.source_record_id
where c.result_category='NEW_WELL_FOR_EXISTING_PAD' and c.review_status='needs_owner_review' and c.confidence>=.99 and c.pad_id is not null
  and s.entity_type='well' and s.retired_at is null
  and c.match_method in ('official_live_well_linked_to_verified_pad_missing_saved_api','exact_pa_well_pad_id_to_verified_pad_missing_saved_api')
  and (c.conflicts is null or c.conflicts='[]'::jsonb or c.conflicts='{}'::jsonb);

insert into tmp_official_additions_raw
select p.id,
       case when length(regexp_replace(coalesce(s.normalized_facts->>'api',s.normalized_facts->>'api_base10'),'[^0-9]','','g'))=10 then regexp_replace(coalesce(s.normalized_facts->>'api',s.normalized_facts->>'api_base10'),'[^0-9]','','g')||'0000' else regexp_replace(coalesce(s.normalized_facts->>'api',s.normalized_facts->>'api_base10'),'[^0-9]','','g') end,
       case when lower(coalesce(s.state,''))='west virginia' and nullif(trim(s.normalized_facts->>'well_number'),'') is not null then regexp_replace(trim(s.normalized_facts->>'well_number'),'[[:space:]]+',' ','g') else regexp_replace(trim(coalesce(s.official_name,s.normalized_facts->>'well_name')),'[[:space:]]+',' ','g') end,
       coalesce(s.official_status,s.normalized_facts->>'well_status'),s.operator_raw,s.county,s.township_or_municipality,
       'explicit exact official source completion',0
from (values
 ('ascent--duke','34067216940000'),
 ('ascent--dwayne','34067218300000'),('ascent--dwayne','34067218310000'),
 ('ascent--pickens','34067216530000'),
 ('expand--dallas-hall','47069002730000')
) t(legacy_id,api_digits)
join public.pads p on p.legacy_id=t.legacy_id
join private_verification.public_data_source_records s on s.entity_type='well' and s.retired_at is null
 and (case when length(regexp_replace(coalesce(s.normalized_facts->>'api',s.normalized_facts->>'api_base10'),'[^0-9]','','g'))=10 then regexp_replace(coalesce(s.normalized_facts->>'api',s.normalized_facts->>'api_base10'),'[^0-9]','','g')||'0000' else regexp_replace(coalesce(s.normalized_facts->>'api',s.normalized_facts->>'api_base10'),'[^0-9]','','g') end)=t.api_digits;

insert into tmp_official_additions_raw
select p.id,'37'||lpad(regexp_replace(pa.permit_number,'[^0-9]','','g'),8,'0')||'0000',regexp_replace(trim(pa.well_name),'[[:space:]]+',' ','g'),pa.well_status,pa.operator,pa.county,pa.municipality,
       'PA DEP exact well-pad-id completion',0
from public.pads p join private_verification.pa_wells_20260803 pa on p.legacy_id='swn--dmc-east' and pa.well_pad_id=151149 and lower(coalesce(pa.well_status,''))='active';

create temporary table tmp_official_additions on commit drop as
with ranked as (
 select r.*,row_number() over(partition by pad_id,api_digits order by source_priority,source_method) rn
 from tmp_official_additions_raw r where api_digits is not null and length(api_digits)=14
), one as (select * from ranked where rn=1), safe as (
 select o.* from one o
 where not exists(select 1 from tmp_saved_dedup s where s.api_digits=o.api_digits and s.pad_id<>o.pad_id)
)
select * from safe;
create index on tmp_official_additions(pad_id,api_digits);

create temporary table tmp_final_api_rows on commit drop as
select s.pad_id,s.legacy_id,s.saved_order*10 as row_order,s.api_digits,s.saved_name,s.saved_api,s.saved_property,s.base_method,
       false added_from_official,coalesce(s.correction_reason,'') method_note
from tmp_saved_dedup s where s.api_digits is not null
union all
select o.pad_id,p.legacy_id,100000+row_number() over(partition by o.pad_id order by coalesce(o.well_name,''),o.api_digits),o.api_digits,null,null,null,o.source_method,true,''
from tmp_official_additions o join public.pads p on p.id=o.pad_id
where not exists(select 1 from tmp_saved_dedup s where s.pad_id=o.pad_id and s.api_digits=o.api_digits);

create temporary table tmp_api_attachment_counts on commit drop as
select api_digits,count(distinct pad_id) pad_count from tmp_final_api_rows group by api_digits;

insert into private_verification.well_resolution_v17311(
 pad_id,legacy_id,row_order,api_digits,api_display,well_name,property_number,official_match,attachment_verified,
 official_status,official_operator,official_county,official_township,official_source,official_latitude,official_longitude,
 resolution_method,saved_name,saved_api,saved_property,added_from_official,evidence)
select f.pad_id,f.legacy_id,f.row_order,f.api_digits,
 substr(f.api_digits,1,2)||'-'||substr(f.api_digits,3,3)||'-'||substr(f.api_digits,6,1)||'-'||substr(f.api_digits,7,4)||'-'||substr(f.api_digits,11,2)||'-'||substr(f.api_digits,13,2),
 coalesce(nullif(os.well_name,''),nullif(f.saved_name,'')),nullif(f.saved_property,''),
 (os.api_digits is not null),
 (os.api_digits is not null and (ac.pad_count=1 or ca.pad_id is not null or f.added_from_official)),
 os.well_status,os.operator,os.county,os.township,os.source_label,os.latitude,os.longitude,
 case when f.added_from_official then 'official_well_added_to_existing_pad'
      when f.base_method='saved_api_corrected_to_official' then 'saved_api_corrected_to_official'
      when f.base_method='saved_name_matched_to_confirmed_official_api' then 'saved_name_matched_to_confirmed_official_api'
      when os.api_digits is not null then 'saved_api_exact_official'
      else 'saved_api_unresolved' end,
 f.saved_name,f.saved_api,f.saved_property,f.added_from_official,
 jsonb_strip_nulls(jsonb_build_object('method_note',nullif(f.method_note,''),'cross_pad_attachment_count',ac.pad_count,'confirmed_pad_well_link',ca.pad_id is not null))
from tmp_final_api_rows f
left join tmp_official_well_source os using(api_digits)
join tmp_api_attachment_counts ac using(api_digits)
left join tmp_confirmed_well_assoc ca on ca.pad_id=f.pad_id and ca.api_digits=f.api_digits;

insert into private_verification.well_resolution_v17311(
 pad_id,legacy_id,row_order,well_name,property_number,official_match,attachment_verified,resolution_method,saved_name,saved_property,added_from_official,evidence)
select s.pad_id,s.legacy_id,s.saved_order*10,nullif(s.saved_name,''),nullif(s.saved_property,''),false,false,'saved_name_without_api',s.saved_name,s.saved_property,false,
       jsonb_build_object('review_reason','Saved well name has no confirmed API number')
from tmp_saved_dedup s where s.api_digits is null and s.saved_name is not null;

create temporary table tmp_reordered on commit drop as
select pad_id,row_order,row_number() over(partition by pad_id order by row_order,coalesce(api_digits,''),coalesce(well_name,'')) new_order
from private_verification.well_resolution_v17311;
update private_verification.well_resolution_v17311 r set row_order=x.new_order
from tmp_reordered x where r.pad_id=x.pad_id and r.row_order=x.row_order;

with agg as (
 select pad_id,
   string_agg(coalesce(nullif(well_name,''),'—'),' | ' order by row_order) well_name,
   string_agg(coalesce(nullif(api_display,''),'—'),' | ' order by row_order) api,
   string_agg(coalesce(nullif(property_number,''),'—'),' | ' order by row_order) property_number,
   jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
     'well_name',coalesce(nullif(well_name,''),''),
     'api',coalesce(nullif(api_display,''),''),
     'property_number',coalesce(nullif(property_number,''),''),
     'verification_status',case when attachment_verified then 'official_exact' when api_digits is not null then 'review' else 'name_only_review' end,
     'official_status',official_status,
     'official_operator',official_operator,
     'resolution_method',resolution_method
   )) order by row_order) well_entries
 from private_verification.well_resolution_v17311 group by pad_id
)
update public.pads p set well_name=a.well_name,api=a.api,property_number=a.property_number,well_entries=a.well_entries,updated_at=now()
from agg a where p.id=a.pad_id;

with official as (
 select pad_id,jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
   'api',api_display,'api_digits',api_digits,'well_name',well_name,'well_status',official_status,'operator',official_operator,
   'county',official_county,'township',official_township,'source',official_source,'checked','2026-08-09',
   'wellhead_latitude',official_latitude,'wellhead_longitude',official_longitude,'verification_method',resolution_method
 )) order by row_order) rows
 from private_verification.well_resolution_v17311 where attachment_verified group by pad_id
), summary as (
 select pad_id,
   count(*) filter(where api_digits is not null) api_count,
   count(*) filter(where api_digits is not null and attachment_verified) exact_count,
   coalesce(jsonb_agg(api_display order by row_order) filter(where api_digits is not null and not attachment_verified),'[]'::jsonb) unmatched
 from private_verification.well_resolution_v17311 group by pad_id
)
update public.pads p set extra_data=
  jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(p.extra_data,'{}'::jsonb),'{official_well_records}',coalesce(o.rows,'[]'::jsonb),true),
      '{api_verification_summary}',
      jsonb_build_object('checked','2026-08-09','saved_api_count',s.api_count,'exact_odnr_matches',s.exact_count,'exact_official_matches',s.exact_count,'unmatched_count',s.api_count-s.exact_count,'unmatched_saved_apis',s.unmatched),true
    ),
    '{well_cleanup_20260809}',
    jsonb_build_object('version','17.3.11','normalized_one_well_per_row',true,'official_wells_added',(select count(*) from private_verification.well_resolution_v17311 rr where rr.pad_id=p.id and rr.added_from_official),'review_rows',(select count(*) from private_verification.well_resolution_v17311 rr where rr.pad_id=p.id and not rr.attachment_verified)),true
  ),updated_at=now()
from summary s left join official o using(pad_id) where p.id=s.pad_id;

select public.refresh_pad_verification_evidence(null);
