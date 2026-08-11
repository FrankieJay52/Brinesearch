-- GitHub #70 — reconcile saved road aliases with Road Manager and official ODOT identity.
--
-- The exact route engine (#69) deliberately refuses to guess a road. This migration
-- uses a stronger source that already exists in BrineSearch: explicit local-name /
-- numbered-route pairs in authoritative saved Clear Directions. Example:
--   Fernwood Bloomingdale Rd / CR-26
--   CR-23 / High St
--
-- Only the Road sequence reference portion is parsed. A local name must exactly
-- equal an active unmatched route-prep road step, and that county/local-name pair
-- must resolve to one and only one numbered route across all saved Clear Directions.
-- The numbered identity must then either reuse one trusted Road Manager road or be
-- backed by one complete official ODOT NLF centerline. No fuzzy, nearest-road,
-- normalized-core, or external-map decision is allowed. This migration does not
-- publish #69 routes.

create table if not exists private_verification.brinesearch_saved_alias_reconcile_issue70 (
  step_id uuid primary key references public.brinesearch_route_prep_steps(id) on delete cascade,
  route_prep_id uuid not null,
  pad_id uuid not null,
  company text,
  pad_name text,
  county text,
  raw_text text not null,
  local_alias text not null,
  route_label text,
  official_route_type text,
  route_number text,
  route_suffix text,
  route_number_full text,
  source_identity_count integer not null default 0,
  source_support_count integer not null default 0,
  source_legacy_ids text[] not null default '{}'::text[],
  source_revision timestamptz,
  source_evidence jsonb not null default '{}'::jsonb,
  decision text not null,
  selected_road_id uuid references public.brinesearch_roads(id),
  selected_nlf_id text,
  road_geometry_digest text,
  staged_at timestamptz not null default now(),
  applied_at timestamptz,
  constraint brinesearch_saved_alias_reconcile_issue70_decision_check check (
    decision in (
      'reuse_existing',
      'upgrade_existing',
      'create_from_official',
      'source_conflict',
      'held_multiple_existing',
      'held_catalog_gap',
      'held_official_ambiguous',
      'held_geometry_incomplete',
      'held_route_scope',
      'held_revalidation',
      'held_stale_step'
    )
  )
);

create index if not exists brinesearch_saved_alias_reconcile_issue70_decision_idx
  on private_verification.brinesearch_saved_alias_reconcile_issue70(decision,applied_at);
create index if not exists brinesearch_saved_alias_reconcile_issue70_road_idx
  on private_verification.brinesearch_saved_alias_reconcile_issue70(selected_road_id)
  where selected_road_id is not null;

alter table private_verification.brinesearch_saved_alias_reconcile_issue70 enable row level security;
alter table private_verification.brinesearch_saved_alias_reconcile_issue70 force row level security;
revoke all on private_verification.brinesearch_saved_alias_reconcile_issue70 from public,anon,authenticated;
grant select,insert,update,delete on private_verification.brinesearch_saved_alias_reconcile_issue70 to service_role;

comment on table private_verification.brinesearch_saved_alias_reconcile_issue70 is
  'Issue #70 durable evidence for exact saved Clear Direction alias-to-numbered-road reconciliation. No fuzzy or nearest-road decisions.';

create or replace function public.brinesearch_stage_saved_alias_reconcile_issue70()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_caller uuid:=auth.uid();
  v_staged integer:=0;
  v_reuse integer:=0;
  v_upgrade integer:=0;
  v_create integer:=0;
  v_conflict integer:=0;
  v_held integer:=0;
begin
  if v_caller is null or not public.is_brinesearch_owner(v_caller) then
    raise exception 'Only the BrineSearch Owner may stage #70 saved alias reconciliation';
  end if;

  delete from private_verification.brinesearch_saved_alias_reconcile_issue70
  where applied_at is null;

  with source_rows as materialized (
    select
      p.id as source_pad_id,
      p.legacy_id,
      p.county,
      p.directions_clear_updated_at as source_revision,
      case
        when pg_catalog.strpos(coalesce(p.directions_clear,''),'Step-by-step directions:')>0
          then pg_catalog.split_part(p.directions_clear,'Step-by-step directions:',1)
        else coalesce(p.directions_clear,'')
      end as reference_text
    from public.pads p
    where upper(coalesce(p.state,'')) in ('OH','OHIO')
      and nullif(pg_catalog.btrim(coalesce(p.directions_clear,'')),'') is not null
      and nullif(pg_catalog.btrim(coalesce(p.county,'')),'') is not null
  ), raw_pairs as materialized (
    select
      s.source_pad_id,s.legacy_id,s.county,s.source_revision,
      pg_catalog.btrim(m[1]) as local_alias,
      pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(m[2]),'[[:space:]]+','','g')) as route_token
    from source_rows s
    cross join lateral pg_catalog.regexp_matches(
      s.reference_text,
      '([A-Za-z0-9 .''-]+(?:Rd|Road|St|Street|Ave|Avenue|Hwy|Highway|Pike|Dr|Drive|Ln|Lane|Blvd|Boulevard))[[:space:]]*/[[:space:]]*((?:CR|TR|OH|SR|US)[- ]?[[:space:]]*[0-9]+[A-Za-z]?)',
      'gi'
    ) m

    union all

    select
      s.source_pad_id,s.legacy_id,s.county,s.source_revision,
      pg_catalog.btrim(m[2]) as local_alias,
      pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(m[1]),'[[:space:]]+','','g')) as route_token
    from source_rows s
    cross join lateral pg_catalog.regexp_matches(
      s.reference_text,
      '((?:CR|TR|OH|SR|US)[- ]?[[:space:]]*[0-9]+[A-Za-z]?)[[:space:]]*/[[:space:]]*([A-Za-z0-9 .''-]+(?:Rd|Road|St|Street|Ave|Avenue|Hwy|Highway|Pike|Dr|Drive|Ln|Lane|Blvd|Boulevard))',
      'gi'
    ) m
  ), parsed_pairs as materialized (
    select
      r.*,
      pg_catalog.lower(pg_catalog.btrim(r.local_alias)) as local_key,
      case
        when r.route_token ~ '^(OH|SR)' then 'SR'
        when r.route_token ~ '^US' then 'US'
        when r.route_token ~ '^CR' then 'CR'
        when r.route_token ~ '^TR' then 'TR'
      end as official_route_type,
      nullif(pg_catalog.ltrim((pg_catalog.regexp_match(r.route_token,'([0-9]+)'))[1],'0'),'') as route_number,
      nullif((pg_catalog.regexp_match(r.route_token,'[0-9]+([A-Z])$'))[1],'') as route_suffix
    from raw_pairs r
    where nullif(pg_catalog.btrim(r.local_alias),'') is not null
  ), normalized_pairs as materialized (
    select
      p.*,
      coalesce(nullif(p.route_number,''),'0') || coalesce(p.route_suffix,'') as route_number_full,
      case p.official_route_type
        when 'SR' then 'OH-'||coalesce(nullif(p.route_number,''),'0')||coalesce(p.route_suffix,'')
        when 'US' then 'US-'||coalesce(nullif(p.route_number,''),'0')||coalesce(p.route_suffix,'')
        when 'CR' then 'CR-'||coalesce(nullif(p.route_number,''),'0')||coalesce(p.route_suffix,'')
        when 'TR' then 'TR-'||coalesce(nullif(p.route_number,''),'0')||coalesce(p.route_suffix,'')
      end as route_label,
      p.official_route_type||':'||coalesce(nullif(p.route_number,''),'0')||coalesce(p.route_suffix,'') as route_identity
    from parsed_pairs p
    where p.official_route_type is not null and p.route_number is not null
  ), pair_summary as materialized (
    select
      county,
      local_key,
      min(local_alias) as local_alias,
      count(distinct route_identity)::integer as source_identity_count,
      min(official_route_type) as official_route_type,
      min(route_number) as route_number,
      min(route_suffix) as route_suffix,
      min(route_number_full) as route_number_full,
      min(route_label) as route_label,
      count(distinct source_pad_id)::integer as source_support_count,
      pg_catalog.array_agg(distinct legacy_id order by legacy_id) filter(where legacy_id is not null) as source_legacy_ids,
      max(source_revision) as source_revision
    from normalized_pairs
    group by county,local_key
  ), unmatched as materialized (
    select
      s.id as step_id,s.route_prep_id,rp.pad_id,rp.company,rp.pad_name,
      pad.county,s.raw_text,pg_catalog.lower(pg_catalog.btrim(s.raw_text)) as raw_key
    from public.brinesearch_route_prep_steps s
    join public.brinesearch_route_prep rp on rp.id=s.route_prep_id and rp.active
    join public.pads pad on pad.id=rp.pad_id
    where s.active
      and s.road_id is null
      and upper(coalesce(rp.state,pad.state,'')) in ('OH','OHIO')
      and s.step_kind in ('local_road','county_road','township_road')
  ), candidates as materialized (
    select
      u.*,ps.local_alias,ps.source_identity_count,ps.official_route_type,
      ps.route_number,ps.route_suffix,ps.route_number_full,ps.route_label,
      ps.source_support_count,coalesce(ps.source_legacy_ids,'{}'::text[]) as source_legacy_ids,
      ps.source_revision,
      public.brinesearch_oh_county_code(u.county) as county_code
    from unmatched u
    join pair_summary ps
      on pg_catalog.lower(coalesce(ps.county,''))=pg_catalog.lower(coalesce(u.county,''))
     and ps.local_key=u.raw_key
  ), official as materialized (
    select
      c.*,
      coalesce(o.nlf_count,0) as official_nlf_count,
      o.selected_nlf_id,
      coalesce(o.geometry_complete,false) as official_geometry_complete,
      o.geometry_digest
    from candidates c
    left join lateral (
      select
        count(*)::integer as nlf_count,
        min(x.nlf_id) as selected_nlf_id,
        bool_and(x.loaded_rows=x.total_rows and x.total_rows>0) as geometry_complete,
        min(x.geometry_digest) as geometry_digest
      from (
        select
          cat.nlf_id,
          count(*)::integer as total_rows,
          count(cat.geom)::integer as loaded_rows,
          case when count(*)=count(cat.geom) and count(*)>0 then
            pg_catalog.md5(extensions.st_asgeojson(extensions.st_unaryunion(extensions.st_collect(cat.geom)),7))
          end as geometry_digest
        from public.brinesearch_odot_road_catalog cat
        where cat.county_code=c.county_code
          and cat.route_type=c.official_route_type
          and cat.route_number_normalized=c.route_number
          and pg_catalog.upper(coalesce(nullif(cat.route_suffix,'*'),''))=pg_catalog.upper(coalesce(c.route_suffix,''))
        group by cat.nlf_id
      ) x
    ) o on true
  ), road_counts as materialized (
    select
      o.*,
      coalesce(r.existing_count,0) as existing_count,
      coalesce(r.trusted_count,0) as trusted_count,
      r.selected_road_id
    from official o
    left join lateral (
      select
        count(*)::integer as existing_count,
        count(*) filter(
          where rr.verification_status='verified'
            and rr.centerline_geojson is not null
            and rr.geometry_status in ('official_centerline_loaded','measured_from_official_centerline')
            and not coalesce(rr.candidate_only,false)
        )::integer as trusted_count,
        min(rr.id) as selected_road_id
      from public.brinesearch_roads rr
      where (
        (o.official_route_type='CR'
          and rr.road_type='county' and rr.state='OH'
          and pg_catalog.lower(coalesce(rr.county,''))=pg_catalog.lower(coalesce(o.county,'')))
        or (o.official_route_type='TR'
          and rr.road_type='township' and rr.state='OH'
          and pg_catalog.lower(coalesce(rr.county,''))=pg_catalog.lower(coalesce(o.county,'')))
        or (o.official_route_type='SR'
          and rr.road_type='state_route' and rr.state='OH')
        or (o.official_route_type='US' and rr.road_type='us_route')
      )
      and (
        pg_catalog.upper(pg_catalog.regexp_replace(coalesce(rr.route_number,''),'[^0-9A-Z]','','g'))=pg_catalog.upper(o.route_number_full)
        or (o.selected_nlf_id is not null and pg_catalog.split_part(coalesce(rr.source_record_id,''),'|',1)=o.selected_nlf_id)
      )
    ) r on true
  )
  insert into private_verification.brinesearch_saved_alias_reconcile_issue70 (
    step_id,route_prep_id,pad_id,company,pad_name,county,raw_text,
    local_alias,route_label,official_route_type,route_number,route_suffix,route_number_full,
    source_identity_count,source_support_count,source_legacy_ids,source_revision,source_evidence,
    decision,selected_road_id,selected_nlf_id,road_geometry_digest,staged_at
  )
  select
    r.step_id,r.route_prep_id,r.pad_id,r.company,r.pad_name,r.county,r.raw_text,
    r.local_alias,r.route_label,r.official_route_type,r.route_number,r.route_suffix,r.route_number_full,
    r.source_identity_count,r.source_support_count,r.source_legacy_ids,r.source_revision,
    pg_catalog.jsonb_build_object(
      'issue',70,
      'evidence_type','authoritative_saved_clear_direction_explicit_alias_pair',
      'local_alias',r.local_alias,
      'numbered_route',r.route_label,
      'source_support_count',r.source_support_count,
      'source_legacy_ids',to_jsonb(r.source_legacy_ids),
      'source_revision',r.source_revision,
      'exact_unmatched_text',r.raw_text,
      'fuzzy_matching',false,
      'name_similarity_decision',false,
      'normalized_core_decision',false,
      'spatial_fallback',false,
      'nearest_road_fallback',false,
      'official_nlf_count',r.official_nlf_count,
      'existing_road_count',r.existing_count
    ),
    case
      when r.source_identity_count<>1 then 'source_conflict'
      when r.existing_count>1 then 'held_multiple_existing'
      when r.existing_count=1 and r.trusted_count=1 then 'reuse_existing'
      when r.existing_count=1 and r.official_route_type in ('CR','TR')
        and r.official_nlf_count=1 and r.official_geometry_complete then 'upgrade_existing'
      when r.existing_count=1 then 'held_route_scope'
      when r.official_route_type in ('CR','TR') and r.official_nlf_count=1
        and r.official_geometry_complete then 'create_from_official'
      when r.official_route_type in ('CR','TR') and r.official_nlf_count=0 then 'held_catalog_gap'
      when r.official_route_type in ('CR','TR') and r.official_nlf_count>1 then 'held_official_ambiguous'
      when r.official_route_type in ('CR','TR') and r.official_nlf_count=1
        and not r.official_geometry_complete then 'held_geometry_incomplete'
      else 'held_route_scope'
    end,
    case when r.existing_count=1 then r.selected_road_id end,
    case when r.official_nlf_count=1 then r.selected_nlf_id end,
    case when r.official_nlf_count=1 and r.official_geometry_complete then r.geometry_digest end,
    now()
  from road_counts r;

  get diagnostics v_staged=row_count;

  select
    count(*) filter(where decision='reuse_existing'),
    count(*) filter(where decision='upgrade_existing'),
    count(*) filter(where decision='create_from_official'),
    count(*) filter(where decision='source_conflict'),
    count(*) filter(where decision not in ('reuse_existing','upgrade_existing','create_from_official','source_conflict'))
  into v_reuse,v_upgrade,v_create,v_conflict,v_held
  from private_verification.brinesearch_saved_alias_reconcile_issue70
  where applied_at is null;

  return pg_catalog.jsonb_build_object(
    'staged_steps',v_staged,
    'reuse_existing',v_reuse,
    'upgrade_existing',v_upgrade,
    'create_from_official',v_create,
    'source_conflict',v_conflict,
    'held_other',v_held,
    'policy','Exact saved Clear Direction local-name/numbered-route pairs only; exact unmatched text; unique source identity; trusted Road Manager or one complete official ODOT NLF; no guessing.'
  );
end;
$$;

revoke all on function public.brinesearch_stage_saved_alias_reconcile_issue70() from public,anon;
grant execute on function public.brinesearch_stage_saved_alias_reconcile_issue70() to authenticated;

create or replace function public.brinesearch_apply_saved_alias_reconcile_issue70()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_caller uuid:=auth.uid();
  rec record;
  v_road_id uuid;
  v_geom extensions.geometry;
  v_total integer;
  v_loaded integer;
  v_nlf_count integer;
  v_duplicate_identity integer;
  v_aliases text[];
  v_identity text;
  v_road_type text;
  v_created integer:=0;
  v_upgraded integer:=0;
  v_reused integer:=0;
  v_linked integer:=0;
  v_held integer:=0;
begin
  if v_caller is null or not public.is_brinesearch_owner(v_caller) then
    raise exception 'Only the BrineSearch Owner may apply #70 saved alias reconciliation';
  end if;

  perform public.brinesearch_stage_saved_alias_reconcile_issue70();

  for rec in
    select *
    from private_verification.brinesearch_saved_alias_reconcile_issue70
    where applied_at is null
      and decision in ('reuse_existing','upgrade_existing','create_from_official')
    order by company,pad_name,route_prep_id,step_id
  loop
    v_road_id:=rec.selected_road_id;
    v_geom:=null;
    v_total:=0;
    v_loaded:=0;
    v_nlf_count:=0;
    v_duplicate_identity:=0;

    if rec.decision='reuse_existing' then
      select count(*) into v_total
      from public.brinesearch_roads r
      where r.id=rec.selected_road_id
        and r.verification_status='verified'
        and r.centerline_geojson is not null
        and r.geometry_status in ('official_centerline_loaded','measured_from_official_centerline')
        and not coalesce(r.candidate_only,false);
      if v_total<>1 then
        update private_verification.brinesearch_saved_alias_reconcile_issue70
        set decision='held_revalidation',
            source_evidence=source_evidence||pg_catalog.jsonb_build_object('held_reason','trusted Road Manager road changed before apply')
        where step_id=rec.step_id;
        v_held:=v_held+1;
        continue;
      end if;
    else
      select count(distinct c.nlf_id)::integer,
             count(*)::integer,
             count(c.geom)::integer,
             extensions.st_unaryunion(extensions.st_collect(c.geom))
      into v_nlf_count,v_total,v_loaded,v_geom
      from public.brinesearch_odot_road_catalog c
      where c.county_code=public.brinesearch_oh_county_code(rec.county)
        and c.route_type=rec.official_route_type
        and c.route_number_normalized=rec.route_number
        and pg_catalog.upper(coalesce(nullif(c.route_suffix,'*'),''))=pg_catalog.upper(coalesce(rec.route_suffix,''))
        and c.nlf_id=rec.selected_nlf_id;

      if v_nlf_count<>1 or v_total=0 or v_loaded<>v_total or v_geom is null then
        update private_verification.brinesearch_saved_alias_reconcile_issue70
        set decision='held_revalidation',
            source_evidence=source_evidence||pg_catalog.jsonb_build_object('held_reason','official ODOT identity/geometry changed before apply')
        where step_id=rec.step_id;
        v_held:=v_held+1;
        continue;
      end if;
    end if;

    select pg_catalog.array_agg(a order by pg_catalog.lower(a))
    into v_aliases
    from (
      select distinct on (pg_catalog.lower(pg_catalog.btrim(x))) pg_catalog.btrim(x) as a
      from pg_catalog.unnest(pg_catalog.array_remove(array[rec.local_alias,rec.route_label],null)) x
      where nullif(pg_catalog.btrim(x),'') is not null
      order by pg_catalog.lower(pg_catalog.btrim(x)),pg_catalog.btrim(x)
    ) q;

    if rec.decision='create_from_official' then
      v_road_type:=case rec.official_route_type when 'CR' then 'county' when 'TR' then 'township' else null end;
      if v_road_type is null then
        update private_verification.brinesearch_saved_alias_reconcile_issue70
        set decision='held_revalidation',source_evidence=source_evidence||pg_catalog.jsonb_build_object('held_reason','automatic creation is limited to county/township roads')
        where step_id=rec.step_id;
        v_held:=v_held+1;
        continue;
      end if;

      v_identity:=rec.selected_nlf_id||'|route:'||rec.official_route_type||':'||rec.route_number_full;
      select count(*) into v_duplicate_identity
      from public.brinesearch_roads r
      where r.road_identity_key='official|'||v_identity
         or r.source_record_id=v_identity;
      if v_duplicate_identity>0 then
        update private_verification.brinesearch_saved_alias_reconcile_issue70
        set decision='held_revalidation',source_evidence=source_evidence||pg_catalog.jsonb_build_object('held_reason','official road identity appeared before create')
        where step_id=rec.step_id;
        v_held:=v_held+1;
        continue;
      end if;

      insert into public.brinesearch_roads(
        canonical_name,normalized_name,road_type,state,county,township,aliases,
        truck_route,verification_status,verified_at,route_number,
        source_agency,source_dataset,source_method,source_url,source_record_id,
        centerline_geojson,geometry_status,geometry_checked_at,
        candidate_only,approved_by_default,notes
      ) values (
        rec.route_label,public.brinesearch_road_match_key(rec.route_label),v_road_type,'OH',rec.county,null,coalesce(v_aliases,'{}'::text[]),
        null,'verified',now(),rec.route_number_full,
        'Ohio Department of Transportation','Road Inventory','official_odot_issue70_saved_clear_alias',
        'https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0',
        v_identity,extensions.st_asgeojson(v_geom,7)::jsonb,'official_centerline_loaded',now(),
        false,false,'Issue #70 exact saved Clear Direction alias pair plus exact official ODOT numbered-road identity. Local alias may describe a traveled segment of the numbered route.'
      ) returning id into v_road_id;
      v_created:=v_created+1;

    elsif rec.decision='upgrade_existing' then
      v_identity:=rec.selected_nlf_id||'|route:'||rec.official_route_type||':'||rec.route_number_full;
      select count(*) into v_duplicate_identity
      from public.brinesearch_roads r
      where r.id<>rec.selected_road_id
        and (r.road_identity_key='official|'||v_identity or r.source_record_id=v_identity);
      if v_duplicate_identity>0 then
        update private_verification.brinesearch_saved_alias_reconcile_issue70
        set decision='held_revalidation',source_evidence=source_evidence||pg_catalog.jsonb_build_object('held_reason','another Road Manager row already owns official identity')
        where step_id=rec.step_id;
        v_held:=v_held+1;
        continue;
      end if;

      update public.brinesearch_roads r
      set aliases=(
            select pg_catalog.array_agg(a order by pg_catalog.lower(a))
            from (
              select distinct on (pg_catalog.lower(pg_catalog.btrim(x))) pg_catalog.btrim(x) as a
              from pg_catalog.unnest(coalesce(r.aliases,'{}'::text[])||coalesce(v_aliases,'{}'::text[])) x
              where nullif(pg_catalog.btrim(x),'') is not null
              order by pg_catalog.lower(pg_catalog.btrim(x)),pg_catalog.btrim(x)
            ) z
          ),
          verification_status='verified',verified_at=coalesce(r.verified_at,now()),
          route_number=rec.route_number_full,
          source_agency='Ohio Department of Transportation',source_dataset='Road Inventory',
          source_method='official_odot_issue70_saved_clear_alias',
          source_url='https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0',
          source_record_id=v_identity,
          centerline_geojson=extensions.st_asgeojson(v_geom,7)::jsonb,
          geometry_status='official_centerline_loaded',geometry_checked_at=now(),
          candidate_only=false,updated_at=now(),
          notes=pg_catalog.btrim(coalesce(r.notes,'')||' #70 verified exact saved Clear Direction alias against official ODOT numbered-road geometry.')
      where r.id=rec.selected_road_id;
      if not found then
        update private_verification.brinesearch_saved_alias_reconcile_issue70
        set decision='held_revalidation',source_evidence=source_evidence||pg_catalog.jsonb_build_object('held_reason','existing Road Manager row disappeared before upgrade')
        where step_id=rec.step_id;
        v_held:=v_held+1;
        continue;
      end if;
      v_road_id:=rec.selected_road_id;
      v_upgraded:=v_upgraded+1;

    else
      update public.brinesearch_roads r
      set aliases=(
            select pg_catalog.array_agg(a order by pg_catalog.lower(a))
            from (
              select distinct on (pg_catalog.lower(pg_catalog.btrim(x))) pg_catalog.btrim(x) as a
              from pg_catalog.unnest(coalesce(r.aliases,'{}'::text[])||coalesce(v_aliases,'{}'::text[])) x
              where nullif(pg_catalog.btrim(x),'') is not null
              order by pg_catalog.lower(pg_catalog.btrim(x)),pg_catalog.btrim(x)
            ) z
          ),
          updated_at=now(),
          notes=pg_catalog.btrim(coalesce(r.notes,'')||' #70 added explicit saved Clear Direction alias evidence for '||rec.route_label||'.')
      where r.id=rec.selected_road_id;
      if not found then
        update private_verification.brinesearch_saved_alias_reconcile_issue70
        set decision='held_revalidation',source_evidence=source_evidence||pg_catalog.jsonb_build_object('held_reason','trusted Road Manager row disappeared before alias reuse')
        where step_id=rec.step_id;
        v_held:=v_held+1;
        continue;
      end if;
      v_road_id:=rec.selected_road_id;
      v_reused:=v_reused+1;
    end if;

    update public.brinesearch_route_prep_steps s
    set road_id=v_road_id,
        step_kind=case rec.official_route_type
          when 'CR' then 'county_road' when 'TR' then 'township_road'
          when 'SR' then 'state_route' when 'US' then 'us_route' else s.step_kind end,
        match_status='exact_master',
        match_method='saved_clear_explicit_alias_issue70',
        match_confidence=1.0,
        source_details=coalesce(s.source_details,'{}'::jsonb)||rec.source_evidence||pg_catalog.jsonb_build_object(
          'road_id',v_road_id,
          'match_basis','authoritative saved Clear Direction explicit local-name / numbered-route pair',
          'route_label',rec.route_label,
          'local_alias',rec.local_alias,
          'source_support_count',rec.source_support_count,
          'official_nlf_id',rec.selected_nlf_id,
          'fuzzy_matching',false,
          'nearest_road_fallback',false,
          'spatial_fallback',false
        ),
        geometry_status='ready',updated_at=now()
    where s.id=rec.step_id
      and s.road_id is null
      and pg_catalog.lower(pg_catalog.btrim(s.raw_text))=pg_catalog.lower(pg_catalog.btrim(rec.local_alias));

    if found then
      update private_verification.brinesearch_saved_alias_reconcile_issue70
      set selected_road_id=v_road_id,applied_at=now(),
          road_geometry_digest=(select pg_catalog.md5(r.centerline_geojson::text) from public.brinesearch_roads r where r.id=v_road_id),
          source_evidence=source_evidence||pg_catalog.jsonb_build_object('applied_road_id',v_road_id)
      where step_id=rec.step_id;
      v_linked:=v_linked+1;
    else
      update private_verification.brinesearch_saved_alias_reconcile_issue70
      set decision='held_stale_step',source_evidence=source_evidence||pg_catalog.jsonb_build_object('held_reason','route-prep step changed before apply')
      where step_id=rec.step_id;
      v_held:=v_held+1;
    end if;
  end loop;

  perform public.road_manager_recalculate_route_readiness();

  return pg_catalog.jsonb_build_object(
    'route_steps_linked',v_linked,
    'existing_roads_reused',v_reused,
    'existing_roads_upgraded',v_upgraded,
    'official_roads_created',v_created,
    'held_during_revalidation',v_held,
    'policy','Saved Clear Direction explicit alias pair + exact road scope + trusted Road Manager or complete official ODOT identity only. No route publication.'
  );
end;
$$;

revoke all on function public.brinesearch_apply_saved_alias_reconcile_issue70() from public,anon;
grant execute on function public.brinesearch_apply_saved_alias_reconcile_issue70() to authenticated;
