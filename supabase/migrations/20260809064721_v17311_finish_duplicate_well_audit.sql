create table private_verification.well_duplicate_final_backup_20260809_v17311 as
select r.*,now() as backed_up_at
from private_verification.well_resolution_v17311 r
where r.api_digits in (
'34013206910000','34013214130000','34013215510000','34013215690000','34019221900000','34059242730000',
'34067212570000','34067213720000','34067214980000','34067217190000','34081205370000','34121245250000'
);

create table private_verification.well_duplicate_final_resolution_20260809_v17311 (
  api_digits text not null,
  legacy_id text not null,
  action text not null check(action in ('remove_wrong_attachment','shared_pad_alias_verified')),
  evidence text not null,
  resolved_at timestamptz not null default now(),
  primary key(api_digits,legacy_id)
);

insert into private_verification.well_duplicate_final_resolution_20260809_v17311 values
('34013206910000','ascent--truchan-ne','remove_wrong_attachment','SHUGERT 2-12H is Gulfport, Warren Twp; official wellhead 40.032723,-81.145640 matches Shugert 12, not Truchan NE.'),
('34013214130000','gulfport--hartley','remove_wrong_attachment','COLEMAN RCH BL 4H official wellhead 40.097695,-80.938096 matches Crowie pad 40.0979,-80.9384 and Ascent operator; Hartley is a different Gulfport location.'),
('34013215510000','ascent--blayney','remove_wrong_attachment','Freund 210497 2A official wellhead 40.075362,-80.774955 matches Gulfport FRUEND, not Ascent Blayney.'),
('34059242730000','ascent--rector','remove_wrong_attachment','RECTOR 1-S API county is Guernsey; official 39.956013,-81.397069 matches Rector-C in Guernsey, not Rector in Jefferson County.'),
('34121245250000','antero--bishop','remove_wrong_attachment','LORETTA UNIT 1H official wellhead 39.891978,-81.312448 matches Dale Yoder official pad; Bishop is about 8 miles south and has different Bishop-Benatar wells.');

insert into private_verification.well_duplicate_final_resolution_20260809_v17311 values
('34013215690000','ascent--ross','shared_pad_alias_verified','Same ROSS pad identity, township and nearly identical saved coordinates as SWN Ross; official Ross well identity matches both legacy pad aliases.'),
('34013215690000','swn--ross','shared_pad_alias_verified','Same ROSS pad identity, township and nearly identical saved coordinates as Ascent Ross; official Ross well identity matches both legacy pad aliases.'),
('34019221900000','chesapeake--morsheiser','shared_pad_alias_verified','Same official pad ID PadCarrollHarrisonSection26-1 and identical saved coordinates as EOG Morsheiser.'),
('34019221900000','eog--morsheiser','shared_pad_alias_verified','Same official pad ID PadCarrollHarrisonSection26-1 and identical saved coordinates as Chesapeake Morsheiser.'),
('34067212570000','eclipse--mizer-farms-unit','shared_pad_alias_verified','Both legacy Mizer records resolve to official pad ID PadHarrisonStockSection31-1 / Mizer Farms.'),
('34067212570000','eclipse--mizer-unit','shared_pad_alias_verified','Both legacy Mizer records resolve to official pad ID PadHarrisonStockSection31-1 / Mizer Farms.'),
('34067213720000','ascent--triplett','shared_pad_alias_verified','Same official pad ID PadHarrisonFranklinSection2-1 and near-identical saved coordinates as EOG Triplett.'),
('34067213720000','eog--triplett','shared_pad_alias_verified','Same official pad ID PadHarrisonFranklinSection2-1 and near-identical saved coordinates as Ascent Triplett.'),
('34067214980000','chesapeake--sadie','shared_pad_alias_verified','Same official pad ID PadHarrisonArcherSection33-1 and near-identical saved coordinates as EOG Sadie.'),
('34067214980000','eog--sadie','shared_pad_alias_verified','Same official pad ID PadHarrisonArcherSection33-1 and near-identical saved coordinates as Chesapeake Sadie.'),
('34067217190000','eog--hn-sto','shared_pad_alias_verified','HN-STO/STO/Infinity HN STO share the same Ourant Rd approach and HN STO identity; official HN STO wellhead is on that route.'),
('34067217190000','eog--sto','shared_pad_alias_verified','STO saved directions explicitly identify HN STO lease and match the HN-STO Ourant Rd route.'),
('34067217190000','infinity--hn-sto','shared_pad_alias_verified','Same HN STO identity and Ourant Rd route; saved coordinate is near the official HN STO wellhead.'),
('34081205370000','chesapeake--booth','shared_pad_alias_verified','Same official pad ID PadJeffersonSpringfieldSection23-1 as EOG Booth.'),
('34081205370000','eog--booth','shared_pad_alias_verified','Same official pad ID PadJeffersonSpringfieldSection23-1 as Chesapeake Booth.');

delete from private_verification.well_resolution_v17311 r
using private_verification.well_duplicate_final_resolution_20260809_v17311 x
where x.action='remove_wrong_attachment' and r.api_digits=x.api_digits and r.legacy_id=x.legacy_id;

update private_verification.well_resolution_v17311 r
set attachment_verified=true,
    resolution_method='shared_physical_pad_alias_verified',
    evidence=r.evidence||jsonb_build_object('duplicate_pad_alias',true,'alias_evidence',x.evidence)
from private_verification.well_duplicate_final_resolution_20260809_v17311 x
where x.action='shared_pad_alias_verified' and r.api_digits=x.api_digits and r.legacy_id=x.legacy_id;

create temporary table tmp_v17311_final_row_numbers on commit drop as
select pad_id,row_order,row_number() over(partition by pad_id order by row_order,coalesce(api_digits,''),coalesce(well_name,'')) new_order
from private_verification.well_resolution_v17311;
update private_verification.well_resolution_v17311 r set row_order=2000000+n.new_order
from tmp_v17311_final_row_numbers n where r.pad_id=n.pad_id and r.row_order=n.row_order;
update private_verification.well_resolution_v17311 set row_order=row_order-2000000 where row_order>=2000001;

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
    '{well_cleanup_20260809}',jsonb_build_object('version','17.3.11','normalized_one_well_per_row',true,'official_wells_added',s.official_added,'review_rows',s.review_rows,'duplicate_api_audit_complete',true),true
  ),updated_at=now()
from summary s left join official o using(pad_id) where p.id=s.pad_id;

select public.refresh_pad_verification_evidence(null);
