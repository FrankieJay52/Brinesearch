create table private_verification.well_conflict_backup_20260809_v17311 as
select r.*,now() as backed_up_at
from private_verification.well_resolution_v17311 r
where r.api_digits in (
'34013208970000','34013210900000','34013211340000','34013215320000','34013215600000','34013216540000','34013216550000','34067216200000','34067217100000','34081206540000','34111245530000','34111246240000'
);

create table private_verification.well_conflict_resolution_20260809_v17311 (
  api_digits text primary key,
  intended_legacy_id text not null,
  removed_legacy_id text not null,
  official_well_name text,
  official_status text,
  official_operator text,
  resolution_basis text not null,
  resolved_at timestamptz not null default now()
);

insert into private_verification.well_conflict_resolution_20260809_v17311(api_digits,intended_legacy_id,removed_legacy_id,official_well_name,official_status,official_operator,resolution_basis)
values
('34013208970000','ascent--kungle-b','ascent--kungle-a','KUNGLE B N YRK BL 3H','Producing','ASCENT RESOURCES UTICA LLC','Confirmed official pad/well link with coordinate support.'),
('34013210900000','gulfport--phillips','ascent--lorraine','PHILLIPS 210225 3B','Producing','GULFPORT APPALACHIA LLC','Confirmed official pad/well link with coordinate support.'),
('34013211340000','ascent--seabright','gulfport--starr','SEABRIGHT CLR BL 2H-A','Producing','ASCENT RESOURCES UTICA LLC','Confirmed official pad/well link with coordinate support.'),
('34013215320000','gulfport--faye','gulfport--orc','Faye 210745 6A','Drilling','GULFPORT APPALACHIA LLC','Confirmed official pad/well link with coordinate support.'),
('34013215600000','ascent--cook','ascent--wise','Cook Unit RCH BL 6H','Producing','ASCENT RESOURCES UTICA LLC','Confirmed official pad/well link with coordinate support.'),
('34013216540000','gulfport--valerie','ascent--shutway','Valerie 211782 6A-M','Well Permitted','GULFPORT APPALACHIA LLC','Confirmed official pad/well link with coordinate support.'),
('34013216550000','gulfport--valerie','ascent--shutway','Valerie 211782 7B-M','Well Permitted','GULFPORT APPALACHIA LLC','Confirmed official pad/well link with coordinate support.'),
('34067216200000','eog--k-wallace','ascent--banjo','K WALLACE 4-11-6 6H','Producing','EOG Ohio, LLC','Confirmed official pad/well link with coordinate support.'),
('34067217100000','eog--dawson','eog--hn-sto','DAWSON 8-11-4 8H','Producing','EOG Ohio, LLC','Confirmed official pad/well link with coordinate support.'),
('34081206540000','ascent--rector','ascent--cermak','RECTOR MTP JF 2H','Producing','ASCENT RESOURCES UTICA LLC','Confirmed official pad/well link with coordinate support.'),
('34111245530000','antero--farnsworth','gulfport--roger-brown','FARNSWORTH-ULRICH 3HU','Producing','INR OHIO LLC','Confirmed official pad/well link with coordinate support.'),
('34111246240000','antero--nikki','antero--madison-cs','NIKKI-CADDIS 1HU','Producing','INR OHIO LLC','Confirmed official pad/well link with coordinate support.');

with missing as (
  select c.api_digits as target_api_digits,c.intended_legacy_id,c.removed_legacy_id,
         c.official_well_name as target_well_name,c.official_status as target_status,c.official_operator as target_operator,
         p.id as intended_pad_id,r.api_display,r.official_county,r.official_township,r.official_source,r.official_latitude,r.official_longitude,
         coalesce((select max(x.row_order) from private_verification.well_resolution_v17311 x where x.pad_id=p.id),0) as base_order,
         row_number() over(partition by p.id order by c.api_digits) as add_order
  from private_verification.well_conflict_resolution_20260809_v17311 c
  join public.pads p on p.legacy_id=c.intended_legacy_id
  join private_verification.well_resolution_v17311 r on r.api_digits=c.api_digits and r.legacy_id=c.removed_legacy_id
  where not exists(select 1 from private_verification.well_resolution_v17311 x where x.pad_id=p.id and x.api_digits=c.api_digits)
)
insert into private_verification.well_resolution_v17311(
  pad_id,legacy_id,row_order,api_digits,api_display,well_name,property_number,official_match,attachment_verified,
  official_status,official_operator,official_county,official_township,official_source,official_latitude,official_longitude,
  resolution_method,saved_name,saved_api,saved_property,added_from_official,evidence)
select intended_pad_id,intended_legacy_id,base_order+1000+add_order,target_api_digits,api_display,target_well_name,null,true,true,
       target_status,target_operator,official_county,official_township,coalesce(official_source,'Confirmed official pad/well link'),official_latitude,official_longitude,
       'confirmed_cross_pad_conflict_reassigned',null,null,null,true,
       jsonb_build_object('resolution','Moved from disproven saved pad to confirmed official pad','removed_from',removed_legacy_id)
from missing;

delete from private_verification.well_resolution_v17311 r
using private_verification.well_conflict_resolution_20260809_v17311 c
where r.api_digits=c.api_digits and r.legacy_id=c.removed_legacy_id;

create table private_verification.well_name_junk_removed_20260809_v17311 as
select r.*,now() as removed_at,'Direction fragment, not a well name'::text as removal_reason
from private_verification.well_resolution_v17311 r
where r.legacy_id='swn--jesse-stalder' and lower(r.well_name)='approximately 3.5 on right outside of ozark';
delete from private_verification.well_resolution_v17311
where legacy_id='swn--jesse-stalder' and lower(well_name)='approximately 3.5 on right outside of ozark';

create temporary table tmp_v17311_row_numbers on commit drop as
select pad_id,row_order,row_number() over(partition by pad_id order by row_order,coalesce(api_digits,''),coalesce(well_name,'')) new_order
from private_verification.well_resolution_v17311;
update private_verification.well_resolution_v17311 r set row_order=1000000+n.new_order
from tmp_v17311_row_numbers n where r.pad_id=n.pad_id and r.row_order=n.row_order;
update private_verification.well_resolution_v17311 set row_order=row_order-1000000 where row_order>=1000001;

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
    '{well_cleanup_20260809}',jsonb_build_object('version','17.3.11','normalized_one_well_per_row',true,'official_wells_added',s.official_added,'review_rows',s.review_rows,'cross_pad_conflicts_resolved',true),true
  ),updated_at=now()
from summary s left join official o using(pad_id) where p.id=s.pad_id;

select public.refresh_pad_verification_evidence(null);
