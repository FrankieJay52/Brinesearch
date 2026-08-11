-- GitHub #70 runtime corrections found during pre-rehearsal review.
--
-- The base migration is intentionally left as the durable first schema/function
-- definition. This follow-up replaces the two runtime functions before the #70
-- pipeline is ever executed. It removes invalid schema-qualification of SQL
-- POSITION syntax and avoids unsupported min(uuid) aggregation when selecting an
-- existing Road Manager record.

create or replace function public.brinesearch_load_oh_road_geometry_issue70(p_batch_size integer default 150)
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
    raise exception 'Only the BrineSearch Owner may load #70 Ohio road geometry';
  end if;

  perform public.brinesearch_refresh_oh_road_matches_issue70();

  loop
    with needed as (
      select distinct c.objectid
      from private_verification.brinesearch_oh_road_matches_issue70 m
      join public.brinesearch_odot_road_catalog c
        on c.nlf_id=m.selected_nlf_id
       and (
         (m.match_method='exact_odot_route_number'
           and c.route_type=m.route_type_hint
           and c.route_number_normalized=m.route_number_hint)
         or (m.match_method in ('exact_odot_street_name','exact_odot_route_number_and_name')
           and m.step_key<>'' and c.street_match_key=m.step_key)
       )
      where m.match_status='unique_exact'
        and m.applied_at is null
        and c.objectid is not null
        and c.geom is null

      union

      select distinct c.objectid
      from public.brinesearch_roads r
      join public.brinesearch_odot_road_catalog c
        on c.nlf_id=pg_catalog.split_part(r.source_record_id,'|',1)
       and (
         pg_catalog.strpos(r.source_record_id,'|street:')=0
         or c.street_match_key=pg_catalog.split_part(r.source_record_id,'|street:',2)
       )
      where r.source_agency='Ohio Department of Transportation'
        and r.centerline_geojson is null
        and r.source_record_id is not null
        and c.objectid is not null
        and c.geom is null
    )
    select pg_catalog.array_agg(objectid order by objectid)
    into v_object_ids
    from (
      select objectid from needed order by objectid limit v_batch
    ) q;

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
      raise exception 'ODOT geometry query failed: %',v_response->'error';
    end if;

    v_features:=coalesce(v_response->'features','[]'::jsonb);
    if pg_catalog.jsonb_array_length(v_features)=0 then
      raise exception 'ODOT geometry query returned no features for requested #70 object IDs';
    end if;

    with parsed as (
      select
        (f->'properties'->>'OBJECTID')::bigint as objectid,
        extensions.st_setsrid(extensions.st_geomfromgeojson((f->'geometry')::text),4326) as geom
      from pg_catalog.jsonb_array_elements(v_features) f
      where f->'geometry' is not null
    )
    update public.brinesearch_odot_road_catalog c
    set geom=p.geom,geometry_loaded_at=now(),fetched_at=now()
    from parsed p
    where c.objectid=p.objectid;
    get diagnostics v_rows=row_count;

    if v_rows=0 then
      raise exception 'ODOT #70 geometry batch produced no catalog updates';
    end if;

    v_loaded:=v_loaded+v_rows;
    v_batches:=v_batches+1;
  end loop;

  perform public.brinesearch_refresh_oh_road_matches_issue70();

  return pg_catalog.jsonb_build_object(
    'geometry_batches',v_batches,
    'catalog_segments_loaded',v_loaded,
    'source','Ohio Department of Transportation Road Inventory',
    'policy','Only object IDs belonging to exact #70 staged identities or already-exact ODOT Road Manager identities were requested.'
  );
end;
$$;

create or replace function public.brinesearch_apply_oh_road_matches_issue70()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_caller uuid:=auth.uid();
  rec record;
  v_road_id uuid;
  v_existing_count integer;
  v_road_type text;
  v_route_number text;
  v_state text;
  v_county text;
  v_canonical text;
  v_normalized text;
  v_identity text;
  v_aliases text[];
  v_geom extensions.geometry;
  v_official_name text;
  v_official_route_type text;
  v_official_route_number text;
  v_expected integer;
  v_loaded integer;
  v_created integer:=0;
  v_reused integer:=0;
  v_steps integer:=0;
  v_existing_geometry integer:=0;
begin
  if v_caller is null or not public.is_brinesearch_owner(v_caller) then
    raise exception 'Only the BrineSearch Owner may apply #70 Ohio road matches';
  end if;

  perform public.brinesearch_refresh_oh_road_matches_issue70();

  with exact_roads as (
    select
      r.id,
      pg_catalog.split_part(r.source_record_id,'|',1) as nlf_id,
      case when pg_catalog.strpos(r.source_record_id,'|street:')>0
        then pg_catalog.split_part(r.source_record_id,'|street:',2)
      end as street_key
    from public.brinesearch_roads r
    where r.source_agency='Ohio Department of Transportation'
      and r.source_record_id is not null
      and r.centerline_geojson is null
  ), aggregated as (
    select e.id,
      extensions.st_unaryunion(extensions.st_collect(c.geom)) as geom,
      count(*)::integer as expected_rows,
      count(c.geom)::integer as loaded_rows
    from exact_roads e
    join public.brinesearch_odot_road_catalog c
      on c.nlf_id=e.nlf_id
     and (e.street_key is null or c.street_match_key=e.street_key)
    group by e.id
    having count(*)>0 and count(*)=count(c.geom)
  )
  update public.brinesearch_roads r
  set centerline_geojson=extensions.st_asgeojson(a.geom,7)::jsonb,
      geometry_status='official_centerline_loaded',
      geometry_checked_at=now(),
      updated_at=now(),
      notes=pg_catalog.btrim(coalesce(r.notes,'')||' #70 completed exact ODOT Road Inventory centerline.')
  from aggregated a
  where r.id=a.id;
  get diagnostics v_existing_geometry=row_count;

  for rec in
    select *
    from private_verification.brinesearch_oh_road_matches_issue70
    where match_status='unique_exact'
      and geometry_status='complete'
      and applied_at is null
    order by company,pad_name,route_prep_id,step_id
  loop
    select
      min(c.official_name),min(c.route_type),min(c.route_number_normalized),
      extensions.st_unaryunion(extensions.st_collect(c.geom)),
      count(*)::integer,count(c.geom)::integer
    into v_official_name,v_official_route_type,v_official_route_number,v_geom,v_expected,v_loaded
    from public.brinesearch_odot_road_catalog c
    where c.nlf_id=rec.selected_nlf_id
      and (
        (rec.match_method='exact_odot_route_number'
          and c.route_type=rec.route_type_hint
          and c.route_number_normalized=rec.route_number_hint)
        or (rec.match_method in ('exact_odot_street_name','exact_odot_route_number_and_name')
          and rec.step_key<>'' and c.street_match_key=rec.step_key)
      );

    if v_geom is null or v_expected=0 or v_loaded<>v_expected then
      update private_verification.brinesearch_oh_road_matches_issue70
      set geometry_status='needs_geometry',
          source_snapshot=source_snapshot||pg_catalog.jsonb_build_object('held_reason','official_geometry_incomplete_after_refresh')
      where step_id=rec.step_id;
      continue;
    end if;

    v_road_type:=case v_official_route_type
      when 'IR' then 'interstate'
      when 'US' then 'us_route'
      when 'SR' then 'state_route'
      when 'CR' then 'county'
      when 'TR' then 'township'
      else 'local'
    end;
    v_route_number:=case when v_official_route_type in ('IR','US','SR','CR','TR')
      then v_official_route_number else null end;
    v_state:=case when v_road_type in ('interstate','us_route') then null else 'OH' end;
    v_county:=case when v_road_type in ('interstate','us_route','state_route') then null else rec.county end;
    v_canonical:=case v_road_type
      when 'interstate' then 'I-'||coalesce(v_route_number,'')
      when 'us_route' then 'US-'||coalesce(v_route_number,'')
      when 'state_route' then 'OH-'||coalesce(v_route_number,'')
      else coalesce(nullif(pg_catalog.initcap(pg_catalog.lower(pg_catalog.replace(coalesce(v_official_name,''),'-',' '))),''),rec.raw_text)
    end;
    v_normalized:=public.brinesearch_road_match_key(v_canonical);
    v_identity:=case
      when v_road_type in ('interstate','us_route','state_route') then rec.selected_nlf_id
      when rec.match_method in ('exact_odot_street_name','exact_odot_route_number_and_name') and rec.step_key<>''
        then rec.selected_nlf_id||'|street:'||rec.step_key
      else rec.selected_nlf_id||'|route:'||coalesce(v_official_route_type,'')||':'||coalesce(v_official_route_number,'')
    end;

    select pg_catalog.array_agg(distinct x order by x)
    into v_aliases
    from pg_catalog.unnest(pg_catalog.array_remove(array[
      rec.raw_text,
      v_official_name,
      case v_official_route_type
        when 'IR' then 'I-'||v_official_route_number
        when 'US' then 'US-'||v_official_route_number
        when 'SR' then 'OH-'||v_official_route_number
        when 'CR' then 'CR-'||v_official_route_number
        when 'TR' then 'TR-'||v_official_route_number
        else null
      end
    ],null)) x
    where nullif(pg_catalog.btrim(x),'') is not null
      and pg_catalog.lower(pg_catalog.btrim(x))<>pg_catalog.lower(pg_catalog.btrim(v_canonical));

    v_road_id:=null;
    v_existing_count:=0;

    if v_road_type in ('interstate','us_route','state_route') then
      select count(*) into v_existing_count
      from public.brinesearch_roads r
      where r.road_type=v_road_type
        and r.route_number=v_route_number
        and (v_state is null or r.state=v_state);
      if v_existing_count=1 then
        select r.id into v_road_id
        from public.brinesearch_roads r
        where r.road_type=v_road_type
          and r.route_number=v_route_number
          and (v_state is null or r.state=v_state)
        order by r.updated_at desc,r.id
        limit 1;
      end if;
    else
      -- Generated road_identity_key is based on source_record_id, so check the
      -- official identity regardless of source_agency before attempting a legacy
      -- upgrade. This avoids duplicate identity-key writes.
      select count(*) into v_existing_count
      from public.brinesearch_roads r
      where r.source_record_id=v_identity;
      if v_existing_count=1 then
        select r.id into v_road_id
        from public.brinesearch_roads r
        where r.source_record_id=v_identity
        order by r.updated_at desc,r.id
        limit 1;
      end if;

      if v_existing_count=0 then
        select count(*) into v_existing_count
        from public.brinesearch_roads r
        where r.state='OH'
          and pg_catalog.lower(coalesce(r.county,''))=pg_catalog.lower(coalesce(v_county,''))
          and (
            (rec.step_key<>'' and public.brinesearch_road_name_core(r.canonical_name)=rec.step_key)
            or (rec.step_key='' and r.road_type=v_road_type and r.route_number=v_route_number)
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
            and pg_catalog.lower(coalesce(r.county,''))=pg_catalog.lower(coalesce(v_county,''))
            and (
              (rec.step_key<>'' and public.brinesearch_road_name_core(r.canonical_name)=rec.step_key)
              or (rec.step_key='' and r.road_type=v_road_type and r.route_number=v_route_number)
            )
            and (
              r.source_agency is null
              or r.source_method='explicit_in_saved_directions'
              or (r.source_agency='OpenStreetMap' and r.source_method='owner_map_tap_v17328')
            )
          order by r.updated_at desc,r.id
          limit 1;
        end if;
      end if;
    end if;

    if v_existing_count>1 then
      update private_verification.brinesearch_oh_road_matches_issue70
      set match_status='held',geometry_status='held',
          source_snapshot=source_snapshot||pg_catalog.jsonb_build_object(
            'held_reason','multiple_existing_road_manager_records_for_exact_identity',
            'existing_record_count',v_existing_count
          )
      where step_id=rec.step_id;
      continue;
    end if;

    if v_road_id is null then
      insert into public.brinesearch_roads(
        canonical_name,normalized_name,road_type,state,county,township,aliases,
        truck_route,verification_status,verified_at,route_number,
        source_agency,source_dataset,source_method,source_url,source_record_id,
        centerline_geojson,geometry_status,geometry_checked_at,
        candidate_only,approved_by_default,notes
      ) values (
        v_canonical,v_normalized,v_road_type,v_state,v_county,null,coalesce(v_aliases,'{}'::text[]),
        null,'verified',now(),v_route_number,
        'Ohio Department of Transportation','Road Inventory','official_odot_issue70_unique_exact',
        'https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0',
        v_identity,extensions.st_asgeojson(v_geom,7)::jsonb,'official_centerline_loaded',now(),
        false,case when v_road_type='state_route' then true else false end,
        'Issue #70 all-operator unique exact ODOT identity. No fuzzy/local-road guessing.'
      ) returning id into v_road_id;
      v_created:=v_created+1;
    else
      update public.brinesearch_roads r
      set aliases=(
            select pg_catalog.array_agg(distinct x order by x)
            from pg_catalog.unnest(coalesce(r.aliases,'{}'::text[])||coalesce(v_aliases,'{}'::text[])) x
            where nullif(pg_catalog.btrim(x),'') is not null
          ),
          verification_status='verified',
          verified_at=coalesce(r.verified_at,now()),
          route_number=coalesce(r.route_number,v_route_number),
          source_agency=case when v_road_type in ('interstate','us_route','state_route') and r.source_agency is not null
            then r.source_agency else 'Ohio Department of Transportation' end,
          source_dataset=case when v_road_type in ('interstate','us_route','state_route') and r.source_dataset is not null
            then r.source_dataset else 'Road Inventory' end,
          source_method=case when v_road_type in ('interstate','us_route','state_route') and r.source_method is not null
            then r.source_method else 'official_odot_issue70_unique_exact' end,
          source_url=coalesce(r.source_url,'https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0'),
          source_record_id=case when v_road_type in ('interstate','us_route','state_route') and r.source_record_id is not null
            then r.source_record_id else v_identity end,
          centerline_geojson=case
            when r.centerline_geojson is null
              or r.source_agency is null
              or r.source_method='explicit_in_saved_directions'
              or (r.source_agency='OpenStreetMap' and r.source_method='owner_map_tap_v17328')
            then extensions.st_asgeojson(v_geom,7)::jsonb
            else r.centerline_geojson
          end,
          geometry_status=case
            when r.centerline_geojson is null
              or r.source_agency is null
              or r.source_method='explicit_in_saved_directions'
              or (r.source_agency='OpenStreetMap' and r.source_method='owner_map_tap_v17328')
            then 'official_centerline_loaded'
            else r.geometry_status
          end,
          geometry_checked_at=now(),
          candidate_only=false,
          approved_by_default=case when v_road_type='state_route' then true else r.approved_by_default end,
          updated_at=now(),
          notes=pg_catalog.btrim(coalesce(r.notes,'')||' #70 exact ODOT identity/geometry verified.')
      where r.id=v_road_id;
      v_reused:=v_reused+1;
    end if;

    update public.brinesearch_route_prep_steps s
    set road_id=v_road_id,
        step_kind=case v_road_type
          when 'interstate' then 'interstate'
          when 'us_route' then 'us_route'
          when 'state_route' then 'state_route'
          when 'county' then 'county_road'
          when 'township' then 'township_road'
          else 'local_road'
        end,
        match_status='exact_master',
        match_method='official_odot_issue70_unique_exact',
        match_confidence=1.0,
        source_details=coalesce(s.source_details,'{}'::jsonb)||rec.source_snapshot||pg_catalog.jsonb_build_object(
          'source_record_id',v_identity,
          'road_id',v_road_id,
          'official_street_name',v_official_name,
          'official_route_type',v_official_route_type,
          'official_route_number',v_official_route_number,
          'local_road_guessing',false,
          'fuzzy_matching',false,
          'match_basis','unique exact county-scoped ODOT identity'
        ),
        geometry_status='ready',
        updated_at=now()
    where s.id=rec.step_id and s.road_id is null;

    if found then
      v_steps:=v_steps+1;
      update private_verification.brinesearch_oh_road_matches_issue70
      set match_status='applied',geometry_status='applied',applied_road_id=v_road_id,applied_at=now(),
          source_snapshot=source_snapshot||pg_catalog.jsonb_build_object('applied_road_id',v_road_id,'road_identity_key',v_identity)
      where step_id=rec.step_id;
    end if;
  end loop;

  perform public.road_manager_recalculate_route_readiness();

  return pg_catalog.jsonb_build_object(
    'existing_exact_odot_roads_geometry_completed',v_existing_geometry,
    'road_manager_records_created',v_created,
    'existing_road_manager_records_reused',v_reused,
    'route_steps_exactly_matched',v_steps,
    'policy','All applied rows are unique exact county-scoped ODOT identities with complete official geometry. Ambiguous/no-match rows remain held.'
  );
end;
$$;

revoke all on function public.brinesearch_load_oh_road_geometry_issue70(integer) from public,anon;
grant execute on function public.brinesearch_load_oh_road_geometry_issue70(integer) to authenticated;
revoke all on function public.brinesearch_apply_oh_road_matches_issue70() from public,anon;
grant execute on function public.brinesearch_apply_oh_road_matches_issue70() to authenticated;
