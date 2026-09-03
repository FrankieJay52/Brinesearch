-- BRINESEARCH V18 / Issue #97 Gates 2 + 3
-- READ-ONLY baseline + function-contract snapshot.
--
-- This file must be run only against the intended read-only baseline database.
-- It performs SELECTs only. It does not refresh receipts, call mutation helpers,
-- create temporary objects, alter functions, or write evidence.

\pset pager off
\set ON_ERROR_STOP on

select 'issue97_gates_2_3_baseline' as report,
       pg_catalog.current_database() as database_name,
       pg_catalog.current_user as database_user,
       pg_catalog.now() as measured_at;

select
  (select count(*) from public.pads) as pads,
  (select count(*) from public.pads
   where latitude is not null and longitude is not null) as pads_with_lat_lon,
  (select count(*) from public.pad_verification_status
   where gps_verified) as pads_gps_verified,
  (select count(*)
   from private_verification.brinesearch_route_occurrence_receipts_issue97)
    as occurrence_receipts_total,
  (select count(*)
   from private_verification.brinesearch_route_occurrence_receipts_issue97
   where resolution_status='resolved') as occurrence_resolved,
  (select count(*)
   from private_verification.brinesearch_route_occurrence_receipts_issue97
   where resolution_status='held') as occurrence_held,
  (select count(*)
   from private_verification.brinesearch_route_reconciliation_receipts_issue97
   where route_status='route_ready') as route_ready_receipts,
  (select count(*) from public.brinesearch_driver_google_routes_public)
    as public_google_routes,
  (select count(*) from public.brinesearch_road_identity_mappings
   where mapping_status='verified') as verified_identity_mappings;

select
  hold_reason,
  count(*) as occurrences,
  count(distinct pad_id) as distinct_pads
from private_verification.brinesearch_route_occurrence_receipts_issue97
where resolution_status='held'
group by hold_reason
order by occurrences desc,hold_reason;

select
  count(*) as private_segment_occurrences,
  count(distinct pad_id) as private_segment_pads
from private_verification.brinesearch_route_occurrence_receipts_issue97
where step_kind='private_segment';

select
  count(*) filter(where nullif(pg_catalog.btrim(coalesce(county,'')),'') is null)
    as pads_with_null_or_blank_county,
  count(*) filter(where pg_catalog.lower(pg_catalog.btrim(coalesce(county,'')))='washington'
                   and state='Pennsylvania')
    as pennsylvania_washington_county_pads,
  count(*) filter(where pg_catalog.lower(pg_catalog.btrim(coalesce(county,'')))='washington'
                   and state='Ohio')
    as ohio_washington_county_pads
from public.pads;

-- Current function body checkpoints used by the reviewed Aug-26 Issue #97
-- migrations and rollout scripts. A mismatch is drift that must be explained
-- before the resolver migration is authored/applied.
select
  proc.oid::pg_catalog.regprocedure::text as function_signature,
  pg_catalog.md5(pg_catalog.pg_get_functiondef(proc.oid)) as function_md5,
  role.rolname as owner,
  lang.lanname as language,
  proc.provolatile as volatility,
  proc.proparallel as parallel,
  proc.prosecdef as security_definer,
  proc.proisstrict as is_strict,
  proc.proconfig as function_config,
  pg_catalog.pg_get_function_result(proc.oid) as return_type,
  proc.proacl as acl,
  pg_catalog.pg_get_functiondef(proc.oid) as function_definition
from pg_catalog.pg_proc proc
join pg_catalog.pg_namespace ns on ns.oid=proc.pronamespace
join pg_catalog.pg_roles role on role.oid=proc.proowner
join pg_catalog.pg_language lang on lang.oid=proc.prolang
where proc.oid in (
  'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure,
  'private_verification.brinesearch_issue97_refresh_route_receipt(uuid)'::pg_catalog.regprocedure
)
order by function_signature;

-- Gate 3 contract inventory. This deliberately exposes the downstream count
-- assumptions that also have to remain internally consistent if a terminal
-- private occurrence is excluded from route blocking.
select
  pg_catalog.md5(pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure
  )) as occurrence_function_md5,
  pg_catalog.md5(pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_route_receipt(uuid)'::pg_catalog.regprocedure
  )) as route_receipt_function_md5,
  pg_catalog.to_regclass('private_verification.brinesearch_v18_named_approach_releases')
    is not null as named_approach_contract_present,
  pg_catalog.to_regclass('public.brinesearch_driver_named_approach_releases_public')
    is not null as named_approach_public_projection_present;

-- Candidate pressure cases requested for Gate 2. These counts are read-only
-- observations, not resolution authority.
with requested(token) as (
  values ('SR-647'),('Route 7'),('CR-28'),('TR-120'),('CR-11')
), normalized as (
  select token,
         private_verification.brinesearch_issue97_normalize_route_token(token)
           as normalized_token
  from requested
)
select n.token,n.normalized_token,
       count(distinct i.id) as statewide_identity_candidates,
       count(distinct i.county_code) as counties,
       count(distinct m.road_id) filter(where m.mapping_status='verified')
         as verified_canonical_roads
from normalized n
left join public.brinesearch_authoritative_road_identities i
  on i.active
 and i.state_code='OH'
 and i.drivable_status='drivable'
 and (
   private_verification.brinesearch_issue97_normalize_route_token(i.display_name)=n.normalized_token
   or n.normalized_token=any(array[
     private_verification.brinesearch_issue97_normalize_route_token(
       pg_catalog.concat_ws(' ',i.route_system,i.route_number)
     ),
     private_verification.brinesearch_issue97_normalize_route_token(case i.road_class
       when 'interstate' then 'I-'||i.route_number
       when 'us_route' then 'US-'||i.route_number
       when 'state_route' then 'SR-'||i.route_number
       when 'county' then 'CR-'||i.route_number
       when 'township' then 'TR-'||i.route_number
       else null end),
     private_verification.brinesearch_issue97_normalize_route_token(case i.road_class
       when 'state_route' then 'Route '||i.route_number
       when 'county' then 'County Road '||i.route_number
       when 'township' then 'Township Road '||i.route_number
       else null end)
   ])
 )
left join public.brinesearch_road_identity_mappings m
  on m.identity_id=i.id and m.mapping_status='verified'
group by n.token,n.normalized_token
order by n.token;
