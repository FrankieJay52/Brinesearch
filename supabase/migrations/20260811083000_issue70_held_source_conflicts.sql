-- GitHub #70 — correct held Ohio road source conflicts using exact official
-- Ohio Statewide LBRS identities and repair Route Prep stale-step identity reuse.
--
-- This migration is intentionally narrow. It corrects only source conflicts for
-- which live BrineSearch route context and the official LBRS source identify one
-- exact numbered road. KIDD / Fowler Rd remains held because the saved local name
-- does not exactly match official TR-219 (Beagle Club Rd).
--
-- No fuzzy/name-similarity/nearest-road identity decision and no #69 route publish.

create table if not exists private_verification.brinesearch_source_conflict_corrections_issue70 (
  nlfid text primary key,
  county text not null,
  township text not null,
  legacy_ids text[] not null default '{}'::text[],
  local_alias text not null,
  old_labels text[] not null default '{}'::text[],
  corrected_route_type text not null,
  corrected_route_number text not null,
  corrected_route_label text not null,
  source_feature_count integer not null,
  source_names text[] not null default '{}'::text[],
  geometry_digest text not null,
  source_url text not null,
  source_checked_at timestamptz not null default now(),
  road_id uuid references public.brinesearch_roads(id),
  route_steps_linked integer not null default 0,
  evidence jsonb not null default '{}'::jsonb,
  constraint brinesearch_source_conflict_corrections_issue70_type_check check (corrected_route_type in ('CR','TR'))
);

alter table private_verification.brinesearch_source_conflict_corrections_issue70 enable row level security;
alter table private_verification.brinesearch_source_conflict_corrections_issue70 force row level security;
revoke all on private_verification.brinesearch_source_conflict_corrections_issue70 from public,anon,authenticated;
grant select,insert,update,delete on private_verification.brinesearch_source_conflict_corrections_issue70 to service_role;

comment on table private_verification.brinesearch_source_conflict_corrections_issue70 is
  'Issue #70 exact official Ohio LBRS evidence for correcting previously held or misidentified saved route-number/type conflicts.';

-- Route Prep refresh previously kept an old local road_id when a pending step changed
-- text at the same index. Clear that stale identity only for the generic refresh
-- match methods. Explicitly revalidated correction methods remain untouched.
create or replace function private_verification.brinesearch_clear_stale_route_step_identity_issue70()
returns trigger
language plpgsql
security invoker
set search_path to 'public','private_verification','pg_temp'
as $function$
begin
  if old.owner_decision='pending'
     and new.raw_text is distinct from old.raw_text
     and coalesce(new.match_method,'') in (
       'unmatched_saved_road_name',
       'explicit_in_saved_directions',
       'state_context_candidate_only'
     ) then
    new.road_id:=null;
    new.distance_miles:=null;
    new.geometry_status:='not_started';
    new.source_details:=coalesce(new.source_details,'{}'::jsonb)||jsonb_build_object(
      'stale_identity_cleared_issue70',true,
      'previous_raw_text',old.raw_text,
      'local_road_guessing',false
    );
  end if;
  return new;
end;
$function$;

revoke all on function private_verification.brinesearch_clear_stale_route_step_identity_issue70() from public,anon,authenticated;
grant execute on function private_verification.brinesearch_clear_stale_route_step_identity_issue70() to service_role;

drop trigger if exists brinesearch_clear_stale_route_step_identity_issue70 on public.brinesearch_route_prep_steps;
create trigger brinesearch_clear_stale_route_step_identity_issue70
before update of raw_text,match_method on public.brinesearch_route_prep_steps
for each row execute function private_verification.brinesearch_clear_stale_route_step_identity_issue70();

do $issue70_conflicts$
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
  v_township_count integer;
  v_names text[];
  v_geom extensions.geometry;
  v_digest text;
  v_existing integer;
  v_road_id uuid;
  v_ref_count integer;
  v_expected_jur text;
  v_expected_road_type text;
  v_alias_base text;
  v_source_url constant text := 'https://maps.ohio.gov/arcgis/rest/services/Hosted/Ohio_Statewide_LBRS_Centerlines/FeatureServer/0';
  v_query_url text;
begin
  for rec in
    select * from (values
      ('Harrison','Rumley',array['eog--gotshall','eog--ruby']::text[],'Burrier Rd',array['CR-135']::text[],'TR','135','THASTR00135**C','correct_existing'),
      ('Harrison','Rumley',array['eog--gotshall','eog--ruby']::text[],'Dutch Ridge Rd',array['CR-136']::text[],'TR','137','THASTR00137**C','create'),
      ('Columbiana','Washington',array['eog--janie-trust']::text[],'Steubenville Pike Rd',array['CR-776']::text[],'TR','776','TCOLTR00776**C','create'),
      ('Columbiana','Washington',array['eog--janie-trust']::text[],'Hazel Run Rd',array['CR-879']::text[],'TR','879','TCOLTR00879**C','create'),
      ('Harrison','Short Creek',array['ascent--sadler']::text[],'Jamison Rd',array['TR-86']::text[],'CR','86','CHASCR00086**C','create'),
      ('Monroe','Salem',array['swn--holliday-unit']::text[],'Cochran Hill Rd',array['CR-64']::text[],'CR','64A','CMOECR00064A*C','create'),
      ('Monroe','Salem',array['swn--holliday-unit']::text[],'Cain Ridge Rd',array['CR-64 / Cochran Hill Rd']::text[],'CR','64','CMOECR00064**C','create')
    ) as x(county,township,legacy_ids,local_alias,old_labels,route_type,route_number,nlfid,mode)
  loop
    v_expected_jur:=case rec.route_type when 'CR' then 'C' else 'T' end;
    v_expected_road_type:=case rec.route_type when 'CR' then 'county' else 'township' end;
    v_alias_base:=upper(regexp_replace(rec.local_alias,'[[:space:]]+(RD|ROAD)$','','i'));

    v_query_url:=v_source_url||'/query?where=NLFID%3D%27'||replace(rec.nlfid,'*','%2A')||
      '%27&outFields=objectid%2Cseg_id%2Cstr_name%2Cstr_type%2Crd_num%2Cjurisdic%2Cnlfid%2Cl_twp%2Cr_twp%2Clength3d&returnGeometry=true&outSR=4326&f=geojson';
    v_response:=extensions.http_get(v_query_url);
    if v_response.status<>200 then
      raise exception '#70 source-conflict LBRS request failed for %: HTTP %',rec.nlfid,v_response.status;
    end if;
    v_json:=v_response.content::jsonb;
    if v_json ? 'error' then
      raise exception '#70 source-conflict LBRS returned an error for %: %',rec.nlfid,v_json->'error';
    end if;
    v_features:=coalesce(v_json->'features','[]'::jsonb);
    v_feature_count:=jsonb_array_length(v_features);
    if v_feature_count=0 then
      raise exception '#70 source-conflict LBRS returned no features for %',rec.nlfid;
    end if;

    select
      count(*) filter(where f->'geometry' is not null),
      count(distinct f->'properties'->>'nlfid'),
      count(distinct f->'properties'->>'rd_num'),
      count(distinct f->'properties'->>'jurisdic'),
      count(*) filter(where upper(btrim(coalesce(f->'properties'->>'str_name','')))=v_alias_base),
      count(*) filter(where upper(btrim(coalesce(f->'properties'->>'l_twp','')))=upper(rec.township) or upper(btrim(coalesce(f->'properties'->>'r_twp','')))=upper(rec.township)),
      array_agg(distinct upper(btrim(coalesce(f->'properties'->>'str_name',''))) order by upper(btrim(coalesce(f->'properties'->>'str_name','')))),
      extensions.st_unaryunion(extensions.st_collect(extensions.st_setsrid(extensions.st_geomfromgeojson((f->'geometry')::text),4326)))
    into v_geom_count,v_nlf_count,v_num_count,v_jur_count,v_name_count,v_township_count,v_names,v_geom
    from jsonb_array_elements(v_features) f;

    if v_geom_count<>v_feature_count or v_geom is null then
      raise exception '#70 source-conflict LBRS geometry incomplete for %: %/%',rec.nlfid,v_geom_count,v_feature_count;
    end if;
    if v_nlf_count<>1 or exists (select 1 from jsonb_array_elements(v_features) f where f->'properties'->>'nlfid'<>rec.nlfid) then
      raise exception '#70 source-conflict NLF identity mismatch for %',rec.nlfid;
    end if;
    if v_num_count<>1 or exists (select 1 from jsonb_array_elements(v_features) f where f->'properties'->>'rd_num'<>rec.route_number) then
      raise exception '#70 source-conflict route number mismatch for % expected %',rec.nlfid,rec.route_number;
    end if;
    if v_jur_count<>1 or exists (select 1 from jsonb_array_elements(v_features) f where f->'properties'->>'jurisdic'<>v_expected_jur) then
      raise exception '#70 source-conflict jurisdiction mismatch for % expected %',rec.nlfid,v_expected_jur;
    end if;
    if v_name_count=0 then
      raise exception '#70 source-conflict NLF % lacks exact local name %',rec.nlfid,v_alias_base;
    end if;
    if v_township_count=0 then
      raise exception '#70 source-conflict NLF % does not include expected township %',rec.nlfid,rec.township;
    end if;

    v_digest:=md5(extensions.st_asgeojson(v_geom,7));

    if rec.mode='correct_existing' then
      select count(*),(min(r.id::text))::uuid into v_existing,v_road_id
      from public.brinesearch_roads r
      where r.state='OH'
        and lower(coalesce(r.county,''))=lower(rec.county)
        and r.road_type='county'
        and r.route_number='135'
        and r.canonical_name='CR-135'
        and 'Burrier Rd'=any(r.aliases);
      if v_existing<>1 then
        raise exception '#70 Burrier correction expected exactly one current CR-135 identity, found %',v_existing;
      end if;
      select count(*) into v_ref_count
      from public.brinesearch_route_prep_steps s
      join public.brinesearch_route_prep rp on rp.id=s.route_prep_id and rp.active
      join public.pads p on p.id=rp.pad_id
      where s.active and s.road_id=v_road_id;
      if v_ref_count<>2 or exists (
        select 1
        from public.brinesearch_route_prep_steps s
        join public.brinesearch_route_prep rp on rp.id=s.route_prep_id and rp.active
        join public.pads p on p.id=rp.pad_id
        where s.active and s.road_id=v_road_id
          and (lower(btrim(s.raw_text))<>'burrier rd' or not (p.legacy_id=any(rec.legacy_ids)))
      ) then
        raise exception '#70 Burrier current identity has unexpected active references';
      end if;
      if exists (
        select 1 from public.brinesearch_roads r
        where r.id<>v_road_id and r.state='OH' and lower(coalesce(r.county,''))=lower(rec.county)
          and r.road_type=v_expected_road_type and r.route_number=rec.route_number
      ) then
        raise exception '#70 Burrier correction would collide with an existing TR-135 identity';
      end if;

      update public.brinesearch_roads
      set canonical_name=rec.route_type||'-'||rec.route_number,
          normalized_name=public.brinesearch_road_match_key(rec.route_type||'-'||rec.route_number),
          road_type=v_expected_road_type,
          township=null,
          aliases=array[rec.route_type||'-'||rec.route_number,rec.local_alias]::text[],
          verification_status='verified',verified_at=now(),route_number=rec.route_number,
          source_agency='State of Ohio',source_dataset='Ohio Statewide LBRS Centerlines',
          source_method='official_ohio_lbrs_issue70_source_conflict_correction',
          source_url=v_source_url,source_record_id=rec.nlfid||'|route:'||rec.route_type||':'||rec.route_number,
          centerline_geojson=extensions.st_asgeojson(v_geom,7)::jsonb,
          geometry_status='official_centerline_loaded',geometry_checked_at=now(),candidate_only=false,approved_by_default=false,
          notes='Issue #70 source-conflict correction: saved CR-135/Burrier identity was contradicted by exact official Ohio LBRS TR-135 / BURRIER in Rumley Township. Corrected in place because this Road Manager row had only the two RUBY/GOTSHALL Burrier references.'
      where id=v_road_id;
    else
      select count(*),(min(r.id::text))::uuid into v_existing,v_road_id
      from public.brinesearch_roads r
      where r.state='OH'
        and lower(coalesce(r.county,''))=lower(rec.county)
        and (
          split_part(coalesce(r.source_record_id,''),'|',1)=rec.nlfid
          or (r.road_type=v_expected_road_type and upper(regexp_replace(coalesce(r.route_number,''),'[^0-9A-Z]','','g'))=upper(rec.route_number))
        );
      if v_existing<>0 then
        raise exception '#70 source-conflict target % unexpectedly has % existing Road Manager candidates',rec.nlfid,v_existing;
      end if;

      insert into public.brinesearch_roads(
        canonical_name,normalized_name,road_type,state,county,township,aliases,
        verification_status,verified_at,route_number,
        source_agency,source_dataset,source_method,source_url,source_record_id,
        centerline_geojson,geometry_status,geometry_checked_at,candidate_only,approved_by_default,notes
      ) values (
        rec.route_type||'-'||rec.route_number,
        public.brinesearch_road_match_key(rec.route_type||'-'||rec.route_number),
        v_expected_road_type,'OH',rec.county,null,array[rec.route_type||'-'||rec.route_number,rec.local_alias]::text[],
        'verified',now(),rec.route_number,
        'State of Ohio','Ohio Statewide LBRS Centerlines','official_ohio_lbrs_issue70_source_conflict_correction',
        v_source_url,rec.nlfid||'|route:'||rec.route_type||':'||rec.route_number,
        extensions.st_asgeojson(v_geom,7)::jsonb,'official_centerline_loaded',now(),false,false,
        'Issue #70 exact source-conflict correction from official Ohio Statewide LBRS. The corrected route type/number is supported by the exact NLF, jurisdiction, township, street name, and complete source geometry.'
      ) returning id into v_road_id;
    end if;

    insert into private_verification.brinesearch_source_conflict_corrections_issue70(
      nlfid,county,township,legacy_ids,local_alias,old_labels,corrected_route_type,corrected_route_number,corrected_route_label,
      source_feature_count,source_names,geometry_digest,source_url,source_checked_at,road_id,evidence
    ) values (
      rec.nlfid,rec.county,rec.township,rec.legacy_ids,rec.local_alias,rec.old_labels,rec.route_type,rec.route_number,rec.route_type||'-'||rec.route_number,
      v_feature_count,v_names,v_digest,v_source_url,now(),v_road_id,
      jsonb_build_object(
        'issue',70,
        'validation','exact NLFID + exact route number + exact jurisdiction + expected township + exact local street name + complete official geometry',
        'feature_count',v_feature_count,'official_names',to_jsonb(v_names),
        'fuzzy_matching',false,'name_similarity_decision',false,'nearest_road_fallback',false,'spatial_identity_decision',false
      )
    );
  end loop;

  -- Topology is confirmation after exact identity, never the identity decision.
  if extensions.st_distance(
      extensions.st_setsrid(extensions.st_geomfromgeojson((select centerline_geojson::text from public.brinesearch_roads where id=(select road_id from private_verification.brinesearch_source_conflict_corrections_issue70 where nlfid='THASTR00137**C'))),4326)::extensions.geography,
      extensions.st_setsrid(extensions.st_geomfromgeojson((select centerline_geojson::text from public.brinesearch_roads where id=(select road_id from private_verification.brinesearch_source_conflict_corrections_issue70 where nlfid='THASTR00135**C'))),4326)::extensions.geography
    ) > 200 then
    raise exception '#70 corrected Dutch Ridge / Burrier official geometries are not spatially continuous enough';
  end if;
  if extensions.st_distance(
      extensions.st_setsrid(extensions.st_geomfromgeojson((select centerline_geojson::text from public.brinesearch_roads where id=(select road_id from private_verification.brinesearch_source_conflict_corrections_issue70 where nlfid='TCOLTR00776**C'))),4326)::extensions.geography,
      extensions.st_setsrid(extensions.st_geomfromgeojson((select centerline_geojson::text from public.brinesearch_roads where id=(select road_id from private_verification.brinesearch_source_conflict_corrections_issue70 where nlfid='TCOLTR00879**C'))),4326)::extensions.geography
    ) > 10 then
    raise exception '#70 corrected TR-776 / TR-879 official geometries do not connect';
  end if;
  if extensions.st_distance(
      extensions.st_setsrid(extensions.st_geomfromgeojson((select centerline_geojson::text from public.brinesearch_roads where id=(select road_id from private_verification.brinesearch_source_conflict_corrections_issue70 where nlfid='CMOECR00064A*C'))),4326)::extensions.geography,
      extensions.st_setsrid(extensions.st_geomfromgeojson((select centerline_geojson::text from public.brinesearch_roads where id=(select road_id from private_verification.brinesearch_source_conflict_corrections_issue70 where nlfid='CMOECR00064**C'))),4326)::extensions.geography
    ) > 10 then
    raise exception '#70 corrected CR-64A / CR-64 official geometries do not connect';
  end if;
end;
$issue70_conflicts$;

-- Stored direction truth: correct only the verified route labels and remove parser
-- duplication from the structured sequence. Private source wording/safety facts are
-- otherwise preserved. The existing direction-intelligence/public-projection triggers
-- refresh the derived driver contract from these authoritative pad updates.
do $issue70_pad_assertions$
begin
  if not exists (select 1 from public.pads where legacy_id='eog--ruby' and directions_clear like '%CR-136%' and directions_clear like '%CR-135%') then
    raise exception '#70 expected RUBY source labels changed before correction';
  end if;
  if not exists (select 1 from public.pads where legacy_id='eog--gotshall' and directions_clear like '%Dutch Ridge Rd%' and directions_clear like '%Burrier Rd%') then
    raise exception '#70 expected GOTSHALL source wording changed before correction';
  end if;
  if not exists (select 1 from public.pads where legacy_id='eog--janie-trust' and directions_clear like '%CR-776%' and directions_clear like '%CR-879%') then
    raise exception '#70 expected JANIE-TRUST source labels changed before correction';
  end if;
  if not exists (select 1 from public.pads where legacy_id='ascent--sadler' and directions_clear like '%TR-86%') then
    raise exception '#70 expected SADLER source label changed before correction';
  end if;
  if not exists (select 1 from public.pads where legacy_id='swn--holliday-unit' and directions_clear like '%CR-64A%' and directions_clear like '%CR 64( Cochran hill rd)%') then
    raise exception '#70 expected HOLLIDAY source wording changed before correction';
  end if;
end;
$issue70_pad_assertions$;

update public.pads
set directions_clear=replace(replace(directions_clear,'CR-136','TR-137'),'CR-135','TR-135'),
    structured_road_sequence='OH-646 → TR-137 / Dutch Ridge Rd → TR-135 / Burrier Rd → Pad'
where legacy_id='eog--ruby';

update public.pads
set directions_clear=replace(replace(directions_clear,'Dutch Ridge Rd','TR-137 / Dutch Ridge Rd'),'Burrier Rd','TR-135 / Burrier Rd'),
    structured_road_sequence='OH-646 → TR-137 / Dutch Ridge Rd → TR-135 / Burrier Rd → Pad'
where legacy_id='eog--gotshall';

update public.pads
set directions_clear=replace(replace(directions_clear,'CR-776','TR-776'),'CR-879','TR-879'),
    structured_road_sequence='OH-7 → OH-39 → TR-776 / Steubenville Pike Rd → TR-879 / Hazel Run Rd → Lease Road'
where legacy_id='eog--janie-trust';

update public.pads
set directions_clear=replace(directions_clear,'TR-86','CR-86'),
    structured_road_sequence='US-250 → CR-86 / Jamison Rd → Pad'
where legacy_id='ascent--sadler';

update public.pads
set directions_clear='Road sequence reference:
OH-78 → CR-64A / Cochran Hill Rd → CR-64 / Cain Ridge Rd → Lease Road

Step-by-step directions:
1. From OH-78, turn onto CR-64A / Cochran Hill Rd. CB Channel 26 on Cochran Hill Rd. Continue 2.7 miles to CR-64 / Cain Ridge Rd at the stop sign.
2. Turn left onto CR-64 / Cain Ridge Rd.
3. Continue south for 0.43 miles to Holliday.
4. Continue onto the lease road.',
    structured_road_sequence='OH-78 → CR-64A / Cochran Hill Rd → CR-64 / Cain Ridge Rd → Lease Road'
where legacy_id='swn--holliday-unit';

-- Rebuild only the five corrected active primary Route Prep records from the corrected
-- stored route truth. Do not call the global Owner maintenance refresh from a deploy
-- migration, and do not touch unrelated routes.
create temporary table tmp_issue70_expected_steps (
  legacy_id text not null,
  step_order integer not null,
  raw_text text not null,
  step_kind text not null,
  road_canonical text,
  road_county text,
  distance_miles numeric,
  primary key(legacy_id,step_order)
) on commit drop;

insert into tmp_issue70_expected_steps values
  ('eog--gotshall',1,'OH-646','state_route','OH-646',null,null),
  ('eog--gotshall',2,'TR-137 / Dutch Ridge Rd','township_road','TR-137','Harrison',null),
  ('eog--gotshall',3,'TR-135 / Burrier Rd','township_road','TR-135','Harrison',null),
  ('eog--gotshall',4,'Pad','private_segment',null,null,null),
  ('eog--ruby',1,'OH-646','state_route','OH-646',null,null),
  ('eog--ruby',2,'TR-137 / Dutch Ridge Rd','township_road','TR-137','Harrison',null),
  ('eog--ruby',3,'TR-135 / Burrier Rd','township_road','TR-135','Harrison',null),
  ('eog--ruby',4,'Pad','private_segment',null,null,null),
  ('eog--janie-trust',1,'OH-7','state_route','OH-7',null,null),
  ('eog--janie-trust',2,'OH-39','state_route','OH-39',null,null),
  ('eog--janie-trust',3,'TR-776 / Steubenville Pike Rd','township_road','TR-776','Columbiana',null),
  ('eog--janie-trust',4,'TR-879 / Hazel Run Rd','township_road','TR-879','Columbiana',null),
  ('eog--janie-trust',5,'Lease Road','private_segment',null,null,null),
  ('ascent--sadler',1,'US-250','us_route','US-250',null,null),
  ('ascent--sadler',2,'CR-86 / Jamison Rd','county_road','CR-86','Harrison',null),
  ('ascent--sadler',3,'Pad','private_segment',null,null,null),
  ('swn--holliday-unit',1,'OH-78','state_route','OH-78',null,null),
  ('swn--holliday-unit',2,'CR-64A / Cochran Hill Rd','county_road','CR-64A','Monroe',2.70),
  ('swn--holliday-unit',3,'CR-64 / Cain Ridge Rd','county_road','CR-64','Monroe',0.43),
  ('swn--holliday-unit',4,'Lease Road','private_segment',null,null,null);

do $issue70_route_prep_assertions$
begin
  if exists (
    select 1
    from public.brinesearch_route_prep_steps s
    join public.brinesearch_route_prep rp on rp.id=s.route_prep_id and rp.active
    join public.pads p on p.id=rp.pad_id
    where p.legacy_id in ('eog--gotshall','eog--ruby','eog--janie-trust','ascent--sadler','swn--holliday-unit')
      and s.active and s.owner_decision<>'pending'
  ) then
    raise exception '#70 corrected routes contain non-pending Owner step decisions; refusing automatic rewrite';
  end if;
  if exists (
    select 1 from tmp_issue70_expected_steps e
    where e.road_canonical is not null and 1<>(
      select count(*) from public.brinesearch_roads r
      where r.canonical_name=e.road_canonical
        and (e.road_county is null or lower(coalesce(r.county,''))=lower(e.road_county))
    )
  ) then
    raise exception '#70 corrected route step does not resolve to exactly one Road Manager identity';
  end if;
  if exists (
    select 1
    from public.pads p
    where p.legacy_id in ('eog--gotshall','eog--ruby','eog--janie-trust','ascent--sadler','swn--holliday-unit')
      and 1<>(select count(*) from public.brinesearch_route_prep rp where rp.pad_id=p.id and rp.active and rp.route_group='primary' and rp.variant_index=1)
  ) then
    raise exception '#70 corrected pad does not have exactly one active primary Route Prep row';
  end if;
end;
$issue70_route_prep_assertions$;

-- Remove obsolete alternate variants such as JANIE-TRUST's parser-created OR split.
update public.brinesearch_route_prep rp
set active=false,updated_at=now()
from public.pads p
where p.id=rp.pad_id
  and p.legacy_id in ('eog--gotshall','eog--ruby','eog--janie-trust','ascent--sadler','swn--holliday-unit')
  and not (rp.route_group='primary' and rp.variant_index=1);

update public.brinesearch_route_prep_steps s
set active=false,updated_at=now()
from public.brinesearch_route_prep rp,public.pads p
where rp.id=s.route_prep_id and p.id=rp.pad_id
  and p.legacy_id in ('eog--gotshall','eog--ruby','eog--janie-trust','ascent--sadler','swn--holliday-unit')
  and not (rp.route_group='primary' and rp.variant_index=1);

with grouped as (
  select p.id as pad_id,rp.id as route_prep_id,
    string_agg(e.raw_text,' → ' order by e.step_order) as seq,
    jsonb_agg(e.raw_text order by e.step_order) as steps,
    max(e.raw_text) filter(where e.step_order=1) as anchor,
    max(e.step_kind) filter(where e.step_order=1) as anchor_kind
  from tmp_issue70_expected_steps e
  join public.pads p on p.legacy_id=e.legacy_id
  join public.brinesearch_route_prep rp on rp.pad_id=p.id and rp.active and rp.route_group='primary' and rp.variant_index=1
  group by p.id,rp.id
)
update public.brinesearch_route_prep rp
set source_sequence=g.seq,source_sequence_hash=md5(g.seq),normalized_sequence=g.seq,normalized_steps=g.steps,
    readiness_status='ready_for_road_matching',issue_codes='{}'::text[],
    highway_anchor_text=g.anchor,highway_anchor_kind=case g.anchor_kind when 'us_route' then 'us_route' else 'state_route' end,
    highway_anchor_status='explicit',candidate_state_route=null,candidate_state_route_source='{}'::jsonb,
    no_guess_policy='strict',analysis_version='road-prep-v1-issue70-source-conflict-corrected',active=true,analyzed_at=now(),updated_at=now()
from grouped g where rp.id=g.route_prep_id;

update public.brinesearch_route_prep_steps s
set active=false,updated_at=now()
from public.brinesearch_route_prep rp,public.pads p
where rp.id=s.route_prep_id and p.id=rp.pad_id and rp.active and rp.route_group='primary' and rp.variant_index=1
  and p.legacy_id in ('eog--gotshall','eog--ruby','eog--janie-trust','ascent--sadler','swn--holliday-unit');

insert into public.brinesearch_route_prep_steps(
  route_prep_id,step_order,raw_text,normalized_text,step_kind,road_id,match_status,match_method,match_confidence,
  source_details,owner_decision,distance_miles,turn_direction,geometry_status,active,updated_at
)
select rp.id,e.step_order,e.raw_text,e.raw_text,e.step_kind,r.id,
  case when e.road_canonical is null then 'private_segment' else 'exact_master' end,
  case when e.road_canonical is null then 'unmatched_saved_road_name'
       when e.step_kind in ('interstate','us_route','state_route') then 'explicit_highway_master_record'
       else 'official_lbrs_source_conflict_correction_issue70' end,
  case when e.road_canonical is null then null else 1.0 end,
  case when e.road_canonical is null then jsonb_build_object('issue',70,'corrected_source_sequence',true,'local_road_guessing',false)
       when e.step_kind in ('interstate','us_route','state_route') then jsonb_build_object('issue',70,'match_basis','corrected authoritative source sequence + explicit highway master','local_road_guessing',false)
       else jsonb_build_object(
         'issue',70,'match_basis','corrected saved route truth + exact official Ohio LBRS source conflict evidence',
         'road_id',r.id,'road_source_record_id',r.source_record_id,
         'fuzzy_matching',false,'name_similarity_decision',false,'nearest_road_fallback',false,'spatial_fallback',false,'local_road_guessing',false
       ) end,
  'pending',e.distance_miles,null,
  case when e.road_canonical is null then 'not_started' when r.geometry_status<>'not_loaded' then 'ready' else 'not_started' end,
  true,now()
from tmp_issue70_expected_steps e
join public.pads p on p.legacy_id=e.legacy_id
join public.brinesearch_route_prep rp on rp.pad_id=p.id and rp.active and rp.route_group='primary' and rp.variant_index=1
left join public.brinesearch_roads r on e.road_canonical is not null and r.canonical_name=e.road_canonical
  and (e.road_county is null or lower(coalesce(r.county,''))=lower(e.road_county))
on conflict(route_prep_id,step_order) do update set
  raw_text=excluded.raw_text,normalized_text=excluded.normalized_text,step_kind=excluded.step_kind,road_id=excluded.road_id,
  match_status=excluded.match_status,match_method=excluded.match_method,match_confidence=excluded.match_confidence,
  source_details=excluded.source_details,owner_decision=excluded.owner_decision,distance_miles=excluded.distance_miles,
  turn_direction=excluded.turn_direction,geometry_status=excluded.geometry_status,active=true,updated_at=now();

-- Any obsolete high step indexes on corrected primary routes remain inactive.

-- Correct the old saved-alias evidence instead of leaving durable rows that claim
-- the disproven route type/number. Fowler is intentionally excluded and stays held.
update private_verification.brinesearch_saved_alias_reconcile_issue70 e
set route_label=c.corrected_route_label,
    official_route_type=c.corrected_route_type,
    route_number=c.corrected_route_number,
    route_suffix=case when c.corrected_route_number ~ '[A-Z]$' then right(c.corrected_route_number,1) else null end,
    route_number_full=c.corrected_route_number,
    decision='corrected_source_conflict',selected_road_id=c.road_id,selected_nlf_id=c.nlfid,
    road_geometry_digest=c.geometry_digest,applied_at=now(),
    source_evidence=e.source_evidence||jsonb_build_object(
      'source_conflict_corrected_issue70',true,
      'corrected_route_label',c.corrected_route_label,
      'corrected_official_nlfid',c.nlfid,
      'corrected_official_names',to_jsonb(c.source_names),
      'correction_basis','exact Ohio Statewide LBRS route number/jurisdiction/township/name/geometry plus authoritative saved route context',
      'fuzzy_matching',false,'name_similarity_decision',false,'nearest_road_fallback',false,'spatial_identity_decision',false
    )
from private_verification.brinesearch_source_conflict_corrections_issue70 c
where lower(e.local_alias)=lower(c.local_alias)
  and lower(e.county)=lower(c.county)
  and lower(e.local_alias) in ('burrier rd','dutch ridge rd','hazel run rd','jamison rd','cochran hill rd');

update private_verification.brinesearch_source_conflict_corrections_issue70 c
set route_steps_linked=(
  select count(*)
  from public.brinesearch_route_prep_steps s
  join public.brinesearch_route_prep rp on rp.id=s.route_prep_id and rp.active
  join public.pads p on p.id=rp.pad_id
  where s.active and s.road_id=c.road_id and p.legacy_id=any(c.legacy_ids)
);

-- Final invariants for this slice. These intentionally leave KIDD/Fowler held.
do $issue70_final_assertions$
declare
  v_routes integer;
  v_steps integer;
begin
  if (select count(*) from private_verification.brinesearch_source_conflict_corrections_issue70)<>7 then
    raise exception '#70 source-conflict evidence expected 7 official identities';
  end if;
  if exists (
    select 1 from private_verification.brinesearch_source_conflict_corrections_issue70 c
    join public.brinesearch_roads r on r.id=c.road_id
    where r.verification_status<>'verified' or r.geometry_status<>'official_centerline_loaded'
      or split_part(coalesce(r.source_record_id,''),'|',1)<>c.nlfid
      or r.route_number<>c.corrected_route_number
      or r.road_type<>case c.corrected_route_type when 'CR' then 'county' else 'township' end
  ) then
    raise exception '#70 corrected Road Manager identity failed official source invariant';
  end if;
  if exists (
    select 1 from public.brinesearch_route_prep_steps s
    join public.brinesearch_route_prep rp on rp.id=s.route_prep_id and rp.active
    join public.pads p on p.id=rp.pad_id
    where p.legacy_id in ('eog--gotshall','eog--ruby','eog--janie-trust','ascent--sadler','swn--holliday-unit')
      and s.active and s.step_kind in ('local_road','county_road','township_road') and s.road_id is null
  ) then
    raise exception '#70 corrected target route still has an unresolved public-road step';
  end if;
  if exists (
    select 1 from public.brinesearch_route_prep_steps s
    join public.brinesearch_route_prep rp on rp.id=s.route_prep_id and rp.active
    join public.pads p on p.id=rp.pad_id
    where p.legacy_id in ('eog--gotshall','eog--ruby','eog--janie-trust','ascent--sadler','swn--holliday-unit')
      and s.active and s.road_id is not null
      and coalesce((s.source_details->>'fuzzy_matching')::boolean,false)
  ) then
    raise exception '#70 corrected target route contains a fuzzy identity';
  end if;
  if not exists (
    select 1 from private_verification.brinesearch_saved_alias_reconcile_issue70
    where lower(local_alias)='fowler rd' and decision='held_catalog_gap' and applied_at is null and selected_road_id is null
  ) then
    raise exception '#70 Fowler conflict must remain held';
  end if;
  if exists (
    select 1 from public.pads p
    where p.legacy_id='eog--janie-trust' and p.structured_road_sequence like '% OR %'
  ) then
    raise exception '#70 JANIE-TRUST parser-created OR split was not removed from stored route truth';
  end if;
  select count(*) into v_routes from public.brinesearch_route_prep rp join public.pads p on p.id=rp.pad_id
  where rp.active and p.legacy_id in ('eog--gotshall','eog--ruby','eog--janie-trust','ascent--sadler','swn--holliday-unit');
  select count(*) into v_steps from public.brinesearch_route_prep_steps s join public.brinesearch_route_prep rp on rp.id=s.route_prep_id
  join public.pads p on p.id=rp.pad_id where rp.active and s.active and p.legacy_id in ('eog--gotshall','eog--ruby','eog--janie-trust','ascent--sadler','swn--holliday-unit');
  if v_routes<>5 or v_steps<>20 then
    raise exception '#70 corrected route-prep shape mismatch: % routes / % steps',v_routes,v_steps;
  end if;
  if (select count(*) from public.pads where jsonb_typeof(structured_route_steps)='array' and jsonb_array_length(structured_route_steps)>0)<>0 then
    raise exception '#70 conflict correction must not publish #69 structured routes';
  end if;
end;
$issue70_final_assertions$;
