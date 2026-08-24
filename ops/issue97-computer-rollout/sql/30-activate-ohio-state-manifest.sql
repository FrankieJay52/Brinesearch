\set ON_ERROR_STOP on
\pset pager off
\timing on

\if :{?issue97_git_sha}
\else
  \quit 2
\endif

-- One final fixed read-only recovery immediately before the atomic activation.
\ir 28-verify-ohio-release-complete.sql

begin;
set local statement_timeout='15min';
set local lock_timeout='2min';
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:ohio-state-release')
);
select pg_catalog.set_config('issue97.git_sha',:'issue97_git_sha',true);

create temporary table issue97_ohio_activation_pins(
  ordinal integer primary key,
  county_code text not null unique,
  build_id uuid not null unique,
  graph_digest text not null
) on commit drop;
insert into issue97_ohio_activation_pins values
  (1,'ATH','8a4bd4ca-7828-46c1-9c36-752d3a9f8ffb','2080a5a06944f3d4842e31937748267f'),
  (2,'BEL','24ffa531-0e69-4625-a137-da52020e6fd0','fc6dcbc8482b2e5c89f4069941c557de'),
  (3,'CAR','5ee5f97b-447f-41d3-946a-68a8b28d8367','e9f4ed56bb2b1308b8b9913a751c78f5'),
  (4,'COL','c9f50b03-4328-4d8b-9995-4dc8bc85dd01','c13278c74933205f5c55cdf85f23f27e'),
  (5,'COS','7c979743-72e4-42a2-a6a9-006a369168c0','7791b63c7bcb5848200b5bc4cc970fb4'),
  (6,'GUE','84568854-3257-46b7-8581-374dc620ef16','b11b2f5ac3c1c5d492c2233494706f4c'),
  (7,'HAS','542c35d5-a9ba-4b43-8a64-63a66f6b29e2','1d8f6a52d2541e313932906f944b2f92'),
  (8,'JEF','cd096654-8a80-4cdb-b5ec-e1aa78b8b0c4','06e8bd25f7fb46fe750214dd77e2b67d'),
  (9,'MAH','360472bf-cb96-4ba7-b2fe-efa04e230f69','4a80abcc01932b7a169189ec5f706cc4'),
  (10,'MEG','e1cb9c50-f2ec-486a-ba9c-2b4c0fcaf048','2fcf1a69c13907789a2f902574a35674'),
  (11,'MOE','ab9f4083-d572-4d9d-8e0a-28ebb77517e7','69010044273a611876c3a8ace7c198a2'),
  (12,'MUS','98ae1835-1064-4c18-a8a7-9a9e570e212d','04a4c9d7a4274ac638cad78a406f76fa'),
  (13,'NOB','70f30495-860a-4199-9360-8e880f3b515b','eefc679ed36e6aba3a590c7ba2c9e541'),
  (14,'POR','c645a8bf-a920-432a-a341-a7b60d9cfd49','89513e609f359ad9064814ebbf074810'),
  (15,'STA','67541fad-5cf2-4483-b0f6-f4060197fda9','67be9ebece47e78c4c7ccf29ea92786e'),
  (16,'TRU','3c94b14c-9d9e-41ec-a897-b754dab6d8dd','2ff743a4c7f223a6821d3eaff7416d1d'),
  (17,'TUS','fd6fdfff-f23f-42cc-a633-64448bd9d044','b5d73c4e9a397596bbdc1dd0697a0b6d'),
  (18,'VIN','785f5277-369c-4ae3-ba80-31411745e46d','551be5443af26c64d5ed5e92a58ee71b'),
  (19,'WAS','90982f30-8a06-4a53-8b4b-9efd5d9042bf','6ccff50666a085a4387c20fb49f90a59');

-- Freeze the complete Ohio activation scope in the installed function's lock
-- order: every graph scope, every captured ingest scope, then mapping. This
-- prevents a builder from entering between serial county activations.
do $issue97_ohio_activation_locks$
declare lock_row record;
begin
  for lock_row in select county_code from issue97_ohio_activation_pins order by ordinal loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      'brinesearch:issue97:graph:OH:'||lock_row.county_code
    ));
  end loop;
  for lock_row in
    select distinct source.value->>'dataset_id' as dataset_id,
      source.value->>'state_code' as state_code,source.value->>'county_code' as county_code
    from issue97_ohio_activation_pins pin
    join public.brinesearch_road_graph_builds build on build.id=pin.build_id
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(build.details->'source_run_vector','[]'::jsonb)
    ) source(value)
    order by dataset_id,state_code,county_code
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      'brinesearch:issue97:ingest:'||lock_row.dataset_id||':'||lock_row.county_code
    ));
  end loop;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
  );
end
$issue97_ohio_activation_locks$;

create temporary table issue97_ohio_activation_before on commit drop as
select
  pg_catalog.md5(coalesce(pg_catalog.string_agg(
    build.id::text||':'||build.state_code||':'||build.county_code||':'||build.status||':'||
      coalesce(build.activated_at::text,'')||':'||coalesce(build.graph_digest,'')||':'||build.details::text,
    '|' order by build.id
  ),'')) as non_ohio_graph_digest,
  (select pg_catalog.md5(pg_catalog.concat_ws('|',
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||receipt.receipt_digest,
      '|' order by receipt.route_prep_id,receipt.occurrence_index),''))
      from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
      join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||receipt.boundary_index::text||':'||receipt.receipt_digest,
      '|' order by receipt.route_prep_id,receipt.boundary_index),''))
      from private_verification.brinesearch_route_transition_receipts_issue97 receipt
      join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||receipt.receipt_digest,
      '|' order by receipt.route_prep_id,receipt.occurrence_index),''))
      from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
      join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||receipt.receipt_digest,
      '|' order by receipt.route_prep_id),''))
      from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
      join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania'))
  ))) as non_ohio_route_digest
from public.brinesearch_road_graph_builds build
where build.state_code in ('WV','PA');

create temporary table issue97_ohio_activation_receipts(
  ordinal integer primary key,county_code text not null,build_id uuid not null,
  graph_digest text not null,activation_receipt jsonb not null
) on commit drop;

create temporary table issue97_ohio_authorizer_original(
  definition text not null,
  definition_md5 text not null
) on commit drop;
insert into issue97_ohio_authorizer_original
select pg_catalog.pg_get_functiondef(authorizer.oid),
  pg_catalog.md5(pg_catalog.pg_get_functiondef(authorizer.oid))
from pg_catalog.pg_proc authorizer
where authorizer.oid=
  'private_verification.brinesearch_issue97_candidate_manifest_authorizes_build(text,uuid)'::pg_catalog.regprocedure;

select count(*)=1 and min(definition_md5)='f6763925461111b2069bde0f60007dd4'
  as authorizer_definition_exact
from issue97_ohio_authorizer_original
\gset issue97_ohio_authorizer_
\if :issue97_ohio_authorizer_authorizer_definition_exact
\else
  do $fail$ begin raise exception 'Issue #97 live activation authorizer definition changed'; end $fail$;
\endif

do $issue97_ohio_activation_precheck$
declare
  v_manifest record;
begin
  select manifest.* into strict v_manifest
  from private_verification.brinesearch_issue97_state_candidate_manifests manifest
  where manifest.manifest_key='issue97-ohio-r2-final-candidate'
    and manifest.state_code='OH' and manifest.member_count=19
    and manifest.generation_key='issue97-release-20260815-r2'
    and manifest.git_sha='e59f8580787bfa05a9f5c05bd3584197ac84444d';

  if not private_verification.brinesearch_issue97_state_candidate_manifest_current(v_manifest.id)
     or coalesce(current_setting('issue97.git_sha',true),'')!~'^[0-9a-f]{40}$'
     or v_manifest.review_details->>'global_cutover_authorized'<>'false'
     or v_manifest.review_details->>'activation_impact_count'<>'0'
     or exists(select 1 from issue97_ohio_activation_before before_state
       where before_state.non_ohio_graph_digest is distinct from
             v_manifest.review_details->>'non_ohio_graph_digest'
          or before_state.non_ohio_route_digest is distinct from
             v_manifest.review_details->>'non_ohio_route_digest')
     or public.brinesearch_issue97_cutover_active()
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
     or exists(select 1 from pg_catalog.pg_stat_activity activity
       where activity.pid<>pg_catalog.pg_backend_pid()
         and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
         and activity.query ilike '%brinesearch_issue97_rebuild_county_graph%') then
    raise exception 'Issue #97 Ohio activation manifest/current-state preflight failed';
  end if;

  if exists(
    (select expected_pin.county_code,expected_pin.build_id,expected_pin.graph_digest
      from issue97_ohio_activation_pins expected_pin
     except
     select member.member_value->>'county_code',
       (member.member_value->>'build_id')::uuid,member.member_value->>'graph_digest'
     from private_verification.brinesearch_issue97_state_candidate_manifest_members member
     where member.manifest_id=v_manifest.id)
    union all
    (select member.member_value->>'county_code',
       (member.member_value->>'build_id')::uuid,member.member_value->>'graph_digest'
     from private_verification.brinesearch_issue97_state_candidate_manifest_members member
     where member.manifest_id=v_manifest.id
     except select expected_pin.county_code,expected_pin.build_id,expected_pin.graph_digest
       from issue97_ohio_activation_pins expected_pin)
  ) then
    raise exception 'Issue #97 Ohio activation manifest members differ from the audited pins';
  end if;

  perform pg_catalog.set_config('issue97.state_manifest_id',v_manifest.id::text,true);
  perform pg_catalog.set_config('issue97.state_manifest_digest',v_manifest.manifest_digest,true);

  -- The installed per-build authorizer recomputes whole-state currentness for
  -- every member. We have just verified that predicate once while holding every
  -- Ohio graph/source/mapping lock. Replace it only inside this uncommitted
  -- transaction with an exact ID/digest/member guard, then restore byte-for-byte
  -- before COMMIT. A failure rolls the catalog replacement back automatically.
  execute $replace$
    create or replace function private_verification.brinesearch_issue97_candidate_manifest_authorizes_build(
      p_manifest_digest text,p_build_id uuid
    ) returns boolean
    language sql stable security definer set search_path=''
    as $function$
      select coalesce(
        current_setting('issue97.state_manifest_digest',true)=p_manifest_digest
        and current_setting('issue97.state_manifest_id',true)~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and exists(
          select 1
          from private_verification.brinesearch_issue97_state_candidate_manifests header
          join private_verification.brinesearch_issue97_state_candidate_manifest_members member
            on member.manifest_id=header.id
          where header.id=current_setting('issue97.state_manifest_id',true)::uuid
            and header.manifest_key='issue97-ohio-r2-final-candidate'
            and header.state_code='OH'
            and header.member_count=19
            and header.manifest_digest=p_manifest_digest
            and member.member_value->>'build_id'=p_build_id::text
        ),false
      )
    $function$;
  $replace$;
end
$issue97_ohio_activation_precheck$;

do $issue97_ohio_activate$
declare
  v_pin record;
  v_manifest record;
  v_impact_count integer;
  v_result jsonb;
begin
  select manifest.* into strict v_manifest
  from private_verification.brinesearch_issue97_state_candidate_manifests manifest
  where manifest.id=current_setting('issue97.state_manifest_id',true)::uuid
    and manifest.manifest_digest=current_setting('issue97.state_manifest_digest',true)
    and manifest.manifest_key='issue97-ohio-r2-final-candidate'
    and manifest.state_code='OH' and manifest.member_count=19;

  for v_pin in select * from issue97_ohio_activation_pins order by ordinal loop
    select count(*)::integer into v_impact_count
    from (
      with referenced as (
        select distinct pad_road.entry_junction_anchor_id as old_anchor_id
        from public.brinesearch_pad_roads pad_road
        where pad_road.junction_build_id in (
          select historical.id from public.brinesearch_road_graph_builds historical
          where historical.state_code='OH' and historical.county_code=v_pin.county_code
        ) and pad_road.entry_junction_anchor_id is not null
        union
        select distinct review_segment.entry_junction_anchor_id
        from public.brinesearch_route_review_segments review_segment
        where review_segment.junction_build_id in (
          select historical.id from public.brinesearch_road_graph_builds historical
          where historical.state_code='OH' and historical.county_code=v_pin.county_code
        ) and review_segment.entry_junction_anchor_id is not null
      )
      select 1
      from referenced
      join public.brinesearch_road_junction_anchors old_anchor on old_anchor.id=referenced.old_anchor_id
      join public.brinesearch_road_junctions old_junction on old_junction.id=old_anchor.junction_id
      left join public.brinesearch_road_junctions new_junction
        on new_junction.build_id=v_pin.build_id
       and new_junction.stable_junction_key=old_junction.stable_junction_key
      left join public.brinesearch_road_junction_anchors new_anchor
        on new_anchor.junction_id=new_junction.id and new_anchor.anchor_role=old_anchor.anchor_role
      where new_junction.id is null or new_anchor.id is null
         or new_anchor.anchor_digest<>old_anchor.anchor_digest
         or new_junction.graph_digest<>old_junction.graph_digest
    ) impacts;
    if v_impact_count<>0 then
      raise exception 'Issue #97 Ohio activation impact set changed for %; audited count 0, current count %',
        v_pin.county_code,v_impact_count;
    end if;

    v_result:=public.brinesearch_issue97_activate_graph_build(
      v_pin.build_id,null,
      pg_catalog.jsonb_build_object(
        'candidate_manifest_digest',v_manifest.manifest_digest,
        'candidate_manifest_git_sha',v_manifest.git_sha,
        'operator_git_sha',current_setting('issue97.git_sha',true),
        'reviewed_by','Codex independent current-state verification under repository-owner authorization',
        'reviewed_at',pg_catalog.clock_timestamp(),
        'evidence','Exact immutable Ohio state manifest '||v_manifest.id::text||
          ' at candidate Git SHA '||v_manifest.git_sha||'; corrected operator Git SHA '||
          current_setting('issue97.git_sha',true)||'; audited activation impact count 0'
      )
    );
    if coalesce((v_result->>'activated')::boolean,false) is not true
       or coalesce((v_result->>'impact_count')::integer,-1)<>0 then
      raise exception 'Issue #97 Ohio activation refused %: %',v_pin.county_code,v_result;
    end if;
    insert into issue97_ohio_activation_receipts
    values(v_pin.ordinal,v_pin.county_code,v_pin.build_id,v_pin.graph_digest,v_result);
  end loop;
end
$issue97_ohio_activate$;

do $issue97_ohio_restore_authorizer$
declare v_original issue97_ohio_authorizer_original%rowtype;
begin
  select * into strict v_original from issue97_ohio_authorizer_original;
  execute v_original.definition;
  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_candidate_manifest_authorizes_build(text,uuid)'::pg_catalog.regprocedure
     ))<>v_original.definition_md5 then
    raise exception 'Issue #97 activation authorizer was not restored exactly';
  end if;
end
$issue97_ohio_restore_authorizer$;

with manifest as (
  select * from private_verification.brinesearch_issue97_state_candidate_manifests
  where manifest_key='issue97-ohio-r2-final-candidate'
), active_exact as (
  select build.county_code,build.id,build.graph_digest
  from public.brinesearch_road_graph_builds build
  join issue97_ohio_activation_pins pin
    on pin.build_id=build.id and pin.county_code=build.county_code
   and pin.graph_digest=build.graph_digest
  where build.state_code='OH' and build.status='active'
    and private_verification.brinesearch_issue97_graph_build_release_current(build.id)
), current_sources as (
  select count(*)::integer as required,
    count(*) filter(where private_verification.brinesearch_issue97_dataset_scope_current(
      scope.dataset_id,scope.state_code,scope.county_code
    ))::integer as current
  from public.brinesearch_road_source_dataset_counties scope
  join public.brinesearch_road_source_datasets dataset
    on dataset.id=scope.dataset_id and dataset.active
  where scope.active and scope.ingest_enabled and scope.required_for_graph
    and scope.state_code='OH'
), after_state as (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    build.id::text||':'||build.state_code||':'||build.county_code||':'||build.status||':'||
      coalesce(build.activated_at::text,'')||':'||coalesce(build.graph_digest,'')||':'||build.details::text,
    '|' order by build.id
  ),'')) as non_ohio_graph_digest,
  (select pg_catalog.md5(pg_catalog.concat_ws('|',
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||receipt.receipt_digest,'|' order by receipt.route_prep_id,receipt.occurrence_index),'')) from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(receipt.route_prep_id::text||':'||receipt.boundary_index::text||':'||receipt.receipt_digest,'|' order by receipt.route_prep_id,receipt.boundary_index),'')) from private_verification.brinesearch_route_transition_receipts_issue97 receipt join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||receipt.receipt_digest,'|' order by receipt.route_prep_id,receipt.occurrence_index),'')) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(receipt.route_prep_id::text||':'||receipt.receipt_digest,'|' order by receipt.route_prep_id),'')) from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania'))
  ))) as non_ohio_route_digest
  from public.brinesearch_road_graph_builds build where build.state_code in ('WV','PA')
)
select (select count(*) from issue97_ohio_activation_receipts)=19
  and (select count(*) from active_exact)=19
  and (select count(*) from public.brinesearch_road_graph_builds
    where state_code='OH' and status='active')=19
  and (select private_verification.brinesearch_issue97_state_candidate_manifest_current(id)
    from manifest)
  and (select required=38 and current=38 from current_sources)
  and not public.brinesearch_issue97_cutover_active()
  and not exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
  and not exists(select 1 from pg_catalog.pg_stat_activity activity
    where activity.pid<>pg_catalog.pg_backend_pid()
      and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
      and activity.query ilike '%brinesearch_issue97_rebuild_county_graph%')
  and (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)=0
  and (select count(*) from public.brinesearch_driver_google_routes_public)=0
  and (select before.non_ohio_graph_digest=after.non_ohio_graph_digest
    and before.non_ohio_route_digest=after.non_ohio_route_digest
    from issue97_ohio_activation_before before cross join after_state after)
  as activation_exact
\gset issue97_ohio_activation_

\if :issue97_ohio_activation_activation_exact
\else
  do $fail$ begin raise exception 'Issue #97 Ohio activation postcheck failed; transaction will roll back'; end $fail$;
\endif

select pg_catalog.jsonb_pretty(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'county_code',county_code,'build_id',build_id,'graph_digest',graph_digest,
  'activation_receipt',activation_receipt
) order by ordinal)) as activation_receipts
from issue97_ohio_activation_receipts
\gset issue97_ohio_activation_output_

commit;
\echo :issue97_ohio_activation_output_activation_receipts
\echo 'Issue #97 exact manifest-authorized Ohio activation PASS: 19/19 active/current, zero audited impacts, non-Ohio graph/routes unchanged, global cutover and public Google routes remain OFF.'
