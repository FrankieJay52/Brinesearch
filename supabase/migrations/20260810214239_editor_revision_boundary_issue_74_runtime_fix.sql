-- GitHub #74 stage 1 runtime correction: NULLIF is SQL syntax and cannot be schema-qualified.
-- Recreate the safe editor RPC with the same reviewed boundary and unqualified NULLIF expressions.

create or replace function public.editor_update_pad(
  p_pad_id uuid,
  p_expected_updated_at timestamptz,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'auth', 'pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_row public.pads%rowtype;
  v_allowed_keys constant text[] := array[
    'pad_name','company','state','county','township','address','latitude','longitude',
    'well_name','api','property_number','well_entries','structured_road_sequence',
    'written_directions','directions_clear'
  ]::text[];
  v_text_keys constant text[] := array[
    'pad_name','company','state','county','township','address','well_name','api',
    'property_number','structured_road_sequence','written_directions','directions_clear'
  ]::text[];
  v_disallowed text[];
  v_key text;
  v_max_length integer;
  v_latitude double precision;
  v_longitude double precision;
begin
  if v_user is null or not public.is_brinesearch_editor(v_user) then
    raise exception 'editor_access_required' using errcode = '42501';
  end if;

  if p_pad_id is null then
    raise exception 'pad_id_required' using errcode = '22023';
  end if;
  if p_expected_updated_at is null then
    raise exception 'expected_revision_required' using errcode = '22023';
  end if;
  if p_patch is null or pg_catalog.jsonb_typeof(p_patch) <> 'object' then
    raise exception 'invalid_editor_patch' using errcode = '22023';
  end if;
  if p_patch = '{}'::jsonb then
    raise exception 'empty_editor_patch' using errcode = '22023';
  end if;
  if pg_catalog.pg_column_size(p_patch) > 262144 then
    raise exception 'editor_patch_too_large' using errcode = '22023';
  end if;

  select coalesce(pg_catalog.array_agg(keys.key order by keys.key), '{}'::text[])
    into v_disallowed
  from pg_catalog.jsonb_object_keys(p_patch) as keys(key)
  where not (keys.key = any(v_allowed_keys));

  if pg_catalog.cardinality(v_disallowed) > 0 then
    raise exception 'invalid_editor_patch_fields:%', pg_catalog.array_to_string(v_disallowed, ',')
      using errcode = '22023';
  end if;

  foreach v_key in array v_text_keys loop
    if p_patch ? v_key
      and p_patch->v_key <> 'null'::jsonb
      and pg_catalog.jsonb_typeof(p_patch->v_key) <> 'string' then
      raise exception 'invalid_editor_field_type:%', v_key using errcode = '22023';
    end if;

    if p_patch ? v_key then
      v_max_length := case v_key
        when 'pad_name' then 200
        when 'company' then 200
        when 'state' then 100
        when 'county' then 300
        when 'township' then 300
        when 'address' then 2000
        when 'well_name' then 20000
        when 'api' then 20000
        when 'property_number' then 20000
        when 'structured_road_sequence' then 20000
        when 'written_directions' then 50000
        when 'directions_clear' then 50000
        else 50000
      end;
      if pg_catalog.length(coalesce(p_patch->>v_key, '')) > v_max_length then
        raise exception 'editor_field_too_long:%', v_key using errcode = '22023';
      end if;
    end if;
  end loop;

  if p_patch ? 'pad_name' and nullif(pg_catalog.btrim(p_patch->>'pad_name'), '') is null then
    raise exception 'pad_name_required' using errcode = '22023';
  end if;
  if p_patch ? 'company' and nullif(pg_catalog.btrim(p_patch->>'company'), '') is null then
    raise exception 'company_required' using errcode = '22023';
  end if;
  if p_patch ? 'state' and nullif(pg_catalog.btrim(p_patch->>'state'), '') is null then
    raise exception 'state_required' using errcode = '22023';
  end if;

  if (p_patch ? 'latitude') <> (p_patch ? 'longitude') then
    raise exception 'coordinate_pair_required' using errcode = '22023';
  end if;

  if p_patch ? 'latitude' then
    if p_patch->'latitude' = 'null'::jsonb and p_patch->'longitude' = 'null'::jsonb then
      v_latitude := null;
      v_longitude := null;
    elsif pg_catalog.jsonb_typeof(p_patch->'latitude') = 'number'
       and pg_catalog.jsonb_typeof(p_patch->'longitude') = 'number' then
      v_latitude := (p_patch->>'latitude')::double precision;
      v_longitude := (p_patch->>'longitude')::double precision;
      if v_latitude < -90 or v_latitude > 90 then
        raise exception 'invalid_latitude' using errcode = '22023';
      end if;
      if v_longitude < -180 or v_longitude > 180 then
        raise exception 'invalid_longitude' using errcode = '22023';
      end if;
    else
      raise exception 'invalid_coordinate_type' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'well_entries' then
    if pg_catalog.jsonb_typeof(p_patch->'well_entries') <> 'array' then
      raise exception 'invalid_well_entries' using errcode = '22023';
    end if;
    if pg_catalog.jsonb_array_length(p_patch->'well_entries') > 200 then
      raise exception 'too_many_well_entries' using errcode = '22023';
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_patch->'well_entries') as e(value)
      where pg_catalog.jsonb_typeof(e.value) <> 'object'
    ) then
      raise exception 'invalid_well_entry' using errcode = '22023';
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_patch->'well_entries') as e(value)
      cross join lateral pg_catalog.jsonb_object_keys(e.value) as keys(key)
      where keys.key not in ('well_name','api','property_number')
    ) then
      raise exception 'invalid_well_entry_fields' using errcode = '22023';
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_patch->'well_entries') as e(value)
      cross join lateral pg_catalog.jsonb_each(e.value) as field(key,value)
      where field.value <> 'null'::jsonb
        and (
          pg_catalog.jsonb_typeof(field.value) <> 'string'
          or pg_catalog.length(field.value #>> '{}') > 2000
        )
    ) then
      raise exception 'invalid_well_entry_value' using errcode = '22023';
    end if;
  end if;

  select p.* into v_row
  from public.pads p
  where p.id = p_pad_id
  for update;

  if not found then
    raise exception 'pad_not_found' using errcode = 'P0002';
  end if;
  if v_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'stale_revision' using errcode = '40001';
  end if;

  update public.pads p
  set
    pad_name = case when p_patch ? 'pad_name'
      then pg_catalog.btrim(p_patch->>'pad_name') else p.pad_name end,
    company = case when p_patch ? 'company'
      then pg_catalog.btrim(p_patch->>'company') else p.company end,
    state = case when p_patch ? 'state'
      then pg_catalog.btrim(p_patch->>'state') else p.state end,
    county = case when p_patch ? 'county'
      then nullif(pg_catalog.btrim(coalesce(p_patch->>'county','')), '') else p.county end,
    township = case when p_patch ? 'township'
      then nullif(pg_catalog.btrim(coalesce(p_patch->>'township','')), '') else p.township end,
    address = case when p_patch ? 'address'
      then nullif(pg_catalog.btrim(coalesce(p_patch->>'address','')), '') else p.address end,
    latitude = case when p_patch ? 'latitude' then v_latitude else p.latitude end,
    longitude = case when p_patch ? 'longitude' then v_longitude else p.longitude end,
    well_name = case when p_patch ? 'well_name'
      then nullif(pg_catalog.btrim(coalesce(p_patch->>'well_name','')), '') else p.well_name end,
    api = case when p_patch ? 'api'
      then nullif(pg_catalog.btrim(coalesce(p_patch->>'api','')), '') else p.api end,
    property_number = case when p_patch ? 'property_number'
      then nullif(pg_catalog.btrim(coalesce(p_patch->>'property_number','')), '') else p.property_number end,
    well_entries = case when p_patch ? 'well_entries'
      then p_patch->'well_entries' else p.well_entries end,
    structured_road_sequence = case when p_patch ? 'structured_road_sequence'
      then nullif(pg_catalog.btrim(coalesce(p_patch->>'structured_road_sequence','')), '') else p.structured_road_sequence end,
    written_directions = case when p_patch ? 'written_directions'
      then nullif(pg_catalog.btrim(coalesce(p_patch->>'written_directions','')), '') else p.written_directions end,
    directions_clear = case when p_patch ? 'directions_clear'
      then nullif(pg_catalog.btrim(coalesce(p_patch->>'directions_clear','')), '') else p.directions_clear end,
    directions_clear_method = case when p_patch ? 'directions_clear'
      then case
        when nullif(pg_catalog.btrim(coalesce(p_patch->>'directions_clear','')), '') is null then null
        else 'BrineSearch smart rewrite reviewed by editor'
      end
      else p.directions_clear_method end
  where p.id = p_pad_id
  returning p.* into v_row;

  return pg_catalog.to_jsonb(v_row);
end;
$$;

comment on function public.editor_update_pad(uuid,timestamptz,jsonb) is
  'Issue #74 safe browser pad-update boundary: editor auth, field allow-list, validation and optimistic revision check.';

revoke all on function public.editor_update_pad(uuid,timestamptz,jsonb) from public;
revoke all on function public.editor_update_pad(uuid,timestamptz,jsonb) from anon;
grant execute on function public.editor_update_pad(uuid,timestamptz,jsonb) to authenticated;
