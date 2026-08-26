-- Issue #97: release one owner-reviewed LASSO approach without pretending the
-- saved pad coordinate is a public-road entrance.
--
-- The approved road core is an exact prefix of Cologie:
--   US-250 -> FOXS BOTTOM RD -> SPRINGDALE HILL RD
-- It is clipped on Cologie's already-proven Springdale occurrence.  The
-- LASSO saved GPS is a separate destination.  No line, road identity, mileage,
-- or approval is manufactured between the core handoff and the destination.

set local statement_timeout = '5min';
set local lock_timeout = '5s';

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:issue97:all-pad-routing-pipeline',97)
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:v18:core-destination-release',18)
);

create temporary table tmp_issue97_lasso_before on commit drop as
select
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(build)::text,'|' order by build.id
  ),'')) from public.brinesearch_road_graph_builds build) as graph_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(route)::text,'|' order by route.id
  ),'')) from public.brinesearch_route_prep route
    where route.pad_id<>'518659d9-bca2-47b0-b294-3141ba679fc4')
    as non_target_route_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(route)::text,'|' order by route.pad_id
  ),'')) from public.brinesearch_driver_google_routes_public route)
    as public_google_route_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(handoff)::text,'|' order by handoff.pad_id
  ),'')) from public.brinesearch_driver_google_handoffs_public handoff)
    as public_google_handoff_digest,
  (select count(*) from public.brinesearch_driver_google_routes_public)
    as public_google_route_count,
  (select count(*) from public.brinesearch_driver_google_handoffs_public)
    as public_google_handoff_count,
  (select cutover_at from public.brinesearch_issue97_release_state where singleton)
    as cutover_at,
  public.brinesearch_v18_driver_pad_status_with_google_handoff(
    'e2b32e85-9e93-4388-8215-9d8167cbbeb8'
  ) as cologie_bundle;

do $preflight$
declare
  v_cologie_status jsonb;
  v_occurrence extensions.geometry;
  v_saved extensions.geometry;
  v_handoff extensions.geometry;
  v_fraction double precision;
  v_offset_m double precision;
begin
  if pg_catalog.to_regclass(
       'private_verification.brinesearch_v18_core_destination_releases'
     ) is not null
     or pg_catalog.to_regclass(
       'public.brinesearch_driver_core_destination_releases_public'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.brinesearch_v18_driver_core_destination_release(uuid)'
     ) is not null then
    raise exception 'V18 core-destination release contract already exists';
  end if;

  if not exists(
    select 1
    from pg_catalog.pg_proc proc
    join pg_catalog.pg_language language on language.oid=proc.prolang
    join pg_catalog.pg_roles owner_role on owner_role.oid=proc.proowner
    where proc.oid=
      'public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)'::
        pg_catalog.regprocedure
      and language.lanname='sql'
      and proc.provolatile='s'
      and proc.prosecdef
      and not proc.proisstrict
      and owner_role.rolbypassrls
      and proc.proconfig is not distinct from
        array[
          'search_path=""','statement_timeout=20s','lock_timeout=500ms'
        ]::text[]
      and not pg_catalog.has_function_privilege(
        'public',
        'public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)',
        'execute'
      )
      and pg_catalog.has_function_privilege(
        'anon',
        'public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)',
        'execute'
      )
      and pg_catalog.has_function_privilege(
        'authenticated',
        'public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)',
        'execute'
      )
      and pg_catalog.has_function_privilege(
        'service_role',
        'public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)',
        'execute'
      )
  ) then
    raise exception 'Atomic driver wrapper starting metadata diverged';
  end if;

  if not exists(
    select 1 from public.pads pad
    where pad.id='518659d9-bca2-47b0-b294-3141ba679fc4'
      and pad.legacy_id='ascent--lasso'
      and pad.pad_name='LASSO' and pad.company='Ascent'
      and pad.state='Ohio' and pad.county='Harrison'
      and pad.latitude=40.240883 and pad.longitude=-80.913963
      and pad.structured_road_sequence is null
      and pad.directions_clear is null
      and pad.written_directions like '%US-250%'
      and pad.written_directions like '%Foxes Bottom Rd%'
      and pad.written_directions like '%Springdale Hill Rd%'
  ) or exists(
    select 1 from public.brinesearch_route_prep route
    where route.pad_id='518659d9-bca2-47b0-b294-3141ba679fc4'
  ) or exists(
    select 1 from public.brinesearch_route_prep route
    where route.id='0102370e-c03f-443c-94c2-61c7e10bf931'
  ) or exists(
    select 1 from public.brinesearch_route_prep_steps step
    where step.id in (
      '1ae9c2e6-62b0-4dab-aa44-4b8adbe83f24',
      'c8fd4f2d-9fd2-4855-975b-02e84fa28c05',
      'aadc13e8-114e-4fd0-ad7a-7550322c8a0c'
    )
  ) then
    raise exception 'LASSO reviewed starting checkpoint diverged';
  end if;

  if private_verification.brinesearch_v18_owner_authority_current(
       '429fd4f8-ede7-44e4-8b12-98aa1c3272ae'
     ) is not true then
    raise exception 'Pinned owner authorization is no longer current';
  end if;

  if not exists(
    select 1 from public.pad_verification_status verification
    where verification.pad_id='518659d9-bca2-47b0-b294-3141ba679fc4'
      and not verification.gps_verified
      and not verification.directions_verified
      and not verification.roads_verified
  ) then
    raise exception 'LASSO held coordinate/direction checkpoint diverged';
  end if;

  select cologie_bundle->'status' into strict v_cologie_status
  from tmp_issue97_lasso_before;
  if v_cologie_status#>>'{route,state}' is distinct from 'ready'
     or v_cologie_status#>>'{route,source}' is distinct from 'exact_graph'
     or v_cologie_status#>>'{graph,state}' is distinct from 'active_current'
     or v_cologie_status#>>'{google,publicState}' is distinct from 'ready'
     or pg_catalog.jsonb_array_length(
          v_cologie_status#>'{route,geometry,features}'
        )<>5
     or coalesce(
          (select cologie_bundle->'publicGoogleRoute'
           from tmp_issue97_lasso_before),
          'null'::jsonb
        )='null'::jsonb
     or coalesce(
          (select cologie_bundle->'publicGoogleHandoff'
           from tmp_issue97_lasso_before),
          'null'::jsonb
        )='null'::jsonb then
    raise exception 'Current Cologie exact-route source is not release-ready';
  end if;

  if not exists(
    select 1 from public.brinesearch_road_graph_builds build
    where build.id='f4e4d43f-e86c-499c-893f-73f2eef3dc29'
      and build.state_code='OH' and build.county_code='HAS'
      and build.status='active'
      and build.activated_at='2026-08-24T23:53:01.785257Z'
  ) then
    raise exception 'Current Harrison graph checkpoint diverged';
  end if;

  if not exists(
    select 1
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
    join private_verification.brinesearch_route_occurrence_receipts_issue97 occurrence
      on occurrence.route_prep_step_id=geometry.route_prep_step_id
    where geometry.route_prep_id='dfb3f204-190c-4d65-85b3-16bcd1715825'
      and geometry.occurrence_index=3 and geometry.status='resolved'
      and geometry.identity_id='b66949a7-9a1c-b635-1d8d-c84759c3d401'
      and geometry.road_id='52219c9b-8b69-4d96-a779-97ed2466062e'
      and occurrence.resolution_status='resolved'
      and occurrence.source_identity_key='OH:ODOT:NLF:THASTR00079**C'
      and occurrence.resolution_method not ilike '%nearest%'
      and occurrence.resolution_method not ilike '%fuzzy%'
      and occurrence.resolution_method not ilike '%name_only%'
  ) then
    raise exception 'Cologie exact Springdale occurrence proof diverged';
  end if;

  if (select count(*)
      from private_verification.brinesearch_route_occurrence_receipts_issue97 occurrence
      where occurrence.route_prep_id='dfb3f204-190c-4d65-85b3-16bcd1715825'
        and occurrence.occurrence_index between 1 and 3
        and occurrence.resolution_status='resolved'
        and occurrence.resolution_method=
              'explicit_authoritative_source_receipt')<>3 then
    raise exception 'Cologie reviewed three-occurrence identity proof diverged';
  end if;

  if (select count(*) from public.brinesearch_route_prep_steps source
      where source.route_prep_id='dfb3f204-190c-4d65-85b3-16bcd1715825'
        and source.active and source.step_order between 1 and 3)<>3 then
    raise exception 'Cologie reviewed three-step shared prefix diverged';
  end if;

  select geometry.step_geometry into strict v_occurrence
  from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
  where geometry.route_prep_id='dfb3f204-190c-4d65-85b3-16bcd1715825'
    and geometry.occurrence_index=3 and geometry.status='resolved';
  v_saved:=extensions.st_setsrid(
    extensions.st_makepoint(-80.913963,40.240883),4326
  );
  -- Owner-reviewed frozen handoff on the already-selected Springdale
  -- occurrence.  GPS never selects or moves this authority boundary.
  v_handoff:=extensions.st_setsrid(
    extensions.st_makepoint(-80.915437726,40.241093947),4326
  );
  v_fraction:=extensions.st_linelocatepoint(v_occurrence,v_handoff);
  v_offset_m:=extensions.st_distance(
    v_handoff::extensions.geography,v_saved::extensions.geography
  );
  if v_fraction<0.79132514 or v_fraction>0.79132517
     or v_offset_m<127 or v_offset_m>129
     or not extensions.st_dwithin(
       v_occurrence::extensions.geography,
       v_handoff::extensions.geography,
       0.05
     )
     or not extensions.st_dwithin(
       private_verification.brinesearch_issue97_authoritative_identity_geometry(
         'b66949a7-9a1c-b635-1d8d-c84759c3d401'
       )::extensions.geography,
       v_handoff::extensions.geography,
       1
     ) then
    raise exception 'LASSO exact selected-occurrence handoff proof failed: fraction %, offset % m',
      v_fraction,v_offset_m;
  end if;

  if (select count(*) from public.brinesearch_driver_google_routes_public)<>1
     or (select count(*) from public.brinesearch_driver_google_handoffs_public)<>1
     or (select cutover_at from public.brinesearch_issue97_release_state where singleton)
          is not null then
    raise exception 'Google/cutover checkpoint diverged';
  end if;
end
$preflight$;

create table private_verification.brinesearch_v18_core_destination_releases(
  pad_id uuid primary key references public.pads(id) on delete restrict,
  record_revision text not null check(length(btrim(record_revision))>0),
  route_prep_id uuid not null references public.brinesearch_route_prep(id)
    on delete restrict,
  route_revision bigint not null check(route_revision>0),
  release_version text not null
    check(release_version='v18-core-destination-v1'),
  route_steps jsonb not null
    check(pg_catalog.jsonb_typeof(route_steps)='array'),
  route_geometry jsonb not null
    check(pg_catalog.jsonb_typeof(route_geometry)='object'),
  graph_county text not null,
  graph_last_verified_at timestamptz not null,
  destination_latitude double precision not null
    check(destination_latitude between -90 and 90),
  destination_longitude double precision not null
    check(destination_longitude between -180 and 180),
  handoff jsonb not null check(pg_catalog.jsonb_typeof(handoff)='object'),
  dependency_digest text not null check(dependency_digest~'^[0-9a-f]{32}$'),
  release_digest text not null check(release_digest~'^[0-9a-f]{32}$'),
  evidence jsonb not null check(pg_catalog.jsonb_typeof(evidence)='object'),
  authorization_basis text not null check(length(btrim(authorization_basis))>0),
  verified_at timestamptz not null,
  revoked_at timestamptz,
  check(revoked_at is null or revoked_at>=verified_at)
);

alter table private_verification.brinesearch_v18_core_destination_releases
enable row level security;
alter table private_verification.brinesearch_v18_core_destination_releases
force row level security;
revoke all on table
  private_verification.brinesearch_v18_core_destination_releases
from public,anon,authenticated,service_role;

create table public.brinesearch_driver_core_destination_releases_public(
  pad_id uuid primary key references public.pads(id) on delete restrict,
  record_revision text not null check(length(btrim(record_revision))>0),
  route_revision bigint not null check(route_revision>0),
  release_version text not null
    check(release_version='v18-core-destination-v1'),
  route_steps jsonb not null
    check(pg_catalog.jsonb_typeof(route_steps)='array'),
  route_geometry jsonb not null
    check(pg_catalog.jsonb_typeof(route_geometry)='object'),
  graph_county text not null,
  graph_last_verified_at timestamptz not null,
  destination_latitude double precision not null
    check(destination_latitude between -90 and 90),
  destination_longitude double precision not null
    check(destination_longitude between -180 and 180),
  handoff jsonb not null check(pg_catalog.jsonb_typeof(handoff)='object'),
  dependency_digest text not null check(dependency_digest~'^[0-9a-f]{32}$'),
  release_digest text not null check(release_digest~'^[0-9a-f]{32}$'),
  published_at timestamptz not null
);

alter table public.brinesearch_driver_core_destination_releases_public
enable row level security;
alter table public.brinesearch_driver_core_destination_releases_public
force row level security;
revoke all on table
  public.brinesearch_driver_core_destination_releases_public
from public,anon,authenticated,service_role;

insert into public.brinesearch_route_prep(
  id,pad_id,pad_name,company,state,route_group,variant_index,
  source_sequence,source_sequence_hash,normalized_sequence,normalized_steps,
  readiness_status,issue_codes,highway_anchor_text,highway_anchor_kind,
  highway_anchor_status,candidate_state_route,candidate_state_route_source,
  no_guess_policy,analysis_version,active,analyzed_at,reviewed_at,reviewed_by,
  owner_notes,created_at,updated_at
) values(
  '0102370e-c03f-443c-94c2-61c7e10bf931',
  '518659d9-bca2-47b0-b294-3141ba679fc4','LASSO','Ascent','Ohio',
  'primary',1,
  'US-250 → FOXS BOTTOM RD → SPRINGDALE HILL RD',
  pg_catalog.md5('US-250 → FOXS BOTTOM RD → SPRINGDALE HILL RD'),
  'US-250 → FOXS BOTTOM RD → SPRINGDALE HILL RD',
  '["US-250","FOXS BOTTOM RD","SPRINGDALE HILL RD"]'::jsonb,
  'ready_for_road_matching','{}'::text[],'US-250','us_route','explicit',
  null,'{}'::jsonb,'strict','issue97-owner-reviewed-core-destination-v1',true,
  '2026-08-26T16:45:38Z','2026-08-26T16:45:38Z',
  '429fd4f8-ede7-44e4-8b12-98aa1c3272ae',
  'Owner-authorized LASSO public-road core. Exact Cologie prefix only; saved GPS is a separate destination and creates no road geometry.',
  '2026-08-26T16:45:38Z','2026-08-26T16:45:38Z'
);

insert into public.brinesearch_route_prep_steps(
  id,route_prep_id,step_order,raw_text,normalized_text,step_kind,road_id,
  match_status,match_method,match_confidence,source_details,owner_decision,
  distance_miles,turn_direction,geometry_status,active,owner_notes,
  created_at,updated_at,travel_direction
)
select
  target.id,'0102370e-c03f-443c-94c2-61c7e10bf931',source.step_order,
  source.raw_text,source.normalized_text,source.step_kind,source.road_id,
  source.match_status,source.match_method,source.match_confidence,
  coalesce(source.source_details,'{}'::jsonb)||pg_catalog.jsonb_build_object(
    'issue',97,
    'owner_reviewed_shared_prefix',true,
    'source_route_prep_id','dfb3f204-190c-4d65-85b3-16bcd1715825',
    'source_route_prep_step_id',source.id,
    'destination_pad_id','518659d9-bca2-47b0-b294-3141ba679fc4',
    'gps_selects_road',false,
    'nearest_road_matching',false,
    'name_only_matching',false,
    'private_access_geometry_created',false
  ),
  'approved',source.distance_miles,source.turn_direction,
  source.geometry_status,true,
  'Owner-authorized exact public-road prefix; no approval beyond the separate handoff.',
  '2026-08-26T16:45:38Z','2026-08-26T16:45:38Z',source.travel_direction
from public.brinesearch_route_prep_steps source
join (values
  (1,'1ae9c2e6-62b0-4dab-aa44-4b8adbe83f24'::uuid),
  (2,'c8fd4f2d-9fd2-4855-975b-02e84fa28c05'::uuid),
  (3,'aadc13e8-114e-4fd0-ad7a-7550322c8a0c'::uuid)
) target(step_order,id) on target.step_order=source.step_order
where source.route_prep_id='dfb3f204-190c-4d65-85b3-16bcd1715825'
  and source.step_order between 1 and 3
  and source.active;

do $materialize_lasso_exact_core$
declare
  v_target record;
  v_source record;
  v_source_key text;
  v_input_digest text;
  v_evidence jsonb;
  v_candidate_count integer;
begin
  if (select count(*) from public.brinesearch_route_prep_steps
      where route_prep_id='0102370e-c03f-443c-94c2-61c7e10bf931'
        and active)<>3 then
    raise exception 'LASSO exact core did not insert exactly three active steps';
  end if;

  -- The target steps are byte-for-byte copies of Cologie's already-reviewed
  -- three-occurrence prefix.  Copy that exact candidate/receipt evidence and
  -- recompute every target-bound digest.  Do not invoke the generic corpus
  -- candidate scan: it searches unrelated exact-name/designation candidates
  -- even when an explicit authoritative source receipt already exists.
  for v_target in
    select step.*,route.pad_id,route.route_group,route.variant_index,
      route.source_sequence_hash,route.state as route_state
    from public.brinesearch_route_prep_steps step
    join public.brinesearch_route_prep route on route.id=step.route_prep_id
    where step.route_prep_id='0102370e-c03f-443c-94c2-61c7e10bf931'
      and step.active
    order by step.step_order
  loop
    select receipt.* into strict v_source
    from public.brinesearch_route_prep_steps source_step
    join private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
      on receipt.route_prep_step_id=source_step.id
    where source_step.route_prep_id='dfb3f204-190c-4d65-85b3-16bcd1715825'
      and source_step.active
      and source_step.step_order=v_target.step_order;

    v_source_key:=
      private_verification.brinesearch_issue97_explicit_occurrence_source_key(
        v_target.route_state,v_target.match_method,v_target.source_details
      );
    if v_source.resolution_status is distinct from 'resolved'
       or v_source.resolution_method is distinct from
            'explicit_authoritative_source_receipt'
       or v_source.identity_id is null
       or v_source.canonical_road_id is null
       or v_source_key is distinct from v_source.source_identity_key
       or v_target.road_id is distinct from v_source.canonical_road_id
       or coalesce(v_target.match_method,'') ilike any(
            array['%nearest%','%fuzzy%','%name_only%']
          )
       or not exists(
         select 1
         from public.brinesearch_authoritative_road_identities identity
         join public.brinesearch_road_identity_mappings mapping
           on mapping.identity_id=identity.id
          and mapping.road_id=v_source.canonical_road_id
          and mapping.mapping_status='verified'
         where identity.id=v_source.identity_id
           and identity.active
           and identity.public_access_status='public'
           and identity.drivable_status='drivable'
           and identity.source_identity_key=v_source.source_identity_key
           and identity.source_digest=v_source.source_digest
           and private_verification.brinesearch_issue97_mapping_fingerprint(
                 identity.id
               )=v_source.mapping_fingerprint
           and private_verification.brinesearch_issue97_dataset_scope_current(
                 identity.dataset_id,identity.state_code,identity.county_code
               )
       ) then
      raise exception
        'LASSO source occurrence % is not an exact current public receipt',
        v_target.step_order;
    end if;

    insert into private_verification.brinesearch_route_occurrence_candidates_issue97(
      route_prep_step_id,identity_id,canonical_road_id,candidate_basis,
      strong_proof,source_identity_key,source_digest,mapping_fingerprint,
      evidence,updated_at
    )
    select v_target.id,candidate.identity_id,candidate.canonical_road_id,
      candidate.candidate_basis,candidate.strong_proof,
      candidate.source_identity_key,candidate.source_digest,
      candidate.mapping_fingerprint,candidate.evidence,
      '2026-08-26T16:45:38Z'::timestamptz
    from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
    where candidate.route_prep_step_id=v_source.route_prep_step_id;

    select count(distinct candidate.identity_id) into v_candidate_count
    from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
    where candidate.route_prep_step_id=v_target.id;
    if v_candidate_count is distinct from v_source.candidate_count
       or not exists(
         select 1
         from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
         where candidate.route_prep_step_id=v_target.id
           and candidate.identity_id=v_source.identity_id
           and candidate.canonical_road_id=v_source.canonical_road_id
           and candidate.candidate_basis=
                 'explicit_authoritative_source_receipt'
           and candidate.strong_proof
           and candidate.source_identity_key=v_source.source_identity_key
           and candidate.source_digest=v_source.source_digest
           and candidate.mapping_fingerprint=v_source.mapping_fingerprint
       ) then
      raise exception
        'LASSO source occurrence % candidate evidence did not copy exactly',
        v_target.step_order;
    end if;

    v_input_digest:=pg_catalog.md5(pg_catalog.concat_ws('|',
      v_target.route_prep_id::text,v_target.source_sequence_hash,
      v_target.step_order::text,v_target.raw_text,v_target.normalized_text,
      v_target.step_kind,coalesce(v_target.road_id::text,''),
      coalesce(v_target.match_status,''),coalesce(v_target.match_method,''),
      coalesce(v_target.source_details::text,'{}'),coalesce(v_source_key,'')
    ));
    v_evidence:=coalesce(v_source.evidence,'{}'::jsonb)
      ||pg_catalog.jsonb_build_object(
        'proof','explicit authoritative source receipt',
        'candidate_count',v_candidate_count,
        'canonical_mapping_present',true,
        'source_route_prep_id','dfb3f204-190c-4d65-85b3-16bcd1715825',
        'source_route_prep_step_id',v_source.route_prep_step_id,
        'selection_uses_nearest_road',false,
        'selection_uses_name_similarity',false,
        'selection_uses_route_number_alone',false
      );

    insert into private_verification.brinesearch_route_occurrence_receipts_issue97(
      route_prep_step_id,route_prep_id,pad_id,route_group,variant_index,
      source_step_order,occurrence_index,raw_text,normalized_text,step_kind,
      input_road_id,input_digest,resolution_status,resolution_method,hold_reason,
      identity_id,canonical_road_id,source_identity_key,driver_road_name,
      valid_aliases,source_digest,mapping_fingerprint,candidate_count,evidence,
      receipt_digest,resolved_at,updated_at
    ) values(
      v_target.id,v_target.route_prep_id,v_target.pad_id,v_target.route_group,
      v_target.variant_index,v_target.step_order,v_target.step_order,
      v_target.raw_text,v_target.normalized_text,v_target.step_kind,
      v_target.road_id,v_input_digest,'resolved',
      'explicit_authoritative_source_receipt',null,v_source.identity_id,
      v_source.canonical_road_id,v_source.source_identity_key,
      v_source.driver_road_name,v_source.valid_aliases,v_source.source_digest,
      v_source.mapping_fingerprint,v_candidate_count,v_evidence,
      pg_catalog.md5(pg_catalog.concat_ws('|',
        v_input_digest,'resolved','explicit_authoritative_source_receipt','',
        v_source.identity_id::text,v_source.canonical_road_id::text,
        v_source.source_digest,v_source.mapping_fingerprint,v_evidence::text
      )),
      '2026-08-26T16:45:38Z'::timestamptz,
      '2026-08-26T16:45:38Z'::timestamptz
    );
    perform private_verification.brinesearch_issue97_write_occurrence_history(
      v_target.id
    );
  end loop;

  if (select count(*)
      from private_verification.brinesearch_route_occurrence_receipts_issue97
      where route_prep_id='0102370e-c03f-443c-94c2-61c7e10bf931'
        and resolution_status='resolved'
        and resolution_method='explicit_authoritative_source_receipt')<>3 then
    raise exception 'LASSO exact source-receipt materialization failed';
  end if;

  perform private_verification.brinesearch_issue97_refresh_transition_receipts(
    '0102370e-c03f-443c-94c2-61c7e10bf931'
  );
  perform private_verification.brinesearch_issue97_refresh_route_geometry(
    '0102370e-c03f-443c-94c2-61c7e10bf931'
  );
  perform private_verification.brinesearch_issue97_refresh_route_receipt(
    '0102370e-c03f-443c-94c2-61c7e10bf931'
  );
end
$materialize_lasso_exact_core$;

create function private_verification.brinesearch_v18_lasso_core_destination_dependency(
  p_pad_id uuid
)
returns text
language plpgsql
volatile
strict
security definer
set search_path=''
set statement_timeout='60s'
set lock_timeout='500ms'
as $function$
declare
  v_pad public.pads%rowtype;
  v_record_revision text;
  v_cologie_manifest jsonb;
  v_route_digest text;
  v_safety jsonb;
begin
  if p_pad_id<>'518659d9-bca2-47b0-b294-3141ba679fc4' then
    return null;
  end if;
  select * into strict v_pad from public.pads where id=p_pad_id;
  select row.record_revision into strict v_record_revision
  from public.brinesearch_directory_snapshot_rows_v18 row
  join public.brinesearch_directory_snapshots_v18 snapshot
    on snapshot.snapshot_id=row.snapshot_id
   and snapshot.publication_state='current'
  where row.pad_id=p_pad_id;
  select route.manifest into strict v_cologie_manifest
  from public.brinesearch_driver_google_routes_public route
  where route.pad_id='e2b32e85-9e93-4388-8215-9d8167cbbeb8';
  select pg_catalog.md5(pg_catalog.concat_ws('|',
    pg_catalog.to_jsonb(route)::text,
    (select pg_catalog.string_agg(pg_catalog.to_jsonb(step)::text,'|'
       order by step.step_order)
     from public.brinesearch_route_prep_steps step
     where step.route_prep_id=route.id and step.active)
  )) into strict v_route_digest
  from public.brinesearch_route_prep route
  where route.id='0102370e-c03f-443c-94c2-61c7e10bf931';
  v_safety:=private_verification.brinesearch_issue97_pad_safety_facts(p_pad_id);
  if coalesce((v_safety->>'has_hold')::boolean,false) then
    return null;
  end if;
  return pg_catalog.md5(pg_catalog.concat_ws('|',
    v_pad.id::text,v_record_revision,
    '0102370e-c03f-443c-94c2-61c7e10bf931',v_route_digest,
    v_cologie_manifest->>'route_revision',
    v_cologie_manifest->>'manifest_digest',
    v_cologie_manifest->>'dependency_digest',
    (select pg_catalog.string_agg(receipt.receipt_digest,'|'
       order by receipt.occurrence_index)
     from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
     where receipt.route_prep_id='0102370e-c03f-443c-94c2-61c7e10bf931'),
    (select pg_catalog.string_agg(receipt.receipt_digest,'|'
       order by receipt.boundary_index)
     from private_verification.brinesearch_route_transition_receipts_issue97 receipt
     where receipt.route_prep_id='0102370e-c03f-443c-94c2-61c7e10bf931'),
    (select receipt.receipt_digest
     from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
     where receipt.route_prep_id='dfb3f204-190c-4d65-85b3-16bcd1715825'
       and receipt.occurrence_index=3),
    private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(
      'b66949a7-9a1c-b635-1d8d-c84759c3d401'
    ),
    (select pg_catalog.concat_ws(':',build.id::text,build.graph_digest,
       build.source_revision_digest,build.activated_at::text)
     from public.brinesearch_road_graph_builds build
     where build.id='f4e4d43f-e86c-499c-893f-73f2eef3dc29'),
    v_safety::text,
    'POINT(-80.915437726 40.241093947)',
    v_pad.longitude::text,v_pad.latitude::text,
    '429fd4f8-ede7-44e4-8b12-98aa1c3272ae',
    'owner-authorized-2026-08-26'
  ));
exception when others then
  return null;
end
$function$;

revoke all on function
  private_verification.brinesearch_v18_lasso_core_destination_dependency(uuid)
from public,anon,authenticated,service_role;

do $release_lasso$
declare
  v_pad public.pads%rowtype;
  v_record_revision text;
  v_cologie_manifest jsonb;
  v_source_geometry extensions.geometry;
  v_springdale_geometry extensions.geometry;
  v_handoff_point extensions.geometry;
  v_destination_point extensions.geometry;
  v_fraction double precision;
  v_core_geometry extensions.geometry;
  v_core_miles numeric;
  v_route_steps jsonb;
  v_route_geometry jsonb;
  v_handoff jsonb;
  v_dependency text;
  v_release text;
  v_safety jsonb;
  v_verified_at constant timestamptz:='2026-08-26T16:45:38Z';
  v_graph_verified_at constant timestamptz:='2026-08-24T23:53:01.785257Z';
begin
  select * into strict v_pad from public.pads
  where id='518659d9-bca2-47b0-b294-3141ba679fc4';
  select row.record_revision into strict v_record_revision
  from public.brinesearch_directory_snapshot_rows_v18 row
  join public.brinesearch_directory_snapshots_v18 snapshot
    on snapshot.snapshot_id=row.snapshot_id
   and snapshot.publication_state='current'
  where row.pad_id=v_pad.id;
  select route.manifest into strict v_cologie_manifest
  from public.brinesearch_driver_google_routes_public route
  where route.pad_id='e2b32e85-9e93-4388-8215-9d8167cbbeb8';

  select geometry.step_geometry into strict v_source_geometry
  from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
  where geometry.route_prep_id='dfb3f204-190c-4d65-85b3-16bcd1715825'
    and geometry.occurrence_index=2 and geometry.status='resolved';
  select geometry.step_geometry into strict v_springdale_geometry
  from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
  where geometry.route_prep_id='dfb3f204-190c-4d65-85b3-16bcd1715825'
    and geometry.occurrence_index=3 and geometry.status='resolved';

  v_destination_point:=extensions.st_setsrid(
    extensions.st_makepoint(v_pad.longitude,v_pad.latitude),4326
  );
  -- Frozen owner-reviewed point on the already-selected occurrence.  The
  -- saved GPS is not allowed to choose or move the public-road boundary.
  v_handoff_point:=extensions.st_setsrid(
    extensions.st_makepoint(-80.915437726,40.241093947),4326
  );
  v_fraction:=extensions.st_linelocatepoint(
    v_springdale_geometry,v_handoff_point
  );
  if v_fraction<0.79132514 or v_fraction>0.79132517
     or not extensions.st_dwithin(
       v_springdale_geometry::extensions.geography,
       v_handoff_point::extensions.geography,
       0.05
     ) then
    raise exception 'Frozen LASSO handoff drifted from its exact occurrence';
  end if;
  v_core_geometry:=extensions.st_linesubstring(
    v_springdale_geometry,0,v_fraction
  );
  v_core_miles:=extensions.st_length(
    v_core_geometry::extensions.geography
  )/1609.344;

  if not extensions.st_dwithin(
       extensions.st_startpoint(v_core_geometry)::extensions.geography,
       extensions.st_endpoint(v_source_geometry)::extensions.geography,
       0.05
     )
     or not extensions.st_dwithin(
       extensions.st_endpoint(v_core_geometry)::extensions.geography,
       v_handoff_point::extensions.geography,
       0.05
     ) then
    raise exception 'LASSO exact road-core clipping failed';
  end if;

  v_route_steps:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'order',1,'kind','turn','displayName','FOXS BOTTOM RD',
      'instruction','Turn left onto FOXS BOTTOM RD',
      'distanceMiles',pg_catalog.round(
        (extensions.st_length(v_source_geometry::extensions.geography)
          /1609.344)::numeric,6
      ),
      'verifiedDesignations',pg_catalog.jsonb_build_array(
        'CR 15','CR-15','Foxes Bottom Rd','Foxs Bottom Rd',
        'FOXS BOTTOM RD','MAIN ST'
      )
    ),
    pg_catalog.jsonb_build_object(
      'order',2,'kind','turn','displayName','SPRINGDALE HILL RD',
      'instruction','Turn left onto SPRINGDALE HILL RD',
      'distanceMiles',pg_catalog.round(v_core_miles,6),
      'verifiedDesignations',pg_catalog.jsonb_build_array(
        'Springdale Hill Rd','SPRINGDALE HILL RD',
        'Township Road 79','TR 79','TR-79'
      )
    )
  );
  v_route_geometry:=pg_catalog.jsonb_build_object(
    'type','FeatureCollection',
    'features',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'type','Feature','properties',pg_catalog.jsonb_build_object('stepOrder',1),
        'geometry',extensions.st_asgeojson(v_source_geometry,7)::jsonb
      ),
      pg_catalog.jsonb_build_object(
        'type','Feature','properties',pg_catalog.jsonb_build_object('stepOrder',2),
        'geometry',extensions.st_asgeojson(v_core_geometry,7)::jsonb
      )
    )
  );
  v_safety:=private_verification.brinesearch_issue97_pad_safety_facts(v_pad.id);
  if coalesce((v_safety->>'has_hold')::boolean,false) then
    raise exception 'LASSO has a current route safety hold';
  end if;
  v_dependency:=
    private_verification.brinesearch_v18_lasso_core_destination_dependency(
      v_pad.id
    );
  if v_dependency is null then
    raise exception 'LASSO live dependency could not be proven';
  end if;
  v_handoff:=pg_catalog.jsonb_build_object(
    'handoff_version','v18-core-destination-v1',
    'pad_id',v_pad.id,
    'route_revision',1,
    'source_dependency_digest',v_dependency,
    'origin_mode','current_location_until_route_ingress',
    'waypoints',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'sequence',1,
        'latitude',extensions.st_y(extensions.st_startpoint(v_source_geometry)),
        'longitude',extensions.st_x(extensions.st_startpoint(v_source_geometry))
      ),
      pg_catalog.jsonb_build_object(
        'sequence',2,
        'latitude',extensions.st_y(extensions.st_endpoint(v_source_geometry)),
        'longitude',extensions.st_x(extensions.st_endpoint(v_source_geometry))
      ),
      pg_catalog.jsonb_build_object(
        'sequence',3,
        'latitude',extensions.st_y(v_handoff_point),
        'longitude',extensions.st_x(v_handoff_point)
      )
    ),
    'core_end',pg_catalog.jsonb_build_object(
      'sequence',3,'role','exact_public_road_handoff',
      'latitude',extensions.st_y(v_handoff_point),
      'longitude',extensions.st_x(v_handoff_point)
    ),
    'destination',pg_catalog.jsonb_build_object(
      'sequence',4,'pad_id',v_pad.id,'role','saved_pad_destination',
      'latitude',v_pad.latitude,'longitude',v_pad.longitude
    ),
    'final_leg_mode','google_to_saved_gps_unapproved'
  );
  v_release:=pg_catalog.md5(pg_catalog.concat_ws('|',
    v_record_revision,'1','v18-core-destination-v1',v_route_steps::text,
    v_route_geometry::text,'Harrison',
    (extract(epoch from v_graph_verified_at))::text,
    v_pad.latitude::text,v_pad.longitude::text,v_handoff::text,v_dependency
  ));

  insert into private_verification.brinesearch_v18_core_destination_releases(
    pad_id,record_revision,route_prep_id,route_revision,release_version,
    route_steps,route_geometry,graph_county,graph_last_verified_at,
    destination_latitude,destination_longitude,handoff,dependency_digest,
    release_digest,evidence,authorization_basis,verified_at
  ) values(
    v_pad.id,v_record_revision,'0102370e-c03f-443c-94c2-61c7e10bf931',1,
    'v18-core-destination-v1',v_route_steps,v_route_geometry,'Harrison',
    v_graph_verified_at,v_pad.latitude,v_pad.longitude,v_handoff,
    v_dependency,v_release,
    pg_catalog.jsonb_build_object(
      'issue',97,
      'contract','exact_public_road_core_plus_saved_gps_destination',
      'source_route_prep_id','dfb3f204-190c-4d65-85b3-16bcd1715825',
      'source_prefix_occurrences',pg_catalog.jsonb_build_array(1,2,3),
      'final_identity_id','b66949a7-9a1c-b635-1d8d-c84759c3d401',
      'final_road_id','52219c9b-8b69-4d96-a779-97ed2466062e',
      'handoff_method','projection_on_owner_selected_exact_occurrence',
      'handoff_offset_m',extensions.st_distance(
        v_handoff_point::extensions.geography,
        v_destination_point::extensions.geography
      ),
      'gps_selected_road',false,
      'nearest_road_matching',false,
      'fuzzy_matching',false,
      'name_only_matching',false,
      'private_access_geometry_created',false,
      'approved_geometry_reaches_destination',false,
      'cologie_tail_included',false
    ),
    'PC explicitly authorized one LASSO route using the unchanged Cologie public-road prefix and stopping at the saved LASSO GPS; the GPS is destination-only and the road highlight ends at the exact Springdale handoff.',
    v_verified_at
  );

  insert into public.brinesearch_driver_core_destination_releases_public(
    pad_id,record_revision,route_revision,release_version,route_steps,
    route_geometry,graph_county,graph_last_verified_at,destination_latitude,
    destination_longitude,handoff,dependency_digest,release_digest,published_at
  ) values(
    v_pad.id,v_record_revision,1,'v18-core-destination-v1',v_route_steps,
    v_route_geometry,'Harrison',v_graph_verified_at,
    v_pad.latitude,v_pad.longitude,v_handoff,v_dependency,v_release,v_verified_at
  );
end
$release_lasso$;

-- This is the expensive source/graph proof.  It is deliberately run only by
-- the release migration.  Driver reads use the frozen release receipt below;
-- they do not re-derive an approved route on every pad open.
create function private_verification.brinesearch_v18_core_destination_release_proof_at_install(
  p_pad_id uuid
)
returns boolean
language plpgsql
volatile
strict
security definer
set search_path=''
set statement_timeout='90s'
set lock_timeout='500ms'
as $function$
declare
  v_lasso constant uuid:='518659d9-bca2-47b0-b294-3141ba679fc4';
  v_cologie constant uuid:='e2b32e85-9e93-4388-8215-9d8167cbbeb8';
  v_route_id constant uuid:='0102370e-c03f-443c-94c2-61c7e10bf931';
  v_receipt private_verification.brinesearch_v18_core_destination_releases%rowtype;
  v_projection public.brinesearch_driver_core_destination_releases_public%rowtype;
  v_pad public.pads%rowtype;
  v_route public.brinesearch_route_prep%rowtype;
  v_record_revision text;
  v_live_dependency text;
  v_live_release text;
  v_foxes extensions.geometry;
  v_springdale extensions.geometry;
  v_public_foxes extensions.geometry;
  v_public_core extensions.geometry;
  v_expected_core extensions.geometry;
  v_handoff extensions.geometry;
  v_destination extensions.geometry;
  v_fraction double precision;
begin
  if p_pad_id<>v_lasso then return false; end if;
  select * into strict v_receipt
  from private_verification.brinesearch_v18_core_destination_releases receipt
  where receipt.pad_id=p_pad_id and receipt.revoked_at is null;
  select * into strict v_projection
  from public.brinesearch_driver_core_destination_releases_public projection
  where projection.pad_id=p_pad_id;
  if v_projection.record_revision is distinct from v_receipt.record_revision
     or v_projection.route_revision is distinct from v_receipt.route_revision
     or v_projection.release_version is distinct from v_receipt.release_version
     or v_projection.route_steps is distinct from v_receipt.route_steps
     or v_projection.route_geometry is distinct from v_receipt.route_geometry
     or v_projection.graph_county is distinct from v_receipt.graph_county
     or v_projection.graph_last_verified_at is distinct from v_receipt.graph_last_verified_at
     or v_projection.destination_latitude is distinct from v_receipt.destination_latitude
     or v_projection.destination_longitude is distinct from v_receipt.destination_longitude
     or v_projection.handoff is distinct from v_receipt.handoff
     or v_projection.dependency_digest is distinct from v_receipt.dependency_digest
     or v_projection.release_digest is distinct from v_receipt.release_digest
     or v_projection.published_at is distinct from v_receipt.verified_at then
    return false;
  end if;

  select * into strict v_pad from public.pads pad where pad.id=p_pad_id;
  select row.record_revision into strict v_record_revision
  from public.brinesearch_directory_snapshot_rows_v18 row
  join public.brinesearch_directory_snapshots_v18 snapshot
    on snapshot.snapshot_id=row.snapshot_id
   and snapshot.publication_state='current'
  where row.pad_id=p_pad_id;
  if coalesce(v_pad.list_only,false)
     or v_pad.legacy_id is distinct from 'ascent--lasso'
     or v_pad.latitude is distinct from v_receipt.destination_latitude
     or v_pad.longitude is distinct from v_receipt.destination_longitude
     or v_record_revision is distinct from v_receipt.record_revision
     or not exists(
       select 1 from public.pad_verification_status verification
       where verification.pad_id=p_pad_id
         and not verification.gps_verified
         and not verification.directions_verified
         and not verification.roads_verified
     ) then
    return false;
  end if;

  select * into strict v_route from public.brinesearch_route_prep route
  where route.id=v_route_id;
  if v_route.pad_id is distinct from p_pad_id
     or not v_route.active
     or v_route.route_group is distinct from 'primary'
     or v_route.variant_index is distinct from 1
     or v_route.analysis_version is distinct from
          'issue97-owner-reviewed-core-destination-v1'
     or v_route.source_sequence is distinct from
          'US-250 → FOXS BOTTOM RD → SPRINGDALE HILL RD'
     or v_route.source_sequence_hash is distinct from pg_catalog.md5(
          'US-250 → FOXS BOTTOM RD → SPRINGDALE HILL RD'
        )
     or v_route.readiness_status is distinct from 'ready_for_road_matching'
     or v_route.reviewed_by is distinct from
          '429fd4f8-ede7-44e4-8b12-98aa1c3272ae'
     or v_route.reviewed_at is null
     or private_verification.brinesearch_v18_owner_authority_current(
          v_route.reviewed_by
        ) is not true
     or (select count(*) from public.brinesearch_route_prep route
         where route.pad_id=p_pad_id and route.active)<>1
     or (select count(*) from public.brinesearch_route_prep_steps step
         where step.route_prep_id=v_route_id and step.active)<>3 then
    return false;
  end if;

  if exists(
    select 1
    from public.brinesearch_route_prep_steps target
    left join public.brinesearch_route_prep_steps source
      on source.route_prep_id='dfb3f204-190c-4d65-85b3-16bcd1715825'
     and source.step_order=target.step_order and source.active
    where target.route_prep_id=v_route_id and target.active
      and (
        source.id is null
        or target.id is distinct from case target.step_order
          when 1 then '1ae9c2e6-62b0-4dab-aa44-4b8adbe83f24'::uuid
          when 2 then 'c8fd4f2d-9fd2-4855-975b-02e84fa28c05'::uuid
          when 3 then 'aadc13e8-114e-4fd0-ad7a-7550322c8a0c'::uuid
        end
        or target.raw_text is distinct from source.raw_text
        or target.normalized_text is distinct from source.normalized_text
        or target.step_kind is distinct from source.step_kind
        or target.road_id is distinct from source.road_id
        or target.travel_direction is distinct from source.travel_direction
        or target.owner_decision is distinct from 'approved'
        or target.source_details->>'source_route_prep_id' is distinct from
             'dfb3f204-190c-4d65-85b3-16bcd1715825'
        or target.source_details->>'source_route_prep_step_id' is distinct from
             source.id::text
        or target.source_details->>'destination_pad_id' is distinct from
             p_pad_id::text
        or coalesce((target.source_details->>'gps_selects_road')::boolean,true)
        or coalesce((target.source_details->>'nearest_road_matching')::boolean,true)
        or coalesce((target.source_details->>'name_only_matching')::boolean,true)
        or coalesce((target.source_details->>'private_access_geometry_created')::boolean,true)
        or coalesce(target.match_method,'') ilike any(
             array['%nearest%','%fuzzy%','%name_only%']
           )
      )
  ) then return false; end if;

  if (select count(*)
      from private_verification.brinesearch_route_occurrence_receipts_issue97 occurrence
      where occurrence.route_prep_id=v_route_id
        and occurrence.resolution_status='resolved')<>3
     or exists(
       select 1
       from private_verification.brinesearch_route_occurrence_receipts_issue97 occurrence
       left join private_verification.brinesearch_route_occurrence_receipts_issue97 source
         on source.route_prep_id='dfb3f204-190c-4d65-85b3-16bcd1715825'
        and source.occurrence_index=occurrence.occurrence_index
        and source.resolution_status='resolved'
       left join public.brinesearch_authoritative_road_identities identity
         on identity.id=occurrence.identity_id and identity.active
        and identity.public_access_status='public'
        and identity.drivable_status='drivable'
       left join public.brinesearch_road_identity_mappings mapping
         on mapping.identity_id=identity.id
        and mapping.road_id=occurrence.canonical_road_id
        and mapping.mapping_status='verified'
       where occurrence.route_prep_id=v_route_id
         and (
           source.route_prep_id is null
           or identity.id is null or mapping.identity_id is null
           or occurrence.occurrence_index not between 1 and 3
           or occurrence.candidate_count<1
           or occurrence.resolution_method is distinct from
                'explicit_authoritative_source_receipt'
           or source.resolution_method is distinct from
                'explicit_authoritative_source_receipt'
           or occurrence.identity_id is distinct from source.identity_id
           or occurrence.canonical_road_id is distinct from
                source.canonical_road_id
           or occurrence.source_identity_key is distinct from
                source.source_identity_key
           or occurrence.source_digest is distinct from source.source_digest
           or occurrence.mapping_fingerprint is distinct from
                source.mapping_fingerprint
           or occurrence.source_digest is distinct from identity.source_digest
           or occurrence.mapping_fingerprint is distinct from
                private_verification.brinesearch_issue97_mapping_fingerprint(identity.id)
           or private_verification.brinesearch_issue97_dataset_scope_current(
                identity.dataset_id,identity.state_code,identity.county_code
              ) is not true
           or coalesce(occurrence.resolution_method,'') ilike any(
                array['%nearest%','%fuzzy%','%name_only%']
              )
         )
     ) then return false; end if;

  if (select count(*)
      from private_verification.brinesearch_route_transition_receipts_issue97 transition
      where transition.route_prep_id=v_route_id
        and transition.status='resolved')<>2
     or exists(
       select 1
       from private_verification.brinesearch_route_transition_receipts_issue97 transition
       left join public.brinesearch_road_junctions junction
         on junction.id=transition.junction_id
        and junction.build_id=transition.graph_build_id
        and junction.graph_digest=transition.graph_digest
        and junction.verification_status='verified'
       left join public.brinesearch_road_junction_anchors anchor
         on anchor.id=transition.anchor_id
        and anchor.junction_id=junction.id
        and anchor.anchor_digest=transition.anchor_digest
       left join public.brinesearch_road_graph_builds build
         on build.id=transition.graph_build_id
        and build.status='active'
        and build.source_revision_digest=transition.source_revision_digest
       where transition.route_prep_id=v_route_id
         and (
           junction.id is null or anchor.id is null or build.id is null
           or transition.boundary_index not in (1,2)
           or transition.candidate_count<1
           or not extensions.st_dwithin(
                anchor.geom::extensions.geography,
                transition.coordinate::extensions.geography,0.05
              )
           or coalesce(transition.resolution_method,'') ilike any(
                array['%nearest%','%fuzzy%','%name_only%']
              )
           or transition.left_route_prep_step_id is distinct from (
                select occurrence.route_prep_step_id
                from private_verification.brinesearch_route_occurrence_receipts_issue97 occurrence
                where occurrence.route_prep_id=v_route_id
                  and occurrence.occurrence_index=transition.boundary_index
              )
           or transition.right_route_prep_step_id is distinct from (
                select occurrence.route_prep_step_id
                from private_verification.brinesearch_route_occurrence_receipts_issue97 occurrence
                where occurrence.route_prep_id=v_route_id
                  and occurrence.occurrence_index=transition.boundary_index+1
              )
         )
     )
     or private_verification.brinesearch_issue97_graph_build_release_current(
          'f4e4d43f-e86c-499c-893f-73f2eef3dc29'
        ) is not true then
    return false;
  end if;

  if (select count(*)
      from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
      where geometry.route_prep_id=v_route_id and geometry.status='resolved')<>2
     or not exists(
       select 1
       from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
       join private_verification.brinesearch_route_occurrence_receipts_issue97 occurrence
         on occurrence.route_prep_step_id=geometry.route_prep_step_id
       where geometry.route_prep_id=v_route_id
         and geometry.occurrence_index=2 and geometry.status='resolved'
         and geometry.identity_id=occurrence.identity_id
         and geometry.road_id=occurrence.canonical_road_id
         and geometry.road_geometry_digest=
              private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(
                geometry.identity_id
              )
         and extensions.geometrytype(geometry.step_geometry)='LINESTRING'
         and extensions.st_srid(geometry.step_geometry)=4326
         and extensions.st_isvalid(geometry.step_geometry)
         and extensions.st_issimple(geometry.step_geometry)
     )
     or not exists(
       select 1
       from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
       where geometry.route_prep_id=v_route_id
         and geometry.occurrence_index=3 and geometry.status='held'
         and geometry.hold_reason='verified_pad_gps_not_on_final_authoritative_geometry'
     )
     or not exists(
       select 1
       from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
       where receipt.route_prep_id=v_route_id
         and receipt.pad_id=p_pad_id
         and receipt.source_sequence_hash=v_route.source_sequence_hash
         and receipt.route_status='needs_review'
         and receipt.road_occurrence_count=3
         and receipt.resolved_occurrence_count=3
         and receipt.held_occurrence_count=0
         and receipt.canonical_mapping_count=3
         and receipt.exact_geometry_count=2
     ) then
    return false;
  end if;

  if public.brinesearch_issue97_google_route_current(v_cologie) is not true
     or public.brinesearch_v18_google_handoff_current(v_cologie) is not true
     or not exists(
       select 1
       from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
       join private_verification.brinesearch_route_occurrence_receipts_issue97 occurrence
         on occurrence.route_prep_step_id=geometry.route_prep_step_id
       where geometry.route_prep_id='dfb3f204-190c-4d65-85b3-16bcd1715825'
         and geometry.occurrence_index=3 and geometry.status='resolved'
         and geometry.identity_id='b66949a7-9a1c-b635-1d8d-c84759c3d401'
         and geometry.road_id='52219c9b-8b69-4d96-a779-97ed2466062e'
         and occurrence.source_identity_key='OH:ODOT:NLF:THASTR00079**C'
         and geometry.road_geometry_digest=
              private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(
                geometry.identity_id
              )
     ) then
    return false;
  end if;

  select geometry.step_geometry into strict v_foxes
  from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
  where geometry.route_prep_id=v_route_id
    and geometry.occurrence_index=2 and geometry.status='resolved';
  select geometry.step_geometry into strict v_springdale
  from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
  where geometry.route_prep_id='dfb3f204-190c-4d65-85b3-16bcd1715825'
    and geometry.occurrence_index=3 and geometry.status='resolved';
  v_public_foxes:=extensions.st_setsrid(extensions.st_geomfromgeojson(
    (v_projection.route_geometry#>'{features,0,geometry}')::text
  ),4326);
  v_public_core:=extensions.st_setsrid(extensions.st_geomfromgeojson(
    (v_projection.route_geometry#>'{features,1,geometry}')::text
  ),4326);
  v_handoff:=extensions.st_setsrid(extensions.st_makepoint(
    (v_projection.handoff#>>'{core_end,longitude}')::double precision,
    (v_projection.handoff#>>'{core_end,latitude}')::double precision
  ),4326);
  v_destination:=extensions.st_setsrid(extensions.st_makepoint(
    v_projection.destination_longitude,v_projection.destination_latitude
  ),4326);
  v_fraction:=extensions.st_linelocatepoint(v_springdale,v_handoff);
  v_expected_core:=extensions.st_linesubstring(v_springdale,0,v_fraction);
  if v_projection.release_version<>'v18-core-destination-v1'
     or pg_catalog.jsonb_array_length(v_projection.route_steps)<>2
     or pg_catalog.jsonb_array_length(
          v_projection.route_geometry->'features'
        )<>2
     or pg_catalog.jsonb_array_length(
          v_projection.handoff->'waypoints'
        )<>3
     or v_projection.handoff->>'handoff_version'<>'v18-core-destination-v1'
     or v_projection.handoff->>'pad_id'<>p_pad_id::text
     or v_projection.handoff->>'source_dependency_digest'<>
          v_projection.dependency_digest
     or v_projection.handoff#>>'{core_end,role}'<>
          'exact_public_road_handoff'
     or v_projection.handoff#>>'{destination,role}'<>
          'saved_pad_destination'
     or v_projection.handoff#>>'{destination,pad_id}'<>p_pad_id::text
     or v_projection.handoff->>'final_leg_mode'<>
          'google_to_saved_gps_unapproved'
     or extensions.geometrytype(v_public_foxes)<>'LINESTRING'
     or extensions.geometrytype(v_public_core)<>'LINESTRING'
     or not extensions.st_coveredby(
          v_public_foxes,
          extensions.st_buffer(v_foxes::extensions.geography,0.20)::extensions.geometry
        )
     or not extensions.st_coveredby(
          v_foxes,
          extensions.st_buffer(v_public_foxes::extensions.geography,0.20)::extensions.geometry
        )
     or not extensions.st_coveredby(
          v_public_core,
          extensions.st_buffer(v_expected_core::extensions.geography,0.20)::extensions.geometry
        )
     or not extensions.st_coveredby(
          v_expected_core,
          extensions.st_buffer(v_public_core::extensions.geography,0.20)::extensions.geometry
        )
     or v_fraction<0.79132514 or v_fraction>0.79132517
     or not extensions.st_dwithin(
          v_springdale::extensions.geography,v_handoff::extensions.geography,0.05
        )
     or not extensions.st_dwithin(
          extensions.st_startpoint(v_public_core)::extensions.geography,
          extensions.st_endpoint(v_public_foxes)::extensions.geography,0.20
        )
     or not extensions.st_dwithin(
          extensions.st_endpoint(v_public_core)::extensions.geography,
          v_handoff::extensions.geography,0.20
        )
     or extensions.st_distance(
          v_handoff::extensions.geography,v_destination::extensions.geography
        ) not between 127 and 129 then
    return false;
  end if;

  v_live_dependency:=
    private_verification.brinesearch_v18_lasso_core_destination_dependency(
      p_pad_id
    );
  v_live_release:=pg_catalog.md5(pg_catalog.concat_ws('|',
    v_receipt.record_revision,v_receipt.route_revision::text,
    v_receipt.release_version,v_receipt.route_steps::text,
    v_receipt.route_geometry::text,v_receipt.graph_county,
    (extract(epoch from v_receipt.graph_last_verified_at))::text,
    v_receipt.destination_latitude::text,v_receipt.destination_longitude::text,
    v_receipt.handoff::text,v_receipt.dependency_digest
  ));
  return v_live_dependency is not null
    and v_live_dependency=v_receipt.dependency_digest
    and v_live_release=v_receipt.release_digest;
exception when others then
  return false;
end
$function$;

revoke all on function
  private_verification.brinesearch_v18_core_destination_release_proof_at_install(uuid)
from public,anon,authenticated,service_role;

comment on function
  private_verification.brinesearch_v18_core_destination_release_proof_at_install(uuid) is
'One-time release proof over exact graph evidence. It is not part of the driver read path.';

-- Each pad has one immutable frozen release.  This constant-time gate checks
-- only the frozen private/public receipt pair, its digest, and explicit
-- revocation state.  Replacement requires an explicit revocation followed by
-- a separately reviewed migration; this pad_id-keyed table is not a revision
-- history.  Unrelated graph timestamps cannot make an issued route disappear.
create function private_verification.brinesearch_v18_core_destination_release_receipt_active(
  p_pad_id uuid
)
returns boolean
language plpgsql
stable
strict
security definer
set search_path=''
set statement_timeout='2s'
set lock_timeout='500ms'
as $function$
declare
  v_receipt private_verification.brinesearch_v18_core_destination_releases%rowtype;
  v_projection public.brinesearch_driver_core_destination_releases_public%rowtype;
  v_release_digest text;
begin
  if p_pad_id<>'518659d9-bca2-47b0-b294-3141ba679fc4' then
    return false;
  end if;

  select * into strict v_receipt
  from private_verification.brinesearch_v18_core_destination_releases receipt
  where receipt.pad_id=p_pad_id and receipt.revoked_at is null;

  select * into strict v_projection
  from public.brinesearch_driver_core_destination_releases_public projection
  where projection.pad_id=p_pad_id;

  if v_receipt.record_revision is distinct from v_projection.record_revision
     or v_receipt.route_revision is distinct from v_projection.route_revision
     or v_receipt.release_version is distinct from v_projection.release_version
     or v_receipt.route_steps is distinct from v_projection.route_steps
     or v_receipt.route_geometry is distinct from v_projection.route_geometry
     or v_receipt.graph_county is distinct from v_projection.graph_county
     or v_receipt.graph_last_verified_at is distinct from
          v_projection.graph_last_verified_at
     or v_receipt.destination_latitude is distinct from
          v_projection.destination_latitude
     or v_receipt.destination_longitude is distinct from
          v_projection.destination_longitude
     or v_receipt.handoff is distinct from v_projection.handoff
     or v_receipt.dependency_digest is distinct from
          v_projection.dependency_digest
     or v_receipt.release_digest is distinct from v_projection.release_digest
     or v_receipt.verified_at is distinct from v_projection.published_at then
    return false;
  end if;

  v_release_digest:=pg_catalog.md5(pg_catalog.concat_ws('|',
    v_projection.record_revision,v_projection.route_revision::text,
    v_projection.release_version,v_projection.route_steps::text,
    v_projection.route_geometry::text,v_projection.graph_county,
    (extract(epoch from v_projection.graph_last_verified_at))::text,
    v_projection.destination_latitude::text,
    v_projection.destination_longitude::text,v_projection.handoff::text,
    v_projection.dependency_digest
  ));

  if v_release_digest is distinct from v_projection.release_digest
     or v_receipt.route_prep_id is distinct from
          '0102370e-c03f-443c-94c2-61c7e10bf931'
     or v_projection.route_revision is distinct from 1
     or v_projection.release_version is distinct from
          'v18-core-destination-v1'
     or v_projection.graph_county is distinct from 'Harrison'
     or v_projection.graph_last_verified_at is distinct from
          '2026-08-24T23:53:01.785257Z'::timestamptz
     or v_projection.destination_latitude is distinct from 40.240883
     or v_projection.destination_longitude is distinct from -80.913963
     or v_projection.published_at is distinct from
          '2026-08-26T16:45:38Z'::timestamptz then
    return false;
  end if;

  -- Exact LASSO v1 driver wording.  JSONB equality rejects every extra key,
  -- injected note, reordered/omitted step, or changed distance.
  if v_projection.route_steps is distinct from pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'order',1,'kind','turn','displayName','FOXS BOTTOM RD',
      'instruction','Turn left onto FOXS BOTTOM RD',
      'distanceMiles',2.394448::numeric,
      'verifiedDesignations',pg_catalog.jsonb_build_array(
        'CR 15','CR-15','Foxes Bottom Rd','Foxs Bottom Rd',
        'FOXS BOTTOM RD','MAIN ST'
      )
    ),
    pg_catalog.jsonb_build_object(
      'order',2,'kind','turn','displayName','SPRINGDALE HILL RD',
      'instruction','Turn left onto SPRINGDALE HILL RD',
      'distanceMiles',0.700359::numeric,
      'verifiedDesignations',pg_catalog.jsonb_build_array(
        'Springdale Hill Rd','SPRINGDALE HILL RD',
        'Township Road 79','TR 79','TR-79'
      )
    )
  ) then
    return false;
  end if;

  -- This digest was recovered read-only from the exact Cologie Foxs Bottom
  -- occurrence plus the frozen clipped Springdale occurrence.  It pins every
  -- coordinate, not merely the line endpoints.
  if pg_catalog.jsonb_typeof(v_projection.route_geometry) is distinct from
       'object'
     or pg_catalog.md5(v_projection.route_geometry::text) is distinct from
          '89b586bdc40544f1cfe8e2e4dfe7653b'
     or v_projection.route_geometry->>'type' is distinct from
          'FeatureCollection'
     or pg_catalog.jsonb_typeof(v_projection.route_geometry->'features')
          is distinct from 'array'
     or pg_catalog.jsonb_array_length(
          v_projection.route_geometry->'features'
        ) is distinct from 2
     or v_projection.route_geometry#>'{features,0,properties}' is distinct from
          '{"stepOrder":1}'::jsonb
     or v_projection.route_geometry#>'{features,1,properties}' is distinct from
          '{"stepOrder":2}'::jsonb then
    return false;
  end if;

  -- The complete handoff object is allowlisted.  The three road waypoints are
  -- frozen geometry endpoints; the fourth point is only the saved GPS.
  if v_projection.handoff is distinct from pg_catalog.jsonb_build_object(
    'handoff_version','v18-core-destination-v1',
    'pad_id',p_pad_id,
    'route_revision',1,
    'source_dependency_digest',v_projection.dependency_digest,
    'origin_mode','current_location_until_route_ingress',
    'waypoints',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'sequence',1,'latitude',40.2376831::double precision,
        'longitude',-80.9648236::double precision
      ),
      pg_catalog.jsonb_build_object(
        'sequence',2,'latitude',40.2344629::double precision,
        'longitude',-80.9217988::double precision
      ),
      pg_catalog.jsonb_build_object(
        'sequence',3,'latitude',40.241093947::double precision,
        'longitude',-80.915437726::double precision
      )
    ),
    'core_end',pg_catalog.jsonb_build_object(
      'sequence',3,'role','exact_public_road_handoff',
      'latitude',40.241093947::double precision,
      'longitude',-80.915437726::double precision
    ),
    'destination',pg_catalog.jsonb_build_object(
      'sequence',4,'pad_id',p_pad_id,'role','saved_pad_destination',
      'latitude',40.240883::double precision,
      'longitude',-80.913963::double precision
    ),
    'final_leg_mode','google_to_saved_gps_unapproved'
  ) then
    return false;
  end if;

  return true;
exception when others then
  return false;
end
$function$;

revoke all on function
  private_verification.brinesearch_v18_core_destination_release_receipt_active(uuid)
from public,anon,authenticated,service_role;

comment on function
  private_verification.brinesearch_v18_core_destination_release_receipt_active(uuid) is
'Checks the immutable reviewed release receipt and explicit revocation only. It does not recompute graph currentness on driver reads.';

create function public.brinesearch_v18_driver_core_destination_release(
  p_pad_id uuid
)
returns jsonb
language sql
stable
strict
security definer
set search_path=''
set statement_timeout='2s'
set lock_timeout='500ms'
as $function$
  select pg_catalog.jsonb_build_object(
    'padId',projection.pad_id,
    'recordRevision',projection.record_revision,
    'routeRevision',projection.route_revision,
    'releaseVersion',projection.release_version,
    'routeSteps',projection.route_steps,
    'routeGeometry',projection.route_geometry,
    'graphCounty',projection.graph_county,
    'graphLastVerifiedAt',projection.graph_last_verified_at,
    'destination',pg_catalog.jsonb_build_object(
      'available',true,'role','saved_pad_destination',
      'latitude',projection.destination_latitude,
      'longitude',projection.destination_longitude
    ),
    'handoff',projection.handoff,
    'dependencyDigest',projection.dependency_digest,
    'releaseDigest',projection.release_digest,
    'publishedAt',projection.published_at,
    'status',pg_catalog.jsonb_build_object(
      'padId',projection.pad_id,
      'recordRevision',projection.record_revision,
      'statusRevision',projection.release_digest,
      'route',pg_catalog.jsonb_build_object(
        'state','ready','source','exact_graph_handoff',
        'steps',projection.route_steps,
        'geometry',projection.route_geometry,
        'safeReason','Approved public-road core ends at the exact handoff; Google handles the separate saved-GPS destination leg, which is not an approved road.',
        'lastVerifiedAt',projection.published_at,
        'writtenDirections',null
      ),
      'graph',pg_catalog.jsonb_build_object(
        'state','verified_release','county',projection.graph_county,
        'counties',pg_catalog.jsonb_build_array(projection.graph_county),
        'graphCount',1,'publicSource','BrineSearch immutable approved release',
        'lastVerifiedAt',projection.graph_last_verified_at
      ),
      'google',pg_catalog.jsonb_build_object(
        'publicState','ready',
        'safeReason','One reviewed handoff follows the exact approved road core, then uses the saved GPS as a destination only.'
      ),
      'destination',pg_catalog.jsonb_build_object(
        'available',true,'role','saved_pad_destination',
        'latitude',projection.destination_latitude,
        'longitude',projection.destination_longitude
      )
    )
  )
  from public.brinesearch_driver_core_destination_releases_public projection
  join private_verification.brinesearch_v18_core_destination_releases receipt
    on receipt.pad_id=projection.pad_id
   and receipt.record_revision=projection.record_revision
   and receipt.route_revision=projection.route_revision
   and receipt.release_version=projection.release_version
   and receipt.route_steps=projection.route_steps
   and receipt.route_geometry=projection.route_geometry
   and receipt.graph_county=projection.graph_county
   and receipt.graph_last_verified_at=projection.graph_last_verified_at
   and receipt.destination_latitude=projection.destination_latitude
   and receipt.destination_longitude=projection.destination_longitude
   and receipt.handoff=projection.handoff
   and receipt.dependency_digest=projection.dependency_digest
   and receipt.release_digest=projection.release_digest
   and receipt.verified_at=projection.published_at
   and receipt.revoked_at is null
  where projection.pad_id=p_pad_id
    and private_verification.brinesearch_v18_core_destination_release_receipt_active(
          projection.pad_id
        )
$function$;

revoke all on function
  public.brinesearch_v18_driver_core_destination_release(uuid)
from public,anon,authenticated,service_role;
grant execute on function
  public.brinesearch_v18_driver_core_destination_release(uuid)
to anon,authenticated,service_role;

comment on function
  public.brinesearch_v18_driver_core_destination_release(uuid) is
'Returns one byte-identical reviewed exact-road-core plus saved-GPS destination release. Approved geometry ends at the on-road handoff; the destination gap has no manufactured road authority.';

create or replace function
  public.brinesearch_v18_driver_pad_status_with_google_handoff(p_pad_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
set statement_timeout='20s'
set lock_timeout='500ms'
as $function$
  with core as materialized (
    select public.brinesearch_v18_driver_core_destination_release(p_pad_id)
      as value
  ),
  driver as materialized (
    select public.brinesearch_v18_driver_pad_status(p_pad_id) as status
    from core
    where core.value is null
  ),
  gated as materialized (
    select
      driver.status,
      coalesce(driver.status#>>'{route,state}','')='ready'
        and coalesce(driver.status#>>'{route,source}','')='exact_graph'
        and coalesce(driver.status#>>'{graph,state}','')='active_current'
        and coalesce(driver.status#>>'{google,publicState}','')='ready'
        as release_ready
    from driver
  ),
  public_route as materialized (
    select pg_catalog.jsonb_build_object(
      'pad_id',route.pad_id,
      'route_revision',route.route_revision,
      'manifest',route.manifest
    ) as value
    from gated
    join public.brinesearch_driver_google_routes_public route
      on gated.release_ready
     and route.pad_id=p_pad_id
    where public.brinesearch_issue97_google_route_current(route.pad_id)
  ),
  public_handoff as materialized (
    select pg_catalog.jsonb_build_object(
      'pad_id',handoff.pad_id,
      'route_revision',handoff.route_revision,
      'source_manifest_digest',handoff.source_manifest_digest,
      'source_dependency_digest',handoff.source_dependency_digest,
      'handoff_version',handoff.handoff_version,
      'handoff',handoff.handoff,
      'handoff_digest',handoff.handoff_digest,
      'published_at',handoff.published_at
    ) as value
    from gated
    join public.brinesearch_driver_google_handoffs_public handoff
      on gated.release_ready
     and handoff.pad_id=p_pad_id
    where public.brinesearch_v18_google_handoff_current(handoff.pad_id)
  )
  select pg_catalog.jsonb_build_object(
    'status',core.value->'status',
    'publicGoogleRoute',null,
    'publicGoogleHandoff',null,
    'coreDestinationRelease',core.value-'status'
  )
  from core
  where core.value is not null
  union all
  select pg_catalog.jsonb_build_object(
    'status',gated.status,
    'publicGoogleRoute',(select value from public_route),
    'publicGoogleHandoff',(select value from public_handoff)
  )
  from gated
$function$;

revoke all on function
  public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)
from public,anon,authenticated,service_role;
grant execute on function
  public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)
to anon,authenticated,service_role;

comment on function
  public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid) is
'Atomic V18 driver envelope. Exact full-route Google releases retain their unchanged gate. A separate reviewed core-destination release may expose exact road geometry ending at a handoff plus an unapproved saved-GPS destination; no private evidence is returned.';

-- Prove that possession of write access to both copies plus knowledge of the
-- digest recipe cannot turn altered release content into driver authority.
-- Each deliberate mutation is contained in a PL/pgSQL subtransaction and is
-- rolled back before the next case.
do $verify_release_tamper_guards$
declare
  v_lasso constant uuid:='518659d9-bca2-47b0-b294-3141ba679fc4';
  v_private_before jsonb;
  v_public_before jsonb;
begin
  select pg_catalog.to_jsonb(receipt) into strict v_private_before
  from private_verification.brinesearch_v18_core_destination_releases receipt
  where receipt.pad_id=v_lasso;
  select pg_catalog.to_jsonb(projection) into strict v_public_before
  from public.brinesearch_driver_core_destination_releases_public projection
  where projection.pad_id=v_lasso;

  if private_verification.brinesearch_v18_core_destination_release_receipt_active(
       v_lasso
     ) is not true
     or public.brinesearch_v18_driver_core_destination_release(v_lasso) is null then
    raise exception 'Untampered immutable release did not pass before mutation tests';
  end if;

  -- Case 1: move the first approved waypoint in both copies and recompute both
  -- release digests using the canonical release recipe.
  begin
    update private_verification.brinesearch_v18_core_destination_releases
    set handoff=pg_catalog.jsonb_set(
      handoff,'{waypoints,0,latitude}',
      pg_catalog.to_jsonb(40.2376832::double precision),false
    )
    where pad_id=v_lasso;
    update public.brinesearch_driver_core_destination_releases_public
    set handoff=pg_catalog.jsonb_set(
      handoff,'{waypoints,0,latitude}',
      pg_catalog.to_jsonb(40.2376832::double precision),false
    )
    where pad_id=v_lasso;
    update private_verification.brinesearch_v18_core_destination_releases receipt
    set release_digest=pg_catalog.md5(pg_catalog.concat_ws('|',
      receipt.record_revision,receipt.route_revision::text,
      receipt.release_version,receipt.route_steps::text,
      receipt.route_geometry::text,receipt.graph_county,
      (extract(epoch from receipt.graph_last_verified_at))::text,
      receipt.destination_latitude::text,receipt.destination_longitude::text,
      receipt.handoff::text,receipt.dependency_digest
    ))
    where receipt.pad_id=v_lasso;
    update public.brinesearch_driver_core_destination_releases_public projection
    set release_digest=pg_catalog.md5(pg_catalog.concat_ws('|',
      projection.record_revision,projection.route_revision::text,
      projection.release_version,projection.route_steps::text,
      projection.route_geometry::text,projection.graph_county,
      (extract(epoch from projection.graph_last_verified_at))::text,
      projection.destination_latitude::text,
      projection.destination_longitude::text,projection.handoff::text,
      projection.dependency_digest
    ))
    where projection.pad_id=v_lasso;
    if (select receipt.release_digest
        from private_verification.brinesearch_v18_core_destination_releases receipt
        where receipt.pad_id=v_lasso) is distinct from
       (select projection.release_digest
        from public.brinesearch_driver_core_destination_releases_public projection
        where projection.pad_id=v_lasso)
       or private_verification.brinesearch_v18_core_destination_release_receipt_active(
            v_lasso
          ) is not false
       or public.brinesearch_v18_driver_core_destination_release(v_lasso)
            is not null then
      raise exception 'Waypoint mutation did not fail closed';
    end if;
    raise exception using
      errcode='ZX101',message='rollback waypoint mutation';
  exception when sqlstate 'ZX101' then
    null;
  end;
  if (select pg_catalog.to_jsonb(receipt)
      from private_verification.brinesearch_v18_core_destination_releases receipt
      where receipt.pad_id=v_lasso) is distinct from v_private_before
     or (select pg_catalog.to_jsonb(projection)
         from public.brinesearch_driver_core_destination_releases_public projection
         where projection.pad_id=v_lasso) is distinct from v_public_before then
    raise exception 'Waypoint mutation subtransaction persisted a row delta';
  end if;

  -- Case 2: inject an unallowlisted nested handoff key in both copies.
  begin
    update private_verification.brinesearch_v18_core_destination_releases
    set handoff=pg_catalog.jsonb_set(
      handoff,'{destination,unexpected_private_note}',
      pg_catalog.to_jsonb('injected'::text),true
    )
    where pad_id=v_lasso;
    update public.brinesearch_driver_core_destination_releases_public
    set handoff=pg_catalog.jsonb_set(
      handoff,'{destination,unexpected_private_note}',
      pg_catalog.to_jsonb('injected'::text),true
    )
    where pad_id=v_lasso;
    update private_verification.brinesearch_v18_core_destination_releases receipt
    set release_digest=pg_catalog.md5(pg_catalog.concat_ws('|',
      receipt.record_revision,receipt.route_revision::text,
      receipt.release_version,receipt.route_steps::text,
      receipt.route_geometry::text,receipt.graph_county,
      (extract(epoch from receipt.graph_last_verified_at))::text,
      receipt.destination_latitude::text,receipt.destination_longitude::text,
      receipt.handoff::text,receipt.dependency_digest
    ))
    where receipt.pad_id=v_lasso;
    update public.brinesearch_driver_core_destination_releases_public projection
    set release_digest=pg_catalog.md5(pg_catalog.concat_ws('|',
      projection.record_revision,projection.route_revision::text,
      projection.release_version,projection.route_steps::text,
      projection.route_geometry::text,projection.graph_county,
      (extract(epoch from projection.graph_last_verified_at))::text,
      projection.destination_latitude::text,
      projection.destination_longitude::text,projection.handoff::text,
      projection.dependency_digest
    ))
    where projection.pad_id=v_lasso;
    if (select receipt.release_digest
        from private_verification.brinesearch_v18_core_destination_releases receipt
        where receipt.pad_id=v_lasso) is distinct from
       (select projection.release_digest
        from public.brinesearch_driver_core_destination_releases_public projection
        where projection.pad_id=v_lasso)
       or private_verification.brinesearch_v18_core_destination_release_receipt_active(
            v_lasso
          ) is not false
       or public.brinesearch_v18_driver_core_destination_release(v_lasso)
            is not null then
      raise exception 'Nested handoff key injection did not fail closed';
    end if;
    raise exception using
      errcode='ZX102',message='rollback nested handoff key mutation';
  exception when sqlstate 'ZX102' then
    null;
  end;
  if (select pg_catalog.to_jsonb(receipt)
      from private_verification.brinesearch_v18_core_destination_releases receipt
      where receipt.pad_id=v_lasso) is distinct from v_private_before
     or (select pg_catalog.to_jsonb(projection)
         from public.brinesearch_driver_core_destination_releases_public projection
         where projection.pad_id=v_lasso) is distinct from v_public_before then
    raise exception 'Nested handoff mutation subtransaction persisted a row delta';
  end if;

  -- Case 3: move only the destination nested inside the handoff.  The top-level
  -- saved destination remains unchanged, so the strict complete-object pin must
  -- still reject the altered release.
  begin
    update private_verification.brinesearch_v18_core_destination_releases
    set handoff=pg_catalog.jsonb_set(
      handoff,'{destination,latitude}',
      pg_catalog.to_jsonb(40.240884::double precision),false
    )
    where pad_id=v_lasso;
    update public.brinesearch_driver_core_destination_releases_public
    set handoff=pg_catalog.jsonb_set(
      handoff,'{destination,latitude}',
      pg_catalog.to_jsonb(40.240884::double precision),false
    )
    where pad_id=v_lasso;
    update private_verification.brinesearch_v18_core_destination_releases receipt
    set release_digest=pg_catalog.md5(pg_catalog.concat_ws('|',
      receipt.record_revision,receipt.route_revision::text,
      receipt.release_version,receipt.route_steps::text,
      receipt.route_geometry::text,receipt.graph_county,
      (extract(epoch from receipt.graph_last_verified_at))::text,
      receipt.destination_latitude::text,receipt.destination_longitude::text,
      receipt.handoff::text,receipt.dependency_digest
    ))
    where receipt.pad_id=v_lasso;
    update public.brinesearch_driver_core_destination_releases_public projection
    set release_digest=pg_catalog.md5(pg_catalog.concat_ws('|',
      projection.record_revision,projection.route_revision::text,
      projection.release_version,projection.route_steps::text,
      projection.route_geometry::text,projection.graph_county,
      (extract(epoch from projection.graph_last_verified_at))::text,
      projection.destination_latitude::text,
      projection.destination_longitude::text,projection.handoff::text,
      projection.dependency_digest
    ))
    where projection.pad_id=v_lasso;
    if (select receipt.release_digest
        from private_verification.brinesearch_v18_core_destination_releases receipt
        where receipt.pad_id=v_lasso) is distinct from
       (select projection.release_digest
        from public.brinesearch_driver_core_destination_releases_public projection
        where projection.pad_id=v_lasso)
       or private_verification.brinesearch_v18_core_destination_release_receipt_active(
            v_lasso
          ) is not false
       or public.brinesearch_v18_driver_core_destination_release(v_lasso)
            is not null then
      raise exception 'Inner destination mutation did not fail closed';
    end if;
    raise exception using
      errcode='ZX103',message='rollback inner destination mutation';
  exception when sqlstate 'ZX103' then
    null;
  end;
  if (select pg_catalog.to_jsonb(receipt)
      from private_verification.brinesearch_v18_core_destination_releases receipt
      where receipt.pad_id=v_lasso) is distinct from v_private_before
     or (select pg_catalog.to_jsonb(projection)
         from public.brinesearch_driver_core_destination_releases_public projection
         where projection.pad_id=v_lasso) is distinct from v_public_before then
    raise exception 'Inner destination mutation subtransaction persisted a row delta';
  end if;

  -- Case 4: remove the second geometry feature from both copies.
  begin
    update private_verification.brinesearch_v18_core_destination_releases
    set route_geometry=pg_catalog.jsonb_set(
      route_geometry,'{features}',(route_geometry->'features')-1,false
    )
    where pad_id=v_lasso;
    update public.brinesearch_driver_core_destination_releases_public
    set route_geometry=pg_catalog.jsonb_set(
      route_geometry,'{features}',(route_geometry->'features')-1,false
    )
    where pad_id=v_lasso;
    update private_verification.brinesearch_v18_core_destination_releases receipt
    set release_digest=pg_catalog.md5(pg_catalog.concat_ws('|',
      receipt.record_revision,receipt.route_revision::text,
      receipt.release_version,receipt.route_steps::text,
      receipt.route_geometry::text,receipt.graph_county,
      (extract(epoch from receipt.graph_last_verified_at))::text,
      receipt.destination_latitude::text,receipt.destination_longitude::text,
      receipt.handoff::text,receipt.dependency_digest
    ))
    where receipt.pad_id=v_lasso;
    update public.brinesearch_driver_core_destination_releases_public projection
    set release_digest=pg_catalog.md5(pg_catalog.concat_ws('|',
      projection.record_revision,projection.route_revision::text,
      projection.release_version,projection.route_steps::text,
      projection.route_geometry::text,projection.graph_county,
      (extract(epoch from projection.graph_last_verified_at))::text,
      projection.destination_latitude::text,
      projection.destination_longitude::text,projection.handoff::text,
      projection.dependency_digest
    ))
    where projection.pad_id=v_lasso;
    if (select receipt.release_digest
        from private_verification.brinesearch_v18_core_destination_releases receipt
        where receipt.pad_id=v_lasso) is distinct from
       (select projection.release_digest
        from public.brinesearch_driver_core_destination_releases_public projection
        where projection.pad_id=v_lasso)
       or private_verification.brinesearch_v18_core_destination_release_receipt_active(
            v_lasso
          ) is not false
       or public.brinesearch_v18_driver_core_destination_release(v_lasso)
            is not null then
      raise exception 'Missing geometry feature did not fail closed';
    end if;
    raise exception using
      errcode='ZX104',message='rollback missing geometry feature mutation';
  exception when sqlstate 'ZX104' then
    null;
  end;
  if (select pg_catalog.to_jsonb(receipt)
      from private_verification.brinesearch_v18_core_destination_releases receipt
      where receipt.pad_id=v_lasso) is distinct from v_private_before
     or (select pg_catalog.to_jsonb(projection)
         from public.brinesearch_driver_core_destination_releases_public projection
         where projection.pad_id=v_lasso) is distinct from v_public_before
     or private_verification.brinesearch_v18_core_destination_release_receipt_active(
          v_lasso
        ) is not true
     or public.brinesearch_v18_driver_core_destination_release(v_lasso) is null then
    raise exception 'Mutation proof did not restore the exact approved release';
  end if;
end
$verify_release_tamper_guards$;

-- One pad_id identifies one frozen active release row.  Release content is
-- never edited in place.  The private row permits only an explicit, one-way
-- revocation timestamp; its sanitized public twin cannot be updated or deleted.
create function private_verification.brinesearch_v18_guard_private_core_destination_release()
returns trigger
language plpgsql
volatile
security invoker
set search_path=''
as $function$
begin
  if tg_op='UPDATE'
     and old.revoked_at is null
     and new.revoked_at is not null
     and new.pad_id is not distinct from old.pad_id
     and new.record_revision is not distinct from old.record_revision
     and new.route_prep_id is not distinct from old.route_prep_id
     and new.route_revision is not distinct from old.route_revision
     and new.release_version is not distinct from old.release_version
     and new.route_steps is not distinct from old.route_steps
     and new.route_geometry is not distinct from old.route_geometry
     and new.graph_county is not distinct from old.graph_county
     and new.graph_last_verified_at is not distinct from old.graph_last_verified_at
     and new.destination_latitude is not distinct from old.destination_latitude
     and new.destination_longitude is not distinct from old.destination_longitude
     and new.handoff is not distinct from old.handoff
     and new.dependency_digest is not distinct from old.dependency_digest
     and new.release_digest is not distinct from old.release_digest
     and new.evidence is not distinct from old.evidence
     and new.authorization_basis is not distinct from old.authorization_basis
     and new.verified_at is not distinct from old.verified_at then
    return new;
  end if;
  raise exception using
    errcode='55000',
    message='Frozen core-destination release content cannot be changed or deleted';
end
$function$;

revoke all on function
  private_verification.brinesearch_v18_guard_private_core_destination_release()
from public,anon,authenticated,service_role;

create function private_verification.brinesearch_v18_guard_public_core_destination_release()
returns trigger
language plpgsql
volatile
security invoker
set search_path=''
as $function$
begin
  raise exception using
    errcode='55000',
    message='Published frozen core-destination release cannot be changed or deleted';
end
$function$;

revoke all on function
  private_verification.brinesearch_v18_guard_public_core_destination_release()
from public,anon,authenticated,service_role;

create trigger brinesearch_v18_private_core_destination_release_immutable
before update or delete
on private_verification.brinesearch_v18_core_destination_releases
for each row execute function
  private_verification.brinesearch_v18_guard_private_core_destination_release();

create trigger brinesearch_v18_public_core_destination_release_immutable
before update or delete
on public.brinesearch_driver_core_destination_releases_public
for each row execute function
  private_verification.brinesearch_v18_guard_public_core_destination_release();

comment on trigger brinesearch_v18_private_core_destination_release_immutable
on private_verification.brinesearch_v18_core_destination_releases is
'Rejects delete and every in-place edit except an exact one-way revoked_at transition.';

comment on trigger brinesearch_v18_public_core_destination_release_immutable
on public.brinesearch_driver_core_destination_releases_public is
'Rejects every update and delete of the sanitized frozen release projection.';

do $verify_install$
declare
  v_lasso constant uuid:='518659d9-bca2-47b0-b294-3141ba679fc4';
  v_cologie constant uuid:='e2b32e85-9e93-4388-8215-9d8167cbbeb8';
  v_release jsonb;
  v_bundle jsonb;
  v_cologie_bundle jsonb;
  v_geometry extensions.geometry;
  v_handoff extensions.geometry;
  v_destination extensions.geometry;
  v_owner_bypasses_rls boolean;
  v_proc pg_catalog.pg_proc%rowtype;
  v_guarded boolean;
  v_private_before jsonb;
  v_public_before jsonb;
begin
  if private_verification.brinesearch_v18_core_destination_release_proof_at_install(
       v_lasso
     ) is not true then
    raise exception 'LASSO one-time exact release proof failed';
  end if;

  if (select count(*)
      from private_verification.brinesearch_route_occurrence_receipts_issue97
      where route_prep_id='0102370e-c03f-443c-94c2-61c7e10bf931'
        and resolution_status='resolved')<>3
     or (select count(*)
         from private_verification.brinesearch_route_transition_receipts_issue97
         where route_prep_id='0102370e-c03f-443c-94c2-61c7e10bf931'
           and status='resolved'
           and graph_build_id='f4e4d43f-e86c-499c-893f-73f2eef3dc29')<>2 then
    raise exception 'LASSO exact occurrence/transition receipts are incomplete';
  end if;

  if (select count(*)
      from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97
      where route_prep_id='0102370e-c03f-443c-94c2-61c7e10bf931'
        and status='resolved')<>2
     or not exists(
       select 1
       from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97
       where route_prep_id='0102370e-c03f-443c-94c2-61c7e10bf931'
         and occurrence_index=3 and status='held'
         and hold_reason='verified_pad_gps_not_on_final_authoritative_geometry'
     ) then
    raise exception 'LASSO full exact route did not remain held at the GPS gap';
  end if;

  v_release:=public.brinesearch_v18_driver_core_destination_release(v_lasso);
  v_bundle:=public.brinesearch_v18_driver_pad_status_with_google_handoff(v_lasso);
  if v_release is null
     or v_release->>'padId' is distinct from v_lasso::text
     or v_release->>'releaseVersion' is distinct from 'v18-core-destination-v1'
     or pg_catalog.jsonb_array_length(v_release->'routeSteps')<>2
     or pg_catalog.jsonb_array_length(
          v_release#>'{routeGeometry,features}'
        )<>2
     or v_release#>>'{destination,role}' is distinct from 'saved_pad_destination'
     or v_release#>>'{handoff,final_leg_mode}' is distinct from
          'google_to_saved_gps_unapproved'
     or v_bundle#>>'{status,route,state}' is distinct from 'ready'
     or v_bundle#>>'{status,route,source}' is distinct from
          'exact_graph_handoff'
     or v_bundle#>>'{status,graph,state}' is distinct from 'verified_release'
     or v_bundle#>>'{status,google,publicState}' is distinct from 'ready'
     or v_bundle#>>'{status,destination,role}' is distinct from
          'saved_pad_destination'
     or v_bundle->'publicGoogleRoute' is distinct from 'null'::jsonb
     or v_bundle->'publicGoogleHandoff' is distinct from 'null'::jsonb then
    raise exception 'LASSO public core-destination contract failed: %',v_bundle;
  end if;

  if v_release::text ilike '%LAMBORN%'
     or v_release::text ilike '%BLAIRMONT%'
     or v_release::text ilike '%UNIONVALE%'
     or v_release::text ilike '%private%'
     or v_release::text ilike '%authorization_basis%'
     or v_release::text ilike '%evidence%' then
    raise exception 'LASSO public release leaked tail/private evidence';
  end if;

  v_geometry:=extensions.st_setsrid(extensions.st_geomfromgeojson(
    (v_release#>'{routeGeometry,features,1,geometry}')::text
  ),4326);
  v_handoff:=extensions.st_setsrid(extensions.st_makepoint(
    (v_release#>>'{handoff,core_end,longitude}')::double precision,
    (v_release#>>'{handoff,core_end,latitude}')::double precision
  ),4326);
  v_destination:=extensions.st_setsrid(extensions.st_makepoint(
    (v_release#>>'{destination,longitude}')::double precision,
    (v_release#>>'{destination,latitude}')::double precision
  ),4326);
  if not extensions.st_dwithin(
       extensions.st_endpoint(v_geometry)::extensions.geography,
       v_handoff::extensions.geography,0.05
     )
     or extensions.st_distance(
       v_handoff::extensions.geography,v_destination::extensions.geography
     )<127
     or extensions.st_distance(
       v_handoff::extensions.geography,v_destination::extensions.geography
     )>129 then
    raise exception 'LASSO highlight/handoff/destination separation failed';
  end if;

  select proc.* into strict v_proc from pg_catalog.pg_proc proc
  where proc.oid=
    'public.brinesearch_v18_driver_core_destination_release(uuid)'::
      pg_catalog.regprocedure;
  select role.rolbypassrls into strict v_owner_bypasses_rls
  from pg_catalog.pg_roles role where role.oid=v_proc.proowner;
  if not v_proc.prosecdef or not v_proc.proisstrict
     or v_proc.provolatile<>'s' or not v_owner_bypasses_rls
     or v_proc.prolang<>(select language.oid
                        from pg_catalog.pg_language language
                        where language.lanname='sql')
     or v_proc.proconfig is distinct from
       array['search_path=""','statement_timeout=2s','lock_timeout=500ms']::text[]
     or pg_catalog.has_function_privilege(
       'public','public.brinesearch_v18_driver_core_destination_release(uuid)',
       'execute'
     )
     or not pg_catalog.has_function_privilege(
        'anon','public.brinesearch_v18_driver_core_destination_release(uuid)',
        'execute'
      )
     or not pg_catalog.has_function_privilege(
        'authenticated',
        'public.brinesearch_v18_driver_core_destination_release(uuid)','execute'
      )
     or not pg_catalog.has_function_privilege(
        'service_role',
        'public.brinesearch_v18_driver_core_destination_release(uuid)','execute'
      ) then
    raise exception 'Core-destination release function security/grants failed';
  end if;

  select proc.* into strict v_proc from pg_catalog.pg_proc proc
  where proc.oid=
    'private_verification.brinesearch_v18_lasso_core_destination_dependency(uuid)'::
      pg_catalog.regprocedure;
  select role.rolbypassrls into strict v_owner_bypasses_rls
  from pg_catalog.pg_roles role where role.oid=v_proc.proowner;
  if not v_proc.prosecdef or not v_proc.proisstrict
     or v_proc.provolatile<>'v' or not v_owner_bypasses_rls
     or v_proc.prolang<>(select language.oid
                        from pg_catalog.pg_language language
                        where language.lanname='plpgsql')
     or v_proc.proconfig is distinct from
       array['search_path=""','statement_timeout=60s','lock_timeout=500ms']::text[]
     or pg_catalog.has_function_privilege(
          'public',
          'private_verification.brinesearch_v18_lasso_core_destination_dependency(uuid)',
          'execute'
        )
     or pg_catalog.has_function_privilege(
          'anon',
          'private_verification.brinesearch_v18_lasso_core_destination_dependency(uuid)',
          'execute'
        )
     or pg_catalog.has_function_privilege(
          'authenticated',
          'private_verification.brinesearch_v18_lasso_core_destination_dependency(uuid)',
          'execute'
        )
     or pg_catalog.has_function_privilege(
          'service_role',
          'private_verification.brinesearch_v18_lasso_core_destination_dependency(uuid)',
          'execute'
        ) then
    raise exception 'Install-only dependency function security/grants failed';
  end if;

  select proc.* into strict v_proc from pg_catalog.pg_proc proc
  where proc.oid=
    'private_verification.brinesearch_v18_core_destination_release_proof_at_install(uuid)'::
      pg_catalog.regprocedure;
  select role.rolbypassrls into strict v_owner_bypasses_rls
  from pg_catalog.pg_roles role where role.oid=v_proc.proowner;
  if not v_proc.prosecdef or not v_proc.proisstrict
     or v_proc.provolatile<>'v' or not v_owner_bypasses_rls
     or v_proc.prolang<>(select language.oid
                        from pg_catalog.pg_language language
                        where language.lanname='plpgsql')
     or v_proc.proconfig is distinct from
       array['search_path=""','statement_timeout=90s','lock_timeout=500ms']::text[]
     or pg_catalog.has_function_privilege(
          'public',
          'private_verification.brinesearch_v18_core_destination_release_proof_at_install(uuid)',
          'execute'
        )
     or pg_catalog.has_function_privilege(
          'anon',
          'private_verification.brinesearch_v18_core_destination_release_proof_at_install(uuid)',
          'execute'
        )
     or pg_catalog.has_function_privilege(
          'authenticated',
          'private_verification.brinesearch_v18_core_destination_release_proof_at_install(uuid)',
          'execute'
        )
     or pg_catalog.has_function_privilege(
          'service_role',
          'private_verification.brinesearch_v18_core_destination_release_proof_at_install(uuid)',
          'execute'
        ) then
    raise exception 'Install-only release proof function security/grants failed';
  end if;

  select proc.* into strict v_proc from pg_catalog.pg_proc proc
  where proc.oid=
    'private_verification.brinesearch_v18_core_destination_release_receipt_active(uuid)'::
      pg_catalog.regprocedure;
  select role.rolbypassrls into strict v_owner_bypasses_rls
  from pg_catalog.pg_roles role where role.oid=v_proc.proowner;
  if not v_proc.prosecdef or not v_proc.proisstrict
     or v_proc.provolatile<>'s' or not v_owner_bypasses_rls
     or v_proc.prolang<>(select language.oid
                        from pg_catalog.pg_language language
                        where language.lanname='plpgsql')
     or v_proc.proconfig is distinct from
       array['search_path=""','statement_timeout=2s','lock_timeout=500ms']::text[]
     or pg_catalog.has_function_privilege(
          'public',
          'private_verification.brinesearch_v18_core_destination_release_receipt_active(uuid)',
          'execute'
        )
     or pg_catalog.has_function_privilege(
          'anon',
          'private_verification.brinesearch_v18_core_destination_release_receipt_active(uuid)',
          'execute'
        )
     or pg_catalog.has_function_privilege(
          'authenticated',
          'private_verification.brinesearch_v18_core_destination_release_receipt_active(uuid)',
          'execute'
        )
     or pg_catalog.has_function_privilege(
          'service_role',
          'private_verification.brinesearch_v18_core_destination_release_receipt_active(uuid)',
          'execute'
        ) then
    raise exception 'Runtime receipt gate function security/grants failed';
  end if;

  -- Preserve the independently recovered production wrapper contract exactly:
  -- SQL, STABLE, SECURITY DEFINER, and the existing bounded timeouts.
  select proc.* into strict v_proc from pg_catalog.pg_proc proc
  where proc.oid=
    'public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)'::
      pg_catalog.regprocedure;
  select role.rolbypassrls into strict v_owner_bypasses_rls
  from pg_catalog.pg_roles role where role.oid=v_proc.proowner;
  if not v_proc.prosecdef or v_proc.proisstrict
     or v_proc.provolatile<>'s' or not v_owner_bypasses_rls
     or v_proc.prolang<>(select language.oid
                        from pg_catalog.pg_language language
                        where language.lanname='sql')
     or v_proc.proconfig is distinct from
       array['search_path=""','statement_timeout=20s','lock_timeout=500ms']::text[]
     or pg_catalog.has_function_privilege(
          'public',
          'public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)',
          'execute'
        )
     or not pg_catalog.has_function_privilege(
          'anon',
          'public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)',
          'execute'
        )
     or not pg_catalog.has_function_privilege(
          'authenticated',
          'public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)',
          'execute'
        )
     or not pg_catalog.has_function_privilege(
          'service_role',
          'public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)',
          'execute'
        ) then
    raise exception 'Atomic wrapper function security/grants drifted';
  end if;

  select proc.* into strict v_proc from pg_catalog.pg_proc proc
  where proc.oid=
    'private_verification.brinesearch_v18_guard_private_core_destination_release()'::
      pg_catalog.regprocedure;
  if v_proc.prosecdef or v_proc.proisstrict or v_proc.provolatile<>'v'
     or v_proc.prolang<>(select language.oid
                        from pg_catalog.pg_language language
                        where language.lanname='plpgsql')
     or v_proc.proconfig is distinct from array['search_path=""']::text[]
     or pg_catalog.has_function_privilege(
          'public',
          'private_verification.brinesearch_v18_guard_private_core_destination_release()',
          'execute'
        )
     or pg_catalog.has_function_privilege(
          'anon',
          'private_verification.brinesearch_v18_guard_private_core_destination_release()',
          'execute'
        )
     or pg_catalog.has_function_privilege(
          'authenticated',
          'private_verification.brinesearch_v18_guard_private_core_destination_release()',
          'execute'
        )
     or pg_catalog.has_function_privilege(
          'service_role',
          'private_verification.brinesearch_v18_guard_private_core_destination_release()',
          'execute'
        ) then
    raise exception 'Private immutability trigger function is unsafe';
  end if;

  select proc.* into strict v_proc from pg_catalog.pg_proc proc
  where proc.oid=
    'private_verification.brinesearch_v18_guard_public_core_destination_release()'::
      pg_catalog.regprocedure;
  if v_proc.prosecdef or v_proc.proisstrict or v_proc.provolatile<>'v'
     or v_proc.prolang<>(select language.oid
                        from pg_catalog.pg_language language
                        where language.lanname='plpgsql')
     or v_proc.proconfig is distinct from array['search_path=""']::text[]
     or pg_catalog.has_function_privilege(
          'public',
          'private_verification.brinesearch_v18_guard_public_core_destination_release()',
          'execute'
        )
     or pg_catalog.has_function_privilege(
          'anon',
          'private_verification.brinesearch_v18_guard_public_core_destination_release()',
          'execute'
        )
     or pg_catalog.has_function_privilege(
          'authenticated',
          'private_verification.brinesearch_v18_guard_public_core_destination_release()',
          'execute'
        )
     or pg_catalog.has_function_privilege(
          'service_role',
          'private_verification.brinesearch_v18_guard_public_core_destination_release()',
          'execute'
        ) then
    raise exception 'Public immutability trigger function is unsafe';
  end if;

  if not exists(
       select 1 from pg_catalog.pg_trigger trg
       where trg.tgrelid=
         'private_verification.brinesearch_v18_core_destination_releases'::
           pg_catalog.regclass
         and trg.tgname=
           'brinesearch_v18_private_core_destination_release_immutable'
         and not trg.tgisinternal and trg.tgenabled='O'
         and trg.tgtype::integer=27
         and trg.tgfoid=
           'private_verification.brinesearch_v18_guard_private_core_destination_release()'::
             pg_catalog.regprocedure
     )
     or not exists(
       select 1 from pg_catalog.pg_trigger trg
       where trg.tgrelid=
         'public.brinesearch_driver_core_destination_releases_public'::
           pg_catalog.regclass
         and trg.tgname=
           'brinesearch_v18_public_core_destination_release_immutable'
         and not trg.tgisinternal and trg.tgenabled='O'
         and trg.tgtype::integer=27
         and trg.tgfoid=
           'private_verification.brinesearch_v18_guard_public_core_destination_release()'::
             pg_catalog.regprocedure
     ) then
    raise exception 'Frozen release immutability triggers are absent or disabled';
  end if;

  select pg_catalog.to_jsonb(receipt) into strict v_private_before
  from private_verification.brinesearch_v18_core_destination_releases receipt
  where receipt.pad_id=v_lasso;
  select pg_catalog.to_jsonb(projection) into strict v_public_before
  from public.brinesearch_driver_core_destination_releases_public projection
  where projection.pad_id=v_lasso;

  v_guarded:=false;
  begin
    update private_verification.brinesearch_v18_core_destination_releases
    set record_revision=record_revision||'-forbidden'
    where pad_id=v_lasso;
  exception when sqlstate '55000' then
    v_guarded:=true;
  end;
  if not v_guarded then
    raise exception 'Private frozen release accepted an unauthorized update';
  end if;

  v_guarded:=false;
  begin
    update private_verification.brinesearch_v18_core_destination_releases
    set revoked_at='2026-08-26T16:45:39Z'::timestamptz,
        authorization_basis=authorization_basis||' forbidden'
    where pad_id=v_lasso;
  exception when sqlstate '55000' then
    v_guarded:=true;
  end;
  if not v_guarded then
    raise exception 'Private revocation changed other frozen release content';
  end if;

  v_guarded:=false;
  begin
    delete from private_verification.brinesearch_v18_core_destination_releases
    where pad_id=v_lasso;
  exception when sqlstate '55000' then
    v_guarded:=true;
  end;
  if not v_guarded then
    raise exception 'Private frozen release accepted a delete';
  end if;

  v_guarded:=false;
  begin
    update public.brinesearch_driver_core_destination_releases_public
    set record_revision=record_revision||'-forbidden'
    where pad_id=v_lasso;
  exception when sqlstate '55000' then
    v_guarded:=true;
  end;
  if not v_guarded then
    raise exception 'Public frozen release accepted an update';
  end if;

  v_guarded:=false;
  begin
    delete from public.brinesearch_driver_core_destination_releases_public
    where pad_id=v_lasso;
  exception when sqlstate '55000' then
    v_guarded:=true;
  end;
  if not v_guarded then
    raise exception 'Public frozen release accepted a delete';
  end if;

  -- Explicit revocation is the one allowed private-row transition.  Exercise it
  -- inside a subtransaction, prove driver reads fail closed, then roll it back.
  begin
    update private_verification.brinesearch_v18_core_destination_releases
    set revoked_at='2026-08-26T16:45:39Z'::timestamptz
    where pad_id=v_lasso;
    if not found
       or private_verification.brinesearch_v18_core_destination_release_receipt_active(
            v_lasso
          ) is not false
       or public.brinesearch_v18_driver_core_destination_release(v_lasso)
            is not null then
      raise exception 'Explicit release revocation did not fail closed';
    end if;
    raise exception using
      errcode='ZX201',message='rollback explicit revocation proof';
  exception when sqlstate 'ZX201' then
    null;
  end;
  if (select pg_catalog.to_jsonb(receipt)
      from private_verification.brinesearch_v18_core_destination_releases receipt
      where receipt.pad_id=v_lasso) is distinct from v_private_before
     or (select pg_catalog.to_jsonb(projection)
         from public.brinesearch_driver_core_destination_releases_public projection
         where projection.pad_id=v_lasso) is distinct from v_public_before
     or private_verification.brinesearch_v18_core_destination_release_receipt_active(
          v_lasso
        ) is not true
     or public.brinesearch_v18_driver_core_destination_release(v_lasso) is null then
    raise exception 'Immutability/revocation tests left a persistent row delta';
  end if;

  v_cologie_bundle:=
    public.brinesearch_v18_driver_pad_status_with_google_handoff(v_cologie);
  if v_cologie_bundle is distinct from
       (select cologie_bundle from tmp_issue97_lasso_before) then
    raise exception 'Cologie public contract changed';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
        pg_catalog.to_jsonb(build)::text,'|' order by build.id
      ),'')) from public.brinesearch_road_graph_builds build)
       is distinct from (select graph_digest from tmp_issue97_lasso_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
        pg_catalog.to_jsonb(route)::text,'|' order by route.id
      ),'')) from public.brinesearch_route_prep route
        where route.pad_id<>v_lasso)
       is distinct from (select non_target_route_digest from tmp_issue97_lasso_before) then
    raise exception 'LASSO release changed a graph or non-target route';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
        pg_catalog.to_jsonb(route)::text,'|' order by route.pad_id
      ),'')) from public.brinesearch_driver_google_routes_public route)
       is distinct from (select public_google_route_digest from tmp_issue97_lasso_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
        pg_catalog.to_jsonb(handoff)::text,'|' order by handoff.pad_id
      ),'')) from public.brinesearch_driver_google_handoffs_public handoff)
       is distinct from (select public_google_handoff_digest from tmp_issue97_lasso_before)
     or (select count(*) from public.brinesearch_driver_google_routes_public)
       is distinct from (select public_google_route_count from tmp_issue97_lasso_before)
     or (select count(*) from public.brinesearch_driver_google_handoffs_public)
       is distinct from (select public_google_handoff_count from tmp_issue97_lasso_before)
     or (select cutover_at from public.brinesearch_issue97_release_state where singleton)
       is distinct from (select cutover_at from tmp_issue97_lasso_before) then
    raise exception 'LASSO release changed existing Google publication or cutover';
  end if;
end
$verify_install$;

comment on table private_verification.brinesearch_v18_core_destination_releases is
'One private frozen release per pad for exact public-road geometry ending at a handoff plus a separate saved pad GPS. The pad_id primary key is not a revision history; replacement requires explicit revocation and a separately reviewed migration. No connector geometry or private-road approval is permitted.';

comment on table public.brinesearch_driver_core_destination_releases_public is
'One immutable sanitized public projection per pad of the frozen exact-road-core plus saved-GPS destination release. Private evidence and authorization text are never exposed.';
