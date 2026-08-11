-- #70 exact Ohio source-conflict correction. No fuzzy/name-similarity/nearest-road
-- identity decision. Spatial checks below only confirm continuity after exact LBRS
-- NLF/number/jurisdiction/township/name validation. No #69 route publication.

create table if not exists private_verification.brinesearch_source_conflict_corrections_issue70 (
  nlfid text primary key,
  county text not null,
  township text not null,
  legacy_ids text[] not null,
  local_alias text not null,
  old_labels text[] not null,
  corrected_route_type text not null check (corrected_route_type in ('CR','TR')),
  corrected_route_number text not null,
  corrected_route_label text not null,
  source_feature_count integer not null,
  source_names text[] not null default '{}'::text[],
  geometry_digest text not null,
  source_url text not null,
  source_checked_at timestamptz not null default now(),
  road_id uuid references public.brinesearch_roads(id),
  route_steps_linked integer not null default 0,
  evidence jsonb not null default '{}'::jsonb
);
alter table private_verification.brinesearch_source_conflict_corrections_issue70 enable row level security;
alter table private_verification.brinesearch_source_conflict_corrections_issue70 force row level security;
revoke all on private_verification.brinesearch_source_conflict_corrections_issue70 from public,anon,authenticated;
grant select,insert,update,delete on private_verification.brinesearch_source_conflict_corrections_issue70 to service_role;

create or replace function private_verification.brinesearch_clear_stale_route_step_identity_issue70()
returns trigger language plpgsql security invoker
set search_path to 'public','private_verification','pg_temp'
as $function$
begin
  if old.owner_decision='pending'
     and new.raw_text is distinct from old.raw_text
     and coalesce(new.match_method,'') in ('unmatched_saved_road_name','explicit_in_saved_directions','state_context_candidate_only') then
    new.road_id:=null;
    new.distance_miles:=null;
    new.geometry_status:='not_started';
    new.source_details:=coalesce(new.source_details,'{}'::jsonb)||jsonb_build_object(
      'stale_identity_cleared_issue70',true,'previous_raw_text',old.raw_text,'local_road_guessing',false
    );
  end if;
  return new;
end;$function$;
revoke all on function private_verification.brinesearch_clear_stale_route_step_identity_issue70() from public,anon,authenticated;
grant execute on function private_verification.brinesearch_clear_stale_route_step_identity_issue70() to service_role;
drop trigger if exists brinesearch_clear_stale_route_step_identity_issue70 on public.brinesearch_route_prep_steps;
create trigger brinesearch_clear_stale_route_step_identity_issue70
before update of raw_text,match_method on public.brinesearch_route_prep_steps
for each row execute function private_verification.brinesearch_clear_stale_route_step_identity_issue70();

do $source$
declare
  rec record; resp extensions.http_response; j jsonb; feats jsonb; geom extensions.geometry;
  feature_count int; geom_count int; name_count int; twp_count int; nlf_count int; num_count int; jur_count int;
  names text[]; digest text; vroad uuid; existing_count int; ref_count int;
  expected_jur text; expected_road_type text; alias_base text;
  v_source_url constant text:='https://maps.ohio.gov/arcgis/rest/services/Hosted/Ohio_Statewide_LBRS_Centerlines/FeatureServer/0';
  query_url text;
begin
  for rec in select * from (values
    ('Harrison','Rumley',array['eog--gotshall','eog--ruby']::text[],'Burrier Rd',array['CR-135']::text[],'TR','135','THASTR00135**C',true),
    ('Harrison','Rumley',array['eog--gotshall','eog--ruby']::text[],'Dutch Ridge Rd',array['CR-136']::text[],'TR','137','THASTR00137**C',false),
    ('Columbiana','Washington',array['eog--janie-trust']::text[],'Steubenville Pike Rd',array['CR-776']::text[],'TR','776','TCOLTR00776**C',false),
    ('Columbiana','Washington',array['eog--janie-trust']::text[],'Hazel Run Rd',array['CR-879']::text[],'TR','879','TCOLTR00879**C',false),
    ('Harrison','Short Creek',array['ascent--sadler']::text[],'Jamison Rd',array['TR-86']::text[],'CR','86','CHASCR00086**C',false),
    ('Monroe','Salem',array['swn--holliday-unit']::text[],'Cochran Hill Rd',array['CR-64']::text[],'CR','64A','CMOECR00064A*C',false),
    ('Monroe','Salem',array['swn--holliday-unit']::text[],'Cain Ridge Rd',array['CR-64 / Cochran Hill Rd']::text[],'CR','64','CMOECR00064**C',false)
  ) x(county,township,legacy_ids,local_alias,old_labels,route_type,route_number,nlfid,correct_existing)
  loop
    expected_jur:=case rec.route_type when 'CR' then 'C' else 'T' end;
    expected_road_type:=case rec.route_type when 'CR' then 'county' else 'township' end;
    alias_base:=upper(regexp_replace(rec.local_alias,'[[:space:]]+(RD|ROAD)$','','i'));
    query_url:=v_source_url||'/query?where=NLFID%3D%27'||replace(rec.nlfid,'*','%2A')||
      '%27&outFields=objectid%2Cseg_id%2Cstr_name%2Cstr_type%2Crd_num%2Cjurisdic%2Cnlfid%2Cl_twp%2Cr_twp%2Clength3d&returnGeometry=true&outSR=4326&f=geojson';
    resp:=extensions.http_get(query_url);
    if resp.status<>200 then raise exception '#70 LBRS HTTP % for %',resp.status,rec.nlfid; end if;
    j:=resp.content::jsonb;
    if j ? 'error' then raise exception '#70 LBRS error for %: %',rec.nlfid,j->'error'; end if;
    feats:=coalesce(j->'features','[]'::jsonb); feature_count:=jsonb_array_length(feats);
    if feature_count=0 then raise exception '#70 LBRS no features for %',rec.nlfid; end if;
    select
      count(*) filter(where f->'geometry' is not null),
      count(distinct f->'properties'->>'nlfid'),count(distinct f->'properties'->>'rd_num'),count(distinct f->'properties'->>'jurisdic'),
      count(*) filter(where upper(btrim(coalesce(f->'properties'->>'str_name','')))=alias_base),
      count(*) filter(where upper(btrim(coalesce(f->'properties'->>'l_twp','')))=upper(rec.township) or upper(btrim(coalesce(f->'properties'->>'r_twp','')))=upper(rec.township)),
      array_agg(distinct upper(btrim(coalesce(f->'properties'->>'str_name',''))) order by upper(btrim(coalesce(f->'properties'->>'str_name','')))),
      extensions.st_unaryunion(extensions.st_collect(extensions.st_setsrid(extensions.st_geomfromgeojson((f->'geometry')::text),4326)))
    into geom_count,nlf_count,num_count,jur_count,name_count,twp_count,names,geom
    from jsonb_array_elements(feats) f;
    if geom_count<>feature_count or geom is null then raise exception '#70 incomplete geometry for %',rec.nlfid; end if;
    if nlf_count<>1 or exists(select 1 from jsonb_array_elements(feats) f where f->'properties'->>'nlfid'<>rec.nlfid) then raise exception '#70 NLF mismatch %',rec.nlfid; end if;
    if num_count<>1 or exists(select 1 from jsonb_array_elements(feats) f where f->'properties'->>'rd_num'<>rec.route_number) then raise exception '#70 number mismatch %',rec.nlfid; end if;
    if jur_count<>1 or exists(select 1 from jsonb_array_elements(feats) f where f->'properties'->>'jurisdic'<>expected_jur) then raise exception '#70 jurisdiction mismatch %',rec.nlfid; end if;
    if name_count=0 or twp_count=0 then raise exception '#70 exact name/township proof missing for %',rec.nlfid; end if;
    digest:=md5(extensions.st_asgeojson(geom,7));

    if rec.correct_existing then
      select count(*),(min(r.id::text))::uuid into existing_count,vroad
      from public.brinesearch_roads r
      where r.state='OH' and lower(coalesce(r.county,''))=lower(rec.county)
        and r.road_type='county' and r.route_number='135' and r.canonical_name='CR-135' and 'Burrier Rd'=any(r.aliases);
      if existing_count<>1 then raise exception '#70 expected one current CR-135/Burrier row, found %',existing_count; end if;
      select count(*) into ref_count
      from public.brinesearch_route_prep_steps s join public.brinesearch_route_prep rp on rp.id=s.route_prep_id and rp.active join public.pads p on p.id=rp.pad_id
      where s.active and s.road_id=vroad;
      if ref_count<>2 or exists(
        select 1 from public.brinesearch_route_prep_steps s join public.brinesearch_route_prep rp on rp.id=s.route_prep_id and rp.active join public.pads p on p.id=rp.pad_id
        where s.active and s.road_id=vroad and (lower(btrim(s.raw_text))<>'burrier rd' or not p.legacy_id=any(rec.legacy_ids))
      ) then raise exception '#70 Burrier row has unexpected references'; end if;
      if exists(select 1 from public.brinesearch_roads r where r.id<>vroad and r.state='OH' and lower(coalesce(r.county,''))=lower(rec.county) and r.road_type='township' and r.route_number='135') then
        raise exception '#70 existing TR-135 would collide with Burrier correction';
      end if;
      update public.brinesearch_roads set
        canonical_name='TR-135',normalized_name=public.brinesearch_road_match_key('TR-135'),road_type='township',township=null,
        aliases=array['TR-135','Burrier Rd']::text[],verification_status='verified',verified_at=now(),route_number='135',
        source_agency='State of Ohio',source_dataset='Ohio Statewide LBRS Centerlines',source_method='official_ohio_lbrs_issue70_source_conflict_correction',
        source_url=v_source_url,source_record_id=rec.nlfid||'|route:TR:135',centerline_geojson=extensions.st_asgeojson(geom,7)::jsonb,
        geometry_status='official_centerline_loaded',geometry_checked_at=now(),candidate_only=false,approved_by_default=false,
        notes='Issue #70 corrected the disproven CR-135/Burrier identity in place to exact official TR-135 / Burrier Rd.'
      where id=vroad;
    else
      select count(*) into existing_count from public.brinesearch_roads r
      where r.state='OH' and lower(coalesce(r.county,''))=lower(rec.county)
        and (split_part(coalesce(r.source_record_id,''),'|',1)=rec.nlfid or (r.road_type=expected_road_type and upper(regexp_replace(coalesce(r.route_number,''),'[^0-9A-Z]','','g'))=upper(rec.route_number)));
      if existing_count<>0 then raise exception '#70 existing Road Manager candidate for %',rec.nlfid; end if;
      insert into public.brinesearch_roads(
        canonical_name,normalized_name,road_type,state,county,aliases,verification_status,verified_at,route_number,
        source_agency,source_dataset,source_method,source_url,source_record_id,centerline_geojson,geometry_status,geometry_checked_at,candidate_only,approved_by_default,notes
      ) values(
        rec.route_type||'-'||rec.route_number,public.brinesearch_road_match_key(rec.route_type||'-'||rec.route_number),expected_road_type,'OH',rec.county,
        array[rec.route_type||'-'||rec.route_number,rec.local_alias]::text[],'verified',now(),rec.route_number,
        'State of Ohio','Ohio Statewide LBRS Centerlines','official_ohio_lbrs_issue70_source_conflict_correction',v_source_url,
        rec.nlfid||'|route:'||rec.route_type||':'||rec.route_number,extensions.st_asgeojson(geom,7)::jsonb,'official_centerline_loaded',now(),false,false,
        'Issue #70 exact official Ohio LBRS source-conflict correction.'
      ) returning id into vroad;
    end if;

    insert into private_verification.brinesearch_source_conflict_corrections_issue70(
      nlfid,county,township,legacy_ids,local_alias,old_labels,corrected_route_type,corrected_route_number,corrected_route_label,
      source_feature_count,source_names,geometry_digest,source_url,road_id,evidence
    ) values(
      rec.nlfid,rec.county,rec.township,rec.legacy_ids,rec.local_alias,rec.old_labels,rec.route_type,rec.route_number,rec.route_type||'-'||rec.route_number,
      feature_count,names,digest,v_source_url,vroad,jsonb_build_object(
        'issue',70,'validation','exact NLFID + exact route number + exact jurisdiction + expected township + exact local street name + complete geometry',
        'fuzzy_matching',false,'name_similarity_decision',false,'nearest_road_fallback',false,'spatial_identity_decision',false
      )
    );
  end loop;

  -- Topology is confirmation after exact identity, never the identity decision.
  if extensions.st_distance(
    extensions.st_setsrid(extensions.st_geomfromgeojson((select r.centerline_geojson::text from public.brinesearch_roads r join private_verification.brinesearch_source_conflict_corrections_issue70 c on c.road_id=r.id where c.nlfid='THASTR00137**C')),4326)::extensions.geography,
    extensions.st_setsrid(extensions.st_geomfromgeojson((select r.centerline_geojson::text from public.brinesearch_roads r join private_verification.brinesearch_source_conflict_corrections_issue70 c on c.road_id=r.id where c.nlfid='THASTR00135**C')),4326)::extensions.geography)>200
  then raise exception '#70 Dutch Ridge/Burrier topology confirmation failed'; end if;
  if extensions.st_distance(
    extensions.st_setsrid(extensions.st_geomfromgeojson((select r.centerline_geojson::text from public.brinesearch_roads r join private_verification.brinesearch_source_conflict_corrections_issue70 c on c.road_id=r.id where c.nlfid='TCOLTR00776**C')),4326)::extensions.geography,
    extensions.st_setsrid(extensions.st_geomfromgeojson((select r.centerline_geojson::text from public.brinesearch_roads r join private_verification.brinesearch_source_conflict_corrections_issue70 c on c.road_id=r.id where c.nlfid='TCOLTR00879**C')),4326)::extensions.geography)>10
  then raise exception '#70 TR-776/TR-879 topology confirmation failed'; end if;
  if extensions.st_distance(
    extensions.st_setsrid(extensions.st_geomfromgeojson((select r.centerline_geojson::text from public.brinesearch_roads r join private_verification.brinesearch_source_conflict_corrections_issue70 c on c.road_id=r.id where c.nlfid='CMOECR00064A*C')),4326)::extensions.geography,
    extensions.st_setsrid(extensions.st_geomfromgeojson((select r.centerline_geojson::text from public.brinesearch_roads r join private_verification.brinesearch_source_conflict_corrections_issue70 c on c.road_id=r.id where c.nlfid='CMOECR00064**C')),4326)::extensions.geography)>10
  then raise exception '#70 CR-64A/CR-64 topology confirmation failed'; end if;
end;$source$;

do $guard$
begin
  if not exists(select 1 from public.pads where legacy_id='eog--ruby' and directions_clear like '%CR-136%' and directions_clear like '%CR-135%') then raise exception '#70 RUBY source changed'; end if;
  if not exists(select 1 from public.pads where legacy_id='eog--gotshall' and directions_clear like '%Dutch Ridge Rd%' and directions_clear like '%Burrier Rd%') then raise exception '#70 GOTSHALL source changed'; end if;
  if not exists(select 1 from public.pads where legacy_id='eog--janie-trust' and directions_clear like '%CR-776%' and directions_clear like '%CR-879%') then raise exception '#70 JANIE source changed'; end if;
  if not exists(select 1 from public.pads where legacy_id='ascent--sadler' and directions_clear like '%TR-86%') then raise exception '#70 SADLER source changed'; end if;
  if not exists(select 1 from public.pads where legacy_id='swn--holliday-unit' and directions_clear like '%CR-64A%' and directions_clear like '%CR 64( Cochran hill rd)%') then raise exception '#70 HOLLIDAY source changed'; end if;
end;$guard$;

alter table public.pads disable trigger brinesearch_direction_intelligence_refresh;
update public.pads set directions_clear=replace(replace(directions_clear,'CR-136','TR-137'),'CR-135','TR-135'),structured_road_sequence='OH-646 → TR-137 / Dutch Ridge Rd → TR-135 / Burrier Rd → Pad' where legacy_id='eog--ruby';
update public.pads set directions_clear=replace(replace(directions_clear,'Dutch Ridge Rd','TR-137 / Dutch Ridge Rd'),'Burrier Rd','TR-135 / Burrier Rd'),structured_road_sequence='OH-646 → TR-137 / Dutch Ridge Rd → TR-135 / Burrier Rd → Pad' where legacy_id='eog--gotshall';
update public.pads set directions_clear=replace(replace(directions_clear,'CR-776','TR-776'),'CR-879','TR-879'),structured_road_sequence='OH-7 → OH-39 → TR-776 / Steubenville Pike Rd → TR-879 / Hazel Run Rd → Lease Road' where legacy_id='eog--janie-trust';
update public.pads set directions_clear=replace(directions_clear,'TR-86','CR-86'),structured_road_sequence='US-250 → CR-86 / Jamison Rd → Pad' where legacy_id='ascent--sadler';
update public.pads set directions_clear='Road sequence reference:
OH-78 → CR-64A / Cochran Hill Rd → CR-64 / Cain Ridge Rd → Lease Road

Step-by-step directions:
1. From OH-78, turn onto CR-64A / Cochran Hill Rd. CB Channel 26 on Cochran Hill Rd. Continue 2.7 miles to CR-64 / Cain Ridge Rd at the stop sign.
2. Turn left onto CR-64 / Cain Ridge Rd.
3. Continue south for 0.43 miles to Holliday.
4. Continue onto the lease road.',structured_road_sequence='OH-78 → CR-64A / Cochran Hill Rd → CR-64 / Cain Ridge Rd → Lease Road' where legacy_id='swn--holliday-unit';
alter table public.pads enable trigger brinesearch_direction_intelligence_refresh;
select public.brinesearch_refresh_all_direction_intelligence();

create temporary table tmp_issue70_steps(
  legacy_id text,step_order int,raw_text text,step_kind text,road_canonical text,road_county text,distance_miles numeric,
  primary key(legacy_id,step_order)
) on commit drop;
insert into tmp_issue70_steps values
('eog--gotshall',1,'OH-646','state_route','OH-646',null,null),('eog--gotshall',2,'TR-137 / Dutch Ridge Rd','township_road','TR-137','Harrison',null),('eog--gotshall',3,'TR-135 / Burrier Rd','township_road','TR-135','Harrison',null),('eog--gotshall',4,'Pad','private_segment',null,null,null),
('eog--ruby',1,'OH-646','state_route','OH-646',null,null),('eog--ruby',2,'TR-137 / Dutch Ridge Rd','township_road','TR-137','Harrison',null),('eog--ruby',3,'TR-135 / Burrier Rd','township_road','TR-135','Harrison',null),('eog--ruby',4,'Pad','private_segment',null,null,null),
('eog--janie-trust',1,'OH-7','state_route','OH-7',null,null),('eog--janie-trust',2,'OH-39','state_route','OH-39',null,null),('eog--janie-trust',3,'TR-776 / Steubenville Pike Rd','township_road','TR-776','Columbiana',null),('eog--janie-trust',4,'TR-879 / Hazel Run Rd','township_road','TR-879','Columbiana',null),('eog--janie-trust',5,'Lease Road','private_segment',null,null,null),
('ascent--sadler',1,'US-250','us_route','US-250',null,null),('ascent--sadler',2,'CR-86 / Jamison Rd','county_road','CR-86','Harrison',null),('ascent--sadler',3,'Pad','private_segment',null,null,null),
('swn--holliday-unit',1,'OH-78','state_route','OH-78',null,null),('swn--holliday-unit',2,'CR-64A / Cochran Hill Rd','county_road','CR-64A','Monroe',2.70),('swn--holliday-unit',3,'CR-64 / Cain Ridge Rd','county_road','CR-64','Monroe',0.43),('swn--holliday-unit',4,'Lease Road','private_segment',null,null,null);

do $prep_guard$
begin
  if exists(select 1 from public.brinesearch_route_prep_steps s join public.brinesearch_route_prep rp on rp.id=s.route_prep_id and rp.active join public.pads p on p.id=rp.pad_id where p.legacy_id in ('eog--gotshall','eog--ruby','eog--janie-trust','ascent--sadler','swn--holliday-unit') and s.active and s.owner_decision<>'pending') then raise exception '#70 target has non-pending Owner decision'; end if;
  if exists(select 1 from tmp_issue70_steps e where e.road_canonical is not null and 1<>(select count(*) from public.brinesearch_roads r where r.canonical_name=e.road_canonical and (e.road_county is null or lower(coalesce(r.county,''))=lower(e.road_county)))) then raise exception '#70 expected step road does not resolve uniquely'; end if;
  if exists(select 1 from public.pads p where p.legacy_id in ('eog--gotshall','eog--ruby','eog--janie-trust','ascent--sadler','swn--holliday-unit') and 1<>(select count(*) from public.brinesearch_route_prep rp where rp.pad_id=p.id and rp.active and rp.route_group='primary' and rp.variant_index=1)) then raise exception '#70 target primary Route Prep shape changed'; end if;
end;$prep_guard$;

update public.brinesearch_route_prep rp set active=false,updated_at=now() from public.pads p
where p.id=rp.pad_id and p.legacy_id in ('eog--gotshall','eog--ruby','eog--janie-trust','ascent--sadler','swn--holliday-unit') and not (rp.route_group='primary' and rp.variant_index=1);
update public.brinesearch_route_prep_steps s set active=false,updated_at=now() from public.brinesearch_route_prep rp,public.pads p
where rp.id=s.route_prep_id and p.id=rp.pad_id and p.legacy_id in ('eog--gotshall','eog--ruby','eog--janie-trust','ascent--sadler','swn--holliday-unit') and not (rp.route_group='primary' and rp.variant_index=1);

with g as(
  select p.id pad_id,rp.id route_prep_id,string_agg(e.raw_text,' → ' order by e.step_order) seq,jsonb_agg(e.raw_text order by e.step_order) steps,
    max(e.raw_text) filter(where e.step_order=1) anchor,max(e.step_kind) filter(where e.step_order=1) anchor_kind
  from tmp_issue70_steps e join public.pads p on p.legacy_id=e.legacy_id join public.brinesearch_route_prep rp on rp.pad_id=p.id and rp.active and rp.route_group='primary' and rp.variant_index=1
  group by p.id,rp.id
)
update public.brinesearch_route_prep rp set source_sequence=g.seq,source_sequence_hash=md5(g.seq),normalized_sequence=g.seq,normalized_steps=g.steps,
  readiness_status='ready_for_road_matching',issue_codes='{}'::text[],highway_anchor_text=g.anchor,
  highway_anchor_kind=case g.anchor_kind when 'us_route' then 'us_route' else 'state_route' end,highway_anchor_status='explicit',candidate_state_route=null,
  candidate_state_route_source='{}'::jsonb,no_guess_policy='strict',analysis_version='road-prep-v1-issue70-source-conflict-corrected',active=true,analyzed_at=now(),updated_at=now()
from g where rp.id=g.route_prep_id;

update public.brinesearch_route_prep_steps s set active=false,updated_at=now() from public.brinesearch_route_prep rp,public.pads p
where rp.id=s.route_prep_id and p.id=rp.pad_id and rp.active and rp.route_group='primary' and rp.variant_index=1 and p.legacy_id in ('eog--gotshall','eog--ruby','eog--janie-trust','ascent--sadler','swn--holliday-unit');

insert into public.brinesearch_route_prep_steps(route_prep_id,step_order,raw_text,normalized_text,step_kind,road_id,match_status,match_method,match_confidence,source_details,owner_decision,distance_miles,turn_direction,geometry_status,active,updated_at)
select rp.id,e.step_order,e.raw_text,e.raw_text,e.step_kind,r.id,
  case when e.road_canonical is null then 'private_segment' else 'exact_master' end,
  case when e.road_canonical is null then 'unmatched_saved_road_name' when e.step_kind in ('interstate','us_route','state_route') then 'explicit_highway_master_record' else 'official_lbrs_source_conflict_correction_issue70' end,
  case when e.road_canonical is null then null else 1.0 end,
  case when e.road_canonical is null then jsonb_build_object('issue',70,'corrected_source_sequence',true,'local_road_guessing',false)
       when e.step_kind in ('interstate','us_route','state_route') then jsonb_build_object('issue',70,'match_basis','corrected authoritative source sequence + explicit highway master','local_road_guessing',false)
       else jsonb_build_object('issue',70,'match_basis','corrected saved route truth + exact official Ohio LBRS source-conflict evidence','road_id',r.id,'road_source_record_id',r.source_record_id,'fuzzy_matching',false,'name_similarity_decision',false,'nearest_road_fallback',false,'spatial_fallback',false,'local_road_guessing',false) end,
  'pending',e.distance_miles,null,case when e.road_canonical is null then 'not_started' when r.geometry_status<>'not_loaded' then 'ready' else 'not_started' end,true,now()
from tmp_issue70_steps e join public.pads p on p.legacy_id=e.legacy_id join public.brinesearch_route_prep rp on rp.pad_id=p.id and rp.active and rp.route_group='primary' and rp.variant_index=1
left join public.brinesearch_roads r on e.road_canonical is not null and r.canonical_name=e.road_canonical and (e.road_county is null or lower(coalesce(r.county,''))=lower(e.road_county))
on conflict(route_prep_id,step_order) do update set raw_text=excluded.raw_text,normalized_text=excluded.normalized_text,step_kind=excluded.step_kind,road_id=excluded.road_id,
  match_status=excluded.match_status,match_method=excluded.match_method,match_confidence=excluded.match_confidence,source_details=excluded.source_details,
  owner_decision=excluded.owner_decision,distance_miles=excluded.distance_miles,turn_direction=excluded.turn_direction,geometry_status=excluded.geometry_status,active=true,updated_at=now();

update private_verification.brinesearch_saved_alias_reconcile_issue70 e set
  route_label=c.corrected_route_label,official_route_type=c.corrected_route_type,route_number=c.corrected_route_number,
  route_suffix=case when c.corrected_route_number~'[A-Z]$' then right(c.corrected_route_number,1) else null end,route_number_full=c.corrected_route_number,
  decision='corrected_source_conflict',selected_road_id=c.road_id,selected_nlf_id=c.nlfid,road_geometry_digest=c.geometry_digest,applied_at=now(),
  source_evidence=e.source_evidence||jsonb_build_object('source_conflict_corrected_issue70',true,'corrected_route_label',c.corrected_route_label,'corrected_official_nlfid',c.nlfid,'fuzzy_matching',false,'name_similarity_decision',false,'nearest_road_fallback',false,'spatial_identity_decision',false)
from private_verification.brinesearch_source_conflict_corrections_issue70 c
where lower(e.local_alias)=lower(c.local_alias) and lower(e.county)=lower(c.county) and lower(e.local_alias) in ('burrier rd','dutch ridge rd','hazel run rd','jamison rd','cochran hill rd');

update private_verification.brinesearch_source_conflict_corrections_issue70 c set route_steps_linked=(
  select count(*) from public.brinesearch_route_prep_steps s join public.brinesearch_route_prep rp on rp.id=s.route_prep_id and rp.active join public.pads p on p.id=rp.pad_id
  where s.active and s.road_id=c.road_id and p.legacy_id=any(c.legacy_ids)
);

do $final$
declare target_routes int; target_steps int;
begin
  if (select count(*) from private_verification.brinesearch_source_conflict_corrections_issue70)<>7 then raise exception '#70 expected 7 source corrections'; end if;
  if exists(select 1 from private_verification.brinesearch_source_conflict_corrections_issue70 c join public.brinesearch_roads r on r.id=c.road_id where r.verification_status<>'verified' or r.geometry_status<>'official_centerline_loaded' or split_part(coalesce(r.source_record_id,''),'|',1)<>c.nlfid or r.route_number<>c.corrected_route_number or r.road_type<>case c.corrected_route_type when 'CR' then 'county' else 'township' end) then raise exception '#70 corrected road invariant failed'; end if;
  if exists(select 1 from public.brinesearch_route_prep_steps s join public.brinesearch_route_prep rp on rp.id=s.route_prep_id and rp.active join public.pads p on p.id=rp.pad_id where p.legacy_id in ('eog--gotshall','eog--ruby','eog--janie-trust','ascent--sadler','swn--holliday-unit') and s.active and s.step_kind in ('local_road','county_road','township_road') and s.road_id is null) then raise exception '#70 corrected target still has unresolved public-road step'; end if;
  if not exists(select 1 from private_verification.brinesearch_saved_alias_reconcile_issue70 where lower(local_alias)='fowler rd' and decision='held_catalog_gap' and applied_at is null and selected_road_id is null) then raise exception '#70 Fowler must remain held'; end if;
  if exists(select 1 from public.pads where legacy_id='eog--janie-trust' and structured_road_sequence like '% OR %') then raise exception '#70 JANIE OR parser split remains'; end if;
  select count(*) into target_routes from public.brinesearch_route_prep rp join public.pads p on p.id=rp.pad_id where rp.active and p.legacy_id in ('eog--gotshall','eog--ruby','eog--janie-trust','ascent--sadler','swn--holliday-unit');
  select count(*) into target_steps from public.brinesearch_route_prep_steps s join public.brinesearch_route_prep rp on rp.id=s.route_prep_id join public.pads p on p.id=rp.pad_id where rp.active and s.active and p.legacy_id in ('eog--gotshall','eog--ruby','eog--janie-trust','ascent--sadler','swn--holliday-unit');
  if target_routes<>5 or target_steps<>20 then raise exception '#70 corrected shape % routes / % steps',target_routes,target_steps; end if;
  if (select count(*) from public.pads where jsonb_typeof(structured_route_steps)='array' and jsonb_array_length(structured_route_steps)>0)<>0 then raise exception '#70 must not publish #69 structured routes'; end if;
end;$final$;
