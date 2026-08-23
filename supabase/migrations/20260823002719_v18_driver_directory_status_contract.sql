-- BrineSearch V18 -- immutable public directory snapshots and separated
-- driver/owner route-status contracts.
--
-- Safety boundaries:
--   * browser roles can read only deliberately public snapshot rows;
--   * public pad status never exposes private Google readiness, hold reasons,
--     graph build identifiers, receipts, or digests;
--   * owner diagnostics require a current authenticated owner at the server;
--   * snapshot publication is deterministic and service-role-only;
--   * Google publication remains governed by the existing Issue #97 dispatcher.

-- Shared live/fallback shape boundary. Unsafe optional values are
-- deterministically quarantined to NULL/empty arrays before hashing. Required
-- pad names fail the snapshot instead of being guessed. These helpers are not
-- browser-callable and accept only a closed field-policy vocabulary.
create or replace function private_verification.brinesearch_v18_safe_directory_text(
  p_value text,
  p_field text
)
returns text
language plpgsql
immutable
parallel safe
security invoker
set search_path=''
as $$
declare
  v_value text:=nullif(pg_catalog.btrim(p_value),'');
begin
  if v_value is null then return null; end if;
  if v_value~'[[:cntrl:]]'
     or v_value~*'^(unknown|idk|n/?a|none|null|undefined|[?.]+|y{3,})$' then
    return null;
  end if;
  case p_field
    when 'legacy_id' then
      if pg_catalog.char_length(v_value)>128
         or v_value!~'^[a-z0-9]+(-[a-z0-9]+)*--[a-z0-9]+(-[a-z0-9]+)*$' then
        return null;
      end if;
    when 'company' then
      if pg_catalog.char_length(v_value)>64
         or v_value!~'^[[:alnum:] .,''’&()/#-]+$' then return null; end if;
    when 'pad_name' then
      if pg_catalog.char_length(v_value)>128
         or v_value!~'^[[:alnum:] .,''’&()/#-]+$' then return null; end if;
    when 'state' then
      if v_value not in (
        'OH','WV','PA','Ohio','West Virginia','Pennsylvania'
      ) then return null; end if;
    when 'county','township' then
      if pg_catalog.char_length(v_value)<3
         or pg_catalog.char_length(v_value)>64
         or v_value!~'^[[:alnum:] .,''’&()/#-]+$' then return null; end if;
    when 'address' then
      if pg_catalog.char_length(v_value)<3
         or pg_catalog.char_length(v_value)>256 then return null; end if;
    when 'structured_road_sequence' then
      if pg_catalog.char_length(v_value)<3
         or pg_catalog.char_length(v_value)>512 then return null; end if;
    when 'verification_state','operating_state' then
      if pg_catalog.char_length(v_value)<3
         or pg_catalog.char_length(v_value)>128 then return null; end if;
    when 'alias','well_name','property_number','safe_road_term' then
      if pg_catalog.char_length(v_value)>(case
           when p_field='safe_road_term' then 128 else 64 end)
         or v_value!~'^[[:alnum:] .,''’&()/#_—-]+$' then return null; end if;
      if p_field in ('alias','well_name','property_number') and (
        v_value~*'\m(correct(ed)?|note|updated?|verified)\M'
        or v_value~*'\m(approximately|continue|head|left|miles?|onto|outside|right|road|turn)\M'
      ) then return null; end if;
    when 'api' then
      if pg_catalog.char_length(v_value)>32
         or v_value!~'^[0-9]{2}-[0-9]{3}-([0-9]-[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{5})$' then
        return null;
      end if;
    else
      return null;
  end case;
  return v_value;
end;
$$;

create or replace function private_verification.brinesearch_v18_safe_directory_array(
  p_values text[],
  p_field text,
  p_max_items integer
)
returns text[]
language plpgsql
immutable
parallel safe
security invoker
set search_path=''
as $$
declare
  v_safe text[];
begin
  if p_max_items<1 or p_max_items>32
     or coalesce(pg_catalog.cardinality(p_values),0)>p_max_items then
    return '{}'::text[];
  end if;
  select coalesce(pg_catalog.array_agg(distinct sanitized.value
    order by sanitized.value),'{}'::text[])
  into v_safe
  from pg_catalog.unnest(coalesce(p_values,'{}'::text[])) raw(value)
  cross join lateral (
    select private_verification.brinesearch_v18_safe_directory_text(
      raw.value,p_field
    ) as value
  ) sanitized
  where sanitized.value is not null;
  return v_safe;
end;
$$;

revoke all on function
  private_verification.brinesearch_v18_safe_directory_text(text,text)
from public,anon,authenticated,service_role;
revoke all on function
  private_verification.brinesearch_v18_safe_directory_array(text[],text,integer)
from public,anon,authenticated,service_role;

create table public.brinesearch_directory_snapshots_v18 (
  snapshot_id uuid primary key default pg_catalog.gen_random_uuid(),
  schema_version integer not null default 1,
  source_revision bigint not null unique,
  generated_at timestamptz not null,
  published_at timestamptz not null,
  publication_state text not null,
  retained_until timestamptz,
  row_count integer not null,
  searchable_count integer not null,
  type_counts jsonb not null,
  coordinate_counts jsonb not null,
  identity_event_count integer not null default 0,
  content_sha256 text not null,
  constraint brinesearch_directory_snapshots_v18_schema_check
    check(schema_version=1),
  constraint brinesearch_directory_snapshots_v18_revision_check
    check(source_revision>0),
  constraint brinesearch_directory_snapshots_v18_state_check
    check(publication_state in ('current','retained','withdrawn')),
  constraint brinesearch_directory_snapshots_v18_retention_check check(
    (
      publication_state='retained'
      and retained_until is not null
      and retained_until>published_at
    )
    or (
      publication_state in ('current','withdrawn')
      and retained_until is null
    )
  ),
  constraint brinesearch_directory_snapshots_v18_count_check
    check(
      row_count>0 and searchable_count=row_count
      and identity_event_count>=0
      and pg_catalog.jsonb_typeof(type_counts)='object'
      and pg_catalog.jsonb_typeof(coordinate_counts)='object'
    ),
  constraint brinesearch_directory_snapshots_v18_digest_check
    check(content_sha256~'^[0-9a-f]{64}$')
);

create unique index brinesearch_directory_snapshots_v18_one_current_idx
on public.brinesearch_directory_snapshots_v18((publication_state))
where publication_state='current';

create index brinesearch_directory_snapshots_v18_retention_idx
on public.brinesearch_directory_snapshots_v18(retained_until,snapshot_id)
where publication_state='retained';

create table public.brinesearch_directory_snapshot_rows_v18 (
  snapshot_id uuid not null references public.brinesearch_directory_snapshots_v18(snapshot_id)
    on delete restrict,
  ordinal integer not null,
  pad_id uuid not null,
  record_revision bigint not null,
  legacy_id text,
  record_type text not null,
  company text,
  pad_name text not null,
  state text,
  county text,
  township text,
  address text,
  structured_road_sequence text,
  driver_latitude double precision,
  driver_longitude double precision,
  coordinate_state text not null,
  search_aliases text[] not null default '{}'::text[],
  well_names text[] not null default '{}'::text[],
  api_numbers text[] not null default '{}'::text[],
  property_numbers text[] not null default '{}'::text[],
  safe_road_terms text[] not null default '{}'::text[],
  verification_state text,
  operating_state text,
  updated_at timestamptz,
  primary key(snapshot_id,ordinal),
  unique(snapshot_id,pad_id),
  constraint brinesearch_directory_snapshot_rows_v18_ordinal_check
    check(ordinal>0),
  constraint brinesearch_directory_snapshot_rows_v18_revision_check
    check(record_revision>0),
  constraint brinesearch_directory_snapshot_rows_v18_record_type_check
    check(record_type in ('pad','disposal','other')),
  constraint brinesearch_directory_snapshot_rows_v18_public_shape_check check(
    private_verification.brinesearch_v18_safe_directory_text(
      pad_name,'pad_name'
    )=pad_name
    and (
      legacy_id is null or private_verification.brinesearch_v18_safe_directory_text(
        legacy_id,'legacy_id'
      )=legacy_id
    )
    and (
      company is null or private_verification.brinesearch_v18_safe_directory_text(
        company,'company'
      )=company
    )
    and (
      state is null or private_verification.brinesearch_v18_safe_directory_text(
        state,'state'
      )=state
    )
    and (
      county is null or private_verification.brinesearch_v18_safe_directory_text(
        county,'county'
      )=county
    )
    and (
      township is null or private_verification.brinesearch_v18_safe_directory_text(
        township,'township'
      )=township
    )
    and (
      address is null or private_verification.brinesearch_v18_safe_directory_text(
        address,'address'
      )=address
    )
    and (
      structured_road_sequence is null
      or private_verification.brinesearch_v18_safe_directory_text(
        structured_road_sequence,'structured_road_sequence'
      )=structured_road_sequence
    )
    and (
      verification_state is null
      or private_verification.brinesearch_v18_safe_directory_text(
        verification_state,'verification_state'
      )=verification_state
    )
    and (
      operating_state is null
      or private_verification.brinesearch_v18_safe_directory_text(
        operating_state,'operating_state'
      )=operating_state
    )
    and private_verification.brinesearch_v18_safe_directory_array(
      search_aliases,'alias',3
    )=search_aliases
    and private_verification.brinesearch_v18_safe_directory_array(
      well_names,'well_name',32
    )=well_names
    and private_verification.brinesearch_v18_safe_directory_array(
      api_numbers,'api',32
    )=api_numbers
    and private_verification.brinesearch_v18_safe_directory_array(
      property_numbers,'property_number',32
    )=property_numbers
    and private_verification.brinesearch_v18_safe_directory_array(
      safe_road_terms,'safe_road_term',8
    )=safe_road_terms
  ),
  constraint brinesearch_directory_snapshot_rows_v18_coordinate_state_check
    check(coordinate_state in ('verified','missing','held')),
  constraint brinesearch_directory_snapshot_rows_v18_coordinate_pair_check
    check(
      (
        coordinate_state='verified'
        and driver_latitude is not null and driver_longitude is not null
        and driver_latitude between 37 and 43
        and driver_longitude between -84 and -74
        and not (driver_latitude=0 and driver_longitude=0)
      )
      or
      (
        coordinate_state<>'verified'
        and driver_latitude is null and driver_longitude is null
      )
    )
);

create index brinesearch_directory_snapshot_rows_v18_pad_idx
on public.brinesearch_directory_snapshot_rows_v18(pad_id,snapshot_id);
create index brinesearch_directory_snapshot_rows_v18_name_idx
on public.brinesearch_directory_snapshot_rows_v18(snapshot_id,pad_name,company,pad_id);
create index brinesearch_directory_snapshot_rows_v18_aliases_idx
on public.brinesearch_directory_snapshot_rows_v18 using gin(search_aliases);
create unique index brinesearch_directory_snapshot_rows_v18_legacy_identity_idx
on public.brinesearch_directory_snapshot_rows_v18(snapshot_id,legacy_id)
where legacy_id is not null;
create index brinesearch_directory_snapshot_rows_v18_wells_idx
on public.brinesearch_directory_snapshot_rows_v18 using gin(well_names);
create index brinesearch_directory_snapshot_rows_v18_apis_idx
on public.brinesearch_directory_snapshot_rows_v18 using gin(api_numbers);
create index brinesearch_directory_snapshot_rows_v18_properties_idx
on public.brinesearch_directory_snapshot_rows_v18 using gin(property_numbers);
create index brinesearch_directory_snapshot_rows_v18_roads_idx
on public.brinesearch_directory_snapshot_rows_v18 using gin(safe_road_terms);

-- Pad detail opens must never scan the full route corpus. The exact route and
-- receipt relations already key by route UUID; this partial index supplies the
-- missing pad/group entry point used by both status RPCs.
create index brinesearch_route_prep_v18_active_pad_group_idx
on public.brinesearch_route_prep(pad_id,route_group,id)
where active;

alter table public.brinesearch_directory_snapshots_v18 enable row level security;
alter table public.brinesearch_directory_snapshots_v18 force row level security;
alter table public.brinesearch_directory_snapshot_rows_v18 enable row level security;
alter table public.brinesearch_directory_snapshot_rows_v18 force row level security;

revoke all on public.brinesearch_directory_snapshots_v18
from public,anon,authenticated,service_role;
revoke all on public.brinesearch_directory_snapshot_rows_v18
from public,anon,authenticated,service_role;
grant select on public.brinesearch_directory_snapshots_v18
to anon,authenticated,service_role;
grant select on public.brinesearch_directory_snapshot_rows_v18
to anon,authenticated,service_role;

create policy brinesearch_directory_snapshots_v18_public_read
on public.brinesearch_directory_snapshots_v18
for select to anon,authenticated
using(
  publication_state='current'
  or (
    publication_state='retained'
    and retained_until>pg_catalog.statement_timestamp()
  )
);

create policy brinesearch_directory_snapshot_rows_v18_public_read
on public.brinesearch_directory_snapshot_rows_v18
for select to anon,authenticated
using(exists(
  select 1
  from public.brinesearch_directory_snapshots_v18 snapshot
  where snapshot.snapshot_id=brinesearch_directory_snapshot_rows_v18.snapshot_id
    and (
      snapshot.publication_state='current'
      or (
        snapshot.publication_state='retained'
        and snapshot.retained_until>pg_catalog.statement_timestamp()
      )
    )
));

create view public.brinesearch_directory_current_v18
with (security_invoker=true,security_barrier=true)
as
select
  snapshot.snapshot_id,
  snapshot.schema_version,
  snapshot.source_revision,
  snapshot.generated_at,
  snapshot.published_at,
  snapshot.row_count,
  snapshot.searchable_count,
  snapshot.type_counts,
  snapshot.coordinate_counts,
  snapshot.content_sha256,
  row.ordinal,
  row.pad_id,
  row.record_revision,
  row.legacy_id,
  row.record_type,
  row.company,
  row.pad_name,
  row.state,
  row.county,
  row.township,
  row.address,
  row.structured_road_sequence,
  row.driver_latitude,
  row.driver_longitude,
  row.coordinate_state,
  row.search_aliases,
  row.well_names,
  row.api_numbers,
  row.property_numbers,
  row.safe_road_terms,
  row.verification_state,
  row.operating_state,
  row.updated_at
from public.brinesearch_directory_snapshots_v18 snapshot
join public.brinesearch_directory_snapshot_rows_v18 row
  on row.snapshot_id=snapshot.snapshot_id
where snapshot.publication_state='current';

revoke all on public.brinesearch_directory_current_v18
from public,anon,authenticated,service_role;
grant select on public.brinesearch_directory_current_v18
to anon,authenticated,service_role;

-- This publisher has no caller-selected rows, filters, ordering, SQL, or
-- snapshot metadata. It atomically builds one complete immutable snapshot from
-- the already-sanitized public projection. Only the service role may invoke it.
create or replace function private_verification.brinesearch_v18_refresh_directory_snapshot()
returns jsonb
language plpgsql
security definer
set search_path=''
set statement_timeout='5min'
set lock_timeout='15s'
as $$
declare
  v_snapshot_id uuid:=pg_catalog.gen_random_uuid();
  v_source_revision bigint;
  v_generated_at timestamptz:=pg_catalog.clock_timestamp();
  v_row_count integer;
  v_pad_count integer;
  v_disposal_count integer;
  v_other_count integer;
  v_verified_coordinate_count integer;
  v_missing_coordinate_count integer;
  v_held_coordinate_count integer;
  v_content_sha256 text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('brinesearch:v18:directory-snapshot',18)
  );

  select coalesce(max(snapshot.source_revision),0)+1
  into v_source_revision
  from public.brinesearch_directory_snapshots_v18 snapshot;

  drop table if exists pg_temp.tmp_brinesearch_directory_rows_v18;
  create temporary table tmp_brinesearch_directory_rows_v18
  on commit drop
  as
  with source as (
    select
      detail.*,
      coalesce(verification.gps_verified,false) as gps_verified,
      route_reference.anchor_name as safe_anchor_name,
      route_reference.status as safe_anchor_status
    from public.public_pad_detail detail
    left join public.pad_verification_status verification
      on verification.pad_id=detail.id
    left join public.brinesearch_driver_route_reference route_reference
      on route_reference.pad_id=detail.id
  ), ordered as (
    select
      source.*,
      pg_catalog.row_number() over(
        order by source.record_number asc nulls last,
          source.pad_name asc nulls last,source.id
      )::integer as ordinal
    from source
  )
  select
    v_snapshot_id as snapshot_id,
    ordered.ordinal,
    ordered.id as pad_id,
    greatest(
      1,
      pg_catalog.floor(
        extract(epoch from coalesce(
          ordered.updated_at,ordered.created_at,pg_catalog.to_timestamp(0)
        ))*1000000
      )::bigint
    ) as record_revision,
    private_verification.brinesearch_v18_safe_directory_text(
      ordered.legacy_id,'legacy_id'
    ) as legacy_id,
    case
      when pg_catalog.lower(coalesce(ordered.record_type,''))='disposal' then 'disposal'
      when pg_catalog.lower(coalesce(ordered.record_type,''))='pad' then 'pad'
      else 'other'
    end as record_type,
    private_verification.brinesearch_v18_safe_directory_text(
      ordered.company,'company'
    ) as company,
    private_verification.brinesearch_v18_safe_directory_text(
      ordered.pad_name,'pad_name'
    ) as pad_name,
    private_verification.brinesearch_v18_safe_directory_text(
      ordered.state,'state'
    ) as state,
    private_verification.brinesearch_v18_safe_directory_text(
      ordered.county,'county'
    ) as county,
    private_verification.brinesearch_v18_safe_directory_text(
      ordered.township,'township'
    ) as township,
    private_verification.brinesearch_v18_safe_directory_text(
      ordered.address,'address'
    ) as address,
    private_verification.brinesearch_v18_safe_directory_text(
      ordered.structured_road_sequence,'structured_road_sequence'
    ) as structured_road_sequence,
    case when ordered.gps_verified
      and ordered.latitude is not null and ordered.longitude is not null
      and ordered.latitude between 37 and 43
      and ordered.longitude between -84 and -74
      and not (ordered.latitude=0 and ordered.longitude=0)
      then ordered.latitude else null end as driver_latitude,
    case when ordered.gps_verified
      and ordered.latitude is not null and ordered.longitude is not null
      and ordered.latitude between 37 and 43
      and ordered.longitude between -84 and -74
      and not (ordered.latitude=0 and ordered.longitude=0)
      then ordered.longitude else null end as driver_longitude,
    case
      when ordered.gps_verified
        and ordered.latitude is not null and ordered.longitude is not null
        and ordered.latitude between 37 and 43
        and ordered.longitude between -84 and -74
        and not (ordered.latitude=0 and ordered.longitude=0)
        then 'verified'
      when ordered.latitude is null and ordered.longitude is null then 'missing'
      else 'held'
    end as coordinate_state,
    private_verification.brinesearch_v18_safe_directory_array(array(
      select distinct alias_value
      from (
        values
          (nullif(pg_catalog.btrim(ordered.legacy_id),'')),
          (nullif(pg_catalog.btrim(ordered.extra_data->>'field_pad_alias'),'')),
          (nullif(pg_catalog.btrim(
            ordered.extra_data->'official_pad_record'->>'pad_name'
          ),''))
      ) alias(alias_value)
      where alias_value is not null
      order by alias_value
    )::text[],'alias',3) as search_aliases,
    private_verification.brinesearch_v18_safe_directory_array(array(
      select distinct well_value
      from (
        select nullif(pg_catalog.btrim(split.value),'') as well_value
        from pg_catalog.regexp_split_to_table(
          ordered.well_name,E'\\s*\\|\\s*'
        ) split(value)
        union all
        select nullif(pg_catalog.btrim(split.value),'')
        from pg_catalog.jsonb_array_elements(case
          when pg_catalog.jsonb_typeof(ordered.well_entries)='array'
            then ordered.well_entries else '[]'::jsonb end) entry
        cross join lateral pg_catalog.regexp_split_to_table(
          entry->>'well_name',E'\\s*\\|\\s*'
        ) split(value)
      ) well
      where well_value is not null
      order by well_value
    )::text[],'well_name',32) as well_names,
    private_verification.brinesearch_v18_safe_directory_array(array(
      select distinct api_value
      from (
        select nullif(pg_catalog.btrim(split.value),'') as api_value
        from pg_catalog.regexp_split_to_table(
          ordered.api,E'\\s*\\|\\s*'
        ) split(value)
        union all
        select nullif(pg_catalog.btrim(split.value),'')
        from pg_catalog.jsonb_array_elements(case
          when pg_catalog.jsonb_typeof(ordered.well_entries)='array'
            then ordered.well_entries else '[]'::jsonb end) entry
        cross join lateral pg_catalog.regexp_split_to_table(
          entry->>'api',E'\\s*\\|\\s*'
        ) split(value)
      ) api
      where api_value is not null
      order by api_value
    )::text[],'api',32) as api_numbers,
    private_verification.brinesearch_v18_safe_directory_array(array(
      select distinct property_value
      from (
        select nullif(pg_catalog.btrim(split.value),'') as property_value
        from pg_catalog.regexp_split_to_table(
          ordered.property_number,E'\\s*\\|\\s*'
        ) split(value)
        union all
        select nullif(pg_catalog.btrim(split.value),'')
        from pg_catalog.jsonb_array_elements(case
          when pg_catalog.jsonb_typeof(ordered.well_entries)='array'
            then ordered.well_entries else '[]'::jsonb end) entry
        cross join lateral pg_catalog.regexp_split_to_table(
          entry->>'property_number',E'\\s*\\|\\s*'
        ) split(value)
      ) property
      where property_value is not null
      order by property_value
    )::text[],'property_number',32) as property_numbers,
    case when ordered.safe_anchor_status in (
      'verified_distance','verified_approximate','verified_range','direct_on_anchor',
      'located_on_anchor','route_marker'
    ) and nullif(pg_catalog.btrim(ordered.safe_anchor_name),'') is not null
      then private_verification.brinesearch_v18_safe_directory_array(
        array[ordered.safe_anchor_name]::text[],'safe_road_term',8
      )
      else '{}'::text[] end as safe_road_terms,
    private_verification.brinesearch_v18_safe_directory_text(
      ordered.verification_status,'verification_state'
    ) as verification_state,
    private_verification.brinesearch_v18_safe_directory_text(
      ordered.operating_status,'operating_state'
    ) as operating_state,
    ordered.updated_at
  from ordered;

  if exists(
    select 1 from pg_temp.tmp_brinesearch_directory_rows_v18 row
    where row.pad_name is null
  ) then
    raise exception 'V18 directory snapshot contains an unsafe required pad name';
  end if;

  if exists(
    select 1
    from pg_temp.tmp_brinesearch_directory_rows_v18 row
    where row.legacy_id is not null
    group by row.legacy_id
    having count(*)>1
  ) then
    raise exception 'V18 directory snapshot contains an ambiguous legacy identity';
  end if;

  select count(*)::integer,
    count(*) filter(where record_type='pad')::integer,
    count(*) filter(where record_type='disposal')::integer,
    count(*) filter(where record_type='other')::integer,
    count(*) filter(where coordinate_state='verified')::integer,
    count(*) filter(where coordinate_state='missing')::integer,
    count(*) filter(where coordinate_state='held')::integer
  into v_row_count,v_pad_count,v_disposal_count,v_other_count,
    v_verified_coordinate_count,v_missing_coordinate_count,v_held_coordinate_count
  from pg_temp.tmp_brinesearch_directory_rows_v18;

  if v_row_count<1 then
    raise exception 'V18 directory snapshot source is empty';
  end if;
  if (select count(distinct pad_id) from pg_temp.tmp_brinesearch_directory_rows_v18)
       <>v_row_count
     or (select min(ordinal) from pg_temp.tmp_brinesearch_directory_rows_v18)<>1
     or (select max(ordinal) from pg_temp.tmp_brinesearch_directory_rows_v18)<>v_row_count
     or (select count(distinct ordinal) from pg_temp.tmp_brinesearch_directory_rows_v18)
       <>v_row_count then
    raise exception 'V18 directory snapshot identity or ordinal contract failed';
  end if;

  select pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.string_agg(
      pg_catalog.jsonb_build_array(
        row.ordinal,row.pad_id,row.record_revision,row.legacy_id,row.record_type,
        row.company,row.pad_name,row.state,row.county,row.township,row.address,
        row.structured_road_sequence,row.driver_latitude,row.driver_longitude,
        row.coordinate_state,
        row.search_aliases,row.well_names,row.api_numbers,row.property_numbers,
        row.safe_road_terms,row.verification_state,row.operating_state,row.updated_at
      )::text,E'\n' order by row.ordinal
    ),'UTF8'
  ),'sha256'),'hex')
  into v_content_sha256
  from pg_temp.tmp_brinesearch_directory_rows_v18 row;

  if v_content_sha256 is null or v_content_sha256!~'^[0-9a-f]{64}$' then
    raise exception 'V18 directory snapshot digest generation failed';
  end if;

  insert into public.brinesearch_directory_snapshots_v18(
    snapshot_id,schema_version,source_revision,generated_at,published_at,
    publication_state,retained_until,row_count,searchable_count,
    type_counts,coordinate_counts,identity_event_count,content_sha256
  ) values(
    v_snapshot_id,1,v_source_revision,v_generated_at,v_generated_at,
    'retained',v_generated_at+interval '15 minutes',v_row_count,v_row_count,
    pg_catalog.jsonb_build_object(
      'pad',v_pad_count,'disposal',v_disposal_count,'other',v_other_count
    ),
    pg_catalog.jsonb_build_object(
      'verifiedDriverEntrance',v_verified_coordinate_count,
      'missingDriverEntrance',v_missing_coordinate_count,
      'heldDriverEntrance',v_held_coordinate_count
    ),
    0,v_content_sha256
  );

  insert into public.brinesearch_directory_snapshot_rows_v18(
    snapshot_id,ordinal,pad_id,record_revision,legacy_id,record_type,company,pad_name,
    state,county,township,address,structured_road_sequence,
    driver_latitude,driver_longitude,coordinate_state,
    search_aliases,well_names,api_numbers,property_numbers,safe_road_terms,
    verification_state,operating_state,updated_at
  )
  select
    snapshot_id,ordinal,pad_id,record_revision,legacy_id,record_type,company,pad_name,
    state,county,township,address,structured_road_sequence,
    driver_latitude,driver_longitude,coordinate_state,
    search_aliases,well_names,api_numbers,property_numbers,safe_road_terms,
    verification_state,operating_state,updated_at
  from pg_temp.tmp_brinesearch_directory_rows_v18
  order by ordinal;

  -- Expired completion snapshots are retained as immutable audit rows but can
  -- no longer be selected through RLS or the paging RPC.
  update public.brinesearch_directory_snapshots_v18
  set publication_state='withdrawn',retained_until=null
  where publication_state='retained'
    and retained_until<=v_generated_at;
  -- The immediately preceding current snapshot gets one bounded completion
  -- window so an in-flight ordinal page sequence can finish on the same UUID.
  update public.brinesearch_directory_snapshots_v18
  set publication_state='retained',
    retained_until=v_generated_at+interval '15 minutes'
  where publication_state='current';
  update public.brinesearch_directory_snapshots_v18
  set publication_state='current',retained_until=null
  where snapshot_id=v_snapshot_id;

  return pg_catalog.jsonb_build_object(
    'schemaVersion',1,'snapshotId',v_snapshot_id,
    'sourceRevision',v_source_revision::text,'rowCount',v_row_count,
    'typeCounts',pg_catalog.jsonb_build_object(
      'pad',v_pad_count,'disposal',v_disposal_count,'other',v_other_count
    ),
    'coordinateCounts',pg_catalog.jsonb_build_object(
      'verifiedDriverEntrance',v_verified_coordinate_count,
      'missingDriverEntrance',v_missing_coordinate_count,
      'heldDriverEntrance',v_held_coordinate_count
    ),
    'contentSha256',v_content_sha256,'publicationState','current',
    'retainedUntil',null
  );
end;
$$;

revoke all on function private_verification.brinesearch_v18_refresh_directory_snapshot()
from public,anon,authenticated,service_role;
-- Existing hardening removes PUBLIC access to the private schema. USAGE lets
-- service_role resolve this one explicitly granted function; it grants no
-- table, sequence, function, or schema-CREATE privilege by itself.
grant usage on schema private_verification to service_role;
grant execute on function private_verification.brinesearch_v18_refresh_directory_snapshot()
to service_role;

-- A current snapshot is valid only while every direct publisher input is
-- unchanged. public_pad_detail is the sanitized direct row source; pads is its
-- upstream source and must withdraw the current snapshot even before/if its
-- projection trigger cannot complete. The other two relations are the only
-- joined publisher inputs. Statement-level triggers cover bulk DML and
-- TRUNCATE without row-count fanout. Withdrawal participates in the source
-- transaction and therefore rolls back with it on failure.
create or replace function
  private_verification.brinesearch_v18_withdraw_directory_snapshot_on_source_change()
returns trigger
language plpgsql
security definer
set search_path=''
set statement_timeout='30s'
set lock_timeout='5s'
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('brinesearch:v18:directory-snapshot',18)
  );
  -- A source change is a revocation boundary, not an ordinary publication.
  -- Every previously public generation must close immediately; only a
  -- successful publisher transition may grant the bounded retention window.
  update public.brinesearch_directory_snapshots_v18
  set publication_state='withdrawn',retained_until=null
  where publication_state in ('current','retained');
  return null;
end;
$$;

revoke all on function
  private_verification.brinesearch_v18_withdraw_directory_snapshot_on_source_change()
from public,anon,authenticated,service_role;

drop trigger if exists brinesearch_v18_directory_snapshot_invalidate
on public.pads;
create trigger brinesearch_v18_directory_snapshot_invalidate
after insert or update or delete or truncate
on public.pads
for each statement execute function
  private_verification.brinesearch_v18_withdraw_directory_snapshot_on_source_change();

drop trigger if exists brinesearch_v18_directory_snapshot_invalidate
on public.public_pad_detail;
create trigger brinesearch_v18_directory_snapshot_invalidate
after insert or update or delete or truncate
on public.public_pad_detail
for each statement execute function
  private_verification.brinesearch_v18_withdraw_directory_snapshot_on_source_change();

drop trigger if exists brinesearch_v18_directory_snapshot_invalidate
on public.pad_verification_status;
create trigger brinesearch_v18_directory_snapshot_invalidate
after insert or update or delete or truncate
on public.pad_verification_status
for each statement execute function
  private_verification.brinesearch_v18_withdraw_directory_snapshot_on_source_change();

drop trigger if exists brinesearch_v18_directory_snapshot_invalidate
on public.brinesearch_driver_route_reference;
create trigger brinesearch_v18_directory_snapshot_invalidate
after insert or update or delete or truncate
on public.brinesearch_driver_route_reference
for each statement execute function
  private_verification.brinesearch_v18_withdraw_directory_snapshot_on_source_change();

-- Immutable ordinal paging. A requested snapshot is never silently replaced by
-- a newer one, so pages from different snapshots cannot be combined.
create or replace function public.brinesearch_v18_directory_page(
  p_snapshot_id uuid default null,
  p_after_ordinal integer default 0,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
set statement_timeout='2500ms'
set lock_timeout='500ms'
as $$
declare
  v_snapshot public.brinesearch_directory_snapshots_v18%rowtype;
  v_rows jsonb:='[]'::jsonb;
  v_page_count integer:=0;
  v_next_ordinal integer:=p_after_ordinal;
begin
  if p_after_ordinal is null or p_after_ordinal<0 then
    return pg_catalog.jsonb_build_object(
      'schemaVersion',1,'error','invalid_cursor'
    );
  end if;
  if p_limit is null or p_limit<1 or p_limit>1000 then
    return pg_catalog.jsonb_build_object(
      'schemaVersion',1,'error','invalid_limit','maximumLimit',1000
    );
  end if;

  if p_snapshot_id is null then
    select snapshot.* into v_snapshot
    from public.brinesearch_directory_snapshots_v18 snapshot
    where snapshot.publication_state='current'
    order by snapshot.source_revision desc
    limit 1;
  else
    select snapshot.* into v_snapshot
    from public.brinesearch_directory_snapshots_v18 snapshot
    where snapshot.snapshot_id=p_snapshot_id
      and (
        snapshot.publication_state='current'
        or (
          snapshot.publication_state='retained'
          and snapshot.retained_until>pg_catalog.statement_timestamp()
        )
      );
  end if;

  if not found then
    return pg_catalog.jsonb_build_object(
      'schemaVersion',1,
      'error',case when p_snapshot_id is null
        then 'directory_unavailable' else 'snapshot_expired' end,
      'requestedSnapshotId',p_snapshot_id
    );
  end if;

  select
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'ordinal',page.ordinal,
      'padId',page.pad_id,
      'recordRevision',page.record_revision::text,
      'legacyId',page.legacy_id,
      'recordType',page.record_type,
      'company',page.company,
      'padName',page.pad_name,
      'state',page.state,
      'county',page.county,
      'township',page.township,
      'address',page.address,
      'structuredRoadSequence',page.structured_road_sequence,
      'driverEntrance',case when page.coordinate_state='verified' then
        pg_catalog.jsonb_build_object(
          'role','driver_entrance','latitude',page.driver_latitude,
          'longitude',page.driver_longitude,'qualityState','validated'
        ) else null end,
      'coordinateState',page.coordinate_state,
      'aliases',pg_catalog.to_jsonb(page.search_aliases),
      'wellNames',pg_catalog.to_jsonb(page.well_names),
      'apis',pg_catalog.to_jsonb(page.api_numbers),
      'propertyNumbers',pg_catalog.to_jsonb(page.property_numbers),
      'safeRoadTerms',pg_catalog.to_jsonb(page.safe_road_terms),
      'verificationState',page.verification_state,
      'operatingState',page.operating_state,
      'updatedAt',page.updated_at
    ) order by page.ordinal),'[]'::jsonb),
    count(*)::integer,
    coalesce(max(page.ordinal),p_after_ordinal)
  into v_rows,v_page_count,v_next_ordinal
  from (
    select row.*
    from public.brinesearch_directory_snapshot_rows_v18 row
    where row.snapshot_id=v_snapshot.snapshot_id
      and row.ordinal>p_after_ordinal
    order by row.ordinal
    limit p_limit
  ) page;

  return pg_catalog.jsonb_build_object(
    'schemaVersion',1,
    'snapshot',pg_catalog.jsonb_build_object(
      'snapshotId',v_snapshot.snapshot_id,
      'sourceRevision',v_snapshot.source_revision::text,
      'generatedAt',v_snapshot.generated_at,
      'publishedAt',v_snapshot.published_at,
      'publicationState',v_snapshot.publication_state,
      'retainedUntil',v_snapshot.retained_until,
      'rowCount',v_snapshot.row_count,
      'searchableCount',v_snapshot.searchable_count,
      'typeCounts',v_snapshot.type_counts,
      'coordinateCounts',v_snapshot.coordinate_counts,
      'identityEventCount',v_snapshot.identity_event_count,
      'contentSha256',v_snapshot.content_sha256
    ),
    'page',pg_catalog.jsonb_build_object(
      'afterOrdinal',p_after_ordinal,
      'nextAfterOrdinal',v_next_ordinal,
      'rowCount',v_page_count,
      'complete',v_next_ordinal>=v_snapshot.row_count
    ),
    'rows',v_rows,
    'identityState','[]'::jsonb
  );
end;
$$;

revoke all on function public.brinesearch_v18_directory_page(uuid,integer,integer)
from public,anon,authenticated,service_role;
grant execute on function public.brinesearch_v18_directory_page(uuid,integer,integer)
to anon,authenticated,service_role;

-- Closed validator for the less-common A->B right-continuation receipt. The
-- outer coalesce is intentional: a missing JSON key or nullable receipt field
-- is false, never an unknown value that can bypass a NOT/OR gate.
create or replace function
  private_verification.brinesearch_v18_valid_right_continuation(
    p_status text,
    p_hold_reason text,
    p_junction_type text,
    p_anchor_role text,
    p_candidate_count integer,
    p_evidence jsonb,
    p_receipt_digest text,
    p_dependency_digest text,
    p_anchor_id uuid
  )
returns boolean
language sql
immutable
parallel safe
security invoker
set search_path=''
return coalesce(
  p_status='resolved'
  and p_hold_reason is null
  and p_junction_type='shared_segment'
  and p_anchor_role in ('shared_start','shared_end')
  and p_candidate_count=2
  and p_evidence->>'shared_segment_sequence'='A->B'
  and p_evidence->>'right_context_kind'
    in ('pad_gps','next_resolved_transition')
  and pg_catalog.jsonb_typeof(p_evidence->'right_context_fraction')='number'
  and pg_catalog.jsonb_typeof(p_evidence->'shared_start_fraction')='number'
  and pg_catalog.jsonb_typeof(p_evidence->'shared_end_fraction')='number'
  and p_evidence->>'right_context_outside_shared_interval'='true'
  and p_evidence->>'selection_uses_exact_right_identity'='true'
  and p_evidence->>'selection_uses_route_sequence'='true'
  and p_evidence->>'selection_uses_name_similarity'='false'
  and p_evidence->>'selection_uses_nearest_road'='false'
  and p_evidence->>'selection_uses_route_number_alone'='false'
  and p_receipt_digest=pg_catalog.md5(
    p_dependency_digest||
    '|resolved|shared_segment_right_continuation_context|'||
    p_anchor_id::text
  ),false
);

revoke all on function
  private_verification.brinesearch_v18_valid_right_continuation(
    text,text,text,text,integer,jsonb,text,text,uuid
  )
from public,anon,authenticated,service_role;

-- Build the selected route solely from the current Issue #97 occurrence,
-- occurrence-geometry, and transition receipt set for one route_prep row.
-- public.pads.structured_route_steps is intentionally not an authority here:
-- the exact 412-route rebuild does not rewrite that legacy V17 snapshot.
--
-- Public order 1 is occurrence 2: occurrence 1 is the zero-length origin
-- anchor, while each later occurrence is one exact traveled road leg. A
-- transition boundary i therefore enters public step i. Shared-road semantics
-- require one unambiguous pair of consecutive exact A->B->A shared-context
-- transition receipts. Name changes require an exact resolved transition whose
-- joined verified junction is explicitly name_change. Names, aliases, and
-- geometric proximity never classify either semantic.
create or replace function private_verification.brinesearch_v18_exact_route_projection(
  p_route_prep_id uuid,
  p_expected_occurrence_count integer
)
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_route record;
  v_receipt private_verification.brinesearch_route_reconciliation_receipts_issue97%rowtype;
  v_expected_dependency text;
  v_dark_current boolean:=false;
  v_source_step_count integer:=0;
  v_occurrence_count integer:=0;
  v_geometry_count integer:=0;
  v_total_geometry_points bigint:=0;
  v_transition_count integer:=0;
  v_min_index integer;
  v_max_index integer;
  v_shared_boundary_count integer:=0;
  v_shared_pair_count integer:=0;
  v_ambiguous_shared_boundaries integer:=0;
  v_right_authority_count integer:=0;
  v_right_semantic_count integer:=0;
  v_right_semantic_mismatch integer:=0;
  v_projection jsonb;
begin
  if p_route_prep_id is null
     or p_expected_occurrence_count<2
     or p_expected_occurrence_count>256 then
    return null;
  end if;

  select route.*,pad.latitude as pad_latitude,pad.longitude as pad_longitude,
    pad.structured_route_revision,pad.road_sequence_status,
    coalesce(verification.gps_verified,false) as gps_verified
  into v_route
  from public.brinesearch_route_prep route
  join public.pads pad on pad.id=route.pad_id
  left join public.pad_verification_status verification
    on verification.pad_id=pad.id
  where route.id=p_route_prep_id and route.active
    and route.route_group='primary' and route.variant_index=1
    and route.readiness_status='ready_for_road_matching';
  if not found or not v_route.gps_verified
     or v_route.pad_latitude is null or v_route.pad_longitude is null
     or v_route.pad_latitude not between 37 and 43
     or v_route.pad_longitude not between -84 and -74
     or (v_route.pad_latitude=0 and v_route.pad_longitude=0) then
    return null;
  end if;

  select receipt.* into v_receipt
  from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
  where receipt.route_prep_id=p_route_prep_id;
  if not found
     or v_receipt.route_status<>'route_ready'
     or v_receipt.stage<>'ready'
     or v_receipt.pad_id is distinct from v_route.pad_id
     or v_receipt.route_group<>'primary'
     or v_receipt.variant_index<>1
     or v_receipt.source_sequence_hash is distinct from v_route.source_sequence_hash
     or pg_catalog.cardinality(v_receipt.exception_reasons)<>0
     or v_receipt.road_occurrence_count<>p_expected_occurrence_count
     or v_receipt.resolved_occurrence_count<>p_expected_occurrence_count
     or v_receipt.held_occurrence_count<>0
     or v_receipt.canonical_mapping_count<>p_expected_occurrence_count
     or v_receipt.exact_geometry_count<>p_expected_occurrence_count then
    return null;
  end if;

  -- Rebuild the installed route-receipt dependency exactly. A row that still
  -- says route_ready after any occurrence, transition, geometry, pad-revision,
  -- or private-manifest dependency drift is not current and cannot publish
  -- public steps. The private readiness value is used only as a boolean input
  -- to this equality check and is never returned by the driver RPC.
  v_dark_current:=
    private_verification.brinesearch_issue97_transition_google_dark_current(
      v_route.pad_id
    );
  v_expected_dependency:=pg_catalog.md5(pg_catalog.concat_ws('|',
    v_route.id::text,v_route.pad_id::text,v_route.source_sequence_hash,
    v_route.route_group,v_route.variant_index::text,
    coalesce(v_route.readiness_status,''),
    coalesce(v_route.structured_route_revision::text,''),
    coalesce(v_route.road_sequence_status,''),
    coalesce((select pg_catalog.string_agg(
        occurrence.receipt_digest,',' order by occurrence.occurrence_index
      )
      from private_verification.brinesearch_route_occurrence_receipts_issue97 occurrence
      where occurrence.route_prep_id=p_route_prep_id),''),
    coalesce((select pg_catalog.string_agg(
        transition.receipt_digest,',' order by transition.boundary_index
      )
      from private_verification.brinesearch_route_transition_receipts_issue97 transition
      where transition.route_prep_id=p_route_prep_id),''),
    coalesce((select pg_catalog.string_agg(
        geometry.receipt_digest,',' order by geometry.occurrence_index
      )
      from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
      where geometry.route_prep_id=p_route_prep_id),''),
    coalesce((select pg_catalog.concat_ws(':',google.status,google.hold_reason,
        google.manifest_digest,google.dependency_digest,google.manifest::text,
        google.evidence::text)
      from private_verification.brinesearch_google_route_receipts_issue97 google
      where google.pad_id=v_route.pad_id),''),
    v_dark_current::text
  ));
  if v_receipt.dependency_digest is distinct from v_expected_dependency
     or v_receipt.receipt_digest is distinct from pg_catalog.md5(
       pg_catalog.concat_ws('|',v_expected_dependency,v_receipt.route_status,
         v_receipt.stage,
         pg_catalog.array_to_string(v_receipt.exception_reasons,','),
         v_receipt.evidence::text)
     ) then
    return null;
  end if;

  select count(*)::integer into v_source_step_count
  from public.brinesearch_route_prep_steps source_step
  where source_step.route_prep_id=p_route_prep_id and source_step.active
    and source_step.step_kind in (
      'interstate','us_route','state_route','county_road',
      'township_road','local_road','private_segment'
    );
  if v_source_step_count<>p_expected_occurrence_count then
    return null;
  end if;

  select count(*)::integer,min(occurrence.occurrence_index),
    max(occurrence.occurrence_index)
  into v_occurrence_count,v_min_index,v_max_index
  from private_verification.brinesearch_route_occurrence_receipts_issue97 occurrence
  where occurrence.route_prep_id=p_route_prep_id;
  if v_occurrence_count<>p_expected_occurrence_count
     or v_min_index<>1 or v_max_index<>p_expected_occurrence_count then
    return null;
  end if;

  select count(*)::integer,min(geometry.occurrence_index),
    max(geometry.occurrence_index),coalesce(pg_catalog.sum(
      case when geometry.step_geometry is null then 0
        else extensions.st_npoints(geometry.step_geometry) end
    ),0)::bigint
  into v_geometry_count,v_min_index,v_max_index,v_total_geometry_points
  from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
  where geometry.route_prep_id=p_route_prep_id;
  if v_geometry_count<>p_expected_occurrence_count
     or v_min_index<>1 or v_max_index<>p_expected_occurrence_count
     or v_total_geometry_points>100000 then
    return null;
  end if;

  if exists(
    select 1
    from private_verification.brinesearch_route_occurrence_receipts_issue97 occurrence
    left join public.brinesearch_route_prep_steps source_step
      on source_step.id=occurrence.route_prep_step_id
    left join public.brinesearch_authoritative_road_identities identity
      on identity.id=occurrence.identity_id
    left join public.brinesearch_road_identity_mappings mapping
      on mapping.identity_id=occurrence.identity_id
      and mapping.mapping_status='verified'
    left join private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
      on geometry.route_prep_step_id=occurrence.route_prep_step_id
      and geometry.route_prep_id=occurrence.route_prep_id
      and geometry.occurrence_index=occurrence.occurrence_index
    where occurrence.route_prep_id=p_route_prep_id and (
      occurrence.pad_id is distinct from v_route.pad_id
      or occurrence.route_group<>'primary' or occurrence.variant_index<>1
      or occurrence.resolution_status<>'resolved'
      or occurrence.hold_reason is not null
      or occurrence.identity_id is null or occurrence.canonical_road_id is null
      or nullif(pg_catalog.btrim(occurrence.driver_road_name),'') is null
      or source_step.id is null or not source_step.active
      or source_step.route_prep_id is distinct from p_route_prep_id
      or source_step.step_order is distinct from occurrence.source_step_order
      or source_step.raw_text is distinct from occurrence.raw_text
      or source_step.normalized_text is distinct from occurrence.normalized_text
      or source_step.step_kind is distinct from occurrence.step_kind
      or source_step.road_id is distinct from occurrence.input_road_id
      or occurrence.occurrence_index is distinct from (
        select count(*)::integer
        from public.brinesearch_route_prep_steps prior
        where prior.route_prep_id=p_route_prep_id and prior.active
          and prior.step_kind in (
            'interstate','us_route','state_route','county_road',
            'township_road','local_road','private_segment'
          )
          and (
            prior.step_order<source_step.step_order
            or (
              prior.step_order=source_step.step_order
              and prior.id<=source_step.id
            )
          )
      )
      or occurrence.input_digest is distinct from pg_catalog.md5(
        pg_catalog.concat_ws('|',p_route_prep_id::text,
          v_route.source_sequence_hash,source_step.step_order::text,
          source_step.raw_text,source_step.normalized_text,
          source_step.step_kind,coalesce(source_step.road_id::text,''),
          coalesce(source_step.match_status,''),
          coalesce(source_step.match_method,''),
          coalesce(source_step.source_details::text,'{}'),
          coalesce(
            private_verification.brinesearch_issue97_explicit_occurrence_source_key(
              v_route.state,source_step.match_method,
              coalesce(source_step.source_details,'{}'::jsonb)
            ),''
          )
        )
      )
      or identity.id is null or not identity.active
      or identity.source_identity_key is distinct from occurrence.source_identity_key
      or identity.source_digest is distinct from occurrence.source_digest
      or mapping.road_id is distinct from occurrence.canonical_road_id
      or occurrence.mapping_fingerprint is distinct from
        private_verification.brinesearch_issue97_mapping_fingerprint(
          occurrence.identity_id
        )
      or occurrence.driver_road_name is distinct from
        private_verification.brinesearch_issue97_identity_driver_name(
          occurrence.identity_id
        )
      or occurrence.valid_aliases is distinct from
        private_verification.brinesearch_issue97_identity_aliases(
          occurrence.identity_id,occurrence.canonical_road_id
        )
      or private_verification.brinesearch_issue97_dataset_scope_current(
        identity.dataset_id,identity.state_code,identity.county_code
      ) is distinct from true
      or geometry.route_prep_step_id is null
      or geometry.pad_id is distinct from v_route.pad_id
      or geometry.route_group<>'primary' or geometry.variant_index<>1
      or geometry.source_step_order is distinct from occurrence.source_step_order
      or geometry.identity_id is distinct from occurrence.identity_id
      or geometry.road_id is distinct from occurrence.canonical_road_id
      or geometry.status<>'resolved' or geometry.hold_reason is not null
      or geometry.road_geometry_digest is distinct from
        private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(
          geometry.identity_id
        )
      or geometry.dependency_digest is distinct from pg_catalog.md5(
        pg_catalog.concat_ws('|',occurrence.receipt_digest,
          geometry.road_geometry_digest,
          coalesce(geometry.start_transition_digest,''),
          coalesce(geometry.end_transition_digest,''),
          coalesce(geometry.pad_coordinate_digest,''),
          coalesce(geometry.geometry_method,''),
          coalesce(geometry.hold_reason,''),
          coalesce(geometry.outbound_turn,''),
          coalesce(geometry.inbound_turn,''))
      )
      or geometry.receipt_digest is distinct from pg_catalog.md5(
        pg_catalog.concat_ws('|',geometry.dependency_digest,geometry.status,
          coalesce(geometry.hold_reason,''),
          coalesce(geometry.geometry_miles::text,''),
          coalesce(geometry.outbound_turn,''),
          coalesce(geometry.evidence::text,'{}'))
      )
      or (occurrence.occurrence_index=1 and not exists(
        select 1
        from private_verification.brinesearch_route_transition_receipts_issue97 transition
        where transition.route_prep_id=p_route_prep_id
          and transition.boundary_index=1 and transition.status='resolved'
          and transition.receipt_digest=geometry.end_transition_digest
      ))
      or (occurrence.occurrence_index>1 and not exists(
        select 1
        from private_verification.brinesearch_route_transition_receipts_issue97 transition
        where transition.route_prep_id=p_route_prep_id
          and transition.boundary_index=occurrence.occurrence_index-1
          and transition.status='resolved'
          and transition.receipt_digest=geometry.start_transition_digest
      ))
      or (occurrence.occurrence_index<p_expected_occurrence_count and not exists(
        select 1
        from private_verification.brinesearch_route_transition_receipts_issue97 transition
        where transition.route_prep_id=p_route_prep_id
          and transition.boundary_index=occurrence.occurrence_index
          and transition.status='resolved'
          and transition.receipt_digest=geometry.end_transition_digest
      ))
      or (occurrence.occurrence_index=1 and (
        geometry.occurrence_role<>'origin_anchor'
        or geometry.step_geometry is not null or geometry.geometry_miles<>0
        or geometry.start_coordinate is null or geometry.end_coordinate is null
        or not extensions.st_dwithin(
          geometry.start_coordinate::extensions.geography,
          geometry.end_coordinate::extensions.geography,0.01
        )
      ))
      or (occurrence.occurrence_index>1 and (
        geometry.occurrence_role<>'traveled'
        or geometry.step_geometry is null or geometry.geometry_miles<=0
        or geometry.outbound_turn not in ('left','right','continue')
        or geometry.start_coordinate is null or geometry.end_coordinate is null
        or extensions.geometrytype(geometry.step_geometry)<>'LINESTRING'
        or extensions.st_srid(geometry.step_geometry)<>4326
        or extensions.st_isempty(geometry.step_geometry)
        or extensions.st_npoints(geometry.step_geometry) not between 2 and 2000
        or not extensions.st_isvalid(geometry.step_geometry)
        or not extensions.st_issimple(geometry.step_geometry)
        or extensions.st_length(geometry.step_geometry)<=0
        or not extensions.st_coveredby(
          geometry.step_geometry,
          extensions.st_makeenvelope(-180,-90,180,90,4326)
        )
        or not extensions.st_dwithin(
          extensions.st_startpoint(geometry.step_geometry)::extensions.geography,
          geometry.start_coordinate::extensions.geography,1
        )
        or not extensions.st_dwithin(
          extensions.st_endpoint(geometry.step_geometry)::extensions.geography,
          geometry.end_coordinate::extensions.geography,1
        )
      ))
    )
  ) then
    return null;
  end if;

  if exists(
    select 1
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 prior
    join private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 next
      on next.route_prep_id=prior.route_prep_id
      and next.occurrence_index=prior.occurrence_index+1
    where prior.route_prep_id=p_route_prep_id
      and not extensions.st_dwithin(
        prior.end_coordinate::extensions.geography,
        next.start_coordinate::extensions.geography,1
      )
  ) or not exists(
    select 1
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 final
    where final.route_prep_id=p_route_prep_id
      and final.occurrence_index=p_expected_occurrence_count
      and final.pad_coordinate_digest=pg_catalog.md5(pg_catalog.concat_ws('|',
        v_route.pad_longitude::text,v_route.pad_latitude::text
      ))
      and extensions.st_dwithin(
        final.end_coordinate::extensions.geography,
        extensions.st_setsrid(extensions.st_makepoint(
          v_route.pad_longitude,v_route.pad_latitude
        ),4326)::extensions.geography,1
      )
  ) then
    return null;
  end if;

  select count(*)::integer,min(transition.boundary_index),
    max(transition.boundary_index)
  into v_transition_count,v_min_index,v_max_index
  from private_verification.brinesearch_route_transition_receipts_issue97 transition
  where transition.route_prep_id=p_route_prep_id;
  if v_transition_count<>p_expected_occurrence_count-1
     or v_min_index<>1 or v_max_index<>p_expected_occurrence_count-1 then
    return null;
  end if;

  if exists(
    select 1
    from private_verification.brinesearch_route_transition_receipts_issue97 transition
    left join private_verification.brinesearch_route_occurrence_receipts_issue97 left_occurrence
      on left_occurrence.route_prep_id=transition.route_prep_id
      and left_occurrence.occurrence_index=transition.boundary_index
    left join private_verification.brinesearch_route_occurrence_receipts_issue97 right_occurrence
      on right_occurrence.route_prep_id=transition.route_prep_id
      and right_occurrence.occurrence_index=transition.boundary_index+1
    left join public.brinesearch_road_junctions junction
      on junction.id=transition.junction_id
    left join public.brinesearch_road_junction_anchors anchor
      on anchor.id=transition.anchor_id
    left join public.brinesearch_road_graph_builds build
      on build.id=transition.graph_build_id
    where transition.route_prep_id=p_route_prep_id and (
      transition.pad_id is distinct from v_route.pad_id
      or transition.route_group<>'primary' or transition.variant_index<>1
      or transition.status<>'resolved' or transition.hold_reason is not null
      or transition.left_route_prep_step_id
        is distinct from left_occurrence.route_prep_step_id
      or transition.right_route_prep_step_id
        is distinct from right_occurrence.route_prep_step_id
      or transition.left_identity_id is distinct from left_occurrence.identity_id
      or transition.right_identity_id is distinct from right_occurrence.identity_id
      or transition.left_road_id is distinct from left_occurrence.canonical_road_id
      or transition.right_road_id is distinct from right_occurrence.canonical_road_id
      or junction.id is null or junction.build_id is distinct from transition.graph_build_id
      or junction.graph_digest is distinct from transition.graph_digest
      or junction.verification_status<>'verified'
      or anchor.id is null or anchor.junction_id is distinct from junction.id
      or anchor.anchor_digest is distinct from transition.anchor_digest
      or not extensions.st_dwithin(
        anchor.geom::extensions.geography,
        transition.coordinate::extensions.geography,0.01
      )
      or build.id is null or build.status<>'active'
      or build.source_revision_digest is distinct from transition.source_revision_digest
    )
  ) then
    return null;
  end if;

  -- A tracked A->B right-continuation receipt proves that the entered road
  -- continues beyond the shared interval, so this boundary is an exact
  -- shared-road exit. Any incomplete/altered evidence fails the whole public
  -- projection instead of silently becoming a generic turn.
  if exists(
    select 1
    from private_verification.brinesearch_route_transition_receipts_issue97 transition
    join public.brinesearch_road_junctions junction
      on junction.id=transition.junction_id
      and junction.build_id=transition.graph_build_id
      and junction.graph_digest=transition.graph_digest
      and junction.verification_status='verified'
    where transition.route_prep_id=p_route_prep_id
      and transition.resolution_method=
        'shared_segment_right_continuation_context'
      and not private_verification.brinesearch_v18_valid_right_continuation(
        transition.status,transition.hold_reason,junction.junction_type,
        transition.anchor_role,transition.candidate_count,transition.evidence,
        transition.receipt_digest,transition.dependency_digest,
        transition.anchor_id
      )
  ) then
    return null;
  end if;

  with transition_authority as materialized (
    select transition.boundary_index,transition.resolution_method,
      transition.status,transition.hold_reason,
      transition.junction_id,transition.anchor_id,transition.graph_build_id,
      transition.anchor_role,transition.candidate_count,
      transition.dependency_digest,transition.receipt_digest,
      transition.evidence,junction.junction_type
    from private_verification.brinesearch_route_transition_receipts_issue97 transition
    join public.brinesearch_road_junctions junction
      on junction.id=transition.junction_id
      and junction.build_id=transition.graph_build_id
      and junction.graph_digest=transition.graph_digest
      and junction.verification_status='verified'
    where transition.route_prep_id=p_route_prep_id
      and transition.status='resolved'
  ), shared_pairs as materialized (
    select first.boundary_index as begin_boundary,
      second.boundary_index as end_boundary
    from transition_authority first
    join transition_authority second
      on second.boundary_index=first.boundary_index+1
      and second.junction_id=first.junction_id
      and second.graph_build_id=first.graph_build_id
      and second.anchor_id<>first.anchor_id
    where first.resolution_method='shared_segment_sequence_context'
      and second.resolution_method='shared_segment_sequence_context'
      and first.junction_type='shared_segment'
      and second.junction_type='shared_segment'
      and first.evidence->>'shared_segment_sequence'='A->B->A'
      and second.evidence->>'shared_segment_sequence'='A->B->A'
      and first.evidence->>'selection_uses_route_sequence'='true'
      and second.evidence->>'selection_uses_route_sequence'='true'
      and first.evidence->>'selection_uses_name_similarity'='false'
      and second.evidence->>'selection_uses_name_similarity'='false'
      and first.evidence->>'selection_uses_nearest_road'='false'
      and second.evidence->>'selection_uses_nearest_road'='false'
  ), shared_members as (
    select pair.begin_boundary as boundary_index from shared_pairs pair
    union all
    select pair.end_boundary from shared_pairs pair
  ), shared_membership as (
    select member.boundary_index,count(*)::integer as membership_count
    from shared_members member group by member.boundary_index
  )
  select
    count(*) filter(where authority.resolution_method=
      'shared_segment_sequence_context')::integer,
    (select count(*)::integer from shared_pairs),
    (select count(*)::integer from shared_membership membership
      where membership.membership_count<>1)
  into v_shared_boundary_count,v_shared_pair_count,
    v_ambiguous_shared_boundaries
  from transition_authority authority;
  if v_shared_boundary_count<>v_shared_pair_count*2
     or v_ambiguous_shared_boundaries<>0 then
    return null;
  end if;

  -- Prove that every A->B right-continuation authority row becomes exactly
  -- one validated shared_end candidate. This closes silent omission: even if
  -- the semantic projection is changed later, its count and boundary set must
  -- still equal the complete authority set.
  with right_authority as materialized (
    select transition.boundary_index,transition.status,
      transition.hold_reason,transition.anchor_role,
      transition.candidate_count,transition.evidence,
      transition.receipt_digest,transition.dependency_digest,
      transition.anchor_id,junction.junction_type
    from private_verification.brinesearch_route_transition_receipts_issue97 transition
    join public.brinesearch_road_junctions junction
      on junction.id=transition.junction_id
      and junction.build_id=transition.graph_build_id
      and junction.graph_digest=transition.graph_digest
      and junction.verification_status='verified'
    where transition.route_prep_id=p_route_prep_id
      and transition.resolution_method=
        'shared_segment_right_continuation_context'
  ), right_semantics as materialized (
    select authority.boundary_index
    from right_authority authority
    where private_verification.brinesearch_v18_valid_right_continuation(
      authority.status,authority.hold_reason,authority.junction_type,
      authority.anchor_role,authority.candidate_count,authority.evidence,
      authority.receipt_digest,authority.dependency_digest,
      authority.anchor_id
    )
  ), set_mismatch as (
    (select authority.boundary_index from right_authority authority
     except select semantic.boundary_index from right_semantics semantic)
    union all
    (select semantic.boundary_index from right_semantics semantic
     except select authority.boundary_index from right_authority authority)
  )
  select
    (select count(*)::integer from right_authority),
    (select count(*)::integer from right_semantics),
    (select count(*)::integer from set_mismatch)
  into v_right_authority_count,v_right_semantic_count,
    v_right_semantic_mismatch;
  if v_right_authority_count<>v_right_semantic_count
     or v_right_semantic_mismatch<>0 then
    return null;
  end if;

  with transition_authority as materialized (
    select transition.boundary_index,transition.resolution_method,
      transition.status,transition.hold_reason,
      transition.junction_id,transition.anchor_id,transition.graph_build_id,
      transition.anchor_role,transition.candidate_count,
      transition.dependency_digest,transition.receipt_digest,
      transition.evidence,junction.junction_type
    from private_verification.brinesearch_route_transition_receipts_issue97 transition
    join public.brinesearch_road_junctions junction
      on junction.id=transition.junction_id
      and junction.build_id=transition.graph_build_id
      and junction.graph_digest=transition.graph_digest
      and junction.verification_status='verified'
    where transition.route_prep_id=p_route_prep_id
      and transition.status='resolved'
  ), shared_pairs as materialized (
    select first.boundary_index as begin_boundary,
      second.boundary_index as end_boundary
    from transition_authority first
    join transition_authority second
      on second.boundary_index=first.boundary_index+1
      and second.junction_id=first.junction_id
      and second.graph_build_id=first.graph_build_id
      and second.anchor_id<>first.anchor_id
    where first.resolution_method='shared_segment_sequence_context'
      and second.resolution_method='shared_segment_sequence_context'
      and first.junction_type='shared_segment'
      and second.junction_type='shared_segment'
      and first.evidence->>'shared_segment_sequence'='A->B->A'
      and second.evidence->>'shared_segment_sequence'='A->B->A'
      and first.evidence->>'selection_uses_route_sequence'='true'
      and second.evidence->>'selection_uses_route_sequence'='true'
      and first.evidence->>'selection_uses_name_similarity'='false'
      and second.evidence->>'selection_uses_name_similarity'='false'
      and first.evidence->>'selection_uses_nearest_road'='false'
      and second.evidence->>'selection_uses_nearest_road'='false'
  ), transition_semantics as (
    select pair.begin_boundary as boundary_index,'shared_begin'::text as kind
    from shared_pairs pair
    union all
    select pair.end_boundary,'shared_end'::text from shared_pairs pair
    union all
    select authority.boundary_index,'shared_end'::text
    from transition_authority authority
    where authority.resolution_method=
        'shared_segment_right_continuation_context'
      and private_verification.brinesearch_v18_valid_right_continuation(
        authority.status,authority.hold_reason,authority.junction_type,
        authority.anchor_role,authority.candidate_count,authority.evidence,
        authority.receipt_digest,authority.dependency_digest,
        authority.anchor_id
      )
    union all
    select authority.boundary_index,'name_change'::text
    from transition_authority authority
    where authority.junction_type='name_change'
  ), traveled as materialized (
    select occurrence.occurrence_index-1 as public_order,
      occurrence.driver_road_name,occurrence.valid_aliases,
      geometry.geometry_miles,geometry.outbound_turn,geometry.step_geometry,
      semantic.kind as exact_semantic
    from private_verification.brinesearch_route_occurrence_receipts_issue97 occurrence
    join private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
      on geometry.route_prep_id=occurrence.route_prep_id
      and geometry.occurrence_index=occurrence.occurrence_index
      and geometry.route_prep_step_id=occurrence.route_prep_step_id
    left join transition_semantics semantic
      on semantic.boundary_index=occurrence.occurrence_index-1
    where occurrence.route_prep_id=p_route_prep_id
      and occurrence.occurrence_index>1
  )
  select pg_catalog.jsonb_build_object(
    'steps',pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'order',traveled.public_order,
      'kind',coalesce(traveled.exact_semantic,case
        when traveled.outbound_turn in ('left','right') then 'turn'
        else 'continue' end),
      'displayName',traveled.driver_road_name,
      'verifiedDesignations',pg_catalog.to_jsonb(traveled.valid_aliases),
      'instruction',case traveled.exact_semantic
        when 'shared_begin' then 'Enter shared roadway on '||traveled.driver_road_name
        when 'shared_end' then 'Exit shared roadway onto '||traveled.driver_road_name
        when 'name_change' then 'Continue as '||traveled.driver_road_name
        else case traveled.outbound_turn
          when 'left' then 'Turn left onto '||traveled.driver_road_name
          when 'right' then 'Turn right onto '||traveled.driver_road_name
          else 'Continue on '||traveled.driver_road_name end
      end,
      'distanceMiles',traveled.geometry_miles::double precision
    ) order by traveled.public_order),
    'geometry',pg_catalog.jsonb_build_object(
      'type','FeatureCollection',
      'features',pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'type','Feature',
        'properties',pg_catalog.jsonb_build_object(
          'stepOrder',traveled.public_order
        ),
        'geometry',extensions.st_asgeojson(
          traveled.step_geometry,9,0
        )::jsonb
      ) order by traveled.public_order)
    )
  ) into v_projection
  from traveled;

  if v_projection is null
     or pg_catalog.pg_column_size(v_projection)>8388608
     or pg_catalog.jsonb_array_length(v_projection->'steps')
       <>p_expected_occurrence_count-1
     or pg_catalog.jsonb_array_length(v_projection#>'{geometry,features}')
       <>p_expected_occurrence_count-1 then
    return null;
  end if;
  return v_projection;
exception when others then
  return null;
end;
$$;

revoke all on function
  private_verification.brinesearch_v18_exact_route_projection(uuid,integer)
from public,anon,authenticated,service_role;

-- Pure public classifier: it consumes only already-public route/graph state and
-- the public Google projection. It has no private receipt input, so a held
-- badge cannot disclose a private Google status, hold reason, or manifest.
create or replace function
  private_verification.brinesearch_v18_public_google_status(
    p_public_current boolean,
    p_public_exists boolean,
    p_route_state text,
    p_graph_state text
  )
returns jsonb
language sql
immutable
parallel safe
security invoker
set search_path=''
as $$
  select case
    when coalesce(p_public_current,false)
      and coalesce(p_public_exists,false) then
      pg_catalog.jsonb_build_object('publicState','ready')
    when coalesce(p_public_exists,false) then
      pg_catalog.jsonb_build_object(
        'publicState','stale',
        'safeReason','published_google_route_is_stale'
      )
    when p_route_state='held' or p_graph_state='held' then
      pg_catalog.jsonb_build_object(
        'publicState','held',
        'safeReason','public_route_or_graph_authority_held'
      )
    when p_route_state='ready' then
      pg_catalog.jsonb_build_object(
        'publicState','not_published',
        'safeReason','approved_google_route_not_published'
      )
    else
      pg_catalog.jsonb_build_object(
        'publicState','unavailable',
        'safeReason','exact_route_not_ready'
      )
  end
$$;

revoke all on function
  private_verification.brinesearch_v18_public_google_status(
    boolean,boolean,text,text
  )
from public,anon,authenticated,service_role;

-- Public driver status deliberately reports only public availability. It may
-- summarize that route work is held, but it cannot reveal a private Google
-- receipt's state or reason. Route, graph, and public Google states are
-- independently computed and never imply one another.
create or replace function public.brinesearch_v18_driver_pad_status(p_pad_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
set statement_timeout='2500ms'
set lock_timeout='500ms'
as $$
declare
  v_pad record;
  v_route public.brinesearch_route_prep%rowtype;
  v_receipt private_verification.brinesearch_route_reconciliation_receipts_issue97%rowtype;
  v_route_count integer:=0;
  v_record_revision bigint;
  v_destination_available boolean:=false;
  v_has_legacy_sequence boolean:=false;
  v_expected_transitions integer:=0;
  v_transition_count integer:=0;
  v_resolved_transition_count integer:=0;
  v_graph_build_count integer:=0;
  v_graph_active boolean:=false;
  v_graph_current boolean:=false;
  v_graph_counties text[]:='{}'::text[];
  v_graph_last_verified_at timestamptz;
  v_graph_state text:='unavailable';
  v_receipt_ready boolean:=false;
  v_route_exact boolean:=false;
  v_route_publishable boolean:=false;
  v_route_state text:='unavailable';
  v_route_source text:='none';
  v_public_google_exists boolean:=false;
  v_public_google_current boolean:=false;
  v_public_google_updated_at timestamptz;
  v_google_state text:='unavailable';
  v_google_reason text;
  v_public_google_status jsonb;
  v_public_projection jsonb;
  v_public_steps jsonb:='[]'::jsonb;
  v_public_geometry jsonb;
  v_status_revision text;
begin
  select
    detail.*,
    coalesce(verification.gps_verified,false) as gps_verified
  into v_pad
  from public.public_pad_detail detail
  left join public.pad_verification_status verification
    on verification.pad_id=detail.id
  where detail.id=p_pad_id;
  if not found then return null; end if;

  select row.record_revision into v_record_revision
  from public.brinesearch_directory_snapshot_rows_v18 row
  join public.brinesearch_directory_snapshots_v18 snapshot
    on snapshot.snapshot_id=row.snapshot_id and snapshot.publication_state='current'
  where row.pad_id=p_pad_id;
  v_record_revision:=coalesce(v_record_revision,greatest(
    1,pg_catalog.floor(extract(epoch from coalesce(
      v_pad.updated_at,v_pad.created_at,pg_catalog.to_timestamp(0)
    ))*1000000)::bigint
  ));

  v_destination_available:=v_pad.gps_verified
    and v_pad.latitude is not null and v_pad.longitude is not null
    and v_pad.latitude between 37 and 43
    and v_pad.longitude between -84 and -74
    and not (v_pad.latitude=0 and v_pad.longitude=0);
  v_has_legacy_sequence:=nullif(
    pg_catalog.btrim(coalesce(v_pad.structured_road_sequence,'')),'') is not null;

  select count(*)::integer into v_route_count
  from public.brinesearch_route_prep route
  where route.pad_id=p_pad_id and route.active and route.route_group='primary';
  if v_route_count=1 then
    select route.* into v_route
    from public.brinesearch_route_prep route
    where route.pad_id=p_pad_id and route.active and route.route_group='primary'
    limit 1;
    select receipt.* into v_receipt
    from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
    where receipt.route_prep_id=v_route.id;
  end if;

  if v_receipt.route_prep_id is not null then
    v_expected_transitions:=greatest(v_receipt.road_occurrence_count-1,0);
    select
      count(*)::integer,
      count(*) filter(where transition.status='resolved')::integer
    into v_transition_count,v_resolved_transition_count
    from private_verification.brinesearch_route_transition_receipts_issue97 transition
    where transition.route_prep_id=v_route.id;

    select
      count(*)::integer,
      coalesce(pg_catalog.bool_and(build.status='active'),false),
      coalesce(pg_catalog.bool_and(
        case when build.status='active' then
          private_verification.brinesearch_issue97_graph_build_release_current(build.id)
        else false end
      ),false),
      coalesce(pg_catalog.array_agg(
        distinct build.county_name order by build.county_name
      ),
        '{}'::text[]),
      max(coalesce(build.activated_at,build.completed_at))
    into v_graph_build_count,v_graph_active,v_graph_current,
      v_graph_counties,v_graph_last_verified_at
    from (
      select distinct transition.graph_build_id
      from private_verification.brinesearch_route_transition_receipts_issue97 transition
      where transition.route_prep_id=v_route.id
        and transition.graph_build_id is not null
    ) graph_reference
    join public.brinesearch_road_graph_builds build
      on build.id=graph_reference.graph_build_id;

    if v_expected_transitions<1 then
      v_graph_state:='unavailable';
    elsif v_transition_count<>v_expected_transitions
       or v_resolved_transition_count<>v_expected_transitions
       or v_graph_build_count<1 then
      v_graph_state:='held';
    elsif not v_graph_active or not v_graph_current then
      v_graph_state:='stale';
    else
      v_graph_state:='active_current';
    end if;

    -- Counts alone never make a receipt current. The current active primary
    -- route and its receipt must still agree, and the receipt must explicitly
    -- be at the terminal route_ready/ready state with no exception reasons.
    v_receipt_ready:=v_receipt.route_status='route_ready'
      and v_receipt.stage='ready'
      and v_receipt.pad_id=p_pad_id
      and v_receipt.route_group='primary'
      and v_receipt.variant_index=1
      and v_receipt.source_sequence_hash=v_route.source_sequence_hash
      and v_route.readiness_status='ready_for_road_matching'
      and pg_catalog.cardinality(v_receipt.exception_reasons)=0;
    v_route_exact:=v_receipt_ready
      and v_receipt.road_occurrence_count between 2 and 256
      and v_receipt.resolved_occurrence_count=v_receipt.road_occurrence_count
      and v_receipt.held_occurrence_count=0
      and v_receipt.canonical_mapping_count=v_receipt.road_occurrence_count
      and v_receipt.exact_geometry_count=v_receipt.road_occurrence_count;
  end if;

  if v_route_exact and v_graph_state='active_current'
     and v_destination_available then
    v_public_projection:=
      private_verification.brinesearch_v18_exact_route_projection(
        v_route.id,v_receipt.road_occurrence_count
      );
    if v_public_projection is not null then
      v_route_publishable:=true;
      v_route_state:='ready';
      v_route_source:='exact_graph';
      v_public_steps:=v_public_projection->'steps';
      v_public_geometry:=v_public_projection->'geometry';
    else
      v_route_state:='held';
      v_route_source:=case when v_has_legacy_sequence then 'legacy_written'
        when v_destination_available then 'destination_only' else 'none' end;
    end if;
  elsif v_receipt.route_prep_id is not null
     and (v_receipt.route_status='stale' or v_graph_state='stale') then
    v_route_state:='stale';
    v_route_source:=case when v_has_legacy_sequence then 'legacy_written'
      when v_destination_available then 'destination_only' else 'none' end;
  elsif v_receipt.route_prep_id is not null or v_route_count>0 then
    v_route_state:='held';
    v_route_source:=case when v_has_legacy_sequence then 'legacy_written'
      when v_destination_available then 'destination_only' else 'none' end;
  elsif v_has_legacy_sequence then
    v_route_state:='written_only';
    v_route_source:='legacy_written';
  elsif v_destination_available then
    v_route_source:='destination_only';
  end if;

  select exists(
    select 1 from public.brinesearch_driver_google_routes_public route
    where route.pad_id=p_pad_id
  ),max(route.source_revision)
  into v_public_google_exists,v_public_google_updated_at
  from public.brinesearch_driver_google_routes_public route
  where route.pad_id=p_pad_id;
  v_public_google_current:=public.brinesearch_issue97_google_route_current(p_pad_id);

  v_public_google_status:=
    private_verification.brinesearch_v18_public_google_status(
      v_public_google_current,v_public_google_exists,
      v_route_state,v_graph_state
    );
  v_google_state:=v_public_google_status->>'publicState';
  v_google_reason:=v_public_google_status->>'safeReason';

  v_status_revision:=pg_catalog.md5(pg_catalog.concat_ws('|',
    p_pad_id::text,v_record_revision::text,v_route_state,v_route_source,
    v_graph_state,pg_catalog.array_to_string(v_graph_counties,','),
    coalesce(v_graph_last_verified_at::text,''),v_google_state,
    coalesce(v_public_google_updated_at::text,''),
    pg_catalog.md5(coalesce(v_public_projection::text,''))
  ));

  return pg_catalog.jsonb_build_object(
    'padId',p_pad_id,
    'recordRevision',v_record_revision::text,
    'statusRevision',v_status_revision,
    'route',pg_catalog.jsonb_build_object(
      'state',v_route_state,
      'source',v_route_source,
      'steps',case
        when v_route_publishable
          then v_public_steps
        else '[]'::jsonb
      end,
      'geometry',case
        when v_route_publishable
          then v_public_geometry
        else null
      end,
      -- Legacy clear directions can contain operational access information.
      -- V18 keeps the response shape stable but exposes no direction prose
      -- until a separately reviewed public-safe projection exists.
      'writtenDirections',null,
      'lastVerifiedAt',case
        when v_route_state='ready' then v_graph_last_verified_at
        else null
      end
    ),
    'graph',pg_catalog.jsonb_build_object(
      'state',v_graph_state,
      'county',case when pg_catalog.cardinality(v_graph_counties)=1
        then v_graph_counties[1] else null end,
      'counties',pg_catalog.to_jsonb(v_graph_counties),
      'graphCount',v_graph_build_count,
      'publicSource',case when v_graph_build_count>0
        then 'BrineSearch authoritative graph' else null end,
      'lastVerifiedAt',v_graph_last_verified_at
    ),
    'google',pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'publicState',v_google_state,
      'safeReason',v_google_reason,
      'lastVerifiedAt',v_public_google_updated_at
    )),
    'destination',case when v_destination_available then
      pg_catalog.jsonb_build_object(
        'available',true,'role','driver_entrance',
        'latitude',v_pad.latitude,'longitude',v_pad.longitude
      ) else pg_catalog.jsonb_build_object('available',false) end
  );
exception when others then
  return null;
end;
$$;

revoke all on function public.brinesearch_v18_driver_pad_status(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.brinesearch_v18_driver_pad_status(uuid)
to anon,authenticated,service_role;

-- Owner diagnostics are deliberately separate from the public driver result.
-- A browser role cannot gain access by hiding/showing a frontend control.
create or replace function public.brinesearch_v18_owner_pad_status(p_pad_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
set statement_timeout='7s'
set lock_timeout='500ms'
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_driver jsonb;
  v_route public.brinesearch_route_prep%rowtype;
  v_receipt private_verification.brinesearch_route_reconciliation_receipts_issue97%rowtype;
  v_google private_verification.brinesearch_google_route_receipts_issue97%rowtype;
  v_graphs jsonb:='[]'::jsonb;
  v_private_current boolean:=false;
  v_public_projected boolean:=false;
  v_route_count integer:=0;
begin
  if v_actor is null or not public.is_brinesearch_owner(v_actor) then
    raise exception 'Owner access required' using errcode='42501';
  end if;

  v_driver:=public.brinesearch_v18_driver_pad_status(p_pad_id);
  if v_driver is null then return null; end if;

  select count(*)::integer into v_route_count
  from public.brinesearch_route_prep route
  where route.pad_id=p_pad_id and route.active and route.route_group='primary';
  if v_route_count=1 then
    select route.* into v_route
    from public.brinesearch_route_prep route
    where route.pad_id=p_pad_id and route.active and route.route_group='primary'
    limit 1;
    select receipt.* into v_receipt
    from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
    where receipt.route_prep_id=v_route.id;
  end if;

  select google.* into v_google
  from private_verification.brinesearch_google_route_receipts_issue97 google
  where google.pad_id=p_pad_id;
  if v_google.pad_id is not null
     and coalesce(v_google.evidence->>'manifest_mode','')='transition_geometry' then
    v_private_current:=
      private_verification.brinesearch_issue97_transition_google_dark_current(p_pad_id);
  end if;
  v_public_projected:=public.brinesearch_issue97_google_route_current(p_pad_id);

  if v_route.id is not null then
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'buildId',graph.id,
      'stateCode',graph.state_code,
      'countyCode',graph.county_code,
      'countyName',graph.county_name,
      'status',graph.status,
      'sourcesCurrent',private_verification.brinesearch_issue97_graph_build_sources_current(
        graph.id
      ),
      'releaseCurrent',private_verification.brinesearch_issue97_graph_build_release_current(
        graph.id
      ),
      'graphDigest',graph.graph_digest,
      'sourceRevisionDigest',graph.source_revision_digest,
      'activatedAt',graph.activated_at,
      'completedAt',graph.completed_at
    ) order by graph.state_code,graph.county_code,graph.id),'[]'::jsonb)
    into v_graphs
    from (
      select distinct build.*
      from private_verification.brinesearch_route_transition_receipts_issue97 transition
      join public.brinesearch_road_graph_builds build
        on build.id=transition.graph_build_id
      where transition.route_prep_id=v_route.id
    ) graph;
  end if;

  return pg_catalog.jsonb_build_object(
    'driver',v_driver,
    'routeAuthority',case when v_route.id is null then null else
      pg_catalog.jsonb_build_object(
        'routePrepId',v_route.id,
        'activePrimaryRouteCount',v_route_count,
        'routeGroup',v_route.route_group,
        'variantIndex',v_route.variant_index,
        'readinessStatus',v_route.readiness_status,
        'sourceSequenceHash',v_route.source_sequence_hash,
        'updatedAt',v_route.updated_at
      ) end,
    'routeReceipt',case when v_receipt.route_prep_id is null then null else
      pg_catalog.jsonb_build_object(
        'routeStatus',v_receipt.route_status,
        'stage',v_receipt.stage,
        'roadOccurrences',v_receipt.road_occurrence_count,
        'resolvedOccurrences',v_receipt.resolved_occurrence_count,
        'heldOccurrences',v_receipt.held_occurrence_count,
        'canonicalMappings',v_receipt.canonical_mapping_count,
        'exactGeometry',v_receipt.exact_geometry_count,
        'googleManifestStatus',v_receipt.google_manifest_status,
        'exceptionReasons',pg_catalog.to_jsonb(v_receipt.exception_reasons),
        'dependencyDigest',v_receipt.dependency_digest,
        'receiptDigest',v_receipt.receipt_digest,
        'updatedAt',v_receipt.updated_at
      ) end,
    'googlePrivate',case when v_google.pad_id is null then
      pg_catalog.jsonb_build_object(
        'status','missing','privateCurrent',false,
        'publicProjected',v_public_projected
      ) else pg_catalog.jsonb_build_object(
        'status',v_google.status,
        'holdReason',v_google.hold_reason,
        'manifestMode',v_google.evidence->>'manifest_mode',
        'publicationMode',v_google.evidence->>'publication_mode',
        'privateCurrent',v_private_current,
        'publicProjected',v_public_projected,
        'manifestDigest',v_google.manifest_digest,
        'dependencyDigest',v_google.dependency_digest,
        'updatedAt',v_google.updated_at
      ) end,
    'graphAuthority',v_graphs
  );
end;
$$;

revoke all on function public.brinesearch_v18_owner_pad_status(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.brinesearch_v18_owner_pad_status(uuid)
to authenticated;

comment on function public.brinesearch_v18_driver_pad_status(uuid) is
  'V18 public driver status. Route, sanitized public steps/written directions, exact/current-only coordinate FeatureCollection, active/current graph, public Google availability, and validated driver entrance are separate. Private Google readiness and internal receipts are never returned.';
comment on function public.brinesearch_v18_owner_pad_status(uuid) is
  'V18 authenticated owner-only route, private Google, and graph diagnostic status. Server authorization is mandatory.';
comment on function public.brinesearch_v18_directory_page(uuid,integer,integer) is
  'V18 immutable ordinal directory page. Subsequent pages remain pinned to the requested snapshot UUID.';

-- Seed exactly one complete first snapshot from the current safe projection.
select private_verification.brinesearch_v18_refresh_directory_snapshot();

do $v18_contract_install_check$
declare
  v_snapshot record;
  v_view_options text[];
begin
  select * into strict v_snapshot
  from public.brinesearch_directory_snapshots_v18
  where publication_state='current';
  if v_snapshot.row_count<>(
       select count(*) from public.brinesearch_directory_snapshot_rows_v18 row
       where row.snapshot_id=v_snapshot.snapshot_id
     )
     or v_snapshot.row_count<>(
       select count(distinct row.pad_id)
       from public.brinesearch_directory_snapshot_rows_v18 row
       where row.snapshot_id=v_snapshot.snapshot_id
     ) then
    raise exception 'V18 initial directory snapshot count contract failed';
  end if;

  select c.reloptions into v_view_options
  from pg_catalog.pg_class c
  where c.oid='public.brinesearch_directory_current_v18'::pg_catalog.regclass;
  if not coalesce('security_invoker=true'=any(v_view_options),false)
     or not coalesce('security_barrier=true'=any(v_view_options),false) then
    raise exception 'V18 current-directory view is not security invoker/barrier';
  end if;

  if not pg_catalog.has_table_privilege(
       'anon','public.brinesearch_directory_snapshots_v18','SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'anon','public.brinesearch_directory_snapshot_rows_v18','SELECT'
     )
     or pg_catalog.has_table_privilege(
       'anon','public.brinesearch_directory_snapshot_rows_v18','INSERT'
     )
     or pg_catalog.has_function_privilege(
       'anon','public.brinesearch_v18_owner_pad_status(uuid)','EXECUTE'
     ) then
    raise exception 'V18 public/owner privilege boundary failed';
  end if;
end;
$v18_contract_install_check$;
