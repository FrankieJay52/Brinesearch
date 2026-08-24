\set ON_ERROR_STOP on
\pset pager off
\pset tuples_only on
\pset format unaligned
\timing on

-- Issue #97 -- exact frozen-wave Ohio graph switch.
--
-- This file accepts one boolean control only.  The safe default is a complete
-- production-shaped rehearsal followed by ROLLBACK.  A separately authorized
-- writer may pass --set issue97_activation_commit=true to commit the identical
-- transaction.  No retry is built in.  Any failed assertion aborts the whole
-- transaction before its terminal COMMIT/ROLLBACK.
\if :{?issue97_activation_commit}
\else
  \set issue97_activation_commit false
\endif

select lower(:'issue97_activation_commit') in ('true','false','on','off','1','0')
  as activation_control_valid,
  lower(:'issue97_activation_commit') in ('true','on','1') as commit_requested
\gset issue97_control_
\if :issue97_control_activation_control_valid
\else
  \echo 'issue97_activation_commit must be one boolean value'
  \quit 2
\endif

begin isolation level read committed;
set local statement_timeout='15min';
set local lock_timeout='2min';
set local idle_in_transaction_session_timeout='3min';
set local timezone='UTC';
set local datestyle='ISO, YMD';
set local extra_float_digits=3;
set local standard_conforming_strings=on;
set local synchronous_commit=on;

-- Match the successfully extracted file-42 authority lock order.  Every lock
-- is transaction scoped.  Lock failure is a fail-stop and is never retried.
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

create temporary table issue97_successors(
  ordinal integer primary key,
  county_code text not null unique,
  build_id uuid not null unique,
  old_build_id uuid not null unique,
  graph_digest text not null,
  mapping_digest text not null,
  source_revision_digest text not null,
  source_segment_count integer not null,
  identity_count integer not null,
  point_count integer not null,
  shared_count integer not null,
  membership_count integer not null
) on commit drop;

insert into issue97_successors values
  (1,'BEL','1c1320b3-4257-4239-9c55-b18a801aa97e','24ffa531-0e69-4625-a137-da52020e6fd0','269e903e991f1790bf5d1428e4c2bb43','59e4d0079a9114a622ca6021d557cc07','b20843ddf3d2a648b8d53a0b3eb1a1c2',5687,3001,4878,112,9912),
  (2,'CAR','8e565c14-33a4-4862-9bf8-be9b5557b293','5ee5f97b-447f-41d3-946a-68a8b28d8367','2943504592861b83abce581f29a1cacb','07dd91d21b7e757d3bf5f20db54ea579','8405344f91e795398ab261a51f2a03bf',2640,1553,2522,90,5251),
  (3,'COL','b86d14c7-5c8a-4cb9-8a3b-903965340678','c9f50b03-4328-4d8b-9995-4dc8bc85dd01','6bd88992a7a63c9643d1a6f1535ca2af','89fbad6cfcc8e62c6e600a406f243d08','44b4e720a523face3149d7dbdc8a298b',5754,3006,5091,126,10812),
  (4,'GUE','44245144-3e39-45fe-907b-95e2b01b9c32','84568854-3257-46b7-8581-374dc620ef16','d7a43bacbf54794d4e92d9e8ceca2e28','02cc95bbbacaaa969a8e8420ae4987e1','b0cc4e8e3aaa7121cc39cc7935189664',3648,2079,2995,101,6433),
  (5,'HAS','0870470a-11f8-4f33-8af3-08d6849d5f34','542c35d5-a9ba-4b43-8a64-63a66f6b29e2','fc53a1492a3eecab78a524dbadcddfe8','d814298cc86b83ea2cb5938dd8e978dd','ece929162c9063ea35a6a276de59a940',2336,1013,1746,57,3550),
  (6,'JEF','c9bac3a2-82d4-4b76-813c-6a29c1bf062a','cd096654-8a80-4cdb-b5ec-e1aa78b8b0c4','ce2de7721f56a145b21ddded270f07fd','6c95c0985714405f2af340e9d7c7c924','0d40dc262b0097cf48783f7271531153',4135,2187,3498,69,7116),
  (7,'MOE','8493f66b-b3d2-4673-be8a-07b024b9723d','ab9f4083-d572-4d9d-8e0a-28ebb77517e7','fafd62f37b76e57859164010d1be967b','2e2fc9e336115c9fd5fced5a69f5a9ad','5a82a31c86fdd78804bf113f73e49694',2264,1250,1715,32,3504),
  (8,'NOB','200d56dc-5b13-4f84-82cb-946b8ebeada2','70f30495-860a-4199-9360-8e880f3b515b','576c5e1b1012fcb8020fa637fb272082','821c52a3c9090067a8496847ee1b1172','795f812c7a9042318196195cccccf3a4',1959,1030,1381,40,2841);

create temporary table issue97_retained(
  ordinal integer primary key,county_code text not null unique,
  build_id uuid not null unique,graph_digest text not null,
  source_revision_digest text not null
) on commit drop;
insert into issue97_retained values
  (1,'ATH','8a4bd4ca-7828-46c1-9c36-752d3a9f8ffb','2080a5a06944f3d4842e31937748267f','4e955e0c8736f17dbd6ff79aa1c17e9d'),
  (5,'COS','7c979743-72e4-42a2-a6a9-006a369168c0','7791b63c7bcb5848200b5bc4cc970fb4','b9da0eb95ae5b4e03a0143484372b658'),
  (9,'MAH','360472bf-cb96-4ba7-b2fe-efa04e230f69','4a80abcc01932b7a169189ec5f706cc4','79d1cd99ffcad7a04a06bd5ad7138417'),
  (10,'MEG','e1cb9c50-f2ec-486a-ba9c-2b4c0fcaf048','2fcf1a69c13907789a2f902574a35674','e90b8b30a449199a490fe85688670dfb'),
  (12,'MUS','98ae1835-1064-4c18-a8a7-9a9e570e212d','04a4c9d7a4274ac638cad78a406f76fa','0761cc66281b70da78dd0375ecb7cb86'),
  (14,'POR','c645a8bf-a920-432a-a341-a7b60d9cfd49','89513e609f359ad9064814ebbf074810','a86ed19837abdfa55047ddabbc60ffcc'),
  (15,'STA','67541fad-5cf2-4483-b0f6-f4060197fda9','67be9ebece47e78c4c7ccf29ea92786e','adaeac05c1e99de304b1c9a10ac83443'),
  (16,'TRU','3c94b14c-9d9e-41ec-a897-b754dab6d8dd','2ff743a4c7f223a6821d3eaff7416d1d','60f07d2d3e4328c1f448c07aca49f4c8'),
  (17,'TUS','fd6fdfff-f23f-42cc-a633-64448bd9d044','b5d73c4e9a397596bbdc1dd0697a0b6d','810a6b9c9f96448c52c722fbba8c3996'),
  (18,'VIN','785f5277-369c-4ae3-ba80-31411745e46d','551be5443af26c64d5ed5e92a58ee71b','c8962e1b5eec1d974533a973ca1f9362'),
  (19,'WAS','90982f30-8a06-4a53-8b4b-9efd5d9042bf','6ccff50666a085a4387c20fb49f90a59','d372a68557e29d1ae871025c372eb785');

create temporary table issue97_google_pads(pad_id uuid primary key) on commit drop;
insert into issue97_google_pads values
  ('69c63442-de05-4d15-95da-07da587bc070'),
  ('6ef0746f-341a-4d29-9399-a81cfbec11e8'),
  ('75600d0c-17b8-488b-96c9-4b7b8ffc8b1b'),
  ('b6dae008-74d4-4976-9c72-fba7ae349c50'),
  ('b7526e45-0b33-4988-ae1c-0a4140971f8e'),
  ('d7898e8c-1bb6-48f8-b5e0-87bc1898420e'),
  ('e2b32e85-9e93-4388-8215-9d8167cbbeb8'),
  ('f896d00c-da26-41b6-bf5b-e9d91afbdbc6'),
  ('fcbf5085-4ba2-496d-9c20-516e8b52f9bd');

create temporary table issue97_expected_members on commit drop as
select case successor.county_code
    when 'BEL' then 2 when 'CAR' then 3 when 'COL' then 4 when 'GUE' then 6
    when 'HAS' then 7 when 'JEF' then 8 when 'MOE' then 11 when 'NOB' then 13
  end as ordinal,successor.county_code,successor.build_id
from issue97_successors successor
union all
select ordinal,county_code,build_id from issue97_retained;
alter table issue97_expected_members add primary key(county_code);

create temporary table issue97_pre_active_members on commit drop as
select successor.ordinal,successor.county_code,
  successor.old_build_id as build_id
from issue97_successors successor
union all
select ordinal,county_code,build_id from issue97_retained;
alter table issue97_pre_active_members add primary key(county_code);

-- Lock all exact source, graph and private-Google scopes while the global
-- mapping/corpus locks are already held.
create temporary table issue97_ingest_locks on commit drop as
select row_number() over(order by dataset_id,state_code,county_code)::integer ordinal,
  dataset_id,state_code,county_code,
  'brinesearch:issue97:ingest:'||dataset_id::text||':'||county_code as lock_key
from (
  select distinct (source.value->>'dataset_id')::uuid dataset_id,
    source.value->>'state_code' state_code,source.value->>'county_code' county_code
  from issue97_expected_members member
  join public.brinesearch_road_graph_builds build on build.id=member.build_id
  cross join lateral pg_catalog.jsonb_array_elements(
    coalesce(build.details->'source_run_vector','[]'::jsonb)
  ) source(value)
) scopes;

do $locks$
declare lock_row record;
begin
  if (select count(*) from issue97_ingest_locks)<>41
     or (select pg_catalog.md5(pg_catalog.string_agg(
       ordinal::text||':'||dataset_id::text||':'||state_code||':'||county_code||':'||lock_key,
       '|' order by ordinal)) from issue97_ingest_locks)
       <>'2d3c4c7f7b8e21af7ec4d7aaad612c12' then
    raise exception 'Issue #97 exact 41-scope ingest-lock authority drifted';
  end if;
  for lock_row in select * from issue97_ingest_locks order by ordinal loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(lock_row.lock_key));
  end loop;
  for lock_row in select county_code from issue97_expected_members order by ordinal loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      'brinesearch:issue97:graph:OH:'||lock_row.county_code
    ));
  end loop;
  for lock_row in select pad_id from issue97_google_pads order by pad_id loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      'brinesearch:issue97:google-route:'||lock_row.pad_id::text
    ));
  end loop;
end
$locks$;

create temporary table issue97_target_before on commit drop as
select successor.ordinal*2-1 event_order,'old'::text build_role,
  successor.county_code,successor.old_build_id build_id,pg_catalog.to_jsonb(build) row_value
from issue97_successors successor
join public.brinesearch_road_graph_builds build on build.id=successor.old_build_id
union all
select successor.ordinal*2,'new',successor.county_code,successor.build_id,
  pg_catalog.to_jsonb(build)
from issue97_successors successor
join public.brinesearch_road_graph_builds build on build.id=successor.build_id;

create temporary table issue97_authorizer_original(
  definition text not null,definition_md5 text not null,
  catalog_md5 text not null
) on commit drop;
insert into issue97_authorizer_original
select pg_catalog.pg_get_functiondef(procedure.oid),
  pg_catalog.md5(pg_catalog.pg_get_functiondef(procedure.oid)),
  pg_catalog.md5(pg_catalog.concat_ws('|',procedure.oid::text,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(procedure.oid)),
    procedure.proowner::text,owner.rolname,procedure.prosecdef::text,
    procedure.provolatile::text,procedure.prokind::text,
    coalesce(procedure.proconfig::text,''),coalesce(procedure.proacl::text,'')))
from pg_catalog.pg_proc procedure
join pg_catalog.pg_roles owner on owner.oid=procedure.proowner
where procedure.oid=
  'private_verification.brinesearch_issue97_candidate_manifest_authorizes_build(text,uuid)'::regprocedure;

-- Snapshot every relation that file 42 classified as activation collateral.
-- The fixed literal inventory is digested before and after the switch; any row
-- or row-count change outside the 16 graph rows aborts the transaction.
create temporary table issue97_protected_relations(
  ordinal integer primary key,schema_name text not null,table_name text not null,
  unique(schema_name,table_name)
) on commit drop;
insert into issue97_protected_relations values
  (1,'public','brinesearch_route_prep'),
  (2,'public','brinesearch_route_prep_steps'),
  (3,'public','brinesearch_pad_roads'),
  (4,'private_verification','brinesearch_route_occurrence_candidates_issue97'),
  (5,'private_verification','brinesearch_route_occurrence_receipts_issue97'),
  (6,'private_verification','brinesearch_route_occurrence_receipt_history_issue97'),
  (7,'private_verification','brinesearch_route_reconciliation_receipts_issue97'),
  (8,'private_verification','brinesearch_route_reconciliation_history_issue97'),
  (9,'private_verification','brinesearch_route_transition_receipts_issue97'),
  (10,'private_verification','brinesearch_route_transition_history_issue97'),
  (11,'private_verification','brinesearch_route_occurrence_geometry_receipts_issue97'),
  (12,'private_verification','brinesearch_route_occurrence_geometry_history_issue97'),
  (13,'public','brinesearch_road_junctions'),
  (14,'public','brinesearch_road_junction_anchors'),
  (15,'public','brinesearch_road_junction_memberships'),
  (16,'public','pads'),
  (17,'private_verification','brinesearch_google_route_receipts_issue97'),
  (18,'private_verification','brinesearch_google_route_refresh_queue_issue97'),
  (19,'public','brinesearch_driver_google_routes_public'),
  (20,'public','public_pad_detail'),
  (21,'public','pad_verification_status'),
  (22,'public','pad_edit_history'),
  (23,'private_verification','brinesearch_issue97_saved_road_release_baseline'),
  (24,'private_verification','brinesearch_issue97_saved_road_reconciliation_runs'),
  (25,'private_verification','brinesearch_issue97_saved_road_reconciliation'),
  (26,'private_verification','brinesearch_issue97_state_candidate_manifests'),
  (27,'private_verification','brinesearch_issue97_state_candidate_manifest_members'),
  (28,'public','brinesearch_road_identity_mappings');

create temporary table issue97_protected_snapshot(
  phase text not null,ordinal integer not null,relation_name text not null,
  row_count bigint not null,row_digest text not null,
  primary key(phase,ordinal)
) on commit drop;

do $snapshot_before$
declare relation_row record; v_count bigint; v_digest text;
begin
  for relation_row in select * from issue97_protected_relations order by ordinal loop
    execute pg_catalog.format(
      'select count(*)::bigint,pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text),''|'' order by pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text)),'''')) from %I.%I row_value',
      relation_row.schema_name,relation_row.table_name
    ) into v_count,v_digest;
    insert into issue97_protected_snapshot values(
      'before',relation_row.ordinal,
      relation_row.schema_name||'.'||relation_row.table_name,v_count,v_digest
    );
  end loop;
end
$snapshot_before$;

create temporary table issue97_sequence_before on commit drop as
select sequence_name,last_value,is_called from (values
  ('private_verification.brinesearch_route_occurrence_receipt_history_issue97_id_seq',
    (select last_value from private_verification.brinesearch_route_occurrence_receipt_history_issue97_id_seq),
    (select is_called from private_verification.brinesearch_route_occurrence_receipt_history_issue97_id_seq)),
  ('private_verification.brinesearch_route_reconciliation_history_issue97_id_seq',
    (select last_value from private_verification.brinesearch_route_reconciliation_history_issue97_id_seq),
    (select is_called from private_verification.brinesearch_route_reconciliation_history_issue97_id_seq)),
  ('private_verification.brinesearch_route_transition_history_issue97_id_seq',
    (select last_value from private_verification.brinesearch_route_transition_history_issue97_id_seq),
    (select is_called from private_verification.brinesearch_route_transition_history_issue97_id_seq)),
  ('private_verification.brinesearch_route_occurrence_geometry_history_issue97_id_seq',
    (select last_value from private_verification.brinesearch_route_occurrence_geometry_history_issue97_id_seq),
    (select is_called from private_verification.brinesearch_route_occurrence_geometry_history_issue97_id_seq)),
  ('public.pad_edit_history_id_seq',
    (select last_value from public.pad_edit_history_id_seq),
    (select is_called from public.pad_edit_history_id_seq))
) sequence_state(sequence_name,last_value,is_called);

do $preflight$
declare v_manifest record; v_target_digest text; v_non_target_digest text;
  v_non_target_rows integer; v_retained_digest text; v_function record;
begin
  if current_user<>'postgres'
     or not pg_catalog.has_function_privilege(current_user,
       'public.brinesearch_issue97_activate_graph_build(uuid,text,jsonb)','EXECUTE')
     or public.brinesearch_issue97_cutover_active()
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
     or exists(select 1 from private_verification.brinesearch_google_route_refresh_queue_issue97)
     or exists(select 1 from public.brinesearch_driver_google_routes_public) then
    raise exception 'Issue #97 activation isolation/role boundary failed';
  end if;

  select * into strict v_manifest
  from private_verification.brinesearch_issue97_state_candidate_manifests
  where id='1ef4015c-b1ae-45d2-8baa-86c47c561f54'::uuid
    and manifest_key='issue97-ohio-r3-frozen-wave-candidate'
    and state_code='OH' and generation_key='issue97-release-20260815-r2'
    and git_sha='1f49bcb8edfdc386105fe84727fd53448c277d37'
    and member_count=19 and manifest_digest='77cb00cf83ad8bab4a45c9b552626f76';
  if not private_verification.brinesearch_issue97_state_candidate_manifest_integrity(v_manifest.id)
     or not private_verification.brinesearch_issue97_state_candidate_manifest_current(v_manifest.id)
     or v_manifest.review_details->>'candidate_set_digest'<>'c3f925954d41cb6fbd5939eca5de3288'
     or v_manifest.review_details->>'route_set_digest'<>'711b1ddd3ba6c47e7642fc700197432f'
     or v_manifest.review_details->>'google_pad_digest'<>'450948793c57a9a1535139fac4974792'
     or v_manifest.review_details->>'google_tuple_digest'<>'5a75e5c4c34805b7dc2fdf8d0534a4f6'
     or v_manifest.review_details->>'global_cutover_authorized'<>'false'
     or v_manifest.review_details->>'public_google_authorized'<>'false' then
    raise exception 'Issue #97 exact successor manifest/currentness drifted';
  end if;
  if exists(
    (select 'OH:'||member.county_code,member.build_id from issue97_expected_members member
     except select manifest_member.member_key,
       (manifest_member.member_value->>'build_id')::uuid
     from private_verification.brinesearch_issue97_state_candidate_manifest_members manifest_member
     where manifest_member.manifest_id=v_manifest.id)
    union all
    (select manifest_member.member_key,(manifest_member.member_value->>'build_id')::uuid
     from private_verification.brinesearch_issue97_state_candidate_manifest_members manifest_member
     where manifest_member.manifest_id=v_manifest.id
     except select 'OH:'||member.county_code,member.build_id from issue97_expected_members member)
  ) then raise exception 'Issue #97 manifest member set drifted'; end if;

  if (select count(*) from issue97_successors)<>8
     or exists(
       select 1 from issue97_successors pin
       left join public.brinesearch_road_graph_builds build on build.id=pin.build_id
       where build.id is null or build.state_code<>'OH' or build.county_code<>pin.county_code
         or build.status<>'validated' or build.activated_at is not null
         or build.graph_digest<>pin.graph_digest
         or build.details->>'mapping_snapshot_digest'<>pin.mapping_digest
         or build.source_revision_digest<>pin.source_revision_digest
         or build.source_segment_count<>pin.source_segment_count
         or build.identity_count<>pin.identity_count
         or build.point_junction_count<>pin.point_count
         or build.shared_segment_count<>pin.shared_count
         or build.membership_count<>pin.membership_count
         or not private_verification.brinesearch_issue97_graph_build_release_current(pin.build_id)
     ) then raise exception 'Issue #97 exact successor rows drifted'; end if;
  if (select pg_catalog.md5(pg_catalog.string_agg(
       county_code||':'||build_id::text||':'||graph_digest||':'||mapping_digest||':'||source_revision_digest,
       '|' order by county_code)) from issue97_successors)
       <>'c3f925954d41cb6fbd5939eca5de3288' then
    raise exception 'Issue #97 candidate-set digest drifted';
  end if;
  if exists(
    select 1 from issue97_successors pin
    left join public.brinesearch_road_graph_builds build on build.id=pin.old_build_id
    where build.id is null or build.state_code<>'OH' or build.county_code<>pin.county_code
      or build.status<>'active'
      or build.activated_at<>'2026-08-16 11:08:18.355674+00'::timestamptz
  ) then raise exception 'Issue #97 predecessor active set drifted'; end if;
  if (select count(*) from issue97_retained)<>11 or exists(
    select 1 from issue97_retained pin
    left join public.brinesearch_road_graph_builds build on build.id=pin.build_id
    where build.id is null or build.state_code<>'OH' or build.county_code<>pin.county_code
      or build.status<>'active' or build.graph_digest<>pin.graph_digest
      or build.source_revision_digest<>pin.source_revision_digest
      or not private_verification.brinesearch_issue97_graph_build_release_current(pin.build_id)
  ) then raise exception 'Issue #97 retained active set drifted'; end if;
  if exists(
    (select county_code,build_id from issue97_pre_active_members
     except select county_code,id from public.brinesearch_road_graph_builds
       where state_code='OH' and status='active')
    union all
    (select county_code,id from public.brinesearch_road_graph_builds
       where state_code='OH' and status='active'
     except select county_code,build_id from issue97_pre_active_members)
  ) then raise exception 'Issue #97 pre-activation active set drifted'; end if;

  select pg_catalog.md5(pg_catalog.string_agg(
    build_id::text||':'||row_value::text,'|' order by event_order))
  into v_target_digest from issue97_target_before;
  if v_target_digest<>'3ef4ff5b89cc5cb974cf7601347923bb' then
    raise exception 'Issue #97 exact 16-row target prestate drifted';
  end if;
  select count(*)::integer,pg_catalog.md5(coalesce(pg_catalog.string_agg(
    build.id::text||':'||pg_catalog.to_jsonb(build)::text,'|' order by build.id),''))
  into v_non_target_rows,v_non_target_digest
  from public.brinesearch_road_graph_builds build
  where not exists(select 1 from issue97_target_before target where target.build_id=build.id);
  if v_non_target_rows<>33 or v_non_target_digest<>'b38ea0d39e75cd30cfc54a9469e485b7' then
    raise exception 'Issue #97 non-target graph-build baseline drifted';
  end if;
  select pg_catalog.md5(pg_catalog.string_agg(
    retained.county_code||':'||retained.build_id::text||':'||build.graph_digest||':'||
      (build.details->>'mapping_snapshot_digest')||':'||build.source_revision_digest||':'||
      build.source_segment_count::text||':'||build.identity_count::text||':'||
      build.point_junction_count::text||':'||build.shared_segment_count::text||':'||
      build.membership_count::text,'|' order by retained.ordinal))
  into v_retained_digest
  from issue97_retained retained join public.brinesearch_road_graph_builds build
    on build.id=retained.build_id;
  if v_retained_digest<>'10b7c0f2fb42c03a49b19f37cc1bca6c' then
    raise exception 'Issue #97 retained-detail digest drifted';
  end if;

  if exists(
    select 1 from issue97_successors pin where exists(
      select 1
      from public.brinesearch_road_graph_builds changed
      join private_verification.brinesearch_google_route_receipts_issue97 receipt
        on exists(select 1 from pg_catalog.jsonb_array_elements(
          coalesce(receipt.manifest->'points','[]'::jsonb)) point(value)
          where point.value->>'graph_build_id'=changed.id::text)
      where changed.id in (pin.build_id,pin.old_build_id)
      union all
      select 1 from public.brinesearch_pad_roads pad_road
      where pad_road.junction_build_id in (pin.build_id,pin.old_build_id)
    )
  ) then raise exception 'Issue #97 graph trigger projection is no longer empty'; end if;
  if (select count(*) from issue97_google_pads)<>9
     or (select pg_catalog.md5(pg_catalog.string_agg(pad_id::text,'|' order by pad_id))
         from issue97_google_pads)<>'450948793c57a9a1535139fac4974792' then
    raise exception 'Issue #97 canonical private-Google pad set drifted';
  end if;

  select procedure.oid,pg_catalog.md5(pg_catalog.pg_get_functiondef(procedure.oid)) definition_md5,
    pg_catalog.md5(pg_catalog.concat_ws('|',procedure.oid::text,
      pg_catalog.md5(pg_catalog.pg_get_functiondef(procedure.oid)),procedure.proowner::text,
      owner.rolname,procedure.prosecdef::text,procedure.provolatile::text,
      procedure.prokind::text,coalesce(procedure.proconfig::text,''),
      coalesce(procedure.proacl::text,''))) catalog_md5
  into strict v_function from pg_catalog.pg_proc procedure
  join pg_catalog.pg_roles owner on owner.oid=procedure.proowner
  where procedure.oid='public.brinesearch_issue97_activate_graph_build(uuid,text,jsonb)'::regprocedure;
  if v_function.definition_md5<>'73eb9adbfd16ea671873da7b4e495f73'
     or v_function.catalog_md5<>'3b6e0ea1fb1da8fe88bc67f3c5169a62' then
    raise exception 'Issue #97 activation function authority drifted';
  end if;
  select procedure.oid,pg_catalog.md5(pg_catalog.pg_get_functiondef(procedure.oid)) definition_md5,
    pg_catalog.md5(pg_catalog.concat_ws('|',procedure.oid::text,
      pg_catalog.md5(pg_catalog.pg_get_functiondef(procedure.oid)),procedure.proowner::text,
      owner.rolname,procedure.prosecdef::text,procedure.provolatile::text,
      procedure.prokind::text,coalesce(procedure.proconfig::text,''),
      coalesce(procedure.proacl::text,''))) catalog_md5
  into strict v_function from pg_catalog.pg_proc procedure
  join pg_catalog.pg_roles owner on owner.oid=procedure.proowner
  where procedure.oid='private_verification.brinesearch_issue97_candidate_manifest_authorizes_build(text,uuid)'::regprocedure;
  if v_function.definition_md5<>'f6763925461111b2069bde0f60007dd4'
     or v_function.catalog_md5<>'3cb37659bb973f4f753301352574f6d7' then
    raise exception 'Issue #97 candidate authorizer authority drifted';
  end if;
  if exists(select 1 from pg_catalog.pg_stat_activity activity
    where activity.pid<>pg_catalog.pg_backend_pid()
      and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
      and (activity.query ilike '%brinesearch_issue97_activate_graph_build%'
        or activity.query ilike '%brinesearch_issue97_rebuild_county_graph%'
        or activity.query ilike '%brinesearch_issue97_reconcile_route_corpus%')) then
    raise exception 'Issue #97 competing operational backend exists';
  end if;
end
$preflight$;

create temporary table issue97_runtime(review_details jsonb not null) on commit drop;
insert into issue97_runtime values(pg_catalog.jsonb_build_object(
  'candidate_manifest_digest','77cb00cf83ad8bab4a45c9b552626f76',
  'candidate_manifest_id','1ef4015c-b1ae-45d2-8baa-86c47c561f54',
  'candidate_set_digest','c3f925954d41cb6fbd5939eca5de3288',
  'activation_authority_git_sha','90353e9d7dae20cdd0fb1e5d0102e314731f6122',
  'activation_authority_receipt_sha256','392C1881B8DFD2D80190A29EBA8ECD2982A9C02A691A4062348BB2E84695B67F',
  'reviewed_by','Codex Issue #97 sole writer under explicit owner activation authorization',
  'reviewed_at',pg_catalog.transaction_timestamp(),
  'evidence','Exact file-42 PASS receipt; eight zero-impact successors; no route, Google-public, or cutover action'
));
select pg_catalog.set_config('issue97.atomic_manifest_id',
  '1ef4015c-b1ae-45d2-8baa-86c47c561f54',true);
select pg_catalog.set_config('issue97.atomic_manifest_digest',
  '77cb00cf83ad8bab4a45c9b552626f76',true);

-- The installed authorizer otherwise recomputes whole-state currentness once
-- per build.  File 30 established this transactional optimization pattern.
-- This temporary definition authorizes only the eight literals below and only
-- in this transaction/session.  It is restored exactly before the final gate;
-- an error or disconnect rolls the catalog change back with the transaction.
create or replace function private_verification.brinesearch_issue97_candidate_manifest_authorizes_build(
  p_manifest_digest text,p_build_id uuid
) returns boolean
language sql stable security definer set search_path=''
as $$
  select coalesce(
    pg_catalog.current_setting('issue97.atomic_manifest_id',true)=
      '1ef4015c-b1ae-45d2-8baa-86c47c561f54'
    and pg_catalog.current_setting('issue97.atomic_manifest_digest',true)=
      '77cb00cf83ad8bab4a45c9b552626f76'
    and p_manifest_digest='77cb00cf83ad8bab4a45c9b552626f76'
    and p_build_id=any(array[
      '1c1320b3-4257-4239-9c55-b18a801aa97e'::uuid,
      '8e565c14-33a4-4862-9bf8-be9b5557b293',
      'b86d14c7-5c8a-4cb9-8a3b-903965340678',
      '44245144-3e39-45fe-907b-95e2b01b9c32',
      '0870470a-11f8-4f33-8af3-08d6849d5f34',
      'c9bac3a2-82d4-4b76-813c-6a29c1bf062a',
      '8493f66b-b3d2-4673-be8a-07b024b9723d',
      '200d56dc-5b13-4f84-82cb-946b8ebeada2'
    ])
    and exists(
      select 1
      from private_verification.brinesearch_issue97_state_candidate_manifests header
      join private_verification.brinesearch_issue97_state_candidate_manifest_members member
        on member.manifest_id=header.id
      where header.id='1ef4015c-b1ae-45d2-8baa-86c47c561f54'::uuid
        and header.manifest_digest=p_manifest_digest
        and header.manifest_key='issue97-ohio-r3-frozen-wave-candidate'
        and header.state_code='OH' and header.member_count=19
        and member.member_value->>'build_id'=p_build_id::text
    ),false
  )
$$;

create temporary table issue97_activation_receipts(
  ordinal integer primary key,county_code text not null unique,
  build_id uuid not null unique,old_build_id uuid not null unique,
  receipt jsonb not null
) on commit drop;

do $activate$
declare pin record; result jsonb; review jsonb;
begin
  select review_details into strict review from issue97_runtime;
  for pin in select * from issue97_successors order by ordinal loop
    result:=public.brinesearch_issue97_activate_graph_build(
      pin.build_id,null,review
    );
    if coalesce((result->>'activated')::boolean,false) is not true
       or (result->>'prior_build_id')::uuid is distinct from pin.old_build_id
       or coalesce((result->>'impact_count')::integer,-1)<>0
       or result->>'impact_digest'<>'d751713988987e9331980363e24189ce' then
      raise exception 'Issue #97 atomic successor activation refused %: %',
        pin.county_code,result;
    end if;
    insert into issue97_activation_receipts values(
      pin.ordinal,pin.county_code,pin.build_id,pin.old_build_id,result
    );
  end loop;
end
$activate$;

-- Restore the byte-semantic pg_get_functiondef captured under the same locks;
-- never reconstruct production authority from a hand-maintained copy.
do $restore_authorizer$
declare original issue97_authorizer_original%rowtype;
begin
  select * into strict original from issue97_authorizer_original;
  if original.definition_md5<>'f6763925461111b2069bde0f60007dd4'
     or original.catalog_md5<>'3cb37659bb973f4f753301352574f6d7' then
    raise exception 'Issue #97 captured authorizer authority drifted';
  end if;
  execute original.definition;
end
$restore_authorizer$;

do $snapshot_after$
declare relation_row record; v_count bigint; v_digest text;
begin
  for relation_row in select * from issue97_protected_relations order by ordinal loop
    execute pg_catalog.format(
      'select count(*)::bigint,pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text),''|'' order by pg_catalog.md5(pg_catalog.to_jsonb(row_value)::text)),'''')) from %I.%I row_value',
      relation_row.schema_name,relation_row.table_name
    ) into v_count,v_digest;
    insert into issue97_protected_snapshot values(
      'after',relation_row.ordinal,
      relation_row.schema_name||'.'||relation_row.table_name,v_count,v_digest
    );
  end loop;
end
$snapshot_after$;

do $postcheck$
declare pin record; before_row jsonb; expected_row jsonb; review jsonb;
  v_function record; v_non_target_rows integer; v_non_target_digest text;
begin
  if (select count(*) from issue97_activation_receipts)<>8 then
    raise exception 'Issue #97 activation receipt count is not eight';
  end if;
  select review_details into strict review from issue97_runtime;
  for pin in select * from issue97_successors order by ordinal loop
    select row_value into strict before_row from issue97_target_before
    where build_id=pin.old_build_id;
    expected_row:=before_row||pg_catalog.jsonb_build_object('status','retired');
    if (select pg_catalog.to_jsonb(build) from public.brinesearch_road_graph_builds build
        where build.id=pin.old_build_id) is distinct from expected_row then
      raise exception 'Issue #97 predecessor changed beyond exact retirement: %',pin.county_code;
    end if;

    select row_value into strict before_row from issue97_target_before
    where build_id=pin.build_id;
    expected_row:=before_row||pg_catalog.jsonb_build_object(
      'status','active','activated_at',pg_catalog.transaction_timestamp(),
      'details',(before_row->'details')||pg_catalog.jsonb_build_object(
        'activation_status','active','prior_build_id',pin.old_build_id,
        'activation_impact_count',0,
        'activation_impact_digest','d751713988987e9331980363e24189ce',
        'activation_review',review
      )
    );
    if (select pg_catalog.to_jsonb(build) from public.brinesearch_road_graph_builds build
        where build.id=pin.build_id) is distinct from expected_row then
      raise exception 'Issue #97 successor changed beyond exact activation: %',pin.county_code;
    end if;
    if not private_verification.brinesearch_issue97_graph_build_release_current(pin.build_id) then
      raise exception 'Issue #97 activated successor is not release-current: %',pin.county_code;
    end if;
  end loop;

  if exists(
    (select county_code,build_id from issue97_expected_members
     except select county_code,id from public.brinesearch_road_graph_builds
       where state_code='OH' and status='active')
    union all
    (select county_code,id from public.brinesearch_road_graph_builds
       where state_code='OH' and status='active'
     except select county_code,build_id from issue97_expected_members)
  ) or (select count(*) from public.brinesearch_road_graph_builds
        where state_code='OH' and status='retired'
          and id in (select old_build_id from issue97_successors))<>8
     or not private_verification.brinesearch_issue97_state_candidate_manifest_current(
       '1ef4015c-b1ae-45d2-8baa-86c47c561f54'::uuid
     ) then
    raise exception 'Issue #97 exact post-activation 19-active/8-retired state failed';
  end if;

  if exists(
    select 1 from issue97_protected_snapshot before_state
    join issue97_protected_snapshot after_state using(ordinal,relation_name)
    where before_state.phase='before' and after_state.phase='after'
      and (before_state.row_count, before_state.row_digest)
        is distinct from (after_state.row_count,after_state.row_digest)
  ) or (select count(*) from issue97_protected_snapshot where phase='after')<>28 then
    raise exception 'Issue #97 protected activation collateral changed';
  end if;
  if exists(
    select 1 from issue97_sequence_before before_state
    join (values
      ('private_verification.brinesearch_route_occurrence_receipt_history_issue97_id_seq',
        (select last_value from private_verification.brinesearch_route_occurrence_receipt_history_issue97_id_seq),(select is_called from private_verification.brinesearch_route_occurrence_receipt_history_issue97_id_seq)),
      ('private_verification.brinesearch_route_reconciliation_history_issue97_id_seq',
        (select last_value from private_verification.brinesearch_route_reconciliation_history_issue97_id_seq),(select is_called from private_verification.brinesearch_route_reconciliation_history_issue97_id_seq)),
      ('private_verification.brinesearch_route_transition_history_issue97_id_seq',
        (select last_value from private_verification.brinesearch_route_transition_history_issue97_id_seq),(select is_called from private_verification.brinesearch_route_transition_history_issue97_id_seq)),
      ('private_verification.brinesearch_route_occurrence_geometry_history_issue97_id_seq',
        (select last_value from private_verification.brinesearch_route_occurrence_geometry_history_issue97_id_seq),(select is_called from private_verification.brinesearch_route_occurrence_geometry_history_issue97_id_seq)),
      ('public.pad_edit_history_id_seq',(select last_value from public.pad_edit_history_id_seq),(select is_called from public.pad_edit_history_id_seq))
    ) after_state(sequence_name,last_value,is_called) using(sequence_name)
    where (before_state.last_value,before_state.is_called)
      is distinct from (after_state.last_value,after_state.is_called)
  ) then raise exception 'Issue #97 protected sequence state changed'; end if;

  select count(*)::integer,pg_catalog.md5(coalesce(pg_catalog.string_agg(
    build.id::text||':'||pg_catalog.to_jsonb(build)::text,'|' order by build.id),''))
  into v_non_target_rows,v_non_target_digest
  from public.brinesearch_road_graph_builds build
  where not exists(select 1 from issue97_target_before target where target.build_id=build.id);
  if v_non_target_rows<>33 or v_non_target_digest<>'b38ea0d39e75cd30cfc54a9469e485b7'
     or public.brinesearch_issue97_cutover_active()
     or exists(select 1 from private_verification.brinesearch_google_route_refresh_queue_issue97)
     or exists(select 1 from public.brinesearch_driver_google_routes_public)
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging') then
    raise exception 'Issue #97 post-activation isolation boundary failed';
  end if;

  select procedure.oid,pg_catalog.md5(pg_catalog.pg_get_functiondef(procedure.oid)) definition_md5,
    pg_catalog.md5(pg_catalog.concat_ws('|',procedure.oid::text,
      pg_catalog.md5(pg_catalog.pg_get_functiondef(procedure.oid)),procedure.proowner::text,
      owner.rolname,procedure.prosecdef::text,procedure.provolatile::text,
      procedure.prokind::text,coalesce(procedure.proconfig::text,''),
      coalesce(procedure.proacl::text,''))) catalog_md5
  into strict v_function from pg_catalog.pg_proc procedure
  join pg_catalog.pg_roles owner on owner.oid=procedure.proowner
  where procedure.oid='private_verification.brinesearch_issue97_candidate_manifest_authorizes_build(text,uuid)'::regprocedure;
  if v_function.definition_md5<>'f6763925461111b2069bde0f60007dd4'
     or v_function.catalog_md5<>'3cb37659bb973f4f753301352574f6d7' then
    raise exception 'Issue #97 candidate authorizer was not restored exactly';
  end if;
end
$postcheck$;

select pg_catalog.jsonb_build_object(
  'classification','ISSUE97_FROZEN_WAVE_OHIO_ATOMIC_SWITCH_PRECOMMIT_PASS',
  'commit_requested',:'issue97_control_commit_requested'::boolean,
  'manifest_id','1ef4015c-b1ae-45d2-8baa-86c47c561f54',
  'manifest_digest','77cb00cf83ad8bab4a45c9b552626f76',
  'candidate_set_digest','c3f925954d41cb6fbd5939eca5de3288',
  'activated',8,'retired',8,'retained',11,'active_ohio',19,
  'activation_impact_count',0,
  'activation_impact_digest','d751713988987e9331980363e24189ce',
  'activation_authority_receipt_sha256',
    '392C1881B8DFD2D80190A29EBA8ECD2982A9C02A691A4062348BB2E84695B67F',
  'route_relations_changed',false,'google_queue',0,'public_google',0,
  'cutover',false,'activation_timestamp',pg_catalog.transaction_timestamp(),
  'receipts',(select pg_catalog.jsonb_agg(receipt order by ordinal)
    from issue97_activation_receipts)
)::text as activation_receipt
\gset issue97_output_

\if :issue97_control_commit_requested
  commit;
  \echo :issue97_output_activation_receipt
  \echo 'ISSUE97_FROZEN_WAVE_OHIO_ATOMIC_SWITCH_COMMITTED'
\else
  rollback;
  \echo :issue97_output_activation_receipt
  \echo 'ISSUE97_FROZEN_WAVE_OHIO_ATOMIC_SWITCH_REHEARSAL_ROLLED_BACK'
\endif
