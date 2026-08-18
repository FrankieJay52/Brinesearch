\set ON_ERROR_STOP on

\if :{?issue97_expected_attempt_id}
\else
  \echo ISSUE97_WORKER_PROOF_ATTEMPT_ID_MISSING
  \quit 80
\endif

begin isolation level repeatable read read only;

set local statement_timeout = '30s';
set local lock_timeout = '2s';

select case
  when :'issue97_expected_attempt_id' ~ '^issue97-wp-[0-9]{8}T[0-9]{9}Z-[0-9a-f]{8}$' then 1
  else 1 / 0
end as issue97_exact_attempt_format_guard;

select pg_catalog.set_config(
  'brinesearch.issue97_attempt_id',
  :'issue97_expected_attempt_id',
  true
) as issue97_transaction_local_attempt_id;

select case
  when pg_catalog.current_setting('brinesearch.issue97_attempt_id', true) =
       :'issue97_expected_attempt_id' then 1
  else 1 / 0
end as issue97_exact_attempt_guc_guard;

select pg_catalog.hashtextextended(
  :'issue97_expected_attempt_id',
  970035
)::bigint as issue97_attempt_lock_key
\gset

select pg_catalog.pg_try_advisory_xact_lock(
  :'issue97_attempt_lock_key'::bigint
)::integer as issue97_attempt_lock_acquired
\gset
\if :issue97_attempt_lock_acquired
\else
  \echo ISSUE97_WORKER_PROOF_ATTEMPT_LOCK_NOT_ACQUIRED
  \quit 81
\endif

select pg_catalog.pg_backend_pid()::integer as issue97_backend_pid,
       pg_catalog.to_char(
         activity.backend_start at time zone 'UTC',
         'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
       ) as issue97_backend_start,
       pg_catalog.current_setting('transaction_read_only') as issue97_transaction_read_only,
       pg_catalog.current_setting('brinesearch.issue97_attempt_id', true) as issue97_attempt_guc,
       pg_catalog.replace(
         pg_catalog.replace(
           pg_catalog.replace(pg_catalog.current_setting('application_name'), '%', '%25'),
           '|', '%7C'
         ),
         E'\n', '%0A'
       ) as issue97_observed_application_name
from pg_catalog.pg_stat_activity activity
where activity.pid = pg_catalog.pg_backend_pid()
\gset

\echo ISSUE97_WORKER_PROOF_BACKEND_IDENTITY|attempt_id=:issue97_expected_attempt_id|attempt_lock_key=:issue97_attempt_lock_key|backend_pid=:issue97_backend_pid|backend_start=:issue97_backend_start|transaction_read_only=:issue97_transaction_read_only|custom_guc=:issue97_attempt_guc|application_name=:issue97_observed_application_name

select (
  current_database() = 'postgres'
  and pg_catalog.to_regclass('private_verification.brinesearch_issue97_state_candidate_manifests') is not null
  and pg_catalog.to_regclass('public.brinesearch_road_graph_builds') is not null
  and pg_catalog.to_regclass('public.brinesearch_driver_google_routes_public') is not null
  and (select pg_catalog.count(*) from supabase_migrations.schema_migrations
       where version = '20260817193212') = 0
  and (select pg_catalog.count(*)
       from private_verification.brinesearch_issue97_state_candidate_manifests manifest
       where manifest.id = 'c41f5320-1273-470c-a316-28b42211d697'::uuid
         and manifest.manifest_digest = '9763dc5bb626da71881b7381ed28a436'
         and manifest.state_code = 'OH'
         and manifest.member_count = 19) = 1
  and (select pg_catalog.count(*) from public.brinesearch_road_graph_builds
       where state_code = 'OH' and status = 'active') = 19
  and (select pg_catalog.count(*)
       from public.brinesearch_road_source_dataset_counties scope
       join public.brinesearch_road_source_datasets dataset
         on dataset.id = scope.dataset_id and dataset.active
       where scope.active and scope.ingest_enabled and scope.required_for_graph
         and scope.state_code = 'OH') = 38
  and (select pg_catalog.count(*)
       from public.brinesearch_road_source_dataset_counties scope
       join public.brinesearch_road_source_datasets dataset
         on dataset.id = scope.dataset_id and dataset.active
       where scope.active and scope.ingest_enabled and scope.required_for_graph
         and scope.state_code = 'OH'
         and private_verification.brinesearch_issue97_dataset_scope_current(
           scope.dataset_id, scope.state_code, scope.county_code
         )) = 38
  and (select pg_catalog.count(*)
       from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
       join public.brinesearch_route_prep route on route.id = receipt.route_prep_id
       join public.pads pad on pad.id = route.pad_id
       where route.active and route.route_group in ('primary', 'alternate')
         and pad.state = 'Ohio' and not COALESCE(pad.list_only, false)) = 806
  and (select pg_catalog.count(*) from public.brinesearch_road_graph_builds
       where status = 'staging') = 0
  and (select pg_catalog.count(*) from public.brinesearch_road_graph_builds
       where state_code in ('WV', 'PA')
         and details->>'release_generation_key' = 'issue97-release-20260815-r2') = 0
  and not public.brinesearch_issue97_cutover_active()
  and (select pg_catalog.count(*) from public.brinesearch_driver_google_routes_public) = 0
  and (select pg_catalog.count(*)
       from private_verification.brinesearch_issue97_saved_road_reconciliation_runs) = 0
)::integer as issue97_exact_production_target \gset
\if :issue97_exact_production_target
\else
  \echo ISSUE97_WORKER_PROOF_WRONG_OR_UNSAFE_TARGET
  \quit 71
\endif

with frozen_mapping_pairs(identity_id, road_id) as (
  values
    ('053d2de3-574b-1ea7-7960-b631a45da010'::uuid,'f11d1a84-da80-4ff1-ac4a-a5e74e8a6a37'::uuid),
    ('0e8d7841-6cfa-085d-ab39-ddabbc0fbfcc'::uuid,'cf05fdb2-fcdf-4f63-bd6b-73a4d11e2eac'::uuid),
    ('0f0e881e-3280-9c5c-fa13-a8e019d238cf'::uuid,'e222f21a-a552-4f7b-a0a0-85ed7d847613'::uuid),
    ('137b9f2a-bf22-4ed5-465f-f56e078b5666'::uuid,'c19792f3-aeb4-423c-8c65-70f16266f9bd'::uuid),
    ('13fe0da8-ba4e-ba64-250b-98789544f9fd'::uuid,'3deab4c8-2a90-4579-bcb6-373cef11a0ce'::uuid),
    ('2bf03464-eb0e-d84d-f559-1146612d3635'::uuid,'3582c931-137f-47b8-9ae9-334e88569676'::uuid),
    ('2ce6037e-df5c-8ec6-f6c4-971cdbaff958'::uuid,'762d7cae-f511-41f6-aa30-153b2292ad07'::uuid),
    ('2dab3b9a-45d9-0c43-9109-b49e46979287'::uuid,'e3002b89-2e29-4dd8-b9ec-20cfdf51ebe0'::uuid),
    ('36386818-82ec-10ca-71e8-58e1727504c7'::uuid,'ee656517-2a97-4a7f-8277-6b18e36a416d'::uuid),
    ('43c9d8dd-716f-a1ab-505c-11df9cd2d399'::uuid,'8d047662-daba-48ef-a95e-b28c30e3e564'::uuid),
    ('48b2a7b6-23d4-1e65-a201-e3d2672bf58e'::uuid,'77bf1737-51e7-46b6-887c-87305375a99d'::uuid),
    ('4975721e-acd6-5bfb-0f5e-fa1643455bd3'::uuid,'9182abf5-4a8c-4532-b6d1-02b72b45a5dc'::uuid),
    ('4da5dd58-d472-7f65-dc11-44a1bea94c23'::uuid,'f391149c-10c2-4c87-99e1-346ee425c1b5'::uuid),
    ('4fba3fe7-6679-9c39-996c-d0bd7ba8c7a1'::uuid,'7c9b1a62-4ed6-4721-94ed-a8bf12ed2f5c'::uuid),
    ('56abd74c-6015-084b-6b07-b6b5f4cc4365'::uuid,'3c1f5a69-a15d-46ed-8c07-74b8d9285009'::uuid),
    ('5aaf55fa-b1bd-ecd7-7ec3-c158fe8db7a9'::uuid,'7c9b1a62-4ed6-4721-94ed-a8bf12ed2f5c'::uuid),
    ('5d76d39f-5d4f-967b-8652-295eefa2ac73'::uuid,'7c9b1a62-4ed6-4721-94ed-a8bf12ed2f5c'::uuid),
    ('5f0233b7-bb01-49bb-12d6-2ac2006191f2'::uuid,'0a96a8b7-e9f6-4607-8d09-20cd3793ff8d'::uuid),
    ('6a726504-2f18-7366-9c33-642676763dfe'::uuid,'5ae10d76-e896-40bb-aecf-8d23f512e195'::uuid),
    ('77db8dda-8652-2a79-e464-9412c2aa419a'::uuid,'28a61175-d4c0-42e5-9644-b1a85160b83d'::uuid),
    ('7bec2b36-7155-aaa2-6198-8dafe49bbc14'::uuid,'4c95c2cf-dc31-469e-b717-a0b03e8abc54'::uuid),
    ('87552b33-5cdb-feb2-a616-d12a6a04ec37'::uuid,'f73b1bc0-5aed-45c1-a88c-7c1f769f52b9'::uuid),
    ('88c8f26f-e848-7877-927e-d3af46068714'::uuid,'e3002b89-2e29-4dd8-b9ec-20cfdf51ebe0'::uuid),
    ('897c8d12-af5b-14c0-22bd-355449abca24'::uuid,'40d2fcd0-8205-44dc-a4de-a650d46ad890'::uuid),
    ('8f990142-8e63-8168-f20a-13bb897c0f67'::uuid,'9182abf5-4a8c-4532-b6d1-02b72b45a5dc'::uuid),
    ('911fa41e-30a2-35ae-da0d-6f22e7e1a0b3'::uuid,'5ae10d76-e896-40bb-aecf-8d23f512e195'::uuid),
    ('928b3dca-62a7-117c-da5c-04e0faf9a9c0'::uuid,'5e165578-f56a-45bc-b87a-bc781b2aa212'::uuid),
    ('9378b0d8-9365-2a37-160b-2a36b2bac3a1'::uuid,'102d9976-3801-42dc-a716-ee1540364f8f'::uuid),
    ('93a43bd7-ea7a-92ea-af5e-4c5e7a7fb4ad'::uuid,'032e69fc-afdf-49ed-821a-f0921cefeef6'::uuid),
    ('990d4aa2-acc5-5e0d-b408-cb0341d7fd47'::uuid,'a6c093cf-cce2-445d-9abe-6bbe05e463ca'::uuid),
    ('99898ae8-b80a-06d3-71c3-7d3901867bcd'::uuid,'9b980c79-5542-4b60-a9f9-c4639ddc2cc2'::uuid),
    ('ac603172-d737-97d2-b668-714c2e5c8471'::uuid,'6a19cd16-4aec-491e-aaa0-414da1c1fa93'::uuid),
    ('b4305a0c-3efe-3a59-d6b1-34d6c71113ab'::uuid,'4da76655-fe6f-4c10-9f03-5510056a0580'::uuid),
    ('bb4e819c-5055-eb5d-1cb0-4d2f1a1be32f'::uuid,'89023472-5bbd-4bf9-b9a4-27d09e7856c9'::uuid),
    ('bd4624be-178e-328d-9f9e-462d6066532e'::uuid,'d7a42c92-9a77-49e0-8792-cd634242272e'::uuid),
    ('c7856355-4ac4-70e0-6ecf-c19b5adb05fb'::uuid,'0a8a8721-4d20-41bf-8d95-ec069173e584'::uuid),
    ('daae38bd-8f05-53bd-4591-08d6b4d98cac'::uuid,'e222f21a-a552-4f7b-a0a0-85ed7d847613'::uuid),
    ('dcaded36-db29-a903-afbd-c2f7129482de'::uuid,'c2d244a5-db55-4d9b-8db7-aa28c226dec9'::uuid),
    ('dee50426-696d-223b-3dc1-604900e34c2d'::uuid,'28a61175-d4c0-42e5-9644-b1a85160b83d'::uuid),
    ('e10108e7-e960-ea53-0b9f-b2485d8089c3'::uuid,'3c1f5a69-a15d-46ed-8c07-74b8d9285009'::uuid),
    ('e7190d69-d5b9-acf1-ae2f-16edd31b051f'::uuid,'79d3dfe9-b6c5-4351-88fd-1a9ffd957137'::uuid),
    ('ec6fa355-2b2d-8a16-6682-397e9df948a5'::uuid,'c2d244a5-db55-4d9b-8db7-aa28c226dec9'::uuid),
    ('f3ff07ad-4156-3c02-3fcb-6b57617d1e44'::uuid,'154688cf-a3d1-4c2f-bf9c-65b15ab424a4'::uuid),
    ('f7feb34a-eb0e-0073-3e56-ecd6141db2df'::uuid,'07751d4e-b2cc-4749-873e-cc3dcbdf921c'::uuid),
    ('f80b4b21-06b0-b774-1ab7-402acfe3c2b9'::uuid,'f4cc321a-7010-4f44-a469-c49ca9c32241'::uuid),
    ('fb216029-dd42-ec15-192f-9192823a0601'::uuid,'a80366a3-06e0-4a0a-970d-7df6c2b7a205'::uuid)
)
select (pg_catalog.count(*) = 0)::integer as issue97_frozen_mapping_rows_zero
from public.brinesearch_road_identity_mappings mapping
where exists (
  select 1 from frozen_mapping_pairs target
  where target.identity_id = mapping.identity_id or target.road_id = mapping.road_id
)
\gset
\if :issue97_frozen_mapping_rows_zero
\else
  \echo ISSUE97_WORKER_PROOF_FROZEN_MAPPINGS_CHANGED
  \quit 79
\endif

select (pg_catalog.count(*) = 0)::integer as issue97_no_competing_backend
from pg_catalog.pg_stat_activity
where pid <> pg_catalog.pg_backend_pid()
  and state in ('active', 'idle in transaction', 'idle in transaction (aborted)')
  and (
    query ilike '%brinesearch_issue97_%'
    or query ilike '%issue97-%'
  )
\gset
\if :issue97_no_competing_backend
\else
  \echo ISSUE97_WORKER_PROOF_COMPETING_BACKEND
  \quit 72
\endif

select pg_catalog.pg_try_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:ohio-state-release')::bigint
)::integer as issue97_ohio_release_lock
\gset
\if :issue97_ohio_release_lock
\else
  \echo ISSUE97_WORKER_PROOF_LOCK_NOT_ACQUIRED
  \quit 73
\endif

select pg_catalog.pg_try_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:issue97:all-pad-routing-pipeline', 97)
)::integer as issue97_pipeline_lock
\gset
\if :issue97_pipeline_lock
\else
  \echo ISSUE97_WORKER_PROOF_LOCK_NOT_ACQUIRED
  \quit 74
\endif

select pg_catalog.pg_try_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:issue97:route-corpus', 97)
)::integer as issue97_route_corpus_lock
\gset
\if :issue97_route_corpus_lock
\else
  \echo ISSUE97_WORKER_PROOF_LOCK_NOT_ACQUIRED
  \quit 75
\endif

select pg_catalog.pg_try_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:saved-road-reconciliation')::bigint
)::integer as issue97_saved_road_lock
\gset
\if :issue97_saved_road_lock
\else
  \echo ISSUE97_WORKER_PROOF_LOCK_NOT_ACQUIRED
  \quit 76
\endif

select pg_catalog.pg_try_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')::bigint
)::integer as issue97_mapping_lock
\gset
\if :issue97_mapping_lock
\else
  \echo ISSUE97_WORKER_PROOF_LOCK_NOT_ACQUIRED
  \quit 77
\endif

select pg_catalog.pg_try_advisory_xact_lock(9700350001::bigint)::integer
  as issue97_worker_proof_lock
\gset
\if :issue97_worker_proof_lock
\else
  \echo ISSUE97_WORKER_PROOF_LOCK_NOT_ACQUIRED
  \quit 78
\endif

select pg_catalog.pg_sleep(5);

select 'ISSUE97_WORKER_PROOF_PASS'::text as issue97_worker_proof_final_marker;

rollback;
