-- GitHub #97 — Washington County PA reviewed supplemental subsegment bridges.
--
-- The Washington NG911 Possum Hollow occurrences are authoritative subsegments
-- of two longer PennDOT local-road source records. The generic PA supplemental
-- mapper intentionally requires near-whole target coverage and therefore holds
-- these rows. This migration adds exactly two reviewed source-to-source bridge
-- receipts. Road names, fuzzy similarity, route-number-only matching, nearest
-- road selection and endpoint snapping are never used to select the target.
-- Both agencies keep their own coordinates; the bridge is revalidated from
-- source geometry and paired municipal-boundary structure on every use.

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);

-- Extend the truthful mapping vocabulary without reclassifying any existing
-- exact-geometry or official-ID mappings.
alter table public.brinesearch_supplemental_centerline_identity_mappings
  drop constraint brinesearch_supplemental_mapping_method_check;
alter table public.brinesearch_supplemental_centerline_identity_mappings
  add constraint brinesearch_supplemental_mapping_method_check check(
    mapping_method in (
      'exact_geometry_coverage','official_source_id','held_for_review',
      'exact_source_subsegment_boundary_pair'
    )
  );

create table private_verification.brinesearch_issue97_reviewed_supplemental_subsegment_bridges (
  dataset_id uuid not null references public.brinesearch_road_source_datasets(id) on delete restrict,
  state_code text not null,
  county_code text not null,
  source_feature_key text not null,
  target_identity_key text not null,
  target_source_segment_key text not null,
  neighbor_source_feature_key text not null,
  neighbor_target_identity_key text not null,
  neighbor_target_source_segment_key text not null,
  expected_source_municipality_key text not null,
  expected_neighbor_municipality_key text not null,
  max_endpoint_distance_m numeric not null default 15 check(max_endpoint_distance_m>0 and max_endpoint_distance_m<=15),
  max_clip_hausdorff_m numeric not null default 15 check(max_clip_hausdorff_m>0 and max_clip_hausdorff_m<=15),
  min_source_coverage_5m numeric not null default 0.98 check(min_source_coverage_5m between 0.98 and 1),
  min_clip_coverage_5m numeric not null default 0.98 check(min_clip_coverage_5m between 0.98 and 1),
  min_length_ratio numeric not null default 0.95 check(min_length_ratio between 0.95 and 1),
  max_length_ratio numeric not null default 1.05 check(max_length_ratio between 1 and 1.05),
  max_cross_source_boundary_distance_m numeric not null default 15
    check(max_cross_source_boundary_distance_m>0 and max_cross_source_boundary_distance_m<=15),
  review_details jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key(dataset_id,state_code,county_code,source_feature_key),
  constraint brinesearch_issue97_reviewed_subsegment_review_check check(
    pg_catalog.jsonb_typeof(review_details)='object'
    and nullif(pg_catalog.btrim(review_details->>'reviewed_by'),'') is not null
    and nullif(pg_catalog.btrim(review_details->>'reviewed_at'),'') is not null
    and nullif(pg_catalog.btrim(review_details->>'evidence'),'') is not null
    and coalesce((review_details->>'name_used')::boolean,false)=false
    and coalesce((review_details->>'nearest_road_used')::boolean,false)=false
    and coalesce((review_details->>'endpoint_snapping_used')::boolean,false)=false
  )
);

alter table private_verification.brinesearch_issue97_reviewed_supplemental_subsegment_bridges
  enable row level security;
alter table private_verification.brinesearch_issue97_reviewed_supplemental_subsegment_bridges
  force row level security;
revoke all on private_verification.brinesearch_issue97_reviewed_supplemental_subsegment_bridges
from public,anon,authenticated,service_role;

insert into private_verification.brinesearch_issue97_reviewed_supplemental_subsegment_bridges(
  dataset_id,state_code,county_code,source_feature_key,
  target_identity_key,target_source_segment_key,
  neighbor_source_feature_key,neighbor_target_identity_key,neighbor_target_source_segment_key,
  expected_source_municipality_key,expected_neighbor_municipality_key,review_details
)
select d.id,'PA','WAS',fixture.source_feature_key,
  fixture.target_identity_key,fixture.target_source_segment_key,
  fixture.neighbor_source_feature_key,fixture.neighbor_target_identity_key,
  fixture.neighbor_target_source_segment_key,
  fixture.expected_source_municipality_key,fixture.expected_neighbor_municipality_key,
  pg_catalog.jsonb_build_object(
    'reviewed_by','ChatGPT independent current-production structural audit',
    'reviewed_at','2026-08-14T16:00:00Z',
    'evidence','Exact reviewed NG911 source subsegment plus paired municipal-boundary correspondence to exact PennDOT source segment; both source geometries retained independently',
    'mapping_method','exact_source_subsegment_boundary_pair',
    'name_used',false,'fuzzy_used',false,'route_number_only_used',false,
    'nearest_road_used',false,'endpoint_snapping_used',false
  )
from public.brinesearch_road_source_datasets d
cross join (values
  (
    'pa_washington_ng911_centerlines:NGUID:RCL22649@co.washington.pa.us:SCOPE:PA:WAS',
    'PA:PENNDOT:LOCAL:62:2049:110961:EJM9','PA:PENNDOT:LOCAL:SEGMENT:379767',
    'pa_washington_ng911_centerlines:NGUID:RCL39851@co.washington.pa.us:SCOPE:PA:WAS',
    'PA:PENNDOT:LOCAL:62:2061:107905:EHBS','PA:PENNDOT:LOCAL:SEGMENT:386101',
    'WESTMIDDLETOWN','HOPEWELL'
  ),
  (
    'pa_washington_ng911_centerlines:NGUID:RCL39851@co.washington.pa.us:SCOPE:PA:WAS',
    'PA:PENNDOT:LOCAL:62:2061:107905:EHBS','PA:PENNDOT:LOCAL:SEGMENT:386101',
    'pa_washington_ng911_centerlines:NGUID:RCL22649@co.washington.pa.us:SCOPE:PA:WAS',
    'PA:PENNDOT:LOCAL:62:2049:110961:EJM9','PA:PENNDOT:LOCAL:SEGMENT:379767',
    'HOPEWELL','WESTMIDDLETOWN'
  )
) fixture(
  source_feature_key,target_identity_key,target_source_segment_key,
  neighbor_source_feature_key,neighbor_target_identity_key,neighbor_target_source_segment_key,
  expected_source_municipality_key,expected_neighbor_municipality_key
)
where d.source_key='pa_washington_ng911_centerlines';

-- Reproduce the supplemental run content receipt after a reviewed mapping is
-- rematerialized. This is intentionally supplemental-only; raw source geometry
-- and ingest page history never change here.
create or replace function private_verification.brinesearch_issue97_supplemental_scope_content_digest(
  p_run_id uuid
)
returns text
language sql
stable
security definer
set search_path=''
as $$
  with run as (
    select r.id,r.dataset_id,r.state_code,r.county_code,r.details
    from public.brinesearch_road_source_ingest_runs r
    join public.brinesearch_road_source_datasets d on d.id=r.dataset_id
    where r.id=p_run_id and d.topology_role='supplemental_aliases'
      and nullif(r.details->>'page_set_digest','') is not null
  ), digests as (
    select c.source_digest as digest from run
    join public.brinesearch_authoritative_supplemental_centerlines c
      on c.dataset_id=run.dataset_id and c.state_code=run.state_code
      and c.county_code=run.county_code and c.active
    union all
    select sh.source_digest from run
    join private_verification.brinesearch_issue97_supplemental_source_holds sh
      on sh.dataset_id=run.dataset_id and sh.state_code=run.state_code
      and sh.county_code=run.county_code and sh.active
    union all
    select s.source_digest from run
    join public.brinesearch_authoritative_external_road_segments s
      on s.dataset_id=run.dataset_id and s.state_code=run.state_code
      and s.county_code=run.county_code and s.active
    union all
    select h.source_digest from run
    join private_verification.brinesearch_issue97_source_geometry_holds h
      on h.dataset_id=run.dataset_id and h.state_code=run.state_code
      and h.county_code=run.county_code and h.active
    union all
    select nh.source_digest from run
    join private_verification.brinesearch_issue97_source_node_holds nh
      on nh.dataset_id=run.dataset_id and nh.state_code=run.state_code
      and nh.county_code=run.county_code and nh.active
    union all
    select n.source_digest from run
    join public.brinesearch_authoritative_road_nodes n
      on n.dataset_id=run.dataset_id and n.state_code=run.state_code
      and n.county_code=run.county_code and n.active
    union all
    select pg_catalog.md5(m.centerline_id::text||':'||m.identity_id::text||':'||
      m.mapping_status||':'||m.source_segment_keys::text)
    from run join public.brinesearch_supplemental_centerline_identity_mappings m
      on m.dataset_id=run.dataset_id and m.state_code=run.state_code
      and m.county_code=run.county_code and m.active
    union all
    select pg_catalog.md5(d.centerline_id::text||':'||d.disposition||':'||
      d.candidate_count::text||':'||d.verified_mapping_count::text)
    from run join public.brinesearch_supplemental_centerline_dispositions d
      on d.dataset_id=run.dataset_id and d.state_code=run.state_code
      and d.county_code=run.county_code and d.active
    union all
    select pg_catalog.md5(n.identity_id::text||':'||n.source_record_id||':'||
      n.name_type||':'||n.road_name)
    from run
    join public.brinesearch_authoritative_road_names n on n.source_dataset_id=run.dataset_id and n.active
    join public.brinesearch_authoritative_road_identities i on i.id=n.identity_id and i.active
      and i.state_code=run.state_code and i.county_code=run.county_code
  )
  select pg_catalog.md5((select details->>'page_set_digest' from run)||':'||
    coalesce(pg_catalog.string_agg(digest,',' order by digest),''))
  from digests
$$;

revoke all on function private_verification.brinesearch_issue97_supplemental_scope_content_digest(uuid)
from public,anon,authenticated,service_role;

-- Return only reviewed bridges whose current independent source geometries still
-- satisfy the exact structural proof. The target is selected by the reviewed
-- source IDs, never by a spatial nearest-neighbor search.
