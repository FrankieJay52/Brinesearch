-- GitHub #70 — strict all-operator Ohio ambiguity resolver.
--
-- The first #70 pass intentionally held multiple exact ODOT identities. This
-- follow-up resolves only candidates with complete official geometry and a very
-- strong spatial/topology discriminator:
--   * both already-verified adjacent Road Manager roads touch one candidate; or
--   * the final public road reaches the pad and one verified neighbor; or
--   * the final public road reaches the pad with a large separation to runner-up.
-- All other ambiguous rows remain held. No road-name similarity, nearest-pad
-- fallback, or external-map geometry is allowed.

create table if not exists private_verification.brinesearch_oh_context_resolutions_issue70 (
  step_id uuid primary key references public.brinesearch_route_prep_steps(id) on delete cascade,
  selected_nlf_id text not null,
  resolution_basis text not null,
  candidate_count integer not null,
  official_name text not null,
  official_route_type text,
  official_route_number text,
  pad_distance_m double precision,
  prev_distance_m double precision,
  next_distance_m double precision,
  second_pad_distance_m double precision,
  second_neighbor_distance_m double precision,
  neighbor_count integer not null,
  neighbor_hits integer not null,
  prev_road_id uuid references public.brinesearch_roads(id),
  next_road_id uuid references public.brinesearch_roads(id),
  prev_geometry_digest text,
  next_geometry_digest text,
  candidate_geometry_digest text not null,
  pad_latitude double precision,
  pad_longitude double precision,
  evidence jsonb not null default '{}'::jsonb,
  staged_at timestamptz not null default now(),
  applied_road_id uuid references public.brinesearch_roads(id),
  applied_at timestamptz,
  constraint brinesearch_oh_context_issue70_basis_check check (
    resolution_basis in ('both_verified_neighbors','pad_and_verified_neighbor','pad_endpoint')
  )
);

create index if not exists brinesearch_oh_context_issue70_nlf_idx
  on private_verification.brinesearch_oh_context_resolutions_issue70(selected_nlf_id);
create index if not exists brinesearch_oh_context_issue70_applied_road_idx
  on private_verification.brinesearch_oh_context_resolutions_issue70(applied_road_id)
  where applied_road_id is not null;

alter table private_verification.brinesearch_oh_context_resolutions_issue70 enable row level security;
alter table private_verification.brinesearch_oh_context_resolutions_issue70 force row level security;
revoke all on private_verification.brinesearch_oh_context_resolutions_issue70 from public,anon,authenticated;
grant select,insert,update,delete on private_verification.brinesearch_oh_context_resolutions_issue70 to service_role;

create or replace function public.brinesearch_load_oh_ambiguous_geometry_issue70(p_batch_size integer default 150)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_caller uuid:=auth.uid();
  v_batch integer:=greatest(10,least(coalesce(p_batch_size,150),250));
  v_object_ids bigint[];
  v_response jsonb;
  v_features jsonb;
  v_rows integer:=0;
  v_loaded integer:=0;
  v_batches integer:=0;
begin
  if v_caller is null or not public.is_brinesearch_owner(v_caller) then
    raise exception 'Only the BrineSearch Owner may load #70 ambiguous Ohio road geometry';
  end if;

  loop
    with needed as (
      select distinct c.objectid
      from private_verification.brinesearch_oh_road_matches_issue70 m
      join public.brinesearch_odot_road_catalog c
        on c.nlf_id=any(m.candidate_nlf_ids)
       and (
         (m.route_type_hint is not null
           and c.route_type=m.route_type_hint
           and c.route_number_normalized=m.route_number_hint)
         or (m.route_type_hint is null
           and c.street_match_key=m.step_key
           and coalesce(c.route_type,'') not in ('IR','US','SR'))
       )
      where m.match_status='ambiguous'
        and m.applied_at is null
        and c.objectid is not null
        and c.geom is null
    )
    select pg_catalog.array_agg(objectid order by objectid)
    into v_object_ids
    from (select objectid from needed order by objectid limit v_batch) q;

    exit when coalesce(cardinality(v_object_ids),0)=0;

    select content::jsonb into v_response
    from extensions.http_get(
      'https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0/query',
      pg_catalog.jsonb_build_object(
        'f','geojson',
        'objectIds',pg_catalog.array_to_string(v_object_ids,','),
        'outFields','OBJECTID,ROADWAY_INVENTORY_ID,NLF_ID,STREET_NAME',
        'returnGeometry','true',
        'outSR','4326'
      )
    );
    if v_response ? 'error' then
      raise exception 'ODOT #70 ambiguous geometry query failed: %',v_response->'error';
    end if;
    v_features:=coalesce(v_response->'features','[]'::jsonb);
    if pg_catalog.jsonb_array_length(v_features)=0 then
      raise exception 'ODOT #70 ambiguous geometry query returned no features';
    end if;

    with parsed as (
      select
        (f->'properties'->>'OBJECTID')::bigint objectid,
        extensions.st_setsrid(extensions.st_geomfromgeojson((f->'geometry')::text),4326) geom
      from pg_catalog.jsonb_array_elements(v_features) f
      where f->'geometry' is not null
    )
    update public.brinesearch_odot_road_catalog c
    set geom=p.geom,geometry_loaded_at=now(),fetched_at=now()
    from parsed p
    where c.objectid=p.objectid;
    get diagnostics v_rows=row_count;
    if v_rows=0 then
      raise exception 'ODOT #70 ambiguous geometry batch produced no catalog updates';
    end if;
    v_loaded:=v_loaded+v_rows;
    v_batches:=v_batches+1;
  end loop;

  return pg_catalog.jsonb_build_object(
    'geometry_batches',v_batches,
    'catalog_segments_loaded',v_loaded,
    'source','Ohio Department of Transportation Road Inventory',
    'policy','Only held exact ODOT candidate IDs were loaded; identity remains unresolved until strict context staging.'
  );
end;
$$;

revoke all on function public.brinesearch_load_oh_ambiguous_geometry_issue70(integer) from public,anon;
grant execute on function public.brinesearch_load_oh_ambiguous_geometry_issue70(integer) to authenticated;

create or replace function public.brinesearch_stage_oh_ambiguous_context_issue70()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_caller uuid:=auth.uid();
  v_staged integer:=0;
  v_both integer:=0;
  v_pad_neighbor integer:=0;
  v_pad integer:=0;
begin
  if v_caller is null or not public.is_brinesearch_owner(v_caller) then
    raise exception 'Only the BrineSearch Owner may stage #70 ambiguous Ohio road context';
  end if;

  -- Recompute from current live topology every time; never preserve a stale
  -- unapplied decision if its evidence no longer qualifies.
  delete from private_verification.brinesearch_oh_context_resolutions_issue70
  where applied_at is null;

  with amb as (
    select
      m.step_id,m.route_prep_id,m.pad_id,m.pad_name,m.company,m.county,
      m.raw_text,m.step_key,m.route_type_hint,m.route_number_hint,
      m.candidate_nlf_ids,m.candidate_count,
      p.latitude,p.longitude,s.step_order,
      prev.road_id as prev_road_id,
      nxt.road_id as next_road_id,
      case when pr.centerline_geojson is not null
        then extensions.st_setsrid(extensions.st_geomfromgeojson(pr.centerline_geojson::text),4326)
      end as prev_geom,
      case when nr.centerline_geojson is not null
        then extensions.st_setsrid(extensions.st_geomfromgeojson(nr.centerline_geojson::text),4326)
      end as next_geom,
      case when pr.centerline_geojson is not null then pg_catalog.md5(pr.centerline_geojson::text) end as prev_digest,
      case when nr.centerline_geojson is not null then pg_catalog.md5(nr.centerline_geojson::text) end as next_digest,
      extensions.st_setsrid(extensions.st_makepoint(p.longitude,p.latitude),4326) as pad_geom,
      (
        select max(x.step_order)
        from public.brinesearch_route_prep_steps x
        where x.route_prep_id=s.route_prep_id and x.active
          and x.step_kind in ('interstate','us_route','state_route','county_road','township_road','local_road')
      ) as max_public_order
    from private_verification.brinesearch_oh_road_matches_issue70 m
    join public.brinesearch_route_prep_steps s on s.id=m.step_id
    join public.pads p on p.id=m.pad_id
    left join public.brinesearch_route_prep_steps prev
      on prev.route_prep_id=s.route_prep_id and prev.step_order=s.step_order-1 and prev.active
    left join public.brinesearch_route_prep_steps nxt
      on nxt.route_prep_id=s.route_prep_id and nxt.step_order=s.step_order+1 and nxt.active
    left join public.brinesearch_roads pr on pr.id=prev.road_id
    left join public.brinesearch_roads nr on nr.id=nxt.road_id
    where m.match_status='ambiguous'
      and m.applied_at is null
      and m.candidate_count between 2 and 40
      and p.latitude is not null and p.longitude is not null
  ), candidates as (
    select
      a.step_id,a.route_prep_id,a.pad_id,a.pad_name,a.company,a.county,
      a.raw_text,a.step_key,a.route_type_hint,a.route_number_hint,a.candidate_count,
      a.latitude,a.longitude,a.step_order,a.max_public_order,
      a.prev_road_id,a.next_road_id,a.prev_geom,a.next_geom,a.prev_digest,a.next_digest,a.pad_geom,
      c.nlf_id,
      min(c.route_type) as route_type,
      min(c.route_number_normalized) as route_number,
      min(c.official_name) as official_name,
      case when count(*)=count(c.geom)
        then extensions.st_unaryunion(extensions.st_collect(c.geom order by c.objectid))
      end as geom
    from amb a
    join public.brinesearch_odot_road_catalog c
      on c.nlf_id=any(a.candidate_nlf_ids)
     and (
       (a.route_type_hint is not null
         and c.route_type=a.route_type_hint
         and c.route_number_normalized=a.route_number_hint)
       or (a.route_type_hint is null
         and c.street_match_key=a.step_key
         and coalesce(c.route_type,'') not in ('IR','US','SR'))
     )
    group by
      a.step_id,a.route_prep_id,a.pad_id,a.pad_name,a.company,a.county,
      a.raw_text,a.step_key,a.route_type_hint,a.route_number_hint,a.candidate_count,
      a.latitude,a.longitude,a.step_order,a.max_public_order,
      a.prev_road_id,a.next_road_id,a.prev_geom,a.next_geom,a.prev_digest,a.next_digest,a.pad_geom,
      c.nlf_id
  ), scored as (
    select c.*,
      extensions.st_distance(c.geom::extensions.geography,c.pad_geom::extensions.geography) as pad_m,
      case when c.prev_geom is not null then
        extensions.st_distance(c.geom::extensions.geography,c.prev_geom::extensions.geography)
      end as prev_m,
      case when c.next_geom is not null then
        extensions.st_distance(c.geom::extensions.geography,c.next_geom::extensions.geography)
      end as next_m,
      (
        case when c.prev_geom is not null and extensions.st_dwithin(c.geom::extensions.geography,c.prev_geom::extensions.geography,50) then 1 else 0 end +
        case when c.next_geom is not null and extensions.st_dwithin(c.geom::extensions.geography,c.next_geom::extensions.geography,50) then 1 else 0 end
      ) as neighbor_hits,
      (case when c.prev_geom is not null then 1 else 0 end + case when c.next_geom is not null then 1 else 0 end) as neighbor_count,
      count(*) over(partition by c.step_id) as candidate_geometry_count,
      pg_catalog.md5(extensions.st_asgeojson(c.geom,7)::jsonb::text) as candidate_digest
    from candidates c
    where c.geom is not null
      and extensions.st_isvalid(c.geom)
      and not extensions.st_isempty(c.geom)
  ), ranked as (
    select s.*,
      row_number() over(
        partition by s.step_id
        order by s.neighbor_hits desc,
          coalesce(greatest(s.prev_m,s.next_m),coalesce(s.prev_m,s.next_m),999999),
          s.pad_m,s.nlf_id
      ) as rn,
      lead(s.neighbor_hits) over(
        partition by s.step_id
        order by s.neighbor_hits desc,
          coalesce(greatest(s.prev_m,s.next_m),coalesce(s.prev_m,s.next_m),999999),
          s.pad_m,s.nlf_id
      ) as second_hits,
      lead(coalesce(greatest(s.prev_m,s.next_m),coalesce(s.prev_m,s.next_m),999999)) over(
        partition by s.step_id
        order by s.neighbor_hits desc,
          coalesce(greatest(s.prev_m,s.next_m),coalesce(s.prev_m,s.next_m),999999),
          s.pad_m,s.nlf_id
      ) as second_neighbor_m,
      lead(s.pad_m) over(
        partition by s.step_id
        order by s.neighbor_hits desc,
          coalesce(greatest(s.prev_m,s.next_m),coalesce(s.prev_m,s.next_m),999999),
          s.pad_m,s.nlf_id
      ) as second_pad_m
    from scored s
  ), picked as (
    select r.*,
      case
        when r.neighbor_count=2 and r.neighbor_hits=2
          and coalesce(r.second_hits,0)<2
          and r.second_neighbor_m is not null and r.second_neighbor_m>=200
          then 'both_verified_neighbors'
        when r.step_order=r.max_public_order
          and r.pad_m<=100
          and r.second_pad_m is not null and r.second_pad_m>=greatest(500,r.pad_m*5)
          and r.neighbor_count>0 and r.neighbor_hits>=1
          then 'pad_and_verified_neighbor'
        when r.step_order=r.max_public_order
          and r.pad_m<=100
          and r.second_pad_m is not null and r.second_pad_m>=greatest(500,r.pad_m*5)
          and r.neighbor_count=0
          then 'pad_endpoint'
        else null
      end as basis
    from ranked r
    where r.rn=1
      and r.candidate_geometry_count=r.candidate_count
      and nullif(pg_catalog.btrim(coalesce(r.official_name,'')),'') is not null
  )
  insert into private_verification.brinesearch_oh_context_resolutions_issue70 (
    step_id,selected_nlf_id,resolution_basis,candidate_count,
    official_name,official_route_type,official_route_number,
    pad_distance_m,prev_distance_m,next_distance_m,
    second_pad_distance_m,second_neighbor_distance_m,
    neighbor_count,neighbor_hits,prev_road_id,next_road_id,
    prev_geometry_digest,next_geometry_digest,candidate_geometry_digest,
    pad_latitude,pad_longitude,evidence,staged_at
  )
  select
    p.step_id,p.nlf_id,p.basis,p.candidate_count,
    p.official_name,p.route_type,p.route_number,
    p.pad_m,p.prev_m,p.next_m,p.second_pad_m,p.second_neighbor_m,
    p.neighbor_count,p.neighbor_hits,p.prev_road_id,p.next_road_id,
    p.prev_digest,p.next_digest,p.candidate_digest,p.latitude,p.longitude,
    pg_catalog.jsonb_build_object(
      'issue',70,
      'candidate_count',p.candidate_count,
      'basis',p.basis,
      'pad_distance_m',p.pad_m,
      'prev_distance_m',p.prev_m,
      'next_distance_m',p.next_m,
      'second_pad_distance_m',p.second_pad_m,
      'second_neighbor_distance_m',p.second_neighbor_m,
      'neighbor_count',p.neighbor_count,
      'neighbor_hits',p.neighbor_hits,
      'source','Ohio Department of Transportation Road Inventory',
      'fuzzy_matching',false,
      'name_similarity_decision',false,
      'closest_pad_only',false
    ),now()
  from picked p
  where p.basis is not null;

  get diagnostics v_staged=row_count;
  select count(*) filter(where resolution_basis='both_verified_neighbors'),
         count(*) filter(where resolution_basis='pad_and_verified_neighbor'),
         count(*) filter(where resolution_basis='pad_endpoint')
  into v_both,v_pad_neighbor,v_pad
  from private_verification.brinesearch_oh_context_resolutions_issue70
  where applied_at is null;

  return pg_catalog.jsonb_build_object(
    'strict_resolutions_staged',v_staged,
    'both_verified_neighbors',v_both,
    'pad_and_verified_neighbor',v_pad_neighbor,
    'pad_endpoint',v_pad,
    'policy','Only complete official ODOT candidate sets with strict spatial/topology separation are staged. All others remain ambiguous.'
  );
end;
$$;

revoke all on function public.brinesearch_stage_oh_ambiguous_context_issue70() from public,anon;
grant execute on function public.brinesearch_stage_oh_ambiguous_context_issue70() to authenticated;

create or replace function public.brinesearch_apply_oh_ambiguous_context_issue70()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_caller uuid:=auth.uid();
  rec record;
  m record;
  p record;
  v_geom extensions.geometry;
  v_geom_digest text;
  v_expected integer;
  v_loaded integer;
  v_road_id uuid;
  v_existing_count integer;
  v_road_type text;
  v_route_number text;
  v_canonical text;
  v_identity text;
  v_aliases text[];
  v_created integer:=0;
  v_reused integer:=0;
  v_applied integer:=0;
  v_held integer:=0;
begin
  if v_caller is null or not public.is_brinesearch_owner(v_caller) then
    raise exception 'Only the BrineSearch Owner may apply #70 ambiguous Ohio road context';
  end if;

  -- Freshly recompute the decisions immediately before mutation.
  perform public.brinesearch_stage_oh_ambiguous_context_issue70();

  for rec in
    select *
    from private_verification.brinesearch_oh_context_resolutions_issue70
    where applied_at is null
    order by step_id
  loop
    select * into m
    from private_verification.brinesearch_oh_road_matches_issue70
    where step_id=rec.step_id and match_status='ambiguous' and applied_at is null;
    if not found then
      continue;
    end if;

    select * into p from public.pads where id=m.pad_id;
    if p.id is null or p.latitude is distinct from rec.pad_latitude or p.longitude is distinct from rec.pad_longitude then
      v_held:=v_held+1;
      continue;
    end if;
    if rec.prev_road_id is not null and not exists (
      select 1 from public.brinesearch_roads r
      where r.id=rec.prev_road_id and r.centerline_geojson is not null
        and pg_catalog.md5(r.centerline_geojson::text)=rec.prev_geometry_digest
    ) then
      v_held:=v_held+1;
      continue;
    end if;
    if rec.next_road_id is not null and not exists (
      select 1 from public.brinesearch_roads r
      where r.id=rec.next_road_id and r.centerline_geojson is not null
        and pg_catalog.md5(r.centerline_geojson::text)=rec.next_geometry_digest
    ) then
      v_held:=v_held+1;
      continue;
    end if;

    select
      extensions.st_unaryunion(extensions.st_collect(c.geom order by c.objectid)),
      count(*)::integer,count(c.geom)::integer
    into v_geom,v_expected,v_loaded
    from public.brinesearch_odot_road_catalog c
    where c.nlf_id=rec.selected_nlf_id
      and (
        (m.route_type_hint is not null
          and c.route_type=m.route_type_hint
          and c.route_number_normalized=m.route_number_hint)
        or (m.route_type_hint is null
          and c.street_match_key=m.step_key
          and coalesce(c.route_type,'') not in ('IR','US','SR'))
      );
    if v_geom is null or v_expected=0 or v_loaded<>v_expected
       or not extensions.st_isvalid(v_geom) or extensions.st_isempty(v_geom) then
      v_held:=v_held+1;
      continue;
    end if;
    v_geom_digest:=pg_catalog.md5(extensions.st_asgeojson(v_geom,7)::jsonb::text);
    if v_geom_digest<>rec.candidate_geometry_digest then
      v_held:=v_held+1;
      continue;
    end if;

    v_road_type:=case rec.official_route_type
      when 'CR' then 'county'
      when 'TR' then 'township'
      else 'local'
    end;
    v_route_number:=case when rec.official_route_type in ('CR','TR') then rec.official_route_number end;
    v_canonical:=coalesce(
      nullif(pg_catalog.initcap(pg_catalog.lower(pg_catalog.replace(rec.official_name,'-',' '))),''),
      case rec.official_route_type when 'CR' then 'CR-'||v_route_number when 'TR' then 'TR-'||v_route_number else m.raw_text end
    );
    v_identity:=case
      when m.route_type_hint is null and m.step_key<>'' then rec.selected_nlf_id||'|street:'||m.step_key
      else rec.selected_nlf_id||'|route:'||coalesce(rec.official_route_type,'')||':'||coalesce(rec.official_route_number,'')
    end;

    select pg_catalog.array_agg(distinct x order by x)
    into v_aliases
    from pg_catalog.unnest(pg_catalog.array_remove(array[
      m.raw_text,rec.official_name,
      case rec.official_route_type when 'CR' then 'CR-'||rec.official_route_number when 'TR' then 'TR-'||rec.official_route_number end
    ],null)) x
    where nullif(pg_catalog.btrim(x),'') is not null
      and pg_catalog.lower(pg_catalog.btrim(x))<>pg_catalog.lower(pg_catalog.btrim(v_canonical));

    v_road_id:=null;
    select count(*) into v_existing_count
    from public.brinesearch_roads r where r.source_record_id=v_identity;
    if v_existing_count=1 then
      select r.id into v_road_id from public.brinesearch_roads r
      where r.source_record_id=v_identity order by r.updated_at desc,r.id limit 1;
    elsif v_existing_count>1 then
      v_held:=v_held+1;
      continue;
    end if;

    if v_existing_count=0 then
      select count(*) into v_existing_count
      from public.brinesearch_roads r
      where r.state='OH'
        and pg_catalog.lower(coalesce(r.county,''))=pg_catalog.lower(coalesce(m.county,''))
        and (
          (m.step_key<>'' and public.brinesearch_road_name_core(r.canonical_name)=m.step_key)
          or (m.step_key='' and r.road_type=v_road_type and r.route_number=v_route_number)
        )
        and (
          r.source_agency is null
          or r.source_method='explicit_in_saved_directions'
          or (r.source_agency='OpenStreetMap' and r.source_method='owner_map_tap_v17328')
        );
      if v_existing_count=1 then
        select r.id into v_road_id
        from public.brinesearch_roads r
        where r.state='OH'
          and pg_catalog.lower(coalesce(r.county,''))=pg_catalog.lower(coalesce(m.county,''))
          and (
            (m.step_key<>'' and public.brinesearch_road_name_core(r.canonical_name)=m.step_key)
            or (m.step_key='' and r.road_type=v_road_type and r.route_number=v_route_number)
          )
          and (
            r.source_agency is null
            or r.source_method='explicit_in_saved_directions'
            or (r.source_agency='OpenStreetMap' and r.source_method='owner_map_tap_v17328')
          )
        order by r.updated_at desc,r.id limit 1;
      elsif v_existing_count>1 then
        v_held:=v_held+1;
        continue;
      end if;
    end if;

    if v_road_id is null then
      insert into public.brinesearch_roads(
        canonical_name,normalized_name,road_type,state,county,township,aliases,
        truck_route,verification_status,verified_at,route_number,
        source_agency,source_dataset,source_method,source_url,source_record_id,
        centerline_geojson,geometry_status,geometry_checked_at,
        candidate_only,approved_by_default,notes
      ) values (
        v_canonical,public.brinesearch_road_match_key(v_canonical),v_road_type,'OH',m.county,null,coalesce(v_aliases,'{}'::text[]),
        null,'verified',now(),v_route_number,
        'Ohio Department of Transportation','Road Inventory','official_odot_issue70_strict_context',
        'https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0',
        v_identity,extensions.st_asgeojson(v_geom,7)::jsonb,'official_centerline_loaded',now(),
        false,false,'Issue #70 strict spatial/topology context resolution; no fuzzy/name-similarity decision.'
      ) returning id into v_road_id;
      v_created:=v_created+1;
    else
      update public.brinesearch_roads r
      set aliases=(
            select pg_catalog.array_agg(distinct x order by x)
            from pg_catalog.unnest(coalesce(r.aliases,'{}'::text[])||coalesce(v_aliases,'{}'::text[])) x
            where nullif(pg_catalog.btrim(x),'') is not null
          ),
          verification_status='verified',verified_at=coalesce(r.verified_at,now()),
          route_number=coalesce(r.route_number,v_route_number),
          source_agency=case when r.source_agency is null or r.source_method='explicit_in_saved_directions' or (r.source_agency='OpenStreetMap' and r.source_method='owner_map_tap_v17328') then 'Ohio Department of Transportation' else r.source_agency end,
          source_dataset=case when r.source_agency is null or r.source_method='explicit_in_saved_directions' or (r.source_agency='OpenStreetMap' and r.source_method='owner_map_tap_v17328') then 'Road Inventory' else r.source_dataset end,
          source_method=case when r.source_agency is null or r.source_method='explicit_in_saved_directions' or (r.source_agency='OpenStreetMap' and r.source_method='owner_map_tap_v17328') then 'official_odot_issue70_strict_context' else r.source_method end,
          source_url=coalesce(r.source_url,'https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0'),
          source_record_id=case when r.source_record_id is null or r.source_method='explicit_in_saved_directions' or (r.source_agency='OpenStreetMap' and r.source_method='owner_map_tap_v17328') then v_identity else r.source_record_id end,
          centerline_geojson=case when r.centerline_geojson is null or r.source_agency is null or r.source_method='explicit_in_saved_directions' or (r.source_agency='OpenStreetMap' and r.source_method='owner_map_tap_v17328') then extensions.st_asgeojson(v_geom,7)::jsonb else r.centerline_geojson end,
          geometry_status=case when r.centerline_geojson is null or r.source_agency is null or r.source_method='explicit_in_saved_directions' or (r.source_agency='OpenStreetMap' and r.source_method='owner_map_tap_v17328') then 'official_centerline_loaded' else r.geometry_status end,
          geometry_checked_at=now(),candidate_only=false,updated_at=now(),
          notes=pg_catalog.btrim(coalesce(r.notes,'')||' #70 strict official context verified.')
      where r.id=v_road_id;
      v_reused:=v_reused+1;
    end if;

    update public.brinesearch_route_prep_steps s
    set road_id=v_road_id,
        step_kind=case v_road_type when 'county' then 'county_road' when 'township' then 'township_road' else 'local_road' end,
        match_status='exact_master',
        match_method='official_odot_issue70_strict_context',
        match_confidence=1.0,
        source_details=coalesce(s.source_details,'{}'::jsonb)||m.source_snapshot||rec.evidence||pg_catalog.jsonb_build_object(
          'source_record_id',v_identity,
          'road_id',v_road_id,
          'selected_nlf_id',rec.selected_nlf_id,
          'resolution_basis',rec.resolution_basis,
          'local_road_guessing',false,
          'fuzzy_matching',false,
          'name_similarity_decision',false,
          'match_basis','strict official geometry + pad/verified-neighbor context'
        ),
        geometry_status='ready',updated_at=now()
    where s.id=rec.step_id and s.road_id is null;

    if found then
      update private_verification.brinesearch_oh_road_matches_issue70
      set selected_nlf_id=rec.selected_nlf_id,
          selected_street_key=case when route_type_hint is null then step_key else selected_street_key end,
          selected_route_type=rec.official_route_type,
          selected_route_number=rec.official_route_number,
          official_name=rec.official_name,
          match_method='official_odot_issue70_strict_context',
          match_status='applied',geometry_status='applied',
          source_snapshot=source_snapshot||rec.evidence||pg_catalog.jsonb_build_object('applied_road_id',v_road_id,'strict_context',true),
          applied_road_id=v_road_id,applied_at=now()
      where step_id=rec.step_id;
      update private_verification.brinesearch_oh_context_resolutions_issue70
      set applied_road_id=v_road_id,applied_at=now()
      where step_id=rec.step_id;
      v_applied:=v_applied+1;
    end if;
  end loop;

  perform public.road_manager_recalculate_route_readiness();
  return pg_catalog.jsonb_build_object(
    'strict_context_steps_applied',v_applied,
    'road_manager_records_created',v_created,
    'existing_road_manager_records_reused',v_reused,
    'held_after_revalidation',v_held,
    'policy','Only fresh strict spatial/topology resolutions are applied; all other ambiguous candidates remain held.'
  );
end;
$$;

revoke all on function public.brinesearch_apply_oh_ambiguous_context_issue70() from public,anon;
grant execute on function public.brinesearch_apply_oh_ambiguous_context_issue70() to authenticated;

comment on function public.brinesearch_stage_oh_ambiguous_context_issue70() is
  'Issue #70: stages only complete-candidate strict spatial/topology ambiguity resolutions; no fuzzy/name similarity decision.';
comment on function public.brinesearch_apply_oh_ambiguous_context_issue70() is
  'Issue #70: applies only freshly revalidated strict context resolutions and leaves all other ambiguous rows held.';
