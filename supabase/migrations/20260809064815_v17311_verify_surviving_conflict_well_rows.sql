create table private_verification.well_surviving_conflict_verification_20260809_v17311 as
select r.*,now() as verified_at
from private_verification.well_resolution_v17311 r
where (r.legacy_id,r.api_digits) in (
('ascent--crowie','34013214130000'),
('ascent--rector-c','34059242730000'),
('eclipse--dale-yoder-unit','34121245250000'),
('gulfport--fruend','34013215510000'),
('gulfport--shugert-12','34013206910000')
);

update private_verification.well_resolution_v17311 r
set attachment_verified=true,
    resolution_method='official_attachment_verified_after_conflict_removal',
    evidence=(r.evidence-'cross_pad_attachment_count')||jsonb_build_object('cross_pad_attachment_count',1,'conflicting_wrong_attachment_removed',true)
where (r.legacy_id,r.api_digits) in (
('ascent--crowie','34013214130000'),
('ascent--rector-c','34059242730000'),
('eclipse--dale-yoder-unit','34121245250000'),
('gulfport--fruend','34013215510000'),
('gulfport--shugert-12','34013206910000')
);

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
    '{well_cleanup_20260809}',jsonb_build_object('version','17.3.11','normalized_one_well_per_row',true,'official_wells_added',s.official_added,'review_rows',s.review_rows,'well_duplicate_audit_complete',true),true
  ),updated_at=now()
from summary s left join official o using(pad_id) where p.id=s.pad_id;

select public.refresh_pad_verification_evidence(null);
