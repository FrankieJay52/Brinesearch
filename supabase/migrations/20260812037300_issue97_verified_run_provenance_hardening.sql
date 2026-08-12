-- GitHub #97 — verified source-run provenance hardening.
--
-- A newer failed retry with the same immutable source fingerprint may leave the prior
-- verified generation current. Receipts must bind that VERIFIED run, never the failed
-- retry id. This keeps source freshness and receipt provenance consistent.

create or replace function private_verification.brinesearch_issue97_current_verified_run_id(
  p_dataset_id uuid,
  p_state_code text,
  p_county_code text
)
returns uuid
language sql
stable
security definer
set search_path=''
as $$
  select case
    when private_verification.brinesearch_issue97_dataset_scope_current(
      p_dataset_id,p_state_code,p_county_code
    ) then (
      select r.id
      from public.brinesearch_road_source_ingest_runs r
      where r.dataset_id=p_dataset_id
        and r.state_code=p_state_code
        and r.county_code=p_county_code
        and private_verification.brinesearch_issue97_ingest_run_verified(r.id)
      order by r.started_at desc,r.id desc
      limit 1
    )
    else null
  end
$$;

revoke all on function private_verification.brinesearch_issue97_current_verified_run_id(uuid,text,text)
from public,anon,authenticated;
grant execute on function private_verification.brinesearch_issue97_current_verified_run_id(uuid,text,text)
to service_role;

comment on function private_verification.brinesearch_issue97_current_verified_run_id(uuid,text,text) is
  'Issue #97 current source-generation selector. Returns the newest verified-complete run only when the dataset scope is current. A compatible newer failed retry never becomes receipt provenance.';

-- Future graph builds freeze the verified generation, not the newest attempt.
do $issue97_patch_graph_verified_run_vector$
declare
  v_definition text;
  v_old text:=$old$
    join lateral (
      select r.* from public.brinesearch_road_source_ingest_runs r
      where r.dataset_id=required.dataset_id and r.state_code=required.state_code
        and r.county_code=required.county_code
      order by r.started_at desc,r.id desc limit 1
    ) run on true
$old$;
  v_new text:=$new$
    join lateral (
      select r.* from public.brinesearch_road_source_ingest_runs r
      where r.dataset_id=required.dataset_id and r.state_code=required.state_code
        and r.county_code=required.county_code
        and r.id=private_verification.brinesearch_issue97_current_verified_run_id(
          required.dataset_id,required.state_code,required.county_code
        )
        and private_verification.brinesearch_issue97_ingest_run_verified(r.id)
      order by r.started_at desc,r.id desc limit 1
    ) run on true
$new$;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 verified graph-run patch target changed unexpectedly: %',v_count;
  end if;
  execute pg_catalog.replace(v_definition,v_old,v_new);
end
$issue97_patch_graph_verified_run_vector$;

-- A graph is current only when every frozen source id is the current VERIFIED run.
do $issue97_patch_graph_current_verified_run$
declare
  v_definition text;
  v_old text:=$old$
          and r.id=(select latest.id
            from public.brinesearch_road_source_ingest_runs latest
            where latest.dataset_id=r.dataset_id and latest.state_code=r.state_code
              and latest.county_code=r.county_code
            order by latest.started_at desc,latest.id desc limit 1)
          and private_verification.brinesearch_issue97_dataset_scope_current(
            r.dataset_id,r.state_code,r.county_code
          )
$old$;
  v_new text:=$new$
          and private_verification.brinesearch_issue97_ingest_run_verified(r.id)
          and r.id=private_verification.brinesearch_issue97_current_verified_run_id(
            r.dataset_id,r.state_code,r.county_code
          )
          and private_verification.brinesearch_issue97_dataset_scope_current(
            r.dataset_id,r.state_code,r.county_code
          )
$new$;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_graph_build_sources_current(uuid)'::pg_catalog.regprocedure
  ) into v_definition;
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 graph-current verified-run patch target changed unexpectedly: %',v_count;
  end if;
  execute pg_catalog.replace(v_definition,v_old,v_new);
end
$issue97_patch_graph_current_verified_run$;

-- Activation compares the frozen vector to the current VERIFIED generation.
do $issue97_patch_graph_activation_verified_run$
declare
  v_definition text;
  v_old text:=$old$
    select r.id into v_latest_run
    from public.brinesearch_road_source_ingest_runs r
    where r.dataset_id=(v_source_entry->>'dataset_id')::uuid
      and r.state_code=v_source_entry->>'state_code'
      and r.county_code=v_source_entry->>'county_code'
    order by r.started_at desc,r.id desc limit 1;
$old$;
  v_new text:=$new$
    v_latest_run:=private_verification.brinesearch_issue97_current_verified_run_id(
      (v_source_entry->>'dataset_id')::uuid,
      v_source_entry->>'state_code',
      v_source_entry->>'county_code'
    );
$new$;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_activate_graph_build(uuid,text,jsonb)'::pg_catalog.regprocedure
  ) into v_definition;
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 graph-activation verified-run patch target changed unexpectedly: %',v_count;
  end if;
  execute pg_catalog.replace(v_definition,v_old,v_new);
end
$issue97_patch_graph_activation_verified_run$;

create or replace function private_verification.brinesearch_issue97_transition_google_dependency(
  p_pad_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_pad record;
  v_route record;
  v_route_count integer:=0;
  v_occ_count integer:=0;
  v_geom_count integer:=0;
  v_transition_count integer:=0;
  v_source_count integer:=0;
  v_safety jsonb;
  v_safety_digest text;
  v_source_dependency text;
  v_dependency text;
begin
  select p.* into v_pad from public.pads p where p.id=p_pad_id;
  if not found or coalesce(v_pad.list_only,false) then return null; end if;
  if v_pad.latitude is null or v_pad.longitude is null
     or v_pad.latitude not between -90 and 90
     or v_pad.longitude not between -180 and 180 then return null; end if;

  select count(*)::integer into v_route_count
  from public.brinesearch_route_prep r
  where r.pad_id=p_pad_id and r.active and r.route_group='primary';
  if v_route_count<>1 then return null; end if;
  select r.* into strict v_route
  from public.brinesearch_route_prep r
  where r.pad_id=p_pad_id and r.active and r.route_group='primary'
  limit 1;
  if v_route.readiness_status<>'ready_for_road_matching' then return null; end if;

  select count(*)::integer into v_occ_count
  from private_verification.brinesearch_route_occurrence_receipts_issue97 o
  where o.route_prep_id=v_route.id;
  if v_occ_count<2 then return null; end if;
  if exists(
    select 1
    from private_verification.brinesearch_route_occurrence_receipts_issue97 o
    left join public.brinesearch_authoritative_road_identities i
      on i.id=o.identity_id and i.active
    left join public.brinesearch_road_identity_mappings m
      on m.identity_id=o.identity_id and m.road_id=o.canonical_road_id
      and m.mapping_status='verified'
    where o.route_prep_id=v_route.id and (
      o.resolution_status<>'resolved'
      or o.identity_id is null or o.canonical_road_id is null
      or i.id is null or m.id is null
      or o.mapping_fingerprint is distinct from
        private_verification.brinesearch_issue97_mapping_fingerprint(o.identity_id)
      or o.source_digest is distinct from i.source_digest
      or not private_verification.brinesearch_issue97_dataset_scope_current(
        i.dataset_id,i.state_code,i.county_code
      )
    )
  ) then return null; end if;

  select count(*)::integer into v_geom_count
  from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
  where g.route_prep_id=v_route.id;
  if v_geom_count<>v_occ_count then return null; end if;
  if exists(
    select 1
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
    join private_verification.brinesearch_route_occurrence_receipts_issue97 o
      on o.route_prep_id=g.route_prep_id and o.occurrence_index=g.occurrence_index
    where g.route_prep_id=v_route.id and (
      g.status<>'resolved'
      or g.identity_id is distinct from o.identity_id
      or g.road_id is distinct from o.canonical_road_id
      or g.road_geometry_digest is distinct from
        private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(g.identity_id)
      or (g.occurrence_index=1 and (
        g.occurrence_role<>'origin_anchor' or g.end_coordinate is null
      ))
      or (g.occurrence_index>1 and (
        g.occurrence_role<>'traveled' or g.step_geometry is null
        or g.start_coordinate is null or g.end_coordinate is null
        or extensions.geometrytype(g.step_geometry)<>'LINESTRING'
        or not extensions.st_isvalid(g.step_geometry)
        or not extensions.st_issimple(g.step_geometry)
      ))
    )
  ) then return null; end if;
  if exists(
    select 1
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 a
    join private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 b
      on b.route_prep_id=a.route_prep_id and b.occurrence_index=a.occurrence_index+1
    where a.route_prep_id=v_route.id
      and not extensions.st_dwithin(
        a.end_coordinate::extensions.geography,
        b.start_coordinate::extensions.geography,1
      )
  ) then return null; end if;
  if not exists(
    select 1
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
    where g.route_prep_id=v_route.id and g.occurrence_index=v_occ_count and g.status='resolved'
      and extensions.st_dwithin(
        g.end_coordinate::extensions.geography,
        extensions.st_setsrid(
          extensions.st_makepoint(v_pad.longitude,v_pad.latitude),4326
        )::extensions.geography,1
      )
  ) then return null; end if;

  select count(*)::integer into v_transition_count
  from private_verification.brinesearch_route_transition_receipts_issue97 t
  where t.route_prep_id=v_route.id;
  if v_transition_count<>v_occ_count-1 then return null; end if;
  if exists(
    select 1
    from private_verification.brinesearch_route_transition_receipts_issue97 t
    left join public.brinesearch_road_junctions j on j.id=t.junction_id
    left join public.brinesearch_road_junction_anchors a on a.id=t.anchor_id
    left join public.brinesearch_road_graph_builds b on b.id=t.graph_build_id
    where t.route_prep_id=v_route.id and (
      t.status<>'resolved' or t.coordinate is null
      or t.junction_id is null or t.anchor_id is null or t.graph_build_id is null
      or t.anchor_digest is null or t.graph_digest is null or t.source_revision_digest is null
      or j.id is null or a.id is null or b.id is null
      or j.build_id is distinct from t.graph_build_id
      or a.junction_id is distinct from t.junction_id
      or t.graph_digest is distinct from j.graph_digest
      or t.anchor_digest is distinct from a.anchor_digest
      or t.source_revision_digest is distinct from b.source_revision_digest
      or b.status<>'active'
      or not private_verification.brinesearch_issue97_graph_build_sources_current(t.graph_build_id)
    )
  ) then return null; end if;

  with current_sources as (
    select o.occurrence_index,i.id as identity_id,i.dataset_id,i.state_code,i.county_code,
      run.id as run_id,run.details->>'page_set_digest' as page_set_digest
    from private_verification.brinesearch_route_occurrence_receipts_issue97 o
    join public.brinesearch_authoritative_road_identities i on i.id=o.identity_id and i.active
    join lateral (
      select private_verification.brinesearch_issue97_current_verified_run_id(
        i.dataset_id,i.state_code,i.county_code
      ) as run_id
    ) current_run on current_run.run_id is not null
    join public.brinesearch_road_source_ingest_runs run
      on run.id=current_run.run_id
      and private_verification.brinesearch_issue97_ingest_run_verified(run.id)
    where o.route_prep_id=v_route.id and o.occurrence_index>1
      and private_verification.brinesearch_issue97_dataset_scope_current(
        i.dataset_id,i.state_code,i.county_code
      )
  )
  select count(*)::integer,
    pg_catalog.string_agg(
      occurrence_index::text||':'||identity_id::text||':'||run_id::text||':'||
        coalesce(page_set_digest,''),
      '|' order by occurrence_index
    )
  into v_source_count,v_source_dependency
  from current_sources;
  if v_source_count<>v_occ_count-1 or v_source_dependency is null then return null; end if;

  v_safety:=private_verification.brinesearch_issue97_pad_safety_facts(p_pad_id);
  v_safety_digest:=pg_catalog.md5(coalesce(v_safety,'{}'::jsonb)::text);
  if coalesce((v_safety->>'has_hold')::boolean,false) then return null; end if;
  if private_verification.brinesearch_issue97_route_data_blocked(p_pad_id) then return null; end if;

  v_dependency:=pg_catalog.md5(pg_catalog.concat_ws('|',
    v_route.id::text,coalesce(v_route.source_sequence_hash,''),
    pg_catalog.round(v_pad.latitude::numeric,7)::text,
    pg_catalog.round(v_pad.longitude::numeric,7)::text,
    coalesce((select pg_catalog.string_agg(o.receipt_digest,'|' order by o.occurrence_index)
      from private_verification.brinesearch_route_occurrence_receipts_issue97 o
      where o.route_prep_id=v_route.id),''),
    coalesce((select pg_catalog.string_agg(g.receipt_digest,'|' order by g.occurrence_index)
      from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
      where g.route_prep_id=v_route.id),''),
    coalesce((select pg_catalog.string_agg(t.receipt_digest,'|' order by t.boundary_index)
      from private_verification.brinesearch_route_transition_receipts_issue97 t
      where t.route_prep_id=v_route.id),''),
    v_source_dependency,v_safety_digest
  ));
  return v_dependency;
end
$$;

revoke all on function private_verification.brinesearch_issue97_transition_google_dependency(uuid)
from public,anon,authenticated;
grant execute on function private_verification.brinesearch_issue97_transition_google_dependency(uuid)
to service_role;

-- Install-time proof: future graph/source code must reference the verified-run selector.
do $issue97_assert_verified_run_provenance$
declare
  v_build text:=pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  );
  v_current text:=pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_graph_build_sources_current(uuid)'::pg_catalog.regprocedure
  );
  v_activate text:=pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_activate_graph_build(uuid,text,jsonb)'::pg_catalog.regprocedure
  );
begin
  if v_build not ilike '%brinesearch_issue97_current_verified_run_id%'
     or v_current not ilike '%brinesearch_issue97_current_verified_run_id%'
     or v_activate not ilike '%brinesearch_issue97_current_verified_run_id%'
  then
    raise exception 'Issue #97 verified source-run provenance hardening did not install cleanly';
  end if;
end
$issue97_assert_verified_run_provenance$;
