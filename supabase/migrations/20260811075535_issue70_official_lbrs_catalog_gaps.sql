-- GitHub #70 — recover exact Ohio road identities that are missing from the
-- current ODOT Road Inventory catalog but are present in the official Statewide
-- LBRS Centerlines service hosted at maps.ohio.gov.
--
-- These targets are not inferred by name similarity. Each already has durable
-- BrineSearch saved Clear Direction evidence for one local-name / numbered-route
-- identity and is currently held specifically as `held_catalog_gap`. The migration
-- requires the exact official LBRS NLFID, exact road number, matching county/township
-- jurisdiction type, at least one exact local street-name feature, and complete
-- geometry for every returned feature. Any mismatch aborts the transaction.
--
-- No nearest-road/spatial/fuzzy identity decision and no #69 route publication.

create table if not exists private_verification.brinesearch_lbrs_catalog_gap_issue70 (
  nlfid text primary key,
  county text not null,
  local_alias text not null,
  route_type text not null,
  route_number text not null,
  route_label text not null,
  source_feature_count integer not null,
  source_names text[] not null default '{}'::text[],
  geometry_digest text not null,
  source_url text not null,
  source_checked_at timestamptz not null default now(),
  road_id uuid references public.brinesearch_roads(id),
  route_steps_linked integer not null default 0,
  evidence jsonb not null default '{}'::jsonb,
  constraint brinesearch_lbrs_catalog_gap_issue70_type_check check (route_type in ('CR','TR'))
);

alter table private_verification.brinesearch_lbrs_catalog_gap_issue70 enable row level security;
alter table private_verification.brinesearch_lbrs_catalog_gap_issue70 force row level security;
revoke all on private_verification.brinesearch_lbrs_catalog_gap_issue70 from public,anon,authenticated;
grant select,insert,update,delete on private_verification.brinesearch_lbrs_catalog_gap_issue70 to service_role;

comment on table private_verification.brinesearch_lbrs_catalog_gap_issue70 is
  'Issue #70 official Ohio Statewide LBRS source proof for exact Road Manager catalog-gap recovery; never a fuzzy/nearest-road source.';

do $issue70_lbrs$
declare
  rec record;
  v_response extensions.http_response;
  v_json jsonb;
  v_features jsonb;
  v_feature_count integer;
  v_geom_count integer;
  v_nlf_count integer;
  v_num_count integer;
  v_jur_count integer;
  v_name_count integer;
  v_names text[];
  v_geom extensions.geometry;
  v_digest text;
  v_existing integer;
  v_road_id uuid;
  v_linked integer;
  v_expected_jur text;
  v_alias_base text;
  v_source_url constant text := 'https://maps.ohio.gov/arcgis/rest/services/Hosted/Ohio_Statewide_LBRS_Centerlines/FeatureServer/0';
  v_query_url text;
begin
  for rec in
    select * from (values
      ('Harrison','Douglas Turn Rd','CR','33','CHASCR00033**C'),
      ('Harrison','Minksville Rd','CR','54','CHASCR00054**C'),
      ('Harrison','Brushy Fork Rd','CR','1','CHASCR00001**C'),
      ('Harrison','Moore Rd','TR','336','THASTR00336**C'),
      ('Harrison','Old Piedmont Rd','CR','16','CHASCR00016**C'),
      ('Harrison','Bower Rd','CR','43','CHASCR00043**C'),
      ('Harrison','Amsterdam Rd','CR','51','CHASCR00051**C'),
      ('Harrison','Brown Hill Rd','CR','19','CHASCR00019**C'),
      ('Harrison','Oak Hill Rd','TR','212','THASTR00212**C'),
      ('Harrison','Toker Rd','TR','164','THASTR00164**C'),
      ('Harrison','Willis Run Rd','TR','213','THASTR00213**C')
    ) as x(county,local_alias,route_type,route_number,nlfid)
  loop
    v_expected_jur:=case rec.route_type when 'CR' then 'C' else 'T' end;
    v_alias_base:=upper(regexp_replace(rec.local_alias,'[[:space:]]+(RD|ROAD)$','','i'));

    -- The road must still be an active unresolved step supported by the durable
    -- saved alias/number evidence that was held only because ODOT catalog coverage
    -- was missing. If that state changed, stop rather than replay stale evidence.
    if not exists (
      select 1
      from private_verification.brinesearch_saved_alias_reconcile_issue70 e
      join public.brinesearch_route_prep_steps s on s.id=e.step_id
      join public.brinesearch_route_prep rp on rp.id=s.route_prep_id and rp.active
      join public.pads p on p.id=rp.pad_id
      where e.applied_at is null
        and e.decision='held_catalog_gap'
        and lower(e.county)=lower(rec.county)
        and lower(e.local_alias)=lower(rec.local_alias)
        and e.route_label=rec.route_type||'-'||rec.route_number
        and s.active and s.road_id is null
        and lower(btrim(s.raw_text))=lower(btrim(rec.local_alias))
        and upper(coalesce(rp.state,p.state,'')) in ('OH','OHIO')
    ) then
      raise exception '#70 LBRS target % / % is no longer an exact active held_catalog_gap',rec.local_alias,rec.route_type||'-'||rec.route_number;
    end if;

    v_query_url:=v_source_url||'/query?where=NLFID%3D%27'||replace(rec.nlfid,'*','%2A')||
      '%27&outFields=objectid%2Cseg_id%2Cstr_name%2Cstr_type%2Crd_num%2Cjurisdic%2Cnlfid%2Cl_twp%2Cr_twp%2Clength3d&returnGeometry=true&outSR=4326&f=geojson';
    v_response:=extensions.http_get(v_query_url);
    if v_response.status<>200 then
      raise exception '#70 LBRS source request failed for %: HTTP %',rec.nlfid,v_response.status;
    end if;
    v_json:=v_response.content::jsonb;
    if v_json ? 'error' then
      raise exception '#70 LBRS source returned an error for %: %',rec.nlfid,v_json->'error';
    end if;
    v_features:=coalesce(v_json->'features','[]'::jsonb);
    v_feature_count:=jsonb_array_length(v_features);
    if v_feature_count=0 then
      raise exception '#70 LBRS source returned no features for %',rec.nlfid;
    end if;

    select
      count(*) filter(where f->'geometry' is not null),
      count(distinct f->'properties'->>'nlfid'),
      count(distinct f->'properties'->>'rd_num'),
      count(distinct f->'properties'->>'jurisdic'),
      count(*) filter(where upper(btrim(coalesce(f->'properties'->>'str_name','')))=v_alias_base),
      array_agg(distinct upper(btrim(coalesce(f->'properties'->>'str_name',''))) order by upper(btrim(coalesce(f->'properties'->>'str_name','')))),
      extensions.st_unaryunion(extensions.st_collect(extensions.st_setsrid(extensions.st_geomfromgeojson((f->'geometry')::text),4326)))
    into v_geom_count,v_nlf_count,v_num_count,v_jur_count,v_name_count,v_names,v_geom
    from jsonb_array_elements(v_features) f;

    if v_geom_count<>v_feature_count or v_geom is null then
      raise exception '#70 LBRS geometry incomplete for %: %/% features',rec.nlfid,v_geom_count,v_feature_count;
    end if;
    if v_nlf_count<>1 or exists (
      select 1 from jsonb_array_elements(v_features) f
      where f->'properties'->>'nlfid'<>rec.nlfid
    ) then
      raise exception '#70 LBRS NLF identity mismatch for %',rec.nlfid;
    end if;
    if v_num_count<>1 or exists (
      select 1 from jsonb_array_elements(v_features) f
      where f->'properties'->>'rd_num'<>rec.route_number
    ) then
      raise exception '#70 LBRS route number mismatch for % expected %',rec.nlfid,rec.route_number;
    end if;
    if v_jur_count<>1 or exists (
      select 1 from jsonb_array_elements(v_features) f
      where f->'properties'->>'jurisdic'<>v_expected_jur
    ) then
      raise exception '#70 LBRS jurisdiction mismatch for % expected %',rec.nlfid,v_expected_jur;
    end if;
    if v_name_count=0 then
      raise exception '#70 LBRS NLF % does not contain exact saved local name %',rec.nlfid,v_alias_base;
    end if;

    v_digest:=md5(extensions.st_asgeojson(v_geom,7));

    select count(*),(min(r.id::text))::uuid
    into v_existing,v_road_id
    from public.brinesearch_roads r
    where r.state='OH'
      and lower(coalesce(r.county,''))=lower(rec.county)
      and r.road_type=case rec.route_type when 'CR' then 'county' else 'township' end
      and (
        split_part(coalesce(r.source_record_id,''),'|',1)=rec.nlfid
        or upper(regexp_replace(coalesce(r.route_number,''),'[^0-9A-Z]','','g'))=upper(rec.route_number)
      );
    if v_existing<>0 then
      raise exception '#70 LBRS target % unexpectedly has % Road Manager identity candidates',rec.nlfid,v_existing;
    end if;

    insert into public.brinesearch_roads(
      canonical_name,normalized_name,road_type,state,county,aliases,
      verification_status,verified_at,route_number,
      source_agency,source_dataset,source_method,source_url,source_record_id,
      centerline_geojson,geometry_status,geometry_checked_at,candidate_only,approved_by_default,notes
    ) values (
      rec.route_type||'-'||rec.route_number,
      public.brinesearch_road_match_key(rec.route_type||'-'||rec.route_number),
      case rec.route_type when 'CR' then 'county' else 'township' end,
      'OH',rec.county,array[rec.route_type||'-'||rec.route_number,rec.local_alias]::text[],
      'verified',now(),rec.route_number,
      'State of Ohio','Ohio Statewide LBRS Centerlines','official_ohio_lbrs_issue70_catalog_gap',
      v_source_url,rec.nlfid||'|route:'||rec.route_type||':'||rec.route_number,
      extensions.st_asgeojson(v_geom,7)::jsonb,'official_centerline_loaded',now(),false,false,
      'Issue #70 exact catalog-gap recovery from official Ohio Statewide LBRS NLF. Local alias is supported by saved Clear Directions and an exact LBRS street-name feature; other LBRS street names remain source evidence only.'
    ) returning id into v_road_id;

    update public.brinesearch_route_prep_steps s
    set road_id=v_road_id,
        step_kind=case rec.route_type when 'CR' then 'county_road' else 'township_road' end,
        match_status='exact_master',
        match_method='official_lbrs_exact_catalog_gap_issue70',
        match_confidence=1.0,
        source_details=coalesce(s.source_details,'{}'::jsonb)||jsonb_build_object(
          'issue',70,
          'match_basis','saved Clear Direction exact local-name/number pair + exact official Ohio LBRS NLF/name/number/jurisdiction/geometry',
          'local_alias',rec.local_alias,
          'route_label',rec.route_type||'-'||rec.route_number,
          'official_lbrs_nlfid',rec.nlfid,
          'official_lbrs_names',to_jsonb(v_names),
          'official_lbrs_feature_count',v_feature_count,
          'road_geometry_digest',v_digest,
          'road_id',v_road_id,
          'fuzzy_matching',false,
          'name_similarity_decision',false,
          'normalized_core_decision',false,
          'spatial_fallback',false,
          'nearest_road_fallback',false
        ),
        geometry_status='ready',updated_at=now()
    where s.active and s.road_id is null
      and lower(btrim(s.raw_text))=lower(btrim(rec.local_alias))
      and exists (
        select 1
        from private_verification.brinesearch_saved_alias_reconcile_issue70 e
        where e.step_id=s.id
          and e.applied_at is null
          and e.decision='held_catalog_gap'
          and e.route_label=rec.route_type||'-'||rec.route_number
      );
    get diagnostics v_linked=row_count;
    if v_linked=0 then
      raise exception '#70 LBRS target % created a road but linked no held route steps',rec.nlfid;
    end if;

    update private_verification.brinesearch_saved_alias_reconcile_issue70 e
    set decision='create_from_official',selected_road_id=v_road_id,selected_nlf_id=rec.nlfid,
        road_geometry_digest=v_digest,applied_at=now(),
        source_evidence=e.source_evidence||jsonb_build_object(
          'official_source','Ohio Statewide LBRS Centerlines',
          'official_source_url',v_source_url,
          'official_lbrs_nlfid',rec.nlfid,
          'official_lbrs_names',to_jsonb(v_names),
          'official_lbrs_feature_count',v_feature_count,
          'official_geometry_digest',v_digest
        )
    where e.applied_at is null
      and e.decision='held_catalog_gap'
      and lower(e.county)=lower(rec.county)
      and lower(e.local_alias)=lower(rec.local_alias)
      and e.route_label=rec.route_type||'-'||rec.route_number
      and exists (select 1 from public.brinesearch_route_prep_steps s where s.id=e.step_id and s.road_id=v_road_id);

    insert into private_verification.brinesearch_lbrs_catalog_gap_issue70(
      nlfid,county,local_alias,route_type,route_number,route_label,
      source_feature_count,source_names,geometry_digest,source_url,source_checked_at,
      road_id,route_steps_linked,evidence
    ) values (
      rec.nlfid,rec.county,rec.local_alias,rec.route_type,rec.route_number,
      rec.route_type||'-'||rec.route_number,v_feature_count,v_names,v_digest,v_source_url,now(),
      v_road_id,v_linked,jsonb_build_object(
        'issue',70,
        'validation','exact NLFID + exact road number + exact jurisdiction + exact saved local street name + complete geometry',
        'feature_count',v_feature_count,
        'names',to_jsonb(v_names),
        'fuzzy_matching',false,
        'nearest_road_fallback',false,
        'spatial_identity_decision',false
      )
    );
  end loop;
end;
$issue70_lbrs$;
