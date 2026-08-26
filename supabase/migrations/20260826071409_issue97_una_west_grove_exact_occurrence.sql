-- GitHub #97 -- UNA uses the WEST GROVE RD portion of the exact TR-78
-- authoritative identity, not the later CROSKEY RD portion. The route then
-- terminates at UNA's stored pad/lease destination as a held LEASE ROUTE.
--
-- This is an occurrence/name/endpoint receipt only.  It does not create a
-- canonical road mapping, rebuild a graph, manufacture geometry, approve a
-- Google handoff, or enable cutover.  UNA remains fail-closed until those
-- independent gates are satisfied by a separately reviewed release.

set local statement_timeout = '5min';
set local lock_timeout = '5s';

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:v18:directory-snapshot',18)
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:v18:company-road-overlay',18)
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:issue97:all-pad-routing-pipeline',97)
);

create temporary table tmp_issue97_una_before on commit drop as
select
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(build)::text,'|' order by build.id
  ),'')) from public.brinesearch_road_graph_builds build) as graph_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(pad)::text,'|' order by pad.id
  ),'')) from public.pads pad
    where pad.id<>'0b675c3f-2c04-4901-955d-8629e7dba05e') as non_target_pad_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(route)::text,'|' order by route.id
  ),'')) from public.brinesearch_route_prep route
    where route.pad_id<>'0b675c3f-2c04-4901-955d-8629e7dba05e') as non_target_route_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_step_id
  ),''))
   from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
   where receipt.pad_id<>'0b675c3f-2c04-4901-955d-8629e7dba05e')
    as non_target_occurrence_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id
  ),''))
   from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
   where receipt.pad_id<>'0b675c3f-2c04-4901-955d-8629e7dba05e')
    as non_target_reconciliation_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(route)::text,'|' order by route.pad_id
  ),'')) from public.brinesearch_driver_google_routes_public route)
    as public_google_digest,
  (select count(*) from public.brinesearch_driver_google_routes_public)
    as public_google_count,
  (select cutover_at from public.brinesearch_issue97_release_state where singleton)
    as cutover_at,
  (select snapshot_id from public.brinesearch_directory_snapshots_v18
    where publication_state='current') as directory_snapshot_id,
  (select source_revision from public.brinesearch_directory_snapshots_v18
    where publication_state='current') as directory_revision,
  (select snapshot_id from public.brinesearch_company_road_overlay_snapshots_v18
    where publication_state='current') as overlay_snapshot_id,
  (select content_sha256 from public.brinesearch_company_road_overlay_snapshots_v18
    where publication_state='current') as overlay_content_sha256,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      (pg_catalog.to_jsonb(row)-'snapshot_id')::text,'|' order by row.pad_id
    ),''))
   from public.brinesearch_directory_snapshot_rows_v18 row
   join public.brinesearch_directory_snapshots_v18 snapshot
     on snapshot.snapshot_id=row.snapshot_id and snapshot.publication_state='current'
   where row.pad_id<>'0b675c3f-2c04-4901-955d-8629e7dba05e')
    as non_target_directory_digest;

do $issue97_una_preconditions$
declare
  v_distance_m double precision;
begin
  if to_regprocedure(
       'private_verification.brinesearch_issue97_occurrence_driver_name(uuid,uuid)'
     ) is not null then
    raise exception 'Issue #97 UNA occurrence driver-name helper already exists';
  end if;

  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_terminal_private_access_destination(uuid)'::
         pg_catalog.regprocedure
     ))<>'34bdc93597f6da3cad68376ca01906c1'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_identity_driver_name(uuid)'::
         pg_catalog.regprocedure
     ))<>'279d434b23a7aa871a5845d2264678dd'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_refresh_route_receipt(uuid)'::
         pg_catalog.regprocedure
     ))<>'8283a543bf42f939296d32e5e5a92b4f'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::
         pg_catalog.regprocedure
     ))<>'0f139df2a01f68722958ff10f1dd6f49'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_resolve_route_identity_path(uuid)'::
         pg_catalog.regprocedure
     ))<>'8ad311611cf361ca457e4084128b9cfb'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_v18_exact_route_projection(uuid,integer)'::
         pg_catalog.regprocedure
     ))<>'e14f8a036e5bff7dec8441ea9528a2e8'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_v18_exact_route_projection_cached(uuid,integer)'::
         pg_catalog.regprocedure
     ))<>'f44e0db9600c9e1f574e1e2ea844bb6a'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_v18_company_road_authority_definition_sha256()'::
         pg_catalog.regprocedure
     ))<>'4e017c12a1208352f4d5972b6db8dfce'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_v18_refresh_directory_snapshot()'::
         pg_catalog.regprocedure
     ))<>'45cc48772d2d960514d69d5806296b97'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_v18_driver_pad_status(uuid)'::pg_catalog.regprocedure
     ))<>'568d9dc661706002e4f516399a1685d1' then
    raise exception 'Issue #97 UNA reviewed function checkpoint diverged';
  end if;

  if not exists(
    select 1
    from public.pads pad
    where pad.id='0b675c3f-2c04-4901-955d-8629e7dba05e'
      and pad.legacy_id='ascent--una'
      and pad.pad_name='UNA' and pad.company='Ascent'
      and pad.state='Ohio' and pad.county='Harrison'
      and pad.township='Short Creek'
      and pad.latitude=40.228835 and pad.longitude=-80.933934
      and pad.structured_road_sequence='US-250'
      and pad.brinesearch_google_route_status_issue97='not_evaluated'
  ) then
    raise exception 'Issue #97 UNA pad checkpoint diverged';
  end if;

  if not exists(
    select 1
    from public.brinesearch_route_prep route
    where route.id='486902dc-9df5-473f-b9ce-678b9710e3d6'
      and route.pad_id='0b675c3f-2c04-4901-955d-8629e7dba05e'
      and route.route_group='primary' and route.variant_index=1 and route.active
      and route.source_sequence='US-250'
      and route.normalized_sequence='US-250'
       and route.source_sequence_hash='ab099f3abfc0d3bc9cb350829715a418'
       and route.readiness_status='needs_sequence_rebuild'
       and route.issue_codes=array['not_enough_road_steps']::text[]
       and route.highway_anchor_text='US-250'
       and route.highway_anchor_kind='us_route'
       and route.highway_anchor_status='explicit'
       and route.no_guess_policy='strict'
  ) or (select count(*) from public.brinesearch_route_prep_steps step
        where step.route_prep_id='486902dc-9df5-473f-b9ce-678b9710e3d6'
          and step.active)<>1
     or not exists(
       select 1 from public.brinesearch_route_prep_steps step
       where step.id='77bc7028-6586-4d95-bd33-faaad47296bd'
         and step.route_prep_id='486902dc-9df5-473f-b9ce-678b9710e3d6'
         and step.step_order=1 and step.raw_text='US-250'
         and step.normalized_text='US-250' and step.step_kind='us_route'
         and step.road_id='cdcfd114-42c5-4478-9251-eac57a70e528'
         and step.match_status='exact_master'
         and step.match_method='explicit_highway_master_record'
     )
     or exists(select 1 from public.brinesearch_route_prep_steps
       where id in (
         'd7ea0091-bd90-2024-20fb-09aad6cc33ed',
         'cc0d7aca-9fc7-4ee1-9521-b4110ed042d7'
       )) then
    raise exception 'Issue #97 UNA route-prep checkpoint diverged';
  end if;

  if not exists(
    select 1
    from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
    where receipt.route_prep_id='486902dc-9df5-473f-b9ce-678b9710e3d6'
      and receipt.pad_id='0b675c3f-2c04-4901-955d-8629e7dba05e'
      and receipt.source_sequence_hash='ab099f3abfc0d3bc9cb350829715a418'
      and receipt.route_status='needs_review'
      and receipt.stage='identity_reconciliation'
      and receipt.road_occurrence_count=1
      and receipt.resolved_occurrence_count=0
      and receipt.held_occurrence_count=1
      and receipt.canonical_mapping_count=0
      and receipt.exact_geometry_count=0
  ) then
    raise exception 'Issue #97 UNA route-receipt checkpoint diverged';
  end if;

  if not exists(
    select 1 from public.pad_verification_status verification
    where verification.pad_id='0b675c3f-2c04-4901-955d-8629e7dba05e'
      and not verification.gps_verified
      and verification.directions_verified
      and not verification.roads_verified
  ) then
    raise exception 'Issue #97 UNA coordinate/direction verification checkpoint diverged';
  end if;

  if not exists(
    select 1
    from public.brinesearch_authoritative_road_identities identity
    where identity.id='894e77bd-9780-c162-730f-5cad9f02134d'
      and identity.source_identity_key='OH:ODOT:NLF:THASTR00078**C'
      and identity.state_code='OH' and identity.county_code='HAS'
      and identity.route_system='TR' and identity.route_number='78'
      and identity.source_digest='f2a9c6b6bace76d0d14a0e727e46ad9a'
      and identity.active and identity.drivable_status='drivable'
      and identity.public_access_status='public'
  ) or exists(
    select 1 from public.brinesearch_road_identity_mappings mapping
    where mapping.identity_id='894e77bd-9780-c162-730f-5cad9f02134d'
  ) then
    raise exception 'Issue #97 UNA TR-78 identity/mapping checkpoint diverged';
  end if;

  if (select count(*)
      from public.brinesearch_authoritative_road_names name
      where name.identity_id='894e77bd-9780-c162-730f-5cad9f02134d'
        and name.source_segment_key='OH:ODOT:SEGMENT:2025_000000000395678'
        and name.road_name='WEST GROVE RD' and name.name_type='official'
        and name.active
        and (name.valid_from is null or name.valid_from<=now())
        and (name.valid_to is null or name.valid_to>now()))<>1
     or not exists(
       select 1 from public.brinesearch_authoritative_road_names name
       where name.identity_id='894e77bd-9780-c162-730f-5cad9f02134d'
         and name.road_name='CROSKEY RD' and name.name_type='official'
         and name.active
     )
     or private_verification.brinesearch_issue97_identity_driver_name(
       '894e77bd-9780-c162-730f-5cad9f02134d'
     ) is distinct from 'CROSKEY RD'
     or not array['CROSKEY RD','TR 78','WEST GROVE RD']::text[] <@
       private_verification.brinesearch_issue97_identity_aliases(
         '894e77bd-9780-c162-730f-5cad9f02134d',null
       ) then
    raise exception 'Issue #97 UNA reviewed same-identity name proof diverged';
  end if;

  if not exists(
    select 1
    from public.brinesearch_authoritative_segment_identity_assignments assignment
    join private_verification.brinesearch_issue97_authoritative_road_segments_internal segment
      on segment.source_segment_key=assignment.source_segment_key
     and segment.identity_id=assignment.identity_id and segment.active
    where assignment.source_segment_key='OH:ODOT:SEGMENT:2025_000000000395678'
      and assignment.identity_id='894e77bd-9780-c162-730f-5cad9f02134d'
      and assignment.assignment_method='connected_component'
      and assignment.active
  ) then
    raise exception 'Issue #97 UNA exact West Grove segment assignment is absent';
  end if;

  select extensions.st_distance(
    segment.geom::extensions.geography,
    extensions.st_setsrid(
      extensions.st_makepoint(-80.933934,40.228835),4326
    )::extensions.geography
  ) into strict v_distance_m
  from private_verification.brinesearch_issue97_authoritative_road_segments_internal segment
  where segment.source_segment_key='OH:ODOT:SEGMENT:2025_000000000395678'
    and segment.identity_id='894e77bd-9780-c162-730f-5cad9f02134d'
    and segment.source_record_id='2025_000000000395678' and segment.active;
  if v_distance_m<8 or v_distance_m>9 then
    raise exception 'Issue #97 UNA verified entrance corroboration drifted: % m',v_distance_m;
  end if;

  if not exists(
    select 1
    from public.brinesearch_road_junctions junction
    join public.brinesearch_road_junction_memberships west
      on west.junction_id=junction.id
     and west.identity_id='894e77bd-9780-c162-730f-5cad9f02134d'
     and west.source_segment_keys=array['OH:ODOT:SEGMENT:2025_000000000395676']::text[]
     and west.road_name_at_junction='WEST GROVE RD'
    join public.brinesearch_road_junction_memberships highway
     on highway.junction_id=junction.id
     and highway.identity_id='f61bbbe4-353e-4968-e1dd-986d8889c11c'
     and highway.road_id='cdcfd114-42c5-4478-9251-eac57a70e528'
     and highway.provenance->>'source_identity_key'=
       'OH:ODOT:NLF:SHASUS00250**C'
    join public.brinesearch_road_graph_builds build
      on build.id=junction.build_id and build.status='active'
    where junction.id='0f64ae5f-481b-b732-c2d2-26c93ba921f1'
      and junction.verification_status='verified'
      and junction.source_method='exact_authoritative_endpoint_on_interior'
      and junction.state_code='OH' and junction.county_code='HAS'
  ) then
    raise exception 'Issue #97 UNA exact US-250 / West Grove junction proof diverged';
  end if;

  if (select count(*) from public.brinesearch_directory_snapshots_v18
      where publication_state='current')<>1
     or (select directory_revision from tmp_issue97_una_before)<>5
     or (select count(*) from public.brinesearch_company_road_overlay_snapshots_v18
      where publication_state='current')<>1
     or (select public_google_count from tmp_issue97_una_before)<>1
     or (select cutover_at from tmp_issue97_una_before) is not null then
    raise exception 'Issue #97 UNA directory/overlay/Google/cutover checkpoint diverged';
  end if;
end
$issue97_una_preconditions$;

create or replace function
  private_verification.brinesearch_issue97_occurrence_driver_name(
    p_route_prep_step_id uuid,
    p_identity_id uuid
  )
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_receipt jsonb;
  v_name text;
  v_count integer;
begin
  select step.source_details->'authoritative_driver_name_receipt'
  into v_receipt
  from public.brinesearch_route_prep_steps step
  join public.brinesearch_route_prep route on route.id=step.route_prep_id
  where step.id=p_route_prep_step_id and step.active and route.active;

  if v_receipt is null then
    return private_verification.brinesearch_issue97_identity_driver_name(p_identity_id);
  end if;
  if pg_catalog.jsonb_typeof(v_receipt) is distinct from 'object'
     or v_receipt->>'proof' is distinct from 'owner_reviewed_exact_source_segment'
     or v_receipt->>'identity_id' is distinct from p_identity_id::text
     or v_receipt->>'name_matching_used' is distinct from 'false'
     or v_receipt->>'fuzzy_matching_used' is distinct from 'false'
     or v_receipt->>'nearest_road_used' is distinct from 'false' then
    return null;
  end if;

  select count(*),min(name.road_name)
  into v_count,v_name
  from public.brinesearch_route_prep_steps step
  join public.brinesearch_route_prep route
    on route.id=step.route_prep_id and route.active
  join public.brinesearch_authoritative_road_identities identity
    on identity.id=p_identity_id and identity.active
   and step.source_details->>'source_identity_key'=identity.source_identity_key
  join public.brinesearch_authoritative_segment_identity_assignments assignment
    on assignment.identity_id=identity.id and assignment.active
   and assignment.dataset_id=identity.dataset_id
   and assignment.assignment_method='connected_component'
   and assignment.source_segment_key=v_receipt->>'source_segment_key'
  join private_verification.brinesearch_issue97_authoritative_road_segments_internal segment
    on segment.identity_id=identity.id and segment.active
   and segment.dataset_id=assignment.dataset_id
   and segment.source_segment_key=assignment.source_segment_key
  join public.brinesearch_authoritative_road_names name
    on name.identity_id=identity.id and name.active
   and name.source_dataset_id=assignment.dataset_id
   and name.source_segment_key=assignment.source_segment_key
   and name.name_type='official'
   and name.road_name=v_receipt->>'road_name'
   and (name.valid_from is null or name.valid_from<=now())
   and (name.valid_to is null or name.valid_to>now())
  where step.id=p_route_prep_step_id
    and private_verification.brinesearch_issue97_dataset_scope_current(
      identity.dataset_id,identity.state_code,identity.county_code
    )
    and private_verification.brinesearch_issue97_dataset_scope_current(
      name.source_dataset_id,identity.state_code,identity.county_code
    );
  if v_count<>1 then return null; end if;
  return v_name;
end
$$;

revoke all on function
  private_verification.brinesearch_issue97_occurrence_driver_name(uuid,uuid)
from public,anon,authenticated,service_role;

comment on function
  private_verification.brinesearch_issue97_occurrence_driver_name(uuid,uuid) is
  'Issue #97 source-segment-bound driver name. An explicit receipt must match one active/current connected-component segment assignment and official name; invalid receipts return NULL so the existing resolved-receipt constraints abort the write. Without a receipt, the unchanged identity-wide name rule applies.';

create or replace function
  private_verification.brinesearch_issue97_terminal_private_access_destination(
    p_step_id uuid
  )
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce((
    select
      step.active
      and route.active
      and step.step_kind='private_segment'
      and (
        pg_catalog.lower(pg_catalog.btrim(step.normalized_text)) in ('pad','lease road')
        or (
          pg_catalog.jsonb_typeof(
            step.source_details->'terminal_private_access_receipt'
          )='object'
          and step.source_details->'terminal_private_access_receipt'->>'proof'=
            'owner_reviewed_pad_bound_lease_endpoint'
          and step.source_details->'terminal_private_access_receipt'->>'pad_id'=
            route.pad_id::text
          and step.source_details->'terminal_private_access_receipt'->>'coordinate_digest'=
            pg_catalog.md5(pg_catalog.concat_ws('|',
              pad.longitude::text,pad.latitude::text
            ))
          and step.source_details->'terminal_private_access_receipt'->>'endpoint_role'=
            'pad_or_lease_destination'
          and step.source_details->'terminal_private_access_receipt'->>'authority_effect'=
            'held_only'
          and step.source_details->'terminal_private_access_receipt'->>'pad_gps_is_public_road_identity'=
            'false'
          and step.source_details->'terminal_private_access_receipt'->>'route_geometry_created'=
            'false'
          and step.source_details->'terminal_private_access_receipt'->>'terminates_at_endpoint'=
            'true'
          and step.source_details->'terminal_private_access_receipt'->>'no_approved_continuation_beyond_endpoint'=
            'true'
          and step.source_details->'terminal_private_access_receipt'->>'requires_reviewed_private_geometry_for_ready'=
            'true'
          and exists(
            select 1
            from public.brinesearch_route_prep_steps prior
            join private_verification.brinesearch_route_occurrence_receipts_issue97 occurrence
              on occurrence.route_prep_step_id=prior.id
             and occurrence.route_prep_id=route.id
             and occurrence.resolution_status='resolved'
            where prior.route_prep_id=route.id and prior.active
              and prior.step_kind in (
                'interstate','us_route','state_route','county_road',
                'township_road','local_road','private_segment'
              )
              and prior.step_order<step.step_order
              and occurrence.identity_id::text=
                step.source_details->'terminal_private_access_receipt'->>'inbound_public_road_identity_id'
              and occurrence.driver_road_name=
                step.source_details->'terminal_private_access_receipt'->>'inbound_public_road_name'
              and prior.source_details->'authoritative_driver_name_receipt'->>'identity_id'=
                step.source_details->'terminal_private_access_receipt'->>'inbound_public_road_identity_id'
              and prior.source_details->'authoritative_driver_name_receipt'->>'source_segment_key'=
                step.source_details->'terminal_private_access_receipt'->>'inbound_source_segment_key'
              and prior.source_details->'authoritative_driver_name_receipt'->>'road_name'=
                step.source_details->'terminal_private_access_receipt'->>'inbound_public_road_name'
              and not exists(
                select 1
                from public.brinesearch_route_prep_steps between_step
                where between_step.route_prep_id=route.id and between_step.active
                  and between_step.step_kind in (
                    'interstate','us_route','state_route','county_road',
                    'township_road','local_road','private_segment'
                  )
                  and between_step.step_order>prior.step_order
                  and between_step.step_order<step.step_order
              )
          )
        )
      )
      and step.road_id is null
      and private_verification.brinesearch_issue97_explicit_occurrence_source_key(
        route.state,step.match_method,coalesce(step.source_details,'{}'::jsonb)
      ) is null
      and not exists(
        select 1
        from public.brinesearch_route_prep_steps later
        where later.route_prep_id=step.route_prep_id
          and later.active
          and later.step_kind in (
            'interstate','us_route','state_route','county_road',
            'township_road','local_road','private_segment'
          )
          and (
            later.step_order>step.step_order
            or (later.step_order=step.step_order and later.id>step.id)
          )
      )
    from public.brinesearch_route_prep_steps step
    join public.brinesearch_route_prep route on route.id=step.route_prep_id
    join public.pads pad on pad.id=route.pad_id
    where step.id=p_step_id
  ),false)
$$;

revoke all on function
  private_verification.brinesearch_issue97_terminal_private_access_destination(uuid)
from public,anon,authenticated,service_role;

comment on function
  private_verification.brinesearch_issue97_terminal_private_access_destination(uuid) is
  'Issue #97 exact classifier for a final unbound Pad/Lease Road placeholder or a pad-bound owner-reviewed lease endpoint receipt. It never turns pad GPS or satellite context into a public-road identity, mapping, geometry, or approval.';

do $issue97_una_patch_consumers$
declare
  v_definition text;
  v_old text;
  v_new text;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::
      pg_catalog.regprocedure
  ) into strict v_definition;
  v_old:='v_driver:=private_verification.brinesearch_issue97_identity_driver_name(v_identity);';
  v_new:='v_driver:=private_verification.brinesearch_issue97_occurrence_driver_name(p_step_id,v_identity);';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
    pg_catalog.replace(v_definition,v_old,''))) / pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 UNA occurrence refresher name patch drifted: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);
  execute v_definition;

  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_resolve_route_identity_path(uuid)'::
      pg_catalog.regprocedure
  ) into strict v_definition;
  v_old:='v_driver:=private_verification.brinesearch_issue97_identity_driver_name(v_identity);';
  v_new:='v_driver:=private_verification.brinesearch_issue97_occurrence_driver_name((select receipt.route_prep_step_id from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt where receipt.route_prep_id=p_route_prep_id and not private_verification.brinesearch_issue97_terminal_private_access_destination(receipt.route_prep_step_id) order by receipt.occurrence_index offset v_choice.path_index-1 limit 1),v_identity);';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
    pg_catalog.replace(v_definition,v_old,''))) / pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 UNA route resolver name patch drifted: %',v_count; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);
  execute v_definition;

  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_v18_exact_route_projection(uuid,integer)'::
      pg_catalog.regprocedure
  ) into strict v_definition;
  v_old:=E'private_verification.brinesearch_issue97_identity_driver_name(\n          occurrence.identity_id\n        )';
  v_new:=E'private_verification.brinesearch_issue97_occurrence_driver_name(\n          source_step.id,occurrence.identity_id\n        )';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
    pg_catalog.replace(v_definition,v_old,''))) / pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 UNA exact projection name patch drifted: %',v_count; end if;
  execute pg_catalog.replace(v_definition,v_old,v_new);

  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_v18_exact_route_projection_cached(uuid,integer)'::
      pg_catalog.regprocedure
  ) into strict v_definition;
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
    pg_catalog.replace(v_definition,v_old,''))) / pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 UNA cached projection name patch drifted: %',v_count; end if;
  execute pg_catalog.replace(v_definition,v_old,v_new);

  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_v18_company_road_authority_definition_sha256()'::
      pg_catalog.regprocedure
  ) into strict v_definition;
  v_old:=E'(''private_verification.brinesearch_issue97_identity_driver_name(uuid)''),\n      (''private_verification.brinesearch_issue97_identity_aliases(uuid,uuid)'')';
  v_new:=E'(''private_verification.brinesearch_issue97_identity_driver_name(uuid)''),\n      (''private_verification.brinesearch_issue97_occurrence_driver_name(uuid,uuid)''),\n      (''private_verification.brinesearch_issue97_identity_aliases(uuid,uuid)'')';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
    pg_catalog.replace(v_definition,v_old,''))) / pg_catalog.length(v_old);
  if v_count<>1 then raise exception 'Issue #97 UNA company-road authority patch drifted: %',v_count; end if;
  execute pg_catalog.replace(v_definition,v_old,v_new);
end
$issue97_una_patch_consumers$;

do $issue97_una_verify_consumer_patch$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::
      pg_catalog.regprocedure
  ) into strict v_definition;
  if pg_catalog.strpos(v_definition,
       'brinesearch_issue97_occurrence_driver_name(p_step_id,v_identity)')=0 then
    raise exception 'Issue #97 UNA occurrence refresher patch is incomplete';
  end if;
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_resolve_route_identity_path(uuid)'::
      pg_catalog.regprocedure
  ) into strict v_definition;
  if pg_catalog.strpos(v_definition,'brinesearch_issue97_occurrence_driver_name(')=0 then
    raise exception 'Issue #97 UNA route resolver patch is incomplete';
  end if;
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_v18_exact_route_projection(uuid,integer)'::
      pg_catalog.regprocedure
  ) into strict v_definition;
  if pg_catalog.strpos(v_definition,
       'brinesearch_issue97_occurrence_driver_name(')=0 then
    raise exception 'Issue #97 UNA exact projection patch is incomplete';
  end if;
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_v18_exact_route_projection_cached(uuid,integer)'::
      pg_catalog.regprocedure
  ) into strict v_definition;
  if pg_catalog.strpos(v_definition,
       'brinesearch_issue97_occurrence_driver_name(')=0
     or pg_catalog.strpos(v_definition,
       'brinesearch_issue97_dataset_scope_current_cached(')=0 then
    raise exception 'Issue #97 UNA cached projection patch is incomplete';
  end if;
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_v18_company_road_authority_definition_sha256()'::
      pg_catalog.regprocedure
  ) into strict v_definition;
  if pg_catalog.strpos(v_definition,
       'private_verification.brinesearch_issue97_occurrence_driver_name(uuid,uuid)')=0 then
    raise exception 'Issue #97 UNA occurrence-name authority is not digest-bound';
  end if;
end
$issue97_una_verify_consumer_patch$;

update public.pads
set structured_road_sequence='US-250 → WEST GROVE RD → LEASE ROUTE'
where id='0b675c3f-2c04-4901-955d-8629e7dba05e';

update public.brinesearch_route_prep
set source_sequence='US-250 → WEST GROVE RD → LEASE ROUTE',
    normalized_sequence='US-250 → WEST GROVE RD → UNA LEASE ROUTE',
    normalized_steps='["US-250","WEST GROVE RD","UNA LEASE ROUTE"]'::jsonb,
    source_sequence_hash=pg_catalog.md5('US-250 → WEST GROVE RD → LEASE ROUTE'),
    readiness_status='ready_for_road_matching',
    issue_codes='{}'::text[],
    highway_anchor_text='US-250',
    highway_anchor_kind='us_route',
    highway_anchor_status='explicit',
    updated_at=pg_catalog.clock_timestamp()
where id='486902dc-9df5-473f-b9ce-678b9710e3d6';

update public.brinesearch_route_prep_steps
set match_method='issue97_owner_reviewed_exact_source_identity',
    match_confidence=1,
    source_details=coalesce(source_details,'{}'::jsonb)||pg_catalog.jsonb_build_object(
      'issue',97,
      'source_identity_key','OH:ODOT:NLF:SHASUS00250**C',
      'authoritative_identity_key','OH:ODOT:NLF:SHASUS00250**C',
      'authoritative_identity_proof',true,
      'proof_scope','reviewed UNA US-250 occurrence + exact verified US-250 / TR-78 junction',
      'route_authority_upgrade',false,
      'public_google_publication',false,
      'name_matching_used',false,
      'fuzzy_matching_used',false,
      'nearest_road_used',false,
      'route_number_only_used',false
    ),
    updated_at=pg_catalog.clock_timestamp()
where id='77bc7028-6586-4d95-bd33-faaad47296bd';

insert into public.brinesearch_route_prep_steps(
  id,route_prep_id,step_order,raw_text,normalized_text,step_kind,road_id,
  match_status,match_method,match_confidence,source_details,owner_decision,
  distance_miles,turn_direction,geometry_status,active,created_at,updated_at
) values (
  'd7ea0091-bd90-2024-20fb-09aad6cc33ed',
  '486902dc-9df5-473f-b9ce-678b9710e3d6',2,
  'WEST GROVE RD','WEST GROVE RD','township_road',null,
  'exact_master','issue97_owner_reviewed_exact_source_identity',1,
  pg_catalog.jsonb_build_object(
    'issue',97,
    'source_identity_key','OH:ODOT:NLF:THASTR00078**C',
    'authoritative_identity_key','OH:ODOT:NLF:THASTR00078**C',
    'authoritative_identity_proof',true,
    'proof_scope','owner-confirmed UNA field road + reviewed directions + exact current ODOT source segment',
    'authoritative_driver_name_receipt',pg_catalog.jsonb_build_object(
      'proof','owner_reviewed_exact_source_segment',
      'identity_id','894e77bd-9780-c162-730f-5cad9f02134d',
      'source_segment_key','OH:ODOT:SEGMENT:2025_000000000395678',
      'road_name','WEST GROVE RD',
      'name_matching_used',false,
      'fuzzy_matching_used',false,
      'nearest_road_used',false
    ),
    'route_authority_upgrade',false,
    'public_google_publication',false,
    'name_matching_used',false,
    'fuzzy_matching_used',false,
    'nearest_road_used',false,
    'route_number_only_used',false
  ),
  'pending',null,'right','not_started',true,
  pg_catalog.clock_timestamp(),pg_catalog.clock_timestamp()
);

insert into public.brinesearch_route_prep_steps(
  id,route_prep_id,step_order,raw_text,normalized_text,step_kind,road_id,
  match_status,match_method,match_confidence,source_details,owner_decision,
  distance_miles,turn_direction,geometry_status,active,created_at,updated_at
) values (
  'cc0d7aca-9fc7-4ee1-9521-b4110ed042d7',
  '486902dc-9df5-473f-b9ce-678b9710e3d6',3,
  'UNA LEASE ROUTE','UNA LEASE ROUTE','private_segment',null,
  'private_segment','issue97_owner_reviewed_terminal_lease_hold',null,
  pg_catalog.jsonb_build_object(
    'issue',97,
    'local_road_guessing',false,
    'display_name','UNA LEASE ROUTE',
    'proof_scope','owner-confirmed UNA pad/lease destination at the exact saved coordinate; this coordinate is not asserted to be a verified public-road entrance, centralized public coordinate state remains held, and satellite track is supporting context only',
    'terminal_private_access_receipt',pg_catalog.jsonb_build_object(
      'proof','owner_reviewed_pad_bound_lease_endpoint',
      'pad_id','0b675c3f-2c04-4901-955d-8629e7dba05e',
      'coordinate_digest',pg_catalog.md5(pg_catalog.concat_ws('|',
        (-80.933934::double precision)::text,(40.228835::double precision)::text
      )),
      'stored_coordinate_role','pad_or_lease_destination_unverified',
      'verified_public_road_entrance_present',false,
      'public_directory_coordinate_state_at_stamp','held',
      'inbound_public_road_identity_id','894e77bd-9780-c162-730f-5cad9f02134d',
      'inbound_public_road_name','WEST GROVE RD',
      'inbound_source_segment_key','OH:ODOT:SEGMENT:2025_000000000395678',
      'endpoint_kind','lease_route',
      'endpoint_role','pad_or_lease_destination',
      'authority_effect','held_only',
      'terminates_at_endpoint',true,
      'no_approved_continuation_beyond_endpoint',true,
      'terminates_at_owner_confirmed_pad_or_lease_destination',true,
      'no_public_road_continuation_to_croskey',true,
      'croskey_portion_included',false,
      'satellite_context_only',true,
      'pad_gps_is_public_road_identity',false,
      'route_geometry_created',false,
      'requires_reviewed_private_geometry_for_ready',true
    ),
    'route_authority_upgrade',false,
    'public_google_publication',false,
    'name_matching_used',false,
    'fuzzy_matching_used',false,
    'nearest_road_used',false,
    'route_number_only_used',false
  ),
  'pending',null,null,'not_started',true,
  pg_catalog.clock_timestamp(),pg_catalog.clock_timestamp()
);

create temporary table tmp_issue97_una_occurrence_results(
  step_id uuid primary key,
  result jsonb not null
) on commit drop;
insert into tmp_issue97_una_occurrence_results values (
  '77bc7028-6586-4d95-bd33-faaad47296bd',
  private_verification.brinesearch_issue97_refresh_occurrence_candidate(
    '77bc7028-6586-4d95-bd33-faaad47296bd'
  )
);
insert into tmp_issue97_una_occurrence_results values (
  'd7ea0091-bd90-2024-20fb-09aad6cc33ed',
  private_verification.brinesearch_issue97_refresh_occurrence_candidate(
    'd7ea0091-bd90-2024-20fb-09aad6cc33ed'
  )
);
insert into tmp_issue97_una_occurrence_results values (
  'cc0d7aca-9fc7-4ee1-9521-b4110ed042d7',
  private_verification.brinesearch_issue97_refresh_occurrence_candidate(
    'cc0d7aca-9fc7-4ee1-9521-b4110ed042d7'
  )
);

create temporary table tmp_issue97_una_route_result on commit drop as
select private_verification.brinesearch_issue97_refresh_route_receipt(
  '486902dc-9df5-473f-b9ce-678b9710e3d6'
) as result;

update public.pad_verification_status
set directions_verified=true,
    roads_verified=false,
    evidence=pg_catalog.jsonb_set(
      coalesce(evidence,'{}'::jsonb),
      '{directions}',
      pg_catalog.jsonb_build_object(
        'basis','Owner-reviewed UNA directions exactly identify US-250, West Grove Rd, and the UNA lease endpoint; the lease geometry and public-road readiness remain held.',
        'issue',97,
        'auto_reviewed',false,
        'public_road_authority_upgrade',false
      ),
      true
    ),
    review_note='Issue #97: exact West Grove occurrence and held UNA lease endpoint; GPS/lease geometry not upgraded.',
    updated_at=pg_catalog.clock_timestamp()
where pad_id='0b675c3f-2c04-4901-955d-8629e7dba05e';

create temporary table tmp_issue97_una_directory_result on commit drop as
select private_verification.brinesearch_v18_refresh_directory_snapshot() as result;

do $issue97_una_postconditions$
declare
  v_status jsonb;
  v_directory_sequence text;
  v_directory_coordinate_state text;
  v_directory_latitude double precision;
  v_directory_longitude double precision;
begin
  if private_verification.brinesearch_issue97_identity_driver_name(
       '894e77bd-9780-c162-730f-5cad9f02134d'
     ) is distinct from 'CROSKEY RD'
     or private_verification.brinesearch_issue97_occurrence_driver_name(
       'd7ea0091-bd90-2024-20fb-09aad6cc33ed',
       '894e77bd-9780-c162-730f-5cad9f02134d'
     ) is distinct from 'WEST GROVE RD'
     or private_verification.brinesearch_issue97_occurrence_driver_name(
       '77bc7028-6586-4d95-bd33-faaad47296bd',
       'f61bbbe4-353e-4968-e1dd-986d8889c11c'
     ) is distinct from private_verification.brinesearch_issue97_identity_driver_name(
       'f61bbbe4-353e-4968-e1dd-986d8889c11c'
     ) then
    raise exception 'Issue #97 UNA identity-wide / occurrence name separation failed';
  end if;

  if (select count(*)
      from public.brinesearch_route_prep_steps step
      join private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
        on receipt.route_prep_step_id=step.id
      where step.route_prep_id='486902dc-9df5-473f-b9ce-678b9710e3d6'
        and step.active and receipt.resolution_status='resolved'
        and receipt.resolution_method='explicit_authoritative_source_receipt'
        and receipt.source_identity_key=step.source_details->>'source_identity_key')<>2 then
    raise exception 'Issue #97 UNA exact source occurrence receipts are incomplete';
  end if;

  if not exists(
    select 1
    from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
    where receipt.route_prep_step_id='d7ea0091-bd90-2024-20fb-09aad6cc33ed'
      and receipt.route_prep_id='486902dc-9df5-473f-b9ce-678b9710e3d6'
      and receipt.pad_id='0b675c3f-2c04-4901-955d-8629e7dba05e'
      and receipt.occurrence_index=2
      and receipt.identity_id='894e77bd-9780-c162-730f-5cad9f02134d'
      and receipt.canonical_road_id is null
      and receipt.driver_road_name='WEST GROVE RD'
      and array['CROSKEY RD','TR 78','WEST GROVE RD']::text[] <@ receipt.valid_aliases
  ) then
    raise exception 'Issue #97 UNA West Grove driver-name receipt failed';
  end if;

  if not exists(
    select 1 from public.brinesearch_route_prep_steps step
    where step.id='cc0d7aca-9fc7-4ee1-9521-b4110ed042d7'
      and step.raw_text='UNA LEASE ROUTE'
      and step.normalized_text='UNA LEASE ROUTE'
      and step.step_kind='private_segment'
      and private_verification.brinesearch_issue97_terminal_private_access_destination(step.id)
      and step.source_details->'terminal_private_access_receipt'->>'pad_id'=
        '0b675c3f-2c04-4901-955d-8629e7dba05e'
      and step.source_details->'terminal_private_access_receipt'->>'coordinate_digest'=
        pg_catalog.md5(pg_catalog.concat_ws('|',
          (-80.933934::double precision)::text,(40.228835::double precision)::text
        ))
      and step.source_details->'terminal_private_access_receipt'->>'inbound_public_road_identity_id'=
        '894e77bd-9780-c162-730f-5cad9f02134d'
      and step.source_details->'terminal_private_access_receipt'->>'inbound_public_road_name'=
        'WEST GROVE RD'
      and step.source_details->'terminal_private_access_receipt'->>'inbound_source_segment_key'=
        'OH:ODOT:SEGMENT:2025_000000000395678'
      and step.source_details->'terminal_private_access_receipt'->>'stored_coordinate_role'=
        'pad_or_lease_destination_unverified'
      and not (step.source_details->'terminal_private_access_receipt'->>'verified_public_road_entrance_present')::boolean
      and (step.source_details->'terminal_private_access_receipt'->>'terminates_at_owner_confirmed_pad_or_lease_destination')::boolean
      and (step.source_details->'terminal_private_access_receipt'->>'no_approved_continuation_beyond_endpoint')::boolean
      and (step.source_details->'terminal_private_access_receipt'->>'no_public_road_continuation_to_croskey')::boolean
      and not (step.source_details->'terminal_private_access_receipt'->>'croskey_portion_included')::boolean
      and (step.source_details->'terminal_private_access_receipt'->>'satellite_context_only')::boolean
      and not (step.source_details->'terminal_private_access_receipt'->>'pad_gps_is_public_road_identity')::boolean
      and not (step.source_details->'terminal_private_access_receipt'->>'route_geometry_created')::boolean
      and (step.source_details->'terminal_private_access_receipt'->>'requires_reviewed_private_geometry_for_ready')::boolean
  ) then
    raise exception 'Issue #97 UNA lease entrance-termination receipt failed';
  end if;

  if not exists(
    select 1
    from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
    where receipt.route_prep_step_id='cc0d7aca-9fc7-4ee1-9521-b4110ed042d7'
      and receipt.route_prep_id='486902dc-9df5-473f-b9ce-678b9710e3d6'
      and receipt.pad_id='0b675c3f-2c04-4901-955d-8629e7dba05e'
      and receipt.occurrence_index=3
      and receipt.resolution_status='held'
      and receipt.hold_reason='terminal_private_access_destination_requires_authoritative_geometry'
      and receipt.candidate_count=0
      and receipt.identity_id is null and receipt.canonical_road_id is null
      and receipt.evidence->>'disposition'='terminal_private_access_destination'
      and receipt.evidence->>'participates_in_authoritative_road_path'='false'
  ) then
    raise exception 'Issue #97 UNA lease endpoint did not remain fail-closed';
  end if;

  if not exists(
    select 1 from public.brinesearch_route_prep route
    where route.id='486902dc-9df5-473f-b9ce-678b9710e3d6'
      and route.pad_id='0b675c3f-2c04-4901-955d-8629e7dba05e'
      and route.active and route.route_group='primary' and route.variant_index=1
      and route.source_sequence='US-250 → WEST GROVE RD → LEASE ROUTE'
      and route.normalized_sequence='US-250 → WEST GROVE RD → UNA LEASE ROUTE'
      and route.normalized_steps='["US-250","WEST GROVE RD","UNA LEASE ROUTE"]'::jsonb
      and route.source_sequence_hash=pg_catalog.md5(
        'US-250 → WEST GROVE RD → LEASE ROUTE'
      )
       and route.readiness_status='ready_for_road_matching'
       and route.issue_codes='{}'::text[]
       and route.highway_anchor_text='US-250'
       and route.highway_anchor_kind='us_route'
       and route.highway_anchor_status='explicit'
       and route.no_guess_policy='strict'
  ) then
    raise exception 'Issue #97 UNA updated route-prep row is not exact';
  end if;

  if not exists(
    select 1
    from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
    where receipt.route_prep_id='486902dc-9df5-473f-b9ce-678b9710e3d6'
      and receipt.pad_id='0b675c3f-2c04-4901-955d-8629e7dba05e'
      and receipt.source_sequence_hash=pg_catalog.md5(
        'US-250 → WEST GROVE RD → LEASE ROUTE'
      )
      and receipt.route_status='needs_review'
      and receipt.stage='identity_reconciliation'
      and receipt.road_occurrence_count=3
      and receipt.resolved_occurrence_count=2
      and receipt.held_occurrence_count=1
      and receipt.canonical_mapping_count=1
      and receipt.exact_geometry_count=0
      and receipt.google_manifest_status is null
      and receipt.exception_reasons=
        array['authoritative_occurrence_identity_incomplete']::text[]
  ) or not exists(
    select 1 from tmp_issue97_una_route_result result
    where result.result->>'route_status'='needs_review'
      and result.result->>'stage'='identity_reconciliation'
      and (result.result->>'road_occurrences')::integer=3
      and (result.result->>'resolved')::integer=2
      and (result.result->>'held')::integer=1
  ) then
    raise exception 'Issue #97 UNA route reconciliation did not refresh to 3/2/1 held';
  end if;

  if not exists(
    select 1 from public.pad_verification_status verification
    where verification.pad_id='0b675c3f-2c04-4901-955d-8629e7dba05e'
      and not verification.gps_verified
      and verification.directions_verified
      and not verification.roads_verified
      and verification.evidence->'directions'->>'issue'='97'
      and verification.evidence->'directions'->>'public_road_authority_upgrade'='false'
  ) then
    raise exception 'Issue #97 UNA direction verification or GPS role drifted';
  end if;

  if exists(
    select 1 from public.brinesearch_road_identity_mappings mapping
    where mapping.identity_id='894e77bd-9780-c162-730f-5cad9f02134d'
  ) or exists(
    select 1 from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
    where geometry.route_prep_id='486902dc-9df5-473f-b9ce-678b9710e3d6'
  ) or exists(
    select 1 from private_verification.brinesearch_route_transition_receipts_issue97 transition
    where transition.route_prep_id='486902dc-9df5-473f-b9ce-678b9710e3d6'
  ) or exists(
    select 1 from private_verification.brinesearch_google_route_receipts_issue97 google_receipt
    where google_receipt.pad_id='0b675c3f-2c04-4901-955d-8629e7dba05e'
  ) or exists(
    select 1 from private_verification.brinesearch_google_route_refresh_queue_issue97 google_queue
    where google_queue.pad_id='0b675c3f-2c04-4901-955d-8629e7dba05e'
  ) then
    raise exception 'Issue #97 UNA stamp unexpectedly created mapping, geometry, transition, or Google artifacts';
  end if;

  select public.brinesearch_v18_driver_pad_status(
    '0b675c3f-2c04-4901-955d-8629e7dba05e'
  ) into strict v_status;
  if v_status->'route'->>'source' is distinct from 'legacy_written'
     or v_status->'route'->>'state' is distinct from 'held'
     or v_status->'route'->'steps' is distinct from '[]'::jsonb
     or v_status->'route'->'geometry' is distinct from 'null'::jsonb
     or nullif(v_status->'route'->>'writtenDirections','') is null
     or v_status->'google'->>'publicState' is distinct from 'held' then
    raise exception 'Issue #97 UNA did not remain fail-closed: %',v_status;
  end if;

  select row.structured_road_sequence,row.coordinate_state,
    row.driver_latitude,row.driver_longitude
  into strict v_directory_sequence,v_directory_coordinate_state,
    v_directory_latitude,v_directory_longitude
  from public.brinesearch_directory_snapshot_rows_v18 row
  join public.brinesearch_directory_snapshots_v18 snapshot
    on snapshot.snapshot_id=row.snapshot_id and snapshot.publication_state='current'
  where row.pad_id='0b675c3f-2c04-4901-955d-8629e7dba05e';
  if v_directory_sequence is distinct from 'US-250 → WEST GROVE RD → LEASE ROUTE'
     or v_directory_coordinate_state is distinct from 'held'
     or v_directory_latitude is not null
     or v_directory_longitude is not null then
    raise exception 'Issue #97 UNA directory display/coordinate role failed closed: % / % / % / %',
      v_directory_sequence,v_directory_coordinate_state,
      v_directory_latitude,v_directory_longitude;
  end if;

  if (select count(*) from public.brinesearch_directory_snapshots_v18
      where publication_state='current')<>1
     or (select source_revision from public.brinesearch_directory_snapshots_v18
       where publication_state='current')<>(select directory_revision+1 from tmp_issue97_una_before)
     or (select row_count from public.brinesearch_directory_snapshots_v18
       where publication_state='current')<>1214
     or (select searchable_count from public.brinesearch_directory_snapshots_v18
       where publication_state='current')<>1214 then
    raise exception 'Issue #97 UNA directory refresh failed';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
        pg_catalog.to_jsonb(build)::text,'|' order by build.id
      ),'')) from public.brinesearch_road_graph_builds build)
       is distinct from (select graph_digest from tmp_issue97_una_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
        pg_catalog.to_jsonb(pad)::text,'|' order by pad.id
      ),'')) from public.pads pad
        where pad.id<>'0b675c3f-2c04-4901-955d-8629e7dba05e')
       is distinct from (select non_target_pad_digest from tmp_issue97_una_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
        pg_catalog.to_jsonb(route)::text,'|' order by route.id
      ),'')) from public.brinesearch_route_prep route
        where route.pad_id<>'0b675c3f-2c04-4901-955d-8629e7dba05e')
       is distinct from (select non_target_route_digest from tmp_issue97_una_before)
      or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
         pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_step_id
       ),'')) from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
         where receipt.pad_id<>'0b675c3f-2c04-4901-955d-8629e7dba05e')
        is distinct from (select non_target_occurrence_digest from tmp_issue97_una_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
         pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id
       ),'')) from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
         where receipt.pad_id<>'0b675c3f-2c04-4901-955d-8629e7dba05e')
        is distinct from (select non_target_reconciliation_digest from tmp_issue97_una_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
         (pg_catalog.to_jsonb(row)-'snapshot_id')::text,'|' order by row.pad_id
       ),''))
       from public.brinesearch_directory_snapshot_rows_v18 row
       join public.brinesearch_directory_snapshots_v18 snapshot
         on snapshot.snapshot_id=row.snapshot_id and snapshot.publication_state='current'
       where row.pad_id<>'0b675c3f-2c04-4901-955d-8629e7dba05e')
        is distinct from (select non_target_directory_digest from tmp_issue97_una_before) then
    raise exception 'Issue #97 UNA changed graph or non-target authority state';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
        pg_catalog.to_jsonb(route)::text,'|' order by route.pad_id
      ),'')) from public.brinesearch_driver_google_routes_public route)
       is distinct from (select public_google_digest from tmp_issue97_una_before)
     or (select count(*) from public.brinesearch_driver_google_routes_public)
       is distinct from (select public_google_count from tmp_issue97_una_before)
     or (select cutover_at from public.brinesearch_issue97_release_state where singleton)
       is distinct from (select cutover_at from tmp_issue97_una_before) then
    raise exception 'Issue #97 UNA changed public Google or cutover';
  end if;

  if (select count(*) from public.brinesearch_company_road_overlay_snapshots_v18
      where publication_state='current')<>0
     or not exists(
       select 1 from public.brinesearch_company_road_overlay_snapshots_v18 snapshot
       where snapshot.snapshot_id=(select overlay_snapshot_id from tmp_issue97_una_before)
         and snapshot.publication_state='withdrawn'
         and snapshot.content_sha256=(select overlay_content_sha256 from tmp_issue97_una_before)
     ) then
    raise exception 'Issue #97 UNA company-road overlay was not safely withdrawn for reauthorization';
  end if;
end
$issue97_una_postconditions$;

comment on column public.brinesearch_route_prep_steps.source_details is
  'Structured, non-public route-preparation evidence. Issue #97 exact source receipts may include a source-segment-bound driver-name receipt and an explicit pad-bound lease-endpoint receipt; these never create approval, a public-road identity, or geometry by themselves.';
