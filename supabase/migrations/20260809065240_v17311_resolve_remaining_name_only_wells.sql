create table private_verification.well_name_only_backup_20260809_v17311 as
select r.*,now() as backed_up_at
from private_verification.well_resolution_v17311 r
where r.api_digits is null;

create table private_verification.well_name_only_resolution_20260809_v17311 (
  legacy_id text not null,
  saved_well_name text not null,
  action text not null check(action in ('resolve_official_api','remove_duplicate_or_nonwell')),
  api_digits text,
  official_well_name text,
  official_status text,
  official_operator text,
  official_source text,
  evidence text not null,
  resolved_at timestamptz not null default now(),
  primary key(legacy_id,saved_well_name)
);

insert into private_verification.well_name_only_resolution_20260809_v17311 values
('antero--mulvay','Mulvay Unit 2H','resolve_official_api','47085101060000','MULVAY UNIT 2H','Active Well','ANTERO RESOURCES CORPORATION','WVDEP live official well record','Exact well number/API in current WVDEP record; historical snapshot also matches Mulvay Unit 2H.'),
('ascent--club','Club-Se-Smf-Jf-8H','resolve_official_api','34081207000000','CLUB SE SMF JF 8H','Producing','ASCENT RESOURCES UTICA LLC','ODNR live official well record','Exact normalized official well name and Smithfield pad vicinity.'),
('ascent--roxy','Roxy-Ne-Crc-Jf-5H','resolve_official_api','34081208100000','ROXY NE CRC JF 5H','Producing','ASCENT RESOURCES UTICA LLC','ODNR live official well record','Exact normalized official well name; official wellhead is on the Roxy pad.'),
('cnx--wdtn-9','Wdtn19ehsm','resolve_official_api','47061019030000','WDTN19EHSM','Active Well','CNX GAS COMPANY LLC','WVDEP live official well record','Exact WVDEP well number WDTN19EHSM; API 47-061-0-1903.'),
('disposals--buckeye-solids','Chk Tus Swd (Swiw #14) 1','resolve_official_api','34157255190000','CHK TUS SWD (SWIW #14) 1','Active Injection','EAP OHIO LLC','ODNR Class II official snapshot','Exact Class II injection well name in Tuscarawas County.'),
('infinity--casper','Casper-3-H','resolve_official_api','34019228570000','Casper 3HU','Producing','INR OHIO LLC','ODNR live official well record','Casper lease, 3H/3HU identity and official wellhead within the saved Casper pad area.'),
('infinity--gray-well-pad','Gray-W-1HU','resolve_official_api','34059247120000','Gray W 1HU','Producing','INR OHIO LLC','ODNR live official well record','Exact normalized official name.'),
('infinity--gray-well-pad','Gray--W-3HU','resolve_official_api','34059247130000','Gray W 3HU','Producing','INR OHIO LLC','ODNR live official well record','Exact normalized official name.'),
('infinity--gray-well-pad','Gray-CW-5HU','resolve_official_api','34059247140000','Gray CW 5HU','Producing','INR OHIO LLC','ODNR live official well record','Exact normalized official name.'),
('infinity--gray-well-pad','Gray-CW-7HU','resolve_official_api','34059247150000','Gray CW 7HU','Producing','INR OHIO LLC','ODNR live official well record','Exact normalized official name.'),
('penn-energy--w-76','Per W76 3H','resolve_official_api','37019228890000','PER W76 3H','Active','PENNENERGY RESOURCES LLC','PA DEP live official well record','Exact PA DEP well name and W76 well-pad identity.');

insert into private_verification.well_name_only_resolution_20260809_v17311(legacy_id,saved_well_name,action,evidence) values
('antero--andes','Quinn Unit 1H','remove_duplicate_or_nonwell','Historical shorthand duplicates verified ANDES-QUINN 1HU on the same pad.'),
('ascent--atlas','Atlas-Nw-Wel-Jf-3H','remove_duplicate_or_nonwell','Duplicate shorthand of verified Atlas NW WEL JF 3H.'),
('ascent--blayney','Blayney-W-Whl-Bl-1H-A','remove_duplicate_or_nonwell','Duplicate formatting variant of verified BLAYNEY W WHL BL 1H-A.'),
('ascent--coffield','Coffield-E-Rch-Bl-8H','remove_duplicate_or_nonwell','Legacy directional shorthand duplicates the verified COFFIELD SE RCH BL 8H row; no second 8H exists in current official data.'),
('ascent--elite','Elite-E-Mtp-Jf-5H','remove_duplicate_or_nonwell','Duplicate formatting variant of verified ELITE E MTP JF 5H.'),
('ascent--grand','Grand-E-Wrn-Bl-7H','remove_duplicate_or_nonwell','Duplicate formatting variant of verified Grand E WRN BL 7H.'),
('ascent--kemper','B8H','remove_duplicate_or_nonwell','Shorthand duplicates verified KEMPER B UNIT 8H.'),
('ascent--lincoln','Lincoln-Se-Mds-Gr-8H','remove_duplicate_or_nonwell','Duplicate formatting variant of verified LINCOLN SE MDS GR 8H.'),
('ascent--matador','Matador-Mrn-Nb-4H','remove_duplicate_or_nonwell','Legacy shorthand duplicates verified MATADOR MR NBL 30 4H.'),
('ascent--matador','Matador-Mrn-Nb-6H','remove_duplicate_or_nonwell','Legacy shorthand duplicates verified MATADOR MR NBL 30 6H.'),
('ascent--pearl','1-H','remove_duplicate_or_nonwell','Shorthand duplicates verified Pearl NW WEL JF 1H; no second Pearl 1H in official data.'),
('ascent--una','Una-N-Shc-Hr-5H','remove_duplicate_or_nonwell','Duplicate formatting variant of verified Una N SHC HR 5H.'),
('eog--hm-yoder','33-8-2-3H','remove_duplicate_or_nonwell','Shorthand duplicates verified HM YODER 33-8-2 3H.'),
('eog--hm-yoder','33-8-2-5H','remove_duplicate_or_nonwell','Shorthand duplicates verified HM YODER 33-8-2 5H.'),
('eog--shadow','Shadow (Update: 2/15/26)','remove_duplicate_or_nonwell','Pad/update annotation, not a specific well name.'),
('gulfport--kilburn','Kilburn-211923-3A','remove_duplicate_or_nonwell','Duplicate formatting variant of verified Kilburn 211923 3A.'),
('swn--jesse-stalder','Jesse-Stalder','remove_duplicate_or_nonwell','Generic pad label; four specific Jesse Stalder official wells are already listed.');

update private_verification.well_resolution_v17311 r
set api_digits=x.api_digits,
    api_display=substr(x.api_digits,1,2)||'-'||substr(x.api_digits,3,3)||'-'||substr(x.api_digits,6,1)||'-'||substr(x.api_digits,7,4)||'-'||substr(x.api_digits,11,2)||'-'||substr(x.api_digits,13,2),
    well_name=x.official_well_name,
    official_match=true,
    attachment_verified=true,
    official_status=x.official_status,
    official_operator=x.official_operator,
    official_source=x.official_source,
    resolution_method='saved_name_resolved_exact_official',
    evidence=r.evidence||jsonb_build_object('name_only_resolution',x.evidence)
from private_verification.well_name_only_resolution_20260809_v17311 x
where x.action='resolve_official_api' and r.legacy_id=x.legacy_id and r.well_name=x.saved_well_name and r.api_digits is null;

with live as (
 select case when length(regexp_replace(coalesce(s.normalized_facts->>'api',s.normalized_facts->>'api_base10'),'[^0-9]','','g'))=10
             then regexp_replace(coalesce(s.normalized_facts->>'api',s.normalized_facts->>'api_base10'),'[^0-9]','','g')||'0000'
             else regexp_replace(coalesce(s.normalized_facts->>'api',s.normalized_facts->>'api_base10'),'[^0-9]','','g') end api_digits,
        s.county,s.township_or_municipality,s.latitude,s.longitude,
        row_number() over(partition by case when length(regexp_replace(coalesce(s.normalized_facts->>'api',s.normalized_facts->>'api_base10'),'[^0-9]','','g'))=10
             then regexp_replace(coalesce(s.normalized_facts->>'api',s.normalized_facts->>'api_base10'),'[^0-9]','','g')||'0000'
             else regexp_replace(coalesce(s.normalized_facts->>'api',s.normalized_facts->>'api_base10'),'[^0-9]','','g') end
             order by s.last_seen_at desc nulls last) rn
 from private_verification.public_data_source_records s
 where s.entity_type='well' and s.retired_at is null and (s.normalized_facts ? 'api' or s.normalized_facts ? 'api_base10')
)
update private_verification.well_resolution_v17311 r
set official_county=coalesce(r.official_county,l.county),official_township=coalesce(r.official_township,l.township_or_municipality),
    official_latitude=coalesce(r.official_latitude,l.latitude),official_longitude=coalesce(r.official_longitude,l.longitude)
from live l where l.rn=1 and r.resolution_method='saved_name_resolved_exact_official' and r.api_digits=l.api_digits;

update private_verification.well_resolution_v17311 r
set official_county=i.county,official_township=i.township,official_latitude=i.latitude,official_longitude=i.longitude
from private_verification.ohio_injection_20260803 i
where r.legacy_id='disposals--buckeye-solids' and r.api_digits=regexp_replace(i.api,'[^0-9]','','g') and r.api_digits='34157255190000';

delete from private_verification.well_resolution_v17311 r
using private_verification.well_name_only_resolution_20260809_v17311 x
where x.action='remove_duplicate_or_nonwell' and r.legacy_id=x.legacy_id and r.well_name=x.saved_well_name and r.api_digits is null;

create temporary table tmp_v17311_name_final_order on commit drop as
select pad_id,row_order,row_number() over(partition by pad_id order by row_order,coalesce(api_digits,''),coalesce(well_name,'')) new_order
from private_verification.well_resolution_v17311;
update private_verification.well_resolution_v17311 r set row_order=3000000+n.new_order
from tmp_v17311_name_final_order n where r.pad_id=n.pad_id and r.row_order=n.row_order;
update private_verification.well_resolution_v17311 set row_order=row_order-3000000 where row_order>=3000001;

with agg as (
 select pad_id,
   string_agg(coalesce(nullif(well_name,''),'—'),' | ' order by row_order) well_name,
   string_agg(coalesce(nullif(api_display,''),'—'),' | ' order by row_order) api,
   string_agg(coalesce(nullif(property_number,''),'—'),' | ' order by row_order) property_number,
   jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
     'well_name',coalesce(nullif(well_name,''),''),'api',coalesce(nullif(api_display,''),''),'property_number',coalesce(nullif(property_number,''),''),
     'verification_status',case when attachment_verified then 'official_exact' when api_digits is not null then 'review' else 'name_only_review' end,
     'official_status',official_status,'official_operator',official_operator,'resolution_method',resolution_method
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
 select pad_id,count(*) filter(where api_digits is not null) api_count,
   count(*) filter(where api_digits is not null and attachment_verified) exact_count,
   coalesce(jsonb_agg(api_display order by row_order) filter(where api_digits is not null and not attachment_verified),'[]'::jsonb) unmatched,
   count(*) filter(where added_from_official) official_added,
   count(*) filter(where not attachment_verified) review_rows
 from private_verification.well_resolution_v17311 group by pad_id
)
update public.pads p set extra_data=
  jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(p.extra_data,'{}'::jsonb),'{official_well_records}',coalesce(o.rows,'[]'::jsonb),true),
      '{api_verification_summary}',jsonb_build_object('checked','2026-08-09','saved_api_count',s.api_count,'exact_odnr_matches',s.exact_count,'exact_official_matches',s.exact_count,'unmatched_count',s.api_count-s.exact_count,'unmatched_saved_apis',s.unmatched),true
    ),
    '{well_cleanup_20260809}',jsonb_build_object('version','17.3.11','normalized_one_well_per_row',true,'official_wells_added',s.official_added,'review_rows',s.review_rows,'name_only_audit_complete',true),true
  ),updated_at=now()
from summary s left join official o using(pad_id) where p.id=s.pad_id;

select public.refresh_pad_verification_evidence(null);
