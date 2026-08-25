-- GitHub #97 — keep exact V18 route reads inside their existing execution budget.
--
-- COLOGIE has six exact route occurrences on one active Harrison County graph.
-- The reviewed route was already correct, but the read path repeatedly proved the
-- same source scopes once per name row and the same graph once per transition.
-- Materialize each distinct proof input once. This migration changes functions
-- only: it does not change pads, routes, receipts, graphs, or Google publication.

create or replace function private_verification.brinesearch_issue97_identity_driver_name(
  p_identity_id uuid
)
returns text
language sql
stable
security definer
set search_path=''
as $$
  with identity as materialized (
    select i.id,i.display_name,i.state_code,i.county_code
    from public.brinesearch_authoritative_road_identities i
    where i.id=p_identity_id and i.active
  ),
  candidate_names as materialized (
    select n.road_name,n.name_type,n.source_dataset_id,
      i.state_code,i.county_code
    from identity i
    join public.brinesearch_authoritative_road_names n
      on n.identity_id=i.id
    where n.active
      and (n.valid_from is null or n.valid_from<=now())
      and (n.valid_to is null or n.valid_to>now())
  ),
  current_scopes as materialized (
    select scope.source_dataset_id,scope.state_code,scope.county_code,
      private_verification.brinesearch_issue97_dataset_scope_current(
        scope.source_dataset_id,scope.state_code,scope.county_code
      ) as scope_current
    from (
      select distinct n.source_dataset_id,n.state_code,n.county_code
      from candidate_names n
    ) scope
  )
  select coalesce((
    select n.road_name
    from candidate_names n
    join current_scopes scope
      on scope.source_dataset_id is not distinct from n.source_dataset_id
     and scope.state_code is not distinct from n.state_code
     and scope.county_code is not distinct from n.county_code
    where scope.scope_current
    order by case n.name_type
      when 'official' then 1 when 'signed' then 2 when 'local' then 3
      when '911' then 4 when 'alternate' then 5 when 'legacy' then 6 else 7 end,
      n.road_name
    limit 1
  ),i.display_name)
  from identity i
$$;

create or replace function private_verification.brinesearch_issue97_identity_aliases(
  p_identity_id uuid,
  p_road_id uuid default null
)
returns text[]
language sql
stable
security definer
set search_path=''
as $$
  with identity as materialized (
    select i.id,i.display_name,i.route_system,i.route_number,
      i.route_suffix,i.route_fraction,i.route_extension,
      i.state_code,i.county_code
    from public.brinesearch_authoritative_road_identities i
    where i.id=p_identity_id
  ),
  candidate_names as materialized (
    select n.road_name,n.source_dataset_id,i.state_code,i.county_code
    from identity i
    join public.brinesearch_authoritative_road_names n
      on n.identity_id=i.id
    where n.active
      and (n.valid_from is null or n.valid_from<=now())
      and (n.valid_to is null or n.valid_to>now())
  ),
  current_scopes as materialized (
    select scope.source_dataset_id,scope.state_code,scope.county_code,
      private_verification.brinesearch_issue97_dataset_scope_current(
        scope.source_dataset_id,scope.state_code,scope.county_code
      ) as scope_current
    from (
      select distinct n.source_dataset_id,n.state_code,n.county_code
      from candidate_names n
    ) scope
  )
  select coalesce(array(
    select distinct value
    from (
      select i.display_name as value
      from identity i
      union all
      select pg_catalog.btrim(pg_catalog.concat_ws(' ',i.route_system,i.route_number,
        nullif(i.route_suffix,''),nullif(i.route_fraction,''),nullif(i.route_extension,'')))
      from identity i
      union all
      select n.road_name
      from candidate_names n
      join current_scopes scope
        on scope.source_dataset_id is not distinct from n.source_dataset_id
       and scope.state_code is not distinct from n.state_code
       and scope.county_code is not distinct from n.county_code
      where scope.scope_current
      union all
      select r.canonical_name from public.brinesearch_roads r where r.id=p_road_id
      union all
      select unnest(coalesce(r.aliases,'{}'::text[]))
      from public.brinesearch_roads r where r.id=p_road_id
    ) names
    where nullif(pg_catalog.btrim(coalesce(value,'')),'') is not null
    order by value
  ),'{}'::text[])
$$;

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
    )
  ) then return null; end if;
  if exists(
    with graph_refs as materialized (
      select distinct t.graph_build_id
      from private_verification.brinesearch_route_transition_receipts_issue97 t
      where t.route_prep_id=v_route.id
    )
    select 1
    from graph_refs graph_ref
    where not private_verification.brinesearch_issue97_graph_build_release_current_contextual(
      graph_ref.graph_build_id
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

revoke all on function private_verification.brinesearch_issue97_identity_driver_name(uuid)
from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_identity_aliases(uuid,uuid)
from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_transition_google_dependency(uuid)
from public,anon,authenticated,service_role;

do $issue97_cologie_query_shape_assertions$
declare
  v_driver text;
  v_aliases text;
  v_dependency text;
  v_status_config text[];
  v_choices_config text[];
begin
  v_driver:=pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_identity_driver_name(uuid)'::pg_catalog.regprocedure
  );
  v_aliases:=pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_identity_aliases(uuid,uuid)'::pg_catalog.regprocedure
  );
  v_dependency:=pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_transition_google_dependency(uuid)'::pg_catalog.regprocedure
  );

  if pg_catalog.strpos(pg_catalog.lower(v_driver),'candidate_names as materialized')=0
     or pg_catalog.strpos(pg_catalog.lower(v_driver),'current_scopes as materialized')=0
     or pg_catalog.strpos(pg_catalog.lower(v_driver),'select distinct n.source_dataset_id')=0 then
    raise exception 'COLOGIE driver-name scope materialization is missing';
  end if;
  if pg_catalog.strpos(pg_catalog.lower(v_aliases),'candidate_names as materialized')=0
     or pg_catalog.strpos(pg_catalog.lower(v_aliases),'current_scopes as materialized')=0
     or pg_catalog.strpos(pg_catalog.lower(v_aliases),'select distinct n.source_dataset_id')=0 then
    raise exception 'COLOGIE alias scope materialization is missing';
  end if;
  if pg_catalog.strpos(pg_catalog.lower(v_dependency),'graph_refs as materialized')=0
     or pg_catalog.strpos(pg_catalog.lower(v_dependency),'select distinct t.graph_build_id')=0 then
    raise exception 'COLOGIE graph-reference materialization is missing';
  end if;

  select p.proconfig into v_status_config
  from pg_catalog.pg_proc p
  where p.oid='public.brinesearch_v18_driver_pad_status(uuid)'::pg_catalog.regprocedure
    and p.prosecdef and p.provolatile='s';
  select p.proconfig into v_choices_config
  from pg_catalog.pg_proc p
  where p.oid='public.brinesearch_v18_driver_route_choices(uuid)'::pg_catalog.regprocedure
    and p.prosecdef and p.provolatile='s';
  if v_status_config is null
     or not ('search_path=""'=any(v_status_config))
     or not ('statement_timeout=12s'=any(v_status_config))
     or not ('lock_timeout=500ms'=any(v_status_config)) then
    raise exception 'V18 driver status execution boundary changed unexpectedly';
  end if;
  if v_choices_config is null
     or not ('search_path=""'=any(v_choices_config))
     or not ('statement_timeout=12s'=any(v_choices_config))
     or not ('lock_timeout=500ms'=any(v_choices_config)) then
    raise exception 'V18 route-choice execution boundary changed unexpectedly';
  end if;
end
$issue97_cologie_query_shape_assertions$;

comment on function private_verification.brinesearch_issue97_identity_driver_name(uuid) is
  'Issue #97 exact driver road name. Currentness is proved once per distinct source scope; name precedence and fallback are unchanged.';
comment on function private_verification.brinesearch_issue97_identity_aliases(uuid,uuid) is
  'Issue #97 exact road aliases. Currentness is proved once per distinct source scope; exact alias contents and ordering are unchanged.';
comment on function private_verification.brinesearch_issue97_transition_google_dependency(uuid) is
  'Issue #97 private dark-route dependency digest. Receipt semantics are unchanged; release currentness is proved once per distinct referenced graph.';
