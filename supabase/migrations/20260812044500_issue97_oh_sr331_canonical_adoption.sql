-- GitHub #97 — Ohio-only exact SR-331 canonical adoption.
--
-- The Phase 1 executable gate exposed current exact Bannock-area occurrences on
-- ODOT SR-331 whose authoritative identity was resolved but whose legacy OH-331
-- Road Manager family row was still needs_review. Upgrade only that one semantic
-- family row and map only exact current ODOT SR-331 identities. No road-name,
-- fuzzy, route-number-only, or nearest-geometry selection is used.

do $issue97_oh_sr331_canonical_adoption$
declare
  v_road_id uuid;
  v_row_count integer;
  v_identity_count integer;
  v_conflict_count integer;
  v_all_current boolean;
  v_geom extensions.geometry;
  v_source_keys text[];
  v_source_digest text;
  v_source_record_id text;
  v_aliases text[];
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
  );

  select count(*)::integer,min(r.id::text)::uuid
  into v_row_count,v_road_id
  from public.brinesearch_roads r
  where r.road_type='state_route' and r.route_number='331' and r.state='OH';
  if v_row_count<>1 then
    raise exception 'Issue #97 Ohio SR-331 adoption expected one Road Manager family row, found %',v_row_count;
  end if;

  select count(*)::integer,
    coalesce(pg_catalog.bool_and(
      private_verification.brinesearch_issue97_dataset_scope_current(
        i.dataset_id,i.state_code,i.county_code
      )
    ),false),
    pg_catalog.array_agg(i.source_identity_key order by i.county_code,i.source_identity_key),
    pg_catalog.md5(pg_catalog.string_agg(
      i.id::text||':'||coalesce(i.source_digest,''),
      '|' order by i.county_code,i.source_identity_key,i.id
    )),
    min(nullif(i.attributes->>'nlf_id','')),
    extensions.st_collectionextract(
      extensions.st_unaryunion(extensions.st_collect(
        private_verification.brinesearch_issue97_authoritative_identity_geometry(i.id)
      )),2
    )
  into v_identity_count,v_all_current,v_source_keys,v_source_digest,
    v_source_record_id,v_geom
  from public.brinesearch_authoritative_road_identities i
  where i.state_code='OH' and i.active
    and i.road_class='state_route' and i.route_number='331'
    and i.public_access_status='public' and i.drivable_status='drivable';

  if v_identity_count<>2 or not coalesce(v_all_current,false)
     or v_geom is null or extensions.st_isempty(v_geom)
     or extensions.st_dimension(v_geom)<>1 then
    raise exception 'Issue #97 Ohio SR-331 authoritative family changed or is incomplete: identities %, current %',
      v_identity_count,v_all_current;
  end if;

  select count(*)::integer into v_conflict_count
  from public.brinesearch_authoritative_road_identities i
  join public.brinesearch_road_identity_mappings m
    on m.identity_id=i.id and m.mapping_status='verified'
  where i.state_code='OH' and i.active
    and i.road_class='state_route' and i.route_number='331'
    and i.public_access_status='public' and i.drivable_status='drivable'
    and m.road_id<>v_road_id;
  if v_conflict_count<>0 then
    raise exception 'Issue #97 Ohio SR-331 adoption found % conflicting verified mappings',v_conflict_count;
  end if;

  select pg_catalog.array_agg(distinct alias_value order by alias_value)
  into v_aliases
  from unnest(
    coalesce((select r.aliases from public.brinesearch_roads r where r.id=v_road_id),'{}'::text[])
    ||array['OH-331','SR-331','Route 331']::text[]
  ) alias_value;

  update public.brinesearch_roads r set
    canonical_name='OH-331',normalized_name='oh-331',road_type='state_route',
    state='OH',county=null,township=null,route_number='331',
    aliases=coalesce(v_aliases,'{}'::text[]),
    verification_status='verified',verified_at=now(),
    source_agency='Ohio Department of Transportation',
    source_dataset='Road Inventory',
    source_method='issue97_oh_exact_route_family',
    source_url='https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0',
    source_record_id=v_source_record_id,
    centerline_geojson=extensions.st_asgeojson(v_geom,7)::jsonb,
    geometry_status='official_centerline_loaded',geometry_checked_at=now(),
    approved_by_default=true,candidate_only=false,
    candidate_basis=coalesce(r.candidate_basis,'{}'::jsonb)||pg_catalog.jsonb_build_object(
      'issue',97,'scope','OH-only','adoption','exact_route_family',
      'route_family','OH-331','source_identity_count',v_identity_count,
      'source_identity_keys',to_jsonb(v_source_keys),'source_digest',v_source_digest,
      'name_matching_used',false,'fuzzy_matching_used',false,'nearest_road_used',false
    ),
    updated_at=now()
  where r.id=v_road_id;

  insert into public.brinesearch_road_identity_mappings(
    id,identity_id,road_id,mapping_status,mapping_method,evidence,
    verified_at,created_at,updated_at
  )
  select
    private_verification.brinesearch_issue97_uuid(
      'identity-mapping:'||i.id::text||':'||v_road_id::text
    ),
    i.id,v_road_id,'verified','exact_route_designation',
    pg_catalog.jsonb_build_object(
      'issue',97,'scope','OH-only','state_code','OH',
      'road_class','state_route','route_number','331',
      'source_identity_key',i.source_identity_key,'source_digest',i.source_digest,
      'source_current',private_verification.brinesearch_issue97_dataset_scope_current(
        i.dataset_id,i.state_code,i.county_code
      ),
      'exact_designation',true,
      'name_matching_used',false,'fuzzy_matching_used',false,'nearest_road_used',false,
      'migration','issue97_oh_sr331_canonical_adoption'
    ),
    now(),now(),now()
  from public.brinesearch_authoritative_road_identities i
  where i.state_code='OH' and i.active
    and i.road_class='state_route' and i.route_number='331'
    and i.public_access_status='public' and i.drivable_status='drivable'
    and private_verification.brinesearch_issue97_dataset_scope_current(
      i.dataset_id,i.state_code,i.county_code
    )
  on conflict(identity_id,road_id) do update set
    mapping_status='verified',mapping_method='exact_route_designation',
    evidence=excluded.evidence,verified_at=excluded.verified_at,updated_at=now();

  if exists(
    select 1
    from public.brinesearch_road_identity_mappings m
    join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
    where m.evidence->>'migration'='issue97_oh_sr331_canonical_adoption'
      and (i.state_code<>'OH' or i.road_class<>'state_route' or i.route_number<>'331'
        or m.mapping_method<>'exact_route_designation'
        or coalesce((m.evidence->>'name_matching_used')::boolean,false)
        or coalesce((m.evidence->>'fuzzy_matching_used')::boolean,false)
        or coalesce((m.evidence->>'nearest_road_used')::boolean,false))
  ) then
    raise exception 'Issue #97 Ohio SR-331 adoption violated the Ohio-only/no-guess contract';
  end if;
end
$issue97_oh_sr331_canonical_adoption$;

do $issue97_verify_oh_sr331_canonical_adoption$
declare
  v_family_rows integer;
  v_mapped integer;
begin
  select count(*)::integer into v_family_rows
  from public.brinesearch_roads r
  where r.road_type='state_route' and r.route_number='331' and r.state='OH'
    and r.verification_status='verified'
    and r.geometry_status='official_centerline_loaded'
    and r.source_method='issue97_oh_exact_route_family';

  select count(*)::integer into v_mapped
  from public.brinesearch_road_identity_mappings m
  join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
  where i.state_code='OH' and i.active and i.road_class='state_route' and i.route_number='331'
    and i.public_access_status='public' and i.drivable_status='drivable'
    and m.mapping_status='verified' and m.mapping_method='exact_route_designation'
    and m.road_id=(select id from public.brinesearch_roads where road_type='state_route' and route_number='331' and state='OH');

  if v_family_rows<>1 or v_mapped<>2 then
    raise exception 'Issue #97 Ohio SR-331 adoption verification failed: family %, mapped %',v_family_rows,v_mapped;
  end if;
end
$issue97_verify_oh_sr331_canonical_adoption$;
