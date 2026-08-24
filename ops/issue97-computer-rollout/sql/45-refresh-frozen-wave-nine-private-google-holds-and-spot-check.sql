\set ON_ERROR_STOP on
\pset pager off
\pset tuples_only on
\pset format unaligned
\timing on

-- Issue #97 frozen-wave private Google phase.
--
-- This transaction calls only the private-dark generator for the exact nine
-- mapping-wave holds. It never calls the public projection dispatcher, never
-- writes a public Google row, and requires global cutover to remain OFF. The
-- route-stage receipt for each pad's one exact active primary route is refreshed
-- once afterward so that it observes the new private-dark receipt.
--
-- Default behavior is a full rollback rehearsal. A production execution must
-- explicitly pass -v issue97_commit=1. The variable is used only as a psql
-- boolean gate; it is never substituted as SQL, an identifier, or data.
\if :{?issue97_commit}
\else
  \set issue97_commit 0
\endif

begin isolation level read committed;
set local statement_timeout='30min';
set local lock_timeout='2min';
set local timezone='UTC';
set local datestyle='ISO, YMD';
set local extra_float_digits=3;
set local standard_conforming_strings=on;

select :'issue97_commit' in ('0','1') as commit_control_exact
\gset issue97_private_google_
\if :issue97_private_google_commit_control_exact
\else
  do $issue97_bad_commit_control$ begin
    raise exception 'Issue #97 private Google commit control must be exactly 0 or 1';
  end $issue97_bad_commit_control$;
\endif
select pg_catalog.set_config('issue97.private_google_commit',:'issue97_commit',true);

-- Acquire the complete authority hierarchy in the same order as file 42.
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:ohio-state-release')
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:issue97:all-pad-routing-pipeline',97)
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:issue97:route-corpus',97)
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:saved-road-reconciliation')
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);

create temporary table tmp_issue97_nine_expected(
  ordinal integer primary key,
  pad_id uuid not null unique,
  legacy_id text not null unique,
  pad_name text not null,
  identity_id uuid not null,
  road_id uuid not null,
  pre_route_revision bigint not null,
  primary_route_id uuid not null unique,
  route_scope text not null check(route_scope in ('frozen_412','untouched_394'))
) on commit drop;

-- ISSUE97_PRIVATE_GOOGLE_NINE_BEGIN
insert into tmp_issue97_nine_expected values
  (1,'69c63442-de05-4d15-95da-07da587bc070','ascent--shutway','SHUTWAY',
    'e78dcae3-372f-4cf6-9bdd-a3773b21a50e','01bad0cc-614e-42b7-9db9-22bf6410c849',0,
    'da4bfcb7-65c9-48e8-bb90-253c6ceee755','untouched_394'),
  (2,'6ef0746f-341a-4d29-9399-a81cfbec11e8','ascent--scout','SCOUT',
    'ebbc1392-345c-882e-2708-6ecc27a76f3c','cdcfd114-42c5-4478-9251-eac57a70e528',0,
    'ed9cd4bb-74ca-48f0-8994-8d39aa2f5e68','frozen_412'),
  (3,'75600d0c-17b8-488b-96c9-4b7b8ffc8b1b','ascent--pickens','PICKENS',
    '542490a4-ba6f-02af-0209-37ad6257a962','52b08bc7-9b54-4b8d-a833-f903fc298f7b',0,
    'bee7fa0b-8ad8-4f44-9bbb-e55d4cdfc6ab','untouched_394'),
  (4,'b6dae008-74d4-4976-9c72-fba7ae349c50','ascent--besece','BESECE',
    'ebbc1392-345c-882e-2708-6ecc27a76f3c','cdcfd114-42c5-4478-9251-eac57a70e528',0,
    '4b6160ce-c46e-4e7b-a146-d420c2a77cb6','frozen_412'),
  (5,'b7526e45-0b33-4988-ae1c-0a4140971f8e','ascent--banjo','BANJO',
    '542490a4-ba6f-02af-0209-37ad6257a962','52b08bc7-9b54-4b8d-a833-f903fc298f7b',0,
    '20bc6634-c5de-46bd-9da7-e0785a3796fe','untouched_394'),
  (6,'d7898e8c-1bb6-48f8-b5e0-87bc1898420e','ascent--bakos','BAKOS',
    '9acadc48-c230-5e7b-6f2a-0a77f86f625c','bbfacbaf-86be-4818-8541-61a697c71199',1,
    '86d86ac5-199c-4715-be36-785a13c1cf30','frozen_412'),
  (7,'e2b32e85-9e93-4388-8215-9d8167cbbeb8','ascent--cologie','COLOGIE',
    'ebbc1392-345c-882e-2708-6ecc27a76f3c','cdcfd114-42c5-4478-9251-eac57a70e528',0,
    'dfb3f204-190c-4d65-85b3-16bcd1715825','frozen_412'),
  (8,'f896d00c-da26-41b6-bf5b-e9d91afbdbc6','ascent--blayney','BLAYNEY',
    'e78dcae3-372f-4cf6-9bdd-a3773b21a50e','01bad0cc-614e-42b7-9db9-22bf6410c849',0,
    'c862dee4-41cb-4070-952a-55719ac0d915','untouched_394'),
  (9,'fcbf5085-4ba2-496d-9c20-516e8b52f9bd','ascent--jennings','JENNINGS',
    'e78dcae3-372f-4cf6-9bdd-a3773b21a50e','01bad0cc-614e-42b7-9db9-22bf6410c849',0,
    '9c3da66f-4a4f-48f3-a4fd-a70eef82d92c','frozen_412');
-- ISSUE97_PRIVATE_GOOGLE_NINE_END

create temporary table tmp_issue97_post_activation_builds(
  build_role text not null,
  county_code text not null,
  build_id uuid primary key,
  expected_status text not null
) on commit drop;
insert into tmp_issue97_post_activation_builds values
  ('new','BEL','1c1320b3-4257-4239-9c55-b18a801aa97e','active'),
  ('new','CAR','8e565c14-33a4-4862-9bf8-be9b5557b293','active'),
  ('new','COL','b86d14c7-5c8a-4cb9-8a3b-903965340678','active'),
  ('new','GUE','44245144-3e39-45fe-907b-95e2b01b9c32','active'),
  ('new','HAS','0870470a-11f8-4f33-8af3-08d6849d5f34','active'),
  ('new','JEF','c9bac3a2-82d4-4b76-813c-6a29c1bf062a','active'),
  ('new','MOE','8493f66b-b3d2-4673-be8a-07b024b9723d','active'),
  ('new','NOB','200d56dc-5b13-4f84-82cb-946b8ebeada2','active'),
  ('old','BEL','24ffa531-0e69-4625-a137-da52020e6fd0','retired'),
  ('old','CAR','5ee5f97b-447f-41d3-946a-68a8b28d8367','retired'),
  ('old','COL','c9f50b03-4328-4d8b-9995-4dc8bc85dd01','retired'),
  ('old','GUE','84568854-3257-46b7-8581-374dc620ef16','retired'),
  ('old','HAS','542c35d5-a9ba-4b43-8a64-63a66f6b29e2','retired'),
  ('old','JEF','cd096654-8a80-4cdb-b5ec-e1aa78b8b0c4','retired'),
  ('old','MOE','ab9f4083-d572-4d9d-8e0a-28ebb77517e7','retired'),
  ('old','NOB','70f30495-860a-4199-9360-8e880f3b515b','retired');

-- Freeze the exact source and graph scopes on which private generation depends.
do $issue97_private_google_ingest_locks$
declare lock_row record;
begin
  for lock_row in
    select distinct source.value->>'dataset_id' as dataset_id,
      source.value->>'state_code' as state_code,
      source.value->>'county_code' as county_code
    from public.brinesearch_road_graph_builds build
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(build.details->'source_run_vector','[]'::jsonb)
    ) source(value)
    where build.id in (
      '8a4bd4ca-7828-46c1-9c36-752d3a9f8ffb',
      '1c1320b3-4257-4239-9c55-b18a801aa97e',
      '8e565c14-33a4-4862-9bf8-be9b5557b293',
      'b86d14c7-5c8a-4cb9-8a3b-903965340678',
      '7c979743-72e4-42a2-a6a9-006a369168c0',
      '44245144-3e39-45fe-907b-95e2b01b9c32',
      '0870470a-11f8-4f33-8af3-08d6849d5f34',
      'c9bac3a2-82d4-4b76-813c-6a29c1bf062a',
      '360472bf-cb96-4ba7-b2fe-efa04e230f69',
      'e1cb9c50-f2ec-486a-ba9c-2b4c0fcaf048',
      '8493f66b-b3d2-4673-be8a-07b024b9723d',
      '98ae1835-1064-4c18-a8a7-9a9e570e212d',
      '200d56dc-5b13-4f84-82cb-946b8ebeada2',
      'c645a8bf-a920-432a-a341-a7b60d9cfd49',
      '67541fad-5cf2-4483-b0f6-f4060197fda9',
      '3c94b14c-9d9e-41ec-a897-b754dab6d8dd',
      'fd6fdfff-f23f-42cc-a633-64448bd9d044',
      '785f5277-369c-4ae3-ba80-31411745e46d',
      '90982f30-8a06-4a53-8b4b-9efd5d9042bf'
    )
    order by dataset_id,state_code,county_code
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      'brinesearch:issue97:ingest:'||lock_row.dataset_id||':'||lock_row.county_code
    ));
  end loop;
end
$issue97_private_google_ingest_locks$;

do $issue97_private_google_graph_locks$
declare lock_row record;
begin
  for lock_row in
    select * from (values
      (1,'ATH'),(2,'BEL'),(3,'CAR'),(4,'COL'),(5,'COS'),(6,'GUE'),
      (7,'HAS'),(8,'JEF'),(9,'MAH'),(10,'MEG'),(11,'MOE'),(12,'MUS'),
      (13,'NOB'),(14,'POR'),(15,'STA'),(16,'TRU'),(17,'TUS'),
      (18,'VIN'),(19,'WAS')
    ) literal(ordinal,county_code)
    order by ordinal
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      'brinesearch:issue97:graph:OH:'||lock_row.county_code
    ));
  end loop;
end
$issue97_private_google_graph_locks$;

do $issue97_private_google_pad_locks$
declare lock_row record;
begin
  for lock_row in select pad_id from tmp_issue97_nine_expected order by pad_id loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      'brinesearch:issue97:google-route:'||lock_row.pad_id::text
    ));
  end loop;
end
$issue97_private_google_pad_locks$;

create temporary table tmp_issue97_spot_expected(
  fixture_order integer primary key,
  legacy_id text not null unique,
  pad_name text not null,
  company text not null,
  pinned_pad_id uuid,
  pinned_primary_route_id uuid
) on commit drop;
-- ISSUE97_SPOT_FIXTURES_BEGIN
insert into tmp_issue97_spot_expected values
  (1,'ascent--cologie','COLOGIE','Ascent',
    'e2b32e85-9e93-4388-8215-9d8167cbbeb8','dfb3f204-190c-4d65-85b3-16bcd1715825'),
  (2,'ascent--cooper','COOPER','Ascent',
    '852a50cf-855e-4ebc-96db-19edd085b083','5f3dd419-e78c-4623-88a7-0937f62b9903'),
  (3,'ascent--lorraine','LORRAINE','Ascent',null,null);
-- ISSUE97_SPOT_FIXTURES_END

do $issue97_private_google_preflight$
declare
  v_ingest_count integer;
  v_ingest_digest text;
begin
  select count(*)::integer,pg_catalog.md5(coalesce(pg_catalog.string_agg(
    scope.dataset_id||':'||scope.state_code||':'||scope.county_code,
    '|' order by scope.dataset_id,scope.state_code,scope.county_code
  ),'')) into v_ingest_count,v_ingest_digest
  from (
    select distinct source.value->>'dataset_id' as dataset_id,
      source.value->>'state_code' as state_code,
      source.value->>'county_code' as county_code
    from public.brinesearch_road_graph_builds build
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(build.details->'source_run_vector','[]'::jsonb)
    ) source(value)
    where build.id in (
      select build.id from public.brinesearch_road_graph_builds build
      where build.state_code='OH' and build.status='active'
    )
  ) scope;

  if v_ingest_count<>41 or v_ingest_digest<>'531d542c9197c2f9883e80f7657555bc'
     or (select count(*) from tmp_issue97_nine_expected)<>9
     or (select count(*) from tmp_issue97_nine_expected where route_scope='frozen_412')<>5
     or (select pg_catalog.md5(pg_catalog.string_agg(
       pad_id::text,'|' order by pad_id)) from tmp_issue97_nine_expected)<>
       '450948793c57a9a1535139fac4974792'
     or (select pg_catalog.md5(pg_catalog.string_agg(
       pad_id::text||':'||identity_id::text||':'||road_id::text||':'||pre_route_revision::text,
       '|' order by pad_id)) from tmp_issue97_nine_expected)<>
       '5a75e5c4c34805b7dc2fdf8d0534a4f6'
     or public.brinesearch_issue97_cutover_active()
     or exists(select 1 from public.brinesearch_driver_google_routes_public)
     or exists(select 1 from private_verification.brinesearch_google_route_refresh_queue_issue97)
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
     or (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>0
     or exists(
       select 1 from pg_catalog.pg_stat_activity activity
       where activity.pid<>pg_catalog.pg_backend_pid()
         and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
         and activity.application_name like 'brinesearch-issue97-%'
     ) then
    raise exception 'Issue #97 private Google global preflight failed';
  end if;

  if exists(
    select 1 from tmp_issue97_post_activation_builds expected
    left join public.brinesearch_road_graph_builds build on build.id=expected.build_id
    where build.id is null or build.state_code<>'OH'
      or build.county_code<>expected.county_code
      or build.status<>expected.expected_status
      or (expected.build_role='new' and build.activated_at is null)
  ) then
    raise exception 'Issue #97 eight-build activation/retirement state is not exact';
  end if;

  if (select count(*) from private_verification.brinesearch_issue97_state_candidate_manifests
      where id='1ef4015c-b1ae-45d2-8baa-86c47c561f54'
        and manifest_key='issue97-ohio-r3-frozen-wave-candidate'
        and state_code='OH' and generation_key='issue97-release-20260815-r2'
        and member_count=19 and manifest_digest='77cb00cf83ad8bab4a45c9b552626f76')<>1 then
    raise exception 'Issue #97 successor manifest authority is missing or changed';
  end if;

  if exists(
    select 1 from tmp_issue97_nine_expected expected
    left join public.pads pad on pad.id=expected.pad_id
    left join public.brinesearch_road_identity_mappings mapping
      on mapping.identity_id=expected.identity_id and mapping.road_id=expected.road_id
      and mapping.mapping_status='verified'
      and mapping.mapping_method in ('exact_source_record_id','exact_route_designation')
    left join private_verification.brinesearch_google_route_receipts_issue97 receipt
      on receipt.pad_id=expected.pad_id
    left join public.brinesearch_route_prep route on route.id=expected.primary_route_id
    where pad.id is null or pad.legacy_id<>expected.legacy_id
      or pad.pad_name<>expected.pad_name or pad.company<>'Ascent'
      or pad.state<>'Ohio' or coalesce(pad.list_only,false)
      or pad.brinesearch_google_route_status_issue97<>'stale'
      or pad.brinesearch_google_route_revision_issue97<>expected.pre_route_revision
      or mapping.id is null
      or receipt.pad_id is null or receipt.status<>'stale'
      or receipt.hold_reason<>'road_identity_mapping_changed'
      or receipt.manifest_version<>'issue97-google-v1'
      or receipt.manifest_digest is not null or receipt.dependency_digest is not null
      or receipt.route_revision<>expected.pre_route_revision
      or receipt.manifest<>pg_catalog.jsonb_build_object(
        'manifest_version','issue97-google-v1','route_ready',false,
        'status','stale','pad_id',expected.pad_id,
        'route_revision',expected.pre_route_revision
      )
      or route.id is null or route.pad_id<>expected.pad_id or not route.active
      or route.route_group<>'primary' or route.variant_index<>1
      or (select count(*) from public.brinesearch_route_prep primary_route
          where primary_route.pad_id=expected.pad_id and primary_route.active
            and primary_route.route_group='primary')<>1
  ) then
    raise exception 'Issue #97 canonical nine stale/private/primary-route prestate changed';
  end if;

  if exists(
    select 1 from tmp_issue97_spot_expected fixture
    where (select count(*) from public.pads pad
      where pad.legacy_id=fixture.legacy_id and pad.pad_name=fixture.pad_name
        and pad.company=fixture.company and pad.state='Ohio'
        and not coalesce(pad.list_only,false))<>1
      or exists(
        select 1 from public.pads pad
        where pad.legacy_id=fixture.legacy_id and (
          (fixture.pinned_pad_id is not null and pad.id<>fixture.pinned_pad_id)
          or (select count(*) from public.brinesearch_route_prep route
              where route.pad_id=pad.id and route.active
                and route.route_group='primary')<>1
          or (fixture.pinned_primary_route_id is not null and not exists(
            select 1 from public.brinesearch_route_prep route
            where route.id=fixture.pinned_primary_route_id and route.pad_id=pad.id
              and route.active and route.route_group='primary' and route.variant_index=1
          ))
        )
      )
  ) then
    raise exception 'Issue #97 Cologie/Cooper/Lorraine spot identity is ambiguous or changed';
  end if;
end
$issue97_private_google_preflight$;

create temporary table tmp_issue97_spot_actual on commit drop as
select fixture.fixture_order,fixture.legacy_id,fixture.pad_name,fixture.company,
  pad.id as pad_id,route.id as primary_route_id,route.readiness_status
from tmp_issue97_spot_expected fixture
join public.pads pad on pad.legacy_id=fixture.legacy_id
  and pad.pad_name=fixture.pad_name and pad.company=fixture.company and pad.state='Ohio'
  and not coalesce(pad.list_only,false)
join public.brinesearch_route_prep route on route.pad_id=pad.id and route.active
  and route.route_group='primary';

\if :issue97_commit
create temporary table tmp_issue97_sequence_before on commit drop as
select route_sequence.last_value as route_history_last_value,
  route_sequence.is_called as route_history_is_called,
  pad_sequence.last_value as pad_history_last_value,
  pad_sequence.is_called as pad_history_is_called
from private_verification.brinesearch_route_reconciliation_history_issue97_id_seq route_sequence
cross join public.pad_edit_history_id_seq pad_sequence;

create temporary table tmp_issue97_protected_before on commit drop as
select
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    build.id::text||':'||pg_catalog.to_jsonb(build)::text,'|' order by build.id),''))
    from public.brinesearch_road_graph_builds build) as graph_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pad.id::text||':'||pg_catalog.to_jsonb(pad)::text,'|' order by pad.id),''))
    from public.pads pad) as pad_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    route.id::text||':'||pg_catalog.to_jsonb(route)::text,'|' order by route.id),''))
    from public.brinesearch_route_prep route) as route_prep_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    step.id::text||':'||pg_catalog.to_jsonb(step)::text,'|' order by step.id),''))
    from public.brinesearch_route_prep_steps step) as route_step_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    road.pad_id::text||':'||road.route_group||':'||road.route_variant_index::text||':'||
      road.step_order::text||':'||pg_catalog.to_jsonb(road)::text,
    '|' order by road.pad_id,road.route_group,road.route_variant_index,road.step_order),''))
    from public.brinesearch_pad_roads road) as pad_road_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||
      pg_catalog.to_jsonb(receipt)::text,
    '|' order by receipt.route_prep_id,receipt.occurrence_index),''))
    from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt)
      as occurrence_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    receipt.route_prep_id::text||':'||receipt.boundary_index::text||':'||
      pg_catalog.to_jsonb(receipt)::text,
    '|' order by receipt.route_prep_id,receipt.boundary_index),''))
    from private_verification.brinesearch_route_transition_receipts_issue97 receipt)
      as transition_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||
      pg_catalog.to_jsonb(receipt)::text,
    '|' order by receipt.route_prep_id,receipt.occurrence_index),''))
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt)
      as geometry_digest,
  (select count(*)::integer from public.brinesearch_driver_google_routes_public)
      as public_google_rows,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    route.pad_id::text||':'||pg_catalog.to_jsonb(route)::text,'|' order by route.pad_id),''))
    from public.brinesearch_driver_google_routes_public route) as public_google_digest,
  (select count(*)::integer from private_verification.brinesearch_google_route_refresh_queue_issue97)
      as queue_rows,
  (select count(*)::integer
    from private_verification.brinesearch_google_route_receipts_issue97 receipt
    where not exists(select 1 from tmp_issue97_nine_expected expected
      where expected.pad_id=receipt.pad_id)) as non_target_google_rows,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    receipt.pad_id::text||':'||pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.pad_id),''))
    from private_verification.brinesearch_google_route_receipts_issue97 receipt
    where not exists(select 1 from tmp_issue97_nine_expected expected
      where expected.pad_id=receipt.pad_id)) as non_target_google_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    receipt.route_prep_id::text||':'||pg_catalog.to_jsonb(receipt)::text,
    '|' order by receipt.route_prep_id),''))
    from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt)
      as route_receipt_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    receipt.route_prep_id::text||':'||pg_catalog.to_jsonb(receipt)::text,
    '|' order by receipt.route_prep_id),''))
    from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
    where not exists(select 1 from tmp_issue97_nine_expected expected
      where expected.primary_route_id=receipt.route_prep_id)) as non_target_route_receipt_digest,
  (select count(*)::bigint
    from private_verification.brinesearch_route_reconciliation_history_issue97)
      as route_history_rows,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    history.id::text||':'||pg_catalog.to_jsonb(history)::text,'|' order by history.id),''))
    from private_verification.brinesearch_route_reconciliation_history_issue97 history)
      as route_history_digest,
  (select count(*)::bigint
    from private_verification.brinesearch_route_reconciliation_history_issue97 history
    where not exists(select 1 from tmp_issue97_nine_expected expected
      where expected.primary_route_id=history.route_prep_id)) as non_target_history_rows,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    history.id::text||':'||pg_catalog.to_jsonb(history)::text,'|' order by history.id),''))
    from private_verification.brinesearch_route_reconciliation_history_issue97 history
    where not exists(select 1 from tmp_issue97_nine_expected expected
      where expected.primary_route_id=history.route_prep_id)) as non_target_history_digest,
  (select count(*)::bigint from public.pad_edit_history) as pad_history_rows,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.md5(
    history.id::text||':'||pg_catalog.to_jsonb(history)::text),'|' order by history.id),''))
    from public.pad_edit_history history) as pad_history_digest;

create temporary table tmp_issue97_private_google_results(
  ordinal integer primary key,
  pad_id uuid not null unique,
  primary_route_id uuid not null unique,
  route_scope text not null,
  google_result jsonb not null
) on commit drop;

-- Mode 0 is deliberately preflight-only. It calls no writer function and thus
-- cannot consume a route-history or pad-history sequence value.
do $issue97_refresh_exact_nine_private_google$
declare
  expected record;
  dark_result jsonb;
begin
  for expected in select * from tmp_issue97_nine_expected order by ordinal loop
    dark_result:=private_verification.brinesearch_issue97_refresh_google_route_transition_dark(
      expected.pad_id
    );
    if dark_result->>'pad_id'<>expected.pad_id::text
       or dark_result->>'status' not in ('ready','held')
       or dark_result->>'manifest_mode'<>'transition_geometry'
       or dark_result->>'publication_mode'<>'private_dark'
       or coalesce((dark_result->>'public_projected')::boolean,true) then
      raise exception 'Issue #97 private Google refresh returned an invalid receipt for %: %',
        expected.pad_id,dark_result;
    end if;

    insert into tmp_issue97_private_google_results values(
      expected.ordinal,expected.pad_id,expected.primary_route_id,expected.route_scope,
      dark_result
    );
  end loop;
end
$issue97_refresh_exact_nine_private_google$;

do $issue97_private_google_postcheck$
declare
  before_state record;
  sequence_before record;
begin
  select * into strict before_state from tmp_issue97_protected_before;
  select * into strict sequence_before from tmp_issue97_sequence_before;

  if (select count(*) from tmp_issue97_private_google_results)<>9
     or (select pg_catalog.md5(pg_catalog.string_agg(
       pad_id::text,'|' order by pad_id)) from tmp_issue97_private_google_results)<>
       '450948793c57a9a1535139fac4974792'
     or public.brinesearch_issue97_cutover_active()
     or exists(select 1 from public.brinesearch_driver_google_routes_public)
     or exists(select 1 from private_verification.brinesearch_google_route_refresh_queue_issue97)
     or exists(select 1 from tmp_issue97_private_google_results result
       where result.google_result->>'status' not in ('ready','held')
          or result.google_result->>'publication_mode'<>'private_dark'
          or coalesce((result.google_result->>'public_projected')::boolean,true)) then
    raise exception 'Issue #97 private Google post-state global contract failed';
  end if;

  if exists(
    select 1
    from tmp_issue97_private_google_results result
    join private_verification.brinesearch_google_route_receipts_issue97 receipt
      on receipt.pad_id=result.pad_id
    where receipt.route_revision<>(result.google_result->>'route_revision')::bigint
      or receipt.status<>result.google_result->>'status'
      or (receipt.status='ready' and (
        receipt.hold_reason is not null
        or receipt.manifest_version<>'issue97-google-v1'
        or receipt.manifest_digest<>result.google_result->>'manifest_digest'
        or receipt.dependency_digest<>result.google_result->>'dependency_digest'
        or not private_verification.brinesearch_issue97_transition_google_dark_current(result.pad_id)
        or receipt.manifest->>'publication_mode'<>'private_dark'
        or coalesce((receipt.manifest->>'public_projected')::boolean,true)
        or receipt.manifest->>'route_ready'<>'true'
        or pg_catalog.md5((receipt.manifest-'manifest_digest')::text)<>receipt.manifest_digest
      ))
      or (receipt.status='held' and (
        nullif(receipt.hold_reason,'') is null
        or receipt.hold_reason<>result.google_result->>'hold_reason'
        or receipt.manifest_digest is not null or receipt.dependency_digest is not null
        or private_verification.brinesearch_issue97_transition_google_dark_current(result.pad_id)
        or receipt.manifest->>'publication_mode'<>'private_dark'
        or coalesce((receipt.manifest->>'public_projected')::boolean,true)
        or receipt.manifest->>'route_ready'<>'false'
      ))
  ) then
    raise exception 'Issue #97 one or more exact private Google receipts are inconsistent';
  end if;

  -- Cologie is the repository-pinned positive fixture. It was already proven
  -- private-dark ready before the mapping invalidation and must be ready again.
  if not exists(
    select 1
    from tmp_issue97_private_google_results result
    join private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
      on receipt.route_prep_id=result.primary_route_id
    where result.pad_id='e2b32e85-9e93-4388-8215-9d8167cbbeb8'
      and result.primary_route_id='dfb3f204-190c-4d65-85b3-16bcd1715825'
      and result.google_result->>'status'='ready'
      and receipt.road_occurrence_count=6 and receipt.resolved_occurrence_count=6
      and receipt.held_occurrence_count=0 and receipt.canonical_mapping_count=6
      and receipt.exact_geometry_count=6
  ) then
    raise exception 'Issue #97 Cologie private-dark positive fixture did not return exact ready state';
  end if;

  if exists(
    select 1 from tmp_issue97_spot_actual spot
    join private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
      on receipt.route_prep_id=spot.primary_route_id
    where receipt.resolution_method in
      ('name_only','fuzzy_name','nearest_road','route_number_only')
  ) or exists(
    select 1 from tmp_issue97_spot_actual spot
    join private_verification.brinesearch_route_transition_receipts_issue97 receipt
      on receipt.route_prep_id=spot.primary_route_id
    where receipt.resolution_method in
      ('name_only','fuzzy_name','nearest_road','closest_anchor','route_number_only')
  ) or exists(
    select 1 from tmp_issue97_spot_actual spot
    join private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
      on receipt.route_prep_id=spot.primary_route_id
    where receipt.geometry_method in
      ('name_only','fuzzy_name','nearest_road','nearest_point','route_number_only')
  ) then
    raise exception 'Issue #97 named spot fixture contains a forbidden guessed method';
  end if;

  -- Every durable relation except the nine private receipts, nine route-stage
  -- receipts, and their exact route-history collateral must remain byte-stable.
  if before_state.graph_digest<>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       build.id::text||':'||pg_catalog.to_jsonb(build)::text,'|' order by build.id),''))
       from public.brinesearch_road_graph_builds build)
     or before_state.pad_digest<>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pad.id::text||':'||pg_catalog.to_jsonb(pad)::text,'|' order by pad.id),''))
       from public.pads pad)
     or before_state.route_prep_digest<>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       route.id::text||':'||pg_catalog.to_jsonb(route)::text,'|' order by route.id),''))
       from public.brinesearch_route_prep route)
     or before_state.route_step_digest<>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       step.id::text||':'||pg_catalog.to_jsonb(step)::text,'|' order by step.id),''))
       from public.brinesearch_route_prep_steps step)
     or before_state.pad_road_digest<>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       road.pad_id::text||':'||road.route_group||':'||road.route_variant_index::text||':'||
         road.step_order::text||':'||pg_catalog.to_jsonb(road)::text,
       '|' order by road.pad_id,road.route_group,road.route_variant_index,road.step_order),''))
       from public.brinesearch_pad_roads road)
     or before_state.occurrence_digest<>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||
         pg_catalog.to_jsonb(receipt)::text,
       '|' order by receipt.route_prep_id,receipt.occurrence_index),''))
       from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt)
     or before_state.transition_digest<>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       receipt.route_prep_id::text||':'||receipt.boundary_index::text||':'||
         pg_catalog.to_jsonb(receipt)::text,
       '|' order by receipt.route_prep_id,receipt.boundary_index),''))
       from private_verification.brinesearch_route_transition_receipts_issue97 receipt)
     or before_state.geometry_digest<>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||
         pg_catalog.to_jsonb(receipt)::text,
       '|' order by receipt.route_prep_id,receipt.occurrence_index),''))
       from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt)
     or before_state.public_google_rows<>(select count(*) from public.brinesearch_driver_google_routes_public)
     or before_state.public_google_digest<>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       route.pad_id::text||':'||pg_catalog.to_jsonb(route)::text,'|' order by route.pad_id),''))
       from public.brinesearch_driver_google_routes_public route)
     or before_state.queue_rows<>(select count(*) from private_verification.brinesearch_google_route_refresh_queue_issue97)
     or before_state.non_target_google_rows<>(select count(*)
       from private_verification.brinesearch_google_route_receipts_issue97 receipt
       where not exists(select 1 from tmp_issue97_nine_expected expected
         where expected.pad_id=receipt.pad_id))
     or before_state.non_target_google_digest<>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       receipt.pad_id::text||':'||pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.pad_id),''))
       from private_verification.brinesearch_google_route_receipts_issue97 receipt
       where not exists(select 1 from tmp_issue97_nine_expected expected
         where expected.pad_id=receipt.pad_id))
     or before_state.route_receipt_digest<>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       receipt.route_prep_id::text||':'||pg_catalog.to_jsonb(receipt)::text,
       '|' order by receipt.route_prep_id),''))
       from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt)
     or before_state.non_target_route_receipt_digest<>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       receipt.route_prep_id::text||':'||pg_catalog.to_jsonb(receipt)::text,
       '|' order by receipt.route_prep_id),''))
       from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
       where not exists(select 1 from tmp_issue97_nine_expected expected
         where expected.primary_route_id=receipt.route_prep_id))
     or before_state.route_history_rows<>(select count(*)
       from private_verification.brinesearch_route_reconciliation_history_issue97)
     or before_state.route_history_digest<>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       history.id::text||':'||pg_catalog.to_jsonb(history)::text,'|' order by history.id),''))
       from private_verification.brinesearch_route_reconciliation_history_issue97 history)
     or before_state.non_target_history_rows<>(select count(*)
       from private_verification.brinesearch_route_reconciliation_history_issue97 history
       where not exists(select 1 from tmp_issue97_nine_expected expected
         where expected.primary_route_id=history.route_prep_id))
     or before_state.non_target_history_digest<>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       history.id::text||':'||pg_catalog.to_jsonb(history)::text,'|' order by history.id),''))
       from private_verification.brinesearch_route_reconciliation_history_issue97 history
       where not exists(select 1 from tmp_issue97_nine_expected expected
         where expected.primary_route_id=history.route_prep_id))
     or before_state.pad_history_rows<>(select count(*) from public.pad_edit_history)
     or before_state.pad_history_digest<>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.md5(
       history.id::text||':'||pg_catalog.to_jsonb(history)::text),'|' order by history.id),''))
       from public.pad_edit_history history) then
    raise exception 'Issue #97 private Google refresh changed protected state';
  end if;

  if (select last_value from private_verification.brinesearch_route_reconciliation_history_issue97_id_seq)<>
        sequence_before.route_history_last_value
     or not (select is_called from private_verification.brinesearch_route_reconciliation_history_issue97_id_seq)
     or (select last_value from public.pad_edit_history_id_seq)<>
        sequence_before.pad_history_last_value
     or (select is_called from public.pad_edit_history_id_seq) is distinct from
        sequence_before.pad_history_is_called then
    raise exception 'Issue #97 route-history or pad-history collateral is not exact';
  end if;
end
$issue97_private_google_postcheck$;

select 'ISSUE97_PRIVATE_GOOGLE_PAD|'||pg_catalog.jsonb_build_object(
  'ordinal',result.ordinal,'pad_id',result.pad_id,
  'legacy_id',expected.legacy_id,'pad_name',expected.pad_name,
  'primary_route_id',result.primary_route_id,'route_scope',result.route_scope,
  'google_result',result.google_result
)::text
from tmp_issue97_private_google_results result
join tmp_issue97_nine_expected expected using(ordinal,pad_id,primary_route_id,route_scope)
order by result.ordinal;

select 'ISSUE97_SPOT_CHECK|'||pg_catalog.jsonb_build_object(
  'fixture_order',spot.fixture_order,'legacy_id',spot.legacy_id,
  'pad_name',spot.pad_name,'pad_id',spot.pad_id,
  'primary_route_id',spot.primary_route_id,
  'route_readiness_status',spot.readiness_status,
  'route_status',receipt.route_status,'stage',receipt.stage,
  'road_occurrences',receipt.road_occurrence_count,
  'resolved_occurrences',receipt.resolved_occurrence_count,
  'held_occurrences',receipt.held_occurrence_count,
  'canonical_mappings',receipt.canonical_mapping_count,
  'exact_geometry',receipt.exact_geometry_count,
  'google_manifest_status',receipt.google_manifest_status,
  'exception_reasons',receipt.exception_reasons,
  'private_dark_current',private_verification.brinesearch_issue97_transition_google_dark_current(spot.pad_id),
  'public_google_rows',(select count(*) from public.brinesearch_driver_google_routes_public),
  'cutover',public.brinesearch_issue97_cutover_active()
)::text
from tmp_issue97_spot_actual spot
left join private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
  on receipt.route_prep_id=spot.primary_route_id
order by spot.fixture_order;

select 'ISSUE97_PRIVATE_GOOGLE_RECEIPT|'||pg_catalog.jsonb_build_object(
  'classification','FROZEN_WAVE_NINE_PRIVATE_GOOGLE_REFRESH_COMPLETE',
  'contract_pass',1,'processed',count(*),
  'private_ready',count(*) filter(where google_result->>'status'='ready'),
  'private_held',count(*) filter(where google_result->>'status'='held'),
  'pad_digest',pg_catalog.md5(pg_catalog.string_agg(
    pad_id::text,'|' order by pad_id)),
  'result_digest',pg_catalog.md5(pg_catalog.string_agg(
    pad_id::text||':'||google_result::text,
    '|' order by pad_id)),
  'public_google',0,'queue',0,'cutover',false,
  'cologie_ready',coalesce(pg_catalog.bool_or(
    pad_id='e2b32e85-9e93-4388-8215-9d8167cbbeb8'
    and google_result->>'status'='ready'
  ),false),
  'transaction_action_requested',case
    when current_setting('issue97.private_google_commit')='1' then 'COMMIT' else 'ROLLBACK' end,
  'production_write',current_setting('issue97.private_google_commit')='1',
  'public_projection_performed',false,'global_cutover_changed',false
)::text
from tmp_issue97_private_google_results;

commit;
\else
select 'ISSUE97_PRIVATE_GOOGLE_PREFLIGHT|'||pg_catalog.jsonb_build_object(
  'classification','FROZEN_WAVE_NINE_PRIVATE_GOOGLE_PREFLIGHT_COMPLETE',
  'contract_pass',1,'processed',0,'writer_functions_called',false,
  'pad_digest','450948793c57a9a1535139fac4974792',
  'tuple_digest','5a75e5c4c34805b7dc2fdf8d0534a4f6',
  'public_google',0,'queue',0,'cutover',false,
  'transaction_action_requested','ROLLBACK','production_write',false,
  'sequence_advance',false
)::text;

select 'ISSUE97_SPOT_CHECK_PREFLIGHT|'||pg_catalog.jsonb_build_object(
  'fixture_order',spot.fixture_order,'legacy_id',spot.legacy_id,
  'pad_name',spot.pad_name,'pad_id',spot.pad_id,
  'primary_route_id',spot.primary_route_id,
  'route_readiness_status',spot.readiness_status,
  'route_status',receipt.route_status,'stage',receipt.stage,
  'road_occurrences',receipt.road_occurrence_count,
  'resolved_occurrences',receipt.resolved_occurrence_count,
  'held_occurrences',receipt.held_occurrence_count,
  'canonical_mappings',receipt.canonical_mapping_count,
  'exact_geometry',receipt.exact_geometry_count,
  'google_manifest_status',receipt.google_manifest_status,
  'exception_reasons',receipt.exception_reasons,
  'public_google_rows',(select count(*) from public.brinesearch_driver_google_routes_public),
  'cutover',public.brinesearch_issue97_cutover_active()
)::text
from tmp_issue97_spot_actual spot
left join private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
  on receipt.route_prep_id=spot.primary_route_id
order by spot.fixture_order;
rollback;
\endif
