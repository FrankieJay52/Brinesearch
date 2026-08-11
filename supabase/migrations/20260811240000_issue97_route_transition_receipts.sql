-- GitHub #97 — automatic exact transition/junction receipts for every active route.
--
-- This stage consumes only resolved occurrence identities from the #97 corpus
-- reconciliation layer. It never chooses a turn boundary by road-name
-- similarity, nearest-road search or a generic route number. A normal boundary
-- is publishable only when one current verified physical graph anchor supports
-- both exact authoritative identities and both mapped canonical centerlines.
-- Shared-segment A -> B -> A cases are resolved from ordered route context and
-- the outer road's source-backed centerline; otherwise they stay held.

create table private_verification.brinesearch_route_transition_receipts_issue97 (
  route_prep_id uuid not null references public.brinesearch_route_prep(id) on delete cascade,
  pad_id uuid not null references public.pads(id) on delete cascade,
  route_group text not null,
  variant_index integer not null,
  boundary_index integer not null,
  left_route_prep_step_id uuid not null references public.brinesearch_route_prep_steps(id) on delete cascade,
  right_route_prep_step_id uuid not null references public.brinesearch_route_prep_steps(id) on delete cascade,
  left_identity_id uuid not null references public.brinesearch_authoritative_road_identities(id) on delete restrict,
  right_identity_id uuid not null references public.brinesearch_authoritative_road_identities(id) on delete restrict,
  left_road_id uuid not null references public.brinesearch_roads(id) on delete restrict,
  right_road_id uuid not null references public.brinesearch_roads(id) on delete restrict,
  status text not null,
  resolution_method text,
  hold_reason text,
  junction_id uuid references public.brinesearch_road_junctions(id) on delete restrict,
  anchor_id uuid references public.brinesearch_road_junction_anchors(id) on delete restrict,
  anchor_role text,
  coordinate extensions.geometry(Point,4326),
  candidate_count integer not null default 0,
  graph_build_id uuid references public.brinesearch_road_graph_builds(id) on delete restrict,
  graph_digest text,
  source_revision_digest text,
  anchor_digest text,
  dependency_digest text not null,
  evidence jsonb not null default '{}'::jsonb,
  receipt_digest text not null,
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(route_prep_id,boundary_index),
  unique(left_route_prep_step_id,right_route_prep_step_id),
  constraint brinesearch_route_transition_status_issue97_check
    check(status in ('resolved','held','stale')),
  constraint brinesearch_route_transition_no_guess_issue97_check
    check(coalesce(resolution_method,'') not in (
      'name_only','fuzzy_name','nearest_road','route_number_only','closest_anchor'
    )),
  constraint brinesearch_route_transition_resolved_issue97_check check(
    status<>'resolved' or (
      hold_reason is null and junction_id is not null and anchor_id is not null
      and coordinate is not null and graph_build_id is not null
      and graph_digest is not null and source_revision_digest is not null
      and anchor_digest is not null and resolved_at is not null
    )
  ),
  constraint brinesearch_route_transition_held_issue97_check
    check(status<>'held' or nullif(hold_reason,'') is not null),
  constraint brinesearch_route_transition_coordinate_issue97_check check(
    coordinate is null or (
      not extensions.st_isempty(coordinate)
      and extensions.geometrytype(coordinate)='POINT'
      and extensions.st_srid(coordinate)=4326
      and extensions.st_coveredby(
        coordinate,extensions.st_makeenvelope(-180,-90,180,90,4326)
      )
    )
  ),
  constraint brinesearch_route_transition_digest_issue97_check
    check(dependency_digest~'^[0-9a-f]{32}$' and receipt_digest~'^[0-9a-f]{32}$')
);

create index brinesearch_route_transition_status_issue97_idx
on private_verification.brinesearch_route_transition_receipts_issue97(status,hold_reason);
create index brinesearch_route_transition_pad_issue97_idx
on private_verification.brinesearch_route_transition_receipts_issue97(pad_id,route_group,variant_index,boundary_index);

create table private_verification.brinesearch_route_transition_history_issue97 (
  id bigint generated always as identity primary key,
  route_prep_id uuid not null,
  pad_id uuid not null,
  route_group text not null,
  variant_index integer not null,
  boundary_index integer not null,
  left_route_prep_step_id uuid not null,
  right_route_prep_step_id uuid not null,
  left_identity_id uuid not null,
  right_identity_id uuid not null,
  left_road_id uuid not null,
  right_road_id uuid not null,
  status text not null,
  resolution_method text,
  hold_reason text,
  junction_id uuid,
  anchor_id uuid,
  anchor_role text,
  coordinate jsonb,
  candidate_count integer not null,
  graph_build_id uuid,
  graph_digest text,
  source_revision_digest text,
  anchor_digest text,
  dependency_digest text not null,
  evidence jsonb not null,
  receipt_digest text not null,
  recorded_at timestamptz not null default now(),
  unique(route_prep_id,boundary_index,receipt_digest),
  constraint brinesearch_route_transition_history_status_issue97_check
    check(status in ('resolved','held','stale')),
  constraint brinesearch_route_transition_history_digest_issue97_check
    check(dependency_digest~'^[0-9a-f]{32}$' and receipt_digest~'^[0-9a-f]{32}$')
);

alter table private_verification.brinesearch_route_transition_receipts_issue97 enable row level security;
alter table private_verification.brinesearch_route_transition_receipts_issue97 force row level security;
alter table private_verification.brinesearch_route_transition_history_issue97 enable row level security;
alter table private_verification.brinesearch_route_transition_history_issue97 force row level security;
revoke all on private_verification.brinesearch_route_transition_receipts_issue97 from public,anon,authenticated,service_role;
revoke all on private_verification.brinesearch_route_transition_history_issue97 from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_write_transition_history(
  p_route_prep_id uuid,
  p_boundary_index integer
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into private_verification.brinesearch_route_transition_history_issue97(
    route_prep_id,pad_id,route_group,variant_index,boundary_index,
    left_route_prep_step_id,right_route_prep_step_id,left_identity_id,right_identity_id,
    left_road_id,right_road_id,status,resolution_method,hold_reason,junction_id,anchor_id,
    anchor_role,coordinate,candidate_count,graph_build_id,graph_digest,source_revision_digest,
    anchor_digest,dependency_digest,evidence,receipt_digest
  )
  select route_prep_id,pad_id,route_group,variant_index,boundary_index,
    left_route_prep_step_id,right_route_prep_step_id,left_identity_id,right_identity_id,
    left_road_id,right_road_id,status,resolution_method,hold_reason,junction_id,anchor_id,
    anchor_role,
    case when coordinate is null then null else
      pg_catalog.jsonb_build_array(extensions.st_x(coordinate),extensions.st_y(coordinate)) end,
    candidate_count,graph_build_id,graph_digest,source_revision_digest,anchor_digest,
    dependency_digest,evidence,receipt_digest
  from private_verification.brinesearch_route_transition_receipts_issue97
  where route_prep_id=p_route_prep_id and boundary_index=p_boundary_index
  on conflict(route_prep_id,boundary_index,receipt_digest) do nothing;
end
$$;
revoke all on function private_verification.brinesearch_issue97_write_transition_history(uuid,integer)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_refresh_transition_receipts(
  p_route_prep_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_route record;
  v_count integer:=0;
  v_i integer;
  v_left record;
  v_right record;
  v_left_geom extensions.geometry;
  v_right_geom extensions.geometry;
  v_candidate_count integer:=0;
  v_candidate record;
  v_evidence jsonb;
  v_dependency text;
  v_receipt text;
  v_hold text;
  v_shared_junctions integer:=0;
  v_previous extensions.geometry;
  v_next extensions.geometry;
  v_shared_a record;
  v_shared_b record;
  v_outer_geom extensions.geometry;
  v_line extensions.geometry;
  v_component_count integer:=0;
  v_prev_snap extensions.geometry;
  v_next_snap extensions.geometry;
  v_a_snap extensions.geometry;
  v_b_snap extensions.geometry;
  v_fp double precision;
  v_fn double precision;
  v_fa double precision;
  v_fb double precision;
  v_entry record;
  v_exit record;
begin
  select p.* into strict v_route from public.brinesearch_route_prep p where p.id=p_route_prep_id;
  if not v_route.active then
    update private_verification.brinesearch_route_transition_receipts_issue97
      set status='stale',hold_reason='route_prep_inactive',resolved_at=null,updated_at=now(),
        receipt_digest=pg_catalog.md5(dependency_digest||'|stale|route_prep_inactive')
    where route_prep_id=p_route_prep_id;
    return pg_catalog.jsonb_build_object('route_prep_id',p_route_prep_id,'status','stale');
  end if;

  select count(*) into v_count
  from private_verification.brinesearch_route_occurrence_receipts_issue97
  where route_prep_id=p_route_prep_id;
  if v_count<2 then
    delete from private_verification.brinesearch_route_transition_receipts_issue97
    where route_prep_id=p_route_prep_id;
    return pg_catalog.jsonb_build_object(
      'route_prep_id',p_route_prep_id,'road_occurrences',v_count,'transitions',0,
      'status',case when v_count=1 then 'no_internal_transition' else 'no_road_occurrences' end
    );
  end if;

  if exists(
    select 1 from private_verification.brinesearch_route_occurrence_receipts_issue97
    where route_prep_id=p_route_prep_id
      and (resolution_status<>'resolved' or canonical_road_id is null or identity_id is null)
  ) then
    delete from private_verification.brinesearch_route_transition_receipts_issue97
    where route_prep_id=p_route_prep_id;
    return pg_catalog.jsonb_build_object(
      'route_prep_id',p_route_prep_id,'road_occurrences',v_count,'transitions',v_count-1,
      'status','held','reason','authoritative_occurrence_identity_or_canonical_mapping_incomplete'
    );
  end if;

  delete from private_verification.brinesearch_route_transition_receipts_issue97
  where route_prep_id=p_route_prep_id;

  for v_i in 1..v_count-1 loop
    select r.*,road.centerline_geojson,road.geometry_status as canonical_geometry_status
      into strict v_left
    from private_verification.brinesearch_route_occurrence_receipts_issue97 r
    join public.brinesearch_roads road on road.id=r.canonical_road_id
    where r.route_prep_id=p_route_prep_id and r.occurrence_index=v_i;
    select r.*,road.centerline_geojson,road.geometry_status as canonical_geometry_status
      into strict v_right
    from private_verification.brinesearch_route_occurrence_receipts_issue97 r
    join public.brinesearch_roads road on road.id=r.canonical_road_id
    where r.route_prep_id=p_route_prep_id and r.occurrence_index=v_i+1;

    v_dependency:=pg_catalog.md5(pg_catalog.concat_ws('|',
      v_route.source_sequence_hash,v_i::text,v_left.receipt_digest,v_right.receipt_digest,
      coalesce(v_left.mapping_fingerprint,''),coalesce(v_right.mapping_fingerprint,'')
    ));
    v_candidate_count:=0;v_candidate:=null;v_hold:=null;v_evidence:='{}'::jsonb;

    if v_left.identity_id=v_right.identity_id or v_left.canonical_road_id=v_right.canonical_road_id then
      v_hold:='adjacent_same_road_split_requires_explicit_source_boundary';
      v_evidence:=pg_catalog.jsonb_build_object(
        'same_identity',v_left.identity_id=v_right.identity_id,
        'same_canonical_road',v_left.canonical_road_id=v_right.canonical_road_id,
        'policy','same-road occurrence boundaries are never invented'
      );
    elsif v_left.centerline_geojson is null or v_right.centerline_geojson is null
       or coalesce(v_left.canonical_geometry_status,'') not in (
         'official_centerline_loaded','field_confirmed_centerline','owner_verified_complete'
       ) or coalesce(v_right.canonical_geometry_status,'') not in (
         'official_centerline_loaded','field_confirmed_centerline','owner_verified_complete'
       ) then
      v_hold:='canonical_geometry_missing_or_not_publishable';
    else
      begin
        v_left_geom:=extensions.st_setsrid(
          extensions.st_geomfromgeojson(v_left.centerline_geojson::text),4326
        );
        v_right_geom:=extensions.st_setsrid(
          extensions.st_geomfromgeojson(v_right.centerline_geojson::text),4326
        );
      exception when others then
        v_left_geom:=null;v_right_geom:=null;
      end;
      if v_left_geom is null or v_right_geom is null
         or extensions.st_isempty(v_left_geom) or extensions.st_isempty(v_right_geom)
         or not extensions.st_isvalid(v_left_geom) or not extensions.st_isvalid(v_right_geom)
         or not extensions.st_issimple(v_left_geom) or not extensions.st_issimple(v_right_geom) then
        v_hold:='canonical_geometry_invalid';
      else
        select count(*)::integer into v_candidate_count
        from (
          select distinct a.id
          from public.brinesearch_road_junction_anchors a
          join public.brinesearch_road_junctions j on j.id=a.junction_id
            and j.verification_status='verified'
          join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
            and private_verification.brinesearch_issue97_graph_build_sources_current(b.id)
          where exists(
            select 1 from public.brinesearch_road_junction_memberships ml
            join public.brinesearch_authoritative_road_identities il on il.id=ml.identity_id
            where ml.junction_id=j.id and ml.identity_id=v_left.identity_id
              and ml.road_id=v_left.canonical_road_id and il.active
              and private_verification.brinesearch_issue97_dataset_scope_current(
                il.dataset_id,il.state_code,il.county_code
              )
          ) and exists(
            select 1 from public.brinesearch_road_junction_memberships mr
            join public.brinesearch_authoritative_road_identities ir on ir.id=mr.identity_id
            where mr.junction_id=j.id and mr.identity_id=v_right.identity_id
              and mr.road_id=v_right.canonical_road_id and ir.active
              and private_verification.brinesearch_issue97_dataset_scope_current(
                ir.dataset_id,ir.state_code,ir.county_code
              )
          )
          and extensions.st_dwithin(a.geom::extensions.geography,v_left_geom::extensions.geography,1)
          and extensions.st_dwithin(a.geom::extensions.geography,v_right_geom::extensions.geography,1)
        ) q;

        if v_candidate_count=1 then
          select a.id as anchor_id,a.anchor_role,a.anchor_digest,a.geom,
            j.id as junction_id,j.junction_type,j.stable_junction_key,j.source_method,
            j.source_provenance,j.graph_digest,b.id as build_id,b.source_revision_digest
          into strict v_candidate
          from public.brinesearch_road_junction_anchors a
          join public.brinesearch_road_junctions j on j.id=a.junction_id
            and j.verification_status='verified'
          join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
            and private_verification.brinesearch_issue97_graph_build_sources_current(b.id)
          where exists(select 1 from public.brinesearch_road_junction_memberships ml
            join public.brinesearch_authoritative_road_identities il on il.id=ml.identity_id
            where ml.junction_id=j.id and ml.identity_id=v_left.identity_id
              and ml.road_id=v_left.canonical_road_id and il.active
              and private_verification.brinesearch_issue97_dataset_scope_current(il.dataset_id,il.state_code,il.county_code))
            and exists(select 1 from public.brinesearch_road_junction_memberships mr
            join public.brinesearch_authoritative_road_identities ir on ir.id=mr.identity_id
            where mr.junction_id=j.id and mr.identity_id=v_right.identity_id
              and mr.road_id=v_right.canonical_road_id and ir.active
              and private_verification.brinesearch_issue97_dataset_scope_current(ir.dataset_id,ir.state_code,ir.county_code))
            and extensions.st_dwithin(a.geom::extensions.geography,v_left_geom::extensions.geography,1)
            and extensions.st_dwithin(a.geom::extensions.geography,v_right_geom::extensions.geography,1);
          v_evidence:=pg_catalog.jsonb_build_object(
            'junction_key',v_candidate.stable_junction_key,'junction_type',v_candidate.junction_type,
            'source_method',v_candidate.source_method,'source_provenance',v_candidate.source_provenance,
            'selection_uses_name_similarity',false,'selection_uses_nearest_road',false,
            'selection_uses_route_number_alone',false
          );
        elsif v_candidate_count=0 then
          v_hold:='no_current_authoritative_transition_anchor';
          v_evidence:=pg_catalog.jsonb_build_object(
            'left_identity_id',v_left.identity_id,'right_identity_id',v_right.identity_id,
            'left_road_id',v_left.canonical_road_id,'right_road_id',v_right.canonical_road_id
          );
        else
          select count(distinct j.id)::integer into v_shared_junctions
          from public.brinesearch_road_junction_anchors a
          join public.brinesearch_road_junctions j on j.id=a.junction_id
          join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
            and private_verification.brinesearch_issue97_graph_build_sources_current(b.id)
          where j.verification_status='verified' and j.junction_type='shared_segment'
            and a.anchor_role in ('shared_start','shared_end')
            and exists(select 1 from public.brinesearch_road_junction_memberships m
              where m.junction_id=j.id and m.identity_id=v_left.identity_id and m.road_id=v_left.canonical_road_id)
            and exists(select 1 from public.brinesearch_road_junction_memberships m
              where m.junction_id=j.id and m.identity_id=v_right.identity_id and m.road_id=v_right.canonical_road_id)
            and extensions.st_dwithin(a.geom::extensions.geography,v_left_geom::extensions.geography,1)
            and extensions.st_dwithin(a.geom::extensions.geography,v_right_geom::extensions.geography,1);
          v_hold:=case when v_shared_junctions=1 and v_candidate_count=2
            then 'shared_segment_requires_sequence_context'
            else 'multiple_current_authoritative_transition_anchors' end;
          v_evidence:=pg_catalog.jsonb_build_object(
            'candidate_count',v_candidate_count,'shared_segment_junction_count',v_shared_junctions
          );
        end if;
      end if;
    end if;

    v_receipt:=pg_catalog.md5(pg_catalog.concat_ws('|',v_dependency,
      case when v_hold is null then 'resolved' else 'held' end,
      coalesce(v_hold,''),coalesce(v_candidate.anchor_id::text,''),coalesce(v_evidence::text,'{}')));
    insert into private_verification.brinesearch_route_transition_receipts_issue97(
      route_prep_id,pad_id,route_group,variant_index,boundary_index,
      left_route_prep_step_id,right_route_prep_step_id,left_identity_id,right_identity_id,
      left_road_id,right_road_id,status,resolution_method,hold_reason,junction_id,anchor_id,
      anchor_role,coordinate,candidate_count,graph_build_id,graph_digest,source_revision_digest,
      anchor_digest,dependency_digest,evidence,receipt_digest,resolved_at
    ) values(
      p_route_prep_id,v_route.pad_id,v_route.route_group,v_route.variant_index,v_i,
      v_left.route_prep_step_id,v_right.route_prep_step_id,v_left.identity_id,v_right.identity_id,
      v_left.canonical_road_id,v_right.canonical_road_id,
      case when v_hold is null then 'resolved' else 'held' end,
      case when v_hold is null then 'unique_authoritative_junction_anchor' else null end,
      v_hold,v_candidate.junction_id,v_candidate.anchor_id,v_candidate.anchor_role,v_candidate.geom,
      v_candidate_count,v_candidate.build_id,v_candidate.graph_digest,v_candidate.source_revision_digest,
      v_candidate.anchor_digest,v_dependency,v_evidence,v_receipt,
      case when v_hold is null then now() else null end
    );
    perform private_verification.brinesearch_issue97_write_transition_history(p_route_prep_id,v_i);
  end loop;

  -- Resolve the common concurrency pattern A -> B -> A using the route sequence,
  -- the unique shared segment, and already resolved boundaries on both sides.
  -- No anchor is picked by distance alone. Both shared anchors must lie strictly
  -- between the two surrounding exact boundaries on one outer-road component.
  if v_count>=3 then
    for v_i in 1..v_count-2 loop
      select r.*,road.centerline_geojson into strict v_left
      from private_verification.brinesearch_route_occurrence_receipts_issue97 r
      join public.brinesearch_roads road on road.id=r.canonical_road_id
      where r.route_prep_id=p_route_prep_id and r.occurrence_index=v_i;
      select r.* into strict v_right
      from private_verification.brinesearch_route_occurrence_receipts_issue97 r
      where r.route_prep_id=p_route_prep_id and r.occurrence_index=v_i+1;
      if not exists(select 1 from private_verification.brinesearch_route_occurrence_receipts_issue97 r
        where r.route_prep_id=p_route_prep_id and r.occurrence_index=v_i+2
          and r.identity_id=v_left.identity_id and r.canonical_road_id=v_left.canonical_road_id) then
        continue;
      end if;
      if v_i=1 or v_i+1>=v_count-1 then continue; end if;
      if not exists(select 1 from private_verification.brinesearch_route_transition_receipts_issue97
        where route_prep_id=p_route_prep_id and boundary_index=v_i
          and status='held' and hold_reason='shared_segment_requires_sequence_context')
        or not exists(select 1 from private_verification.brinesearch_route_transition_receipts_issue97
        where route_prep_id=p_route_prep_id and boundary_index=v_i+1
          and status='held' and hold_reason='shared_segment_requires_sequence_context') then
        continue;
      end if;
      select coordinate into v_previous
      from private_verification.brinesearch_route_transition_receipts_issue97
      where route_prep_id=p_route_prep_id and boundary_index=v_i-1 and status='resolved';
      select coordinate into v_next
      from private_verification.brinesearch_route_transition_receipts_issue97
      where route_prep_id=p_route_prep_id and boundary_index=v_i+2 and status='resolved';
      if v_previous is null or v_next is null then continue; end if;

      select a.id as anchor_id,a.anchor_role,a.anchor_digest,a.geom,j.id as junction_id,
        j.graph_digest,b.id as build_id,b.source_revision_digest,j.stable_junction_key
      into v_shared_a
      from public.brinesearch_road_junction_anchors a
      join public.brinesearch_road_junctions j on j.id=a.junction_id
        and j.verification_status='verified' and j.junction_type='shared_segment'
      join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
        and private_verification.brinesearch_issue97_graph_build_sources_current(b.id)
      where a.anchor_role='shared_start'
        and exists(select 1 from public.brinesearch_road_junction_memberships m
          where m.junction_id=j.id and m.identity_id=v_left.identity_id and m.road_id=v_left.canonical_road_id)
        and exists(select 1 from public.brinesearch_road_junction_memberships m
          where m.junction_id=j.id and m.identity_id=v_right.identity_id and m.road_id=v_right.canonical_road_id)
      limit 1;
      select a.id as anchor_id,a.anchor_role,a.anchor_digest,a.geom,j.id as junction_id,
        j.graph_digest,b.id as build_id,b.source_revision_digest,j.stable_junction_key
      into v_shared_b
      from public.brinesearch_road_junction_anchors a
      join public.brinesearch_road_junctions j on j.id=a.junction_id
        and j.verification_status='verified' and j.junction_type='shared_segment'
      join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
        and private_verification.brinesearch_issue97_graph_build_sources_current(b.id)
      where a.anchor_role='shared_end' and j.id=v_shared_a.junction_id
      limit 1;
      if v_shared_a.anchor_id is null or v_shared_b.anchor_id is null then continue; end if;

      begin
        v_outer_geom:=extensions.st_setsrid(
          extensions.st_geomfromgeojson(v_left.centerline_geojson::text),4326
        );
      exception when others then
        continue;
      end;
      select count(*) into v_component_count
      from (select (d).geom from (select extensions.st_dump(extensions.st_linemerge(v_outer_geom)) d) q) parts
      where extensions.geometrytype(parts.geom)='LINESTRING'
        and extensions.st_dwithin(parts.geom::extensions.geography,v_previous::extensions.geography,1)
        and extensions.st_dwithin(parts.geom::extensions.geography,v_next::extensions.geography,1)
        and extensions.st_dwithin(parts.geom::extensions.geography,v_shared_a.geom::extensions.geography,1)
        and extensions.st_dwithin(parts.geom::extensions.geography,v_shared_b.geom::extensions.geography,1);
      if v_component_count<>1 then continue; end if;
      select parts.geom into v_line
      from (select (d).geom from (select extensions.st_dump(extensions.st_linemerge(v_outer_geom)) d) q) parts
      where extensions.geometrytype(parts.geom)='LINESTRING'
        and extensions.st_dwithin(parts.geom::extensions.geography,v_previous::extensions.geography,1)
        and extensions.st_dwithin(parts.geom::extensions.geography,v_next::extensions.geography,1)
        and extensions.st_dwithin(parts.geom::extensions.geography,v_shared_a.geom::extensions.geography,1)
        and extensions.st_dwithin(parts.geom::extensions.geography,v_shared_b.geom::extensions.geography,1);

      v_prev_snap:=extensions.st_closestpoint(v_line,v_previous);
      v_next_snap:=extensions.st_closestpoint(v_line,v_next);
      v_a_snap:=extensions.st_closestpoint(v_line,v_shared_a.geom);
      v_b_snap:=extensions.st_closestpoint(v_line,v_shared_b.geom);
      v_fp:=extensions.st_linelocatepoint(v_line,v_prev_snap);
      v_fn:=extensions.st_linelocatepoint(v_line,v_next_snap);
      v_fa:=extensions.st_linelocatepoint(v_line,v_a_snap);
      v_fb:=extensions.st_linelocatepoint(v_line,v_b_snap);
      if pg_catalog.abs(v_fp-v_fn)<1e-12 or pg_catalog.abs(v_fa-v_fb)<1e-12 then continue; end if;
      if not ((v_fp<v_fn and v_fa>v_fp and v_fa<v_fn and v_fb>v_fp and v_fb<v_fn)
           or (v_fp>v_fn and v_fa<v_fp and v_fa>v_fn and v_fb<v_fp and v_fb>v_fn)) then
        continue;
      end if;

      if (v_fp<v_fn and v_fa<v_fb) or (v_fp>v_fn and v_fa>v_fb) then
        v_entry:=v_shared_a;v_exit:=v_shared_b;
      else
        v_entry:=v_shared_b;v_exit:=v_shared_a;
      end if;

      update private_verification.brinesearch_route_transition_receipts_issue97 set
        status='resolved',resolution_method='shared_segment_sequence_context',hold_reason=null,
        junction_id=v_entry.junction_id,anchor_id=v_entry.anchor_id,anchor_role=v_entry.anchor_role,
        coordinate=v_entry.geom,candidate_count=2,graph_build_id=v_entry.build_id,
        graph_digest=v_entry.graph_digest,source_revision_digest=v_entry.source_revision_digest,
        anchor_digest=v_entry.anchor_digest,resolved_at=now(),updated_at=now(),
        evidence=coalesce(evidence,'{}'::jsonb)||pg_catalog.jsonb_build_object(
          'shared_segment_sequence','A->B->A','outer_previous_fraction',v_fp,
          'outer_next_fraction',v_fn,'entry_fraction',case when v_entry.anchor_id=v_shared_a.anchor_id then v_fa else v_fb end,
          'exit_fraction',case when v_exit.anchor_id=v_shared_a.anchor_id then v_fa else v_fb end,
          'selection_uses_route_sequence',true,'selection_uses_name_similarity',false,'selection_uses_nearest_road',false
        ),
        receipt_digest=pg_catalog.md5(dependency_digest||'|resolved|shared_segment_sequence_context|'||v_entry.anchor_id::text)
      where route_prep_id=p_route_prep_id and boundary_index=v_i;
      update private_verification.brinesearch_route_transition_receipts_issue97 set
        status='resolved',resolution_method='shared_segment_sequence_context',hold_reason=null,
        junction_id=v_exit.junction_id,anchor_id=v_exit.anchor_id,anchor_role=v_exit.anchor_role,
        coordinate=v_exit.geom,candidate_count=2,graph_build_id=v_exit.build_id,
        graph_digest=v_exit.graph_digest,source_revision_digest=v_exit.source_revision_digest,
        anchor_digest=v_exit.anchor_digest,resolved_at=now(),updated_at=now(),
        evidence=coalesce(evidence,'{}'::jsonb)||pg_catalog.jsonb_build_object(
          'shared_segment_sequence','A->B->A','outer_previous_fraction',v_fp,
          'outer_next_fraction',v_fn,'entry_fraction',case when v_entry.anchor_id=v_shared_a.anchor_id then v_fa else v_fb end,
          'exit_fraction',case when v_exit.anchor_id=v_shared_a.anchor_id then v_fa else v_fb end,
          'selection_uses_route_sequence',true,'selection_uses_name_similarity',false,'selection_uses_nearest_road',false
        ),
        receipt_digest=pg_catalog.md5(dependency_digest||'|resolved|shared_segment_sequence_context|'||v_exit.anchor_id::text)
      where route_prep_id=p_route_prep_id and boundary_index=v_i+1;
      perform private_verification.brinesearch_issue97_write_transition_history(p_route_prep_id,v_i);
      perform private_verification.brinesearch_issue97_write_transition_history(p_route_prep_id,v_i+1);
    end loop;
  end if;

  return pg_catalog.jsonb_build_object(
    'route_prep_id',p_route_prep_id,'road_occurrences',v_count,'transitions',v_count-1,
    'resolved',(select count(*) from private_verification.brinesearch_route_transition_receipts_issue97
      where route_prep_id=p_route_prep_id and status='resolved'),
    'held',(select count(*) from private_verification.brinesearch_route_transition_receipts_issue97
      where route_prep_id=p_route_prep_id and status='held'),
    'held_by_reason',coalesce((select pg_catalog.jsonb_object_agg(hold_reason,cnt order by hold_reason)
      from (select hold_reason,count(*) cnt from private_verification.brinesearch_route_transition_receipts_issue97
        where route_prep_id=p_route_prep_id and status='held' group by hold_reason) q),'{}'::jsonb)
  );
end
$$;
revoke all on function private_verification.brinesearch_issue97_refresh_transition_receipts(uuid)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_transition_metrics_json()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select pg_catalog.jsonb_build_object(
    'transition_receipts',(select count(*) from private_verification.brinesearch_route_transition_receipts_issue97 t
      join public.brinesearch_route_prep p on p.id=t.route_prep_id where p.active),
    'resolved_transitions',(select count(*) from private_verification.brinesearch_route_transition_receipts_issue97 t
      join public.brinesearch_route_prep p on p.id=t.route_prep_id where p.active and t.status='resolved'),
    'held_transitions',(select count(*) from private_verification.brinesearch_route_transition_receipts_issue97 t
      join public.brinesearch_route_prep p on p.id=t.route_prep_id where p.active and t.status='held'),
    'holds_by_reason',coalesce((select pg_catalog.jsonb_object_agg(hold_reason,cnt order by hold_reason)
      from (select t.hold_reason,count(*) cnt
        from private_verification.brinesearch_route_transition_receipts_issue97 t
        join public.brinesearch_route_prep p on p.id=t.route_prep_id
        where p.active and t.status='held' group by t.hold_reason) q),'{}'::jsonb),
    'forbidden_resolution_count',(select count(*) from private_verification.brinesearch_route_transition_receipts_issue97
      where resolution_method in ('name_only','fuzzy_name','nearest_road','route_number_only','closest_anchor'))
  )
$$;
revoke all on function private_verification.brinesearch_issue97_transition_metrics_json()
from public,anon,authenticated,service_role;

create or replace function public.brinesearch_issue97_run_all_pad_routing_pipeline(
  p_pad_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_identity jsonb;
  v_route record;
  v_routes integer:=0;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('brinesearch:issue97:all-pad-routing-pipeline',97)
  );
  v_identity:=public.brinesearch_issue97_reconcile_route_corpus(p_pad_id);
  for v_route in
    select id from public.brinesearch_route_prep
    where active and (p_pad_id is null or pad_id=p_pad_id)
    order by pad_id,route_group,variant_index,id
  loop
    perform private_verification.brinesearch_issue97_refresh_transition_receipts(v_route.id);
    perform private_verification.brinesearch_issue97_refresh_route_receipt(v_route.id);
    v_routes:=v_routes+1;
  end loop;
  return v_identity
    ||private_verification.brinesearch_issue97_transition_metrics_json()
    ||pg_catalog.jsonb_build_object('pipeline_routes_processed',v_routes);
end
$$;
revoke all on function public.brinesearch_issue97_run_all_pad_routing_pipeline(uuid)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_run_all_pad_routing_pipeline(uuid)
to service_role;

create or replace function public.brinesearch_issue97_transition_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not public.is_brinesearch_editor(auth.uid()) then
    raise exception 'Road Manager editor access is required';
  end if;
  return private_verification.brinesearch_issue97_transition_metrics_json();
end
$$;
revoke all on function public.brinesearch_issue97_transition_metrics() from public,anon;
grant execute on function public.brinesearch_issue97_transition_metrics() to authenticated;

create or replace function public.brinesearch_issue97_transition_exception_queue(
  p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_limit integer:=greatest(1,least(coalesce(p_limit,200),500));v_rows jsonb;
begin
  if not public.is_brinesearch_editor(auth.uid()) then
    raise exception 'Road Manager editor access is required';
  end if;
  select coalesce(pg_catalog.jsonb_agg(item order by item->>'company',item->>'pad_name',
    (item->>'variant_index')::integer,(item->>'boundary_index')::integer),'[]'::jsonb)
  into v_rows
  from (
    select pg_catalog.jsonb_build_object(
      'route_prep_id',t.route_prep_id,'pad_id',t.pad_id,'pad_name',p.pad_name,
      'company',p.company,'state',p.state,'route_group',t.route_group,
      'variant_index',t.variant_index,'boundary_index',t.boundary_index,
      'left_raw_text',l.raw_text,'right_raw_text',r.raw_text,
      'left_identity_id',t.left_identity_id,'right_identity_id',t.right_identity_id,
      'left_road_id',t.left_road_id,'right_road_id',t.right_road_id,
      'hold_reason',t.hold_reason,'candidate_count',t.candidate_count,'evidence',t.evidence
    ) item
    from private_verification.brinesearch_route_transition_receipts_issue97 t
    join public.pads p on p.id=t.pad_id
    join public.brinesearch_route_prep rp on rp.id=t.route_prep_id and rp.active
    join private_verification.brinesearch_route_occurrence_receipts_issue97 l
      on l.route_prep_step_id=t.left_route_prep_step_id
    join private_verification.brinesearch_route_occurrence_receipts_issue97 r
      on r.route_prep_step_id=t.right_route_prep_step_id
    where t.status='held'
    order by p.company,p.pad_name,t.variant_index,t.boundary_index
    limit v_limit
  ) q;
  return pg_catalog.jsonb_build_object(
    'metrics',private_verification.brinesearch_issue97_transition_metrics_json(),
    'transition_exceptions',v_rows,
    'manual_map_editor_role','review_exception_qa_only'
  );
end
$$;
revoke all on function public.brinesearch_issue97_transition_exception_queue(integer) from public,anon;
grant execute on function public.brinesearch_issue97_transition_exception_queue(integer) to authenticated;

comment on function public.brinesearch_issue97_run_all_pad_routing_pipeline(uuid) is
  'Issue #97 service-only all-route pipeline: exact occurrence reconciliation followed by physical-junction transition resolution. Further exact geometry/manifest stages extend this same orchestrator.';
comment on function public.brinesearch_issue97_transition_exception_queue(integer) is
  'Issue #97 editor-only transition hold queue. It exposes only unresolved exact-boundary work; routine routes require no manual map tapping.';
