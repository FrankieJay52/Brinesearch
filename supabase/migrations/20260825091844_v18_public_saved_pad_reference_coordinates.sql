-- BrineSearch V18 -- exact public map-reference coordinates for Ohio pads.
--
-- This public-safe contract keeps the reviewed official references and adds
-- valid saved pad GPS pairs for current directory rows whose entrance status is
-- held. Saved pairs remain display-only. They do not become driver entrances,
-- route endpoints, route steps, geometry, graph authority, Google output, or
-- cutover authority. No name, fuzzy, proximity, or nearest-road match is used.

create or replace function public.brinesearch_v18_pad_reference_coordinates(
  p_snapshot_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
set statement_timeout='2500ms'
set lock_timeout='500ms'
as $$
declare
  v_snapshot public.brinesearch_directory_snapshots_v18%rowtype;
  v_rows jsonb:='[]'::jsonb;
  v_row_count integer:=0;
  v_pad_count integer:=0;
  v_wellhead_count integer:=0;
  v_saved_count integer:=0;
  v_content_sha256 text;
begin
  select snapshot.* into v_snapshot
  from public.brinesearch_directory_snapshots_v18 snapshot
  where snapshot.snapshot_id=p_snapshot_id
    and snapshot.publication_state='current';

  if not found then
    return pg_catalog.jsonb_build_object(
      'schemaVersion',1,
      'error','snapshot_unavailable',
      'requestedSnapshotId',p_snapshot_id
    );
  end if;

  with missing_ohio_pads as (
    select pad.*
    from public.brinesearch_directory_snapshot_rows_v18 snapshot_row
    join public.pads pad on pad.id=snapshot_row.pad_id
    where snapshot_row.snapshot_id=v_snapshot.snapshot_id
      and snapshot_row.state='Ohio'
      and snapshot_row.record_type='pad'
      and (pad.latitude is null or pad.longitude is null)
  ), official_pad_candidates as (
    select pad.id,
      case
        when pg_catalog.btrim(
          pad.extra_data->'official_pad_record'->>'latitude'
        )~'^-?[0-9]+([.][0-9]+)?$'
        then (pad.extra_data->'official_pad_record'->>'latitude')::numeric
        else null
      end as latitude,
      case
        when pg_catalog.btrim(
          pad.extra_data->'official_pad_record'->>'longitude'
        )~'^-?[0-9]+([.][0-9]+)?$'
        then (pad.extra_data->'official_pad_record'->>'longitude')::numeric
        else null
      end as longitude
    from missing_ohio_pads pad
    where pg_catalog.jsonb_typeof(
      pad.extra_data->'official_pad_record'
    )='object'
      and pad.extra_data->'official_audit_outcome'->>'recommendation_class'
        in (
          'official_pad_layer',
          'normalized_existing_pad_attachment',
          'corrected_exact_api_pad_match'
        )
  ), official_pad_references as (
    select candidate.id,candidate.latitude,candidate.longitude
    from official_pad_candidates candidate
    where candidate.latitude between 36.5 and 43.5
      and candidate.longitude between -84.5 and -73.5
  ), official_well_candidates as (
    select pad.id,
      case
        when pg_catalog.btrim(well.value->>'wellhead_latitude')
          ~'^-?[0-9]+([.][0-9]+)?$'
        then (well.value->>'wellhead_latitude')::numeric
        else null
      end as latitude,
      case
        when pg_catalog.btrim(well.value->>'wellhead_longitude')
          ~'^-?[0-9]+([.][0-9]+)?$'
        then (well.value->>'wellhead_longitude')::numeric
        else null
      end as longitude,
      well.value->>'api_digits' as api_digits
    from missing_ohio_pads pad
    cross join lateral pg_catalog.jsonb_array_elements(
      case
        when pg_catalog.jsonb_typeof(
          pad.extra_data->'official_well_records'
        )='array'
        and pg_catalog.jsonb_array_length(
          pad.extra_data->'official_well_records'
        )<=64
        then pad.extra_data->'official_well_records'
        else '[]'::jsonb
      end
    ) well(value)
    where coalesce(well.value->>'api_digits','')~'^[0-9]{14}$'
      and coalesce(well.value->>'verification_method','') in (
        'saved_api_exact_official',
        'saved_api_corrected_to_official',
        'shared_physical_pad_alias_verified',
        'official_well_added_to_existing_pad',
        'confirmed_cross_pad_conflict_reassigned',
        'official_well_added_by_deep_inventory_pad_identity',
        'official_well_added_by_direct_wellhead_pad_recovery'
      )
  ), ranked_well_references as (
    select candidate.*,
      row_number() over(
        partition by candidate.id
        order by candidate.api_digits,candidate.latitude,candidate.longitude
      ) as candidate_order
    from official_well_candidates candidate
    where candidate.latitude between 36.5 and 43.5
      and candidate.longitude between -84.5 and -73.5
  ), official_references as (
    select pad.id,'official_pad_reference'::text as reference_kind,
      pad.latitude,pad.longitude
    from official_pad_references pad
    union all
    select well.id,'official_wellhead_reference'::text,
      well.latitude,well.longitude
    from ranked_well_references well
    where well.candidate_order=1
      and not exists(
        select 1 from official_pad_references pad where pad.id=well.id
      )
  ), saved_pad_references as (
    select pad.id,'saved_pad_reference'::text as reference_kind,
      pad.latitude::numeric as latitude,pad.longitude::numeric as longitude
    from public.brinesearch_directory_snapshot_rows_v18 snapshot_row
    join public.pads pad on pad.id=snapshot_row.pad_id
    where snapshot_row.snapshot_id=v_snapshot.snapshot_id
      and snapshot_row.state='Ohio'
      and snapshot_row.record_type='pad'
      and snapshot_row.coordinate_state='held'
      and pad.latitude between 37 and 43
      and pad.longitude between -84 and -74
      and not (pad.latitude=0 and pad.longitude=0)
      and not exists(
        select 1 from official_references reference
        where reference.id=pad.id
      )
  ), reference_rows as (
    select * from official_references
    union all
    select * from saved_pad_references
  )
  select
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'padId',reference.id,
      'referenceKind',reference.reference_kind,
      'latitude',reference.latitude,
      'longitude',reference.longitude
    ) order by reference.id),'[]'::jsonb),
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter(
      where reference.reference_kind='official_pad_reference'
    )::integer,
    pg_catalog.count(*) filter(
      where reference.reference_kind='official_wellhead_reference'
    )::integer,
    pg_catalog.count(*) filter(
      where reference.reference_kind='saved_pad_reference'
    )::integer,
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce(
      pg_catalog.string_agg(
        reference.id::text||'|'||reference.reference_kind||'|'||
        reference.latitude::text||'|'||reference.longitude::text,
        E'\n' order by reference.id
      ),''
    ),'UTF8'),'sha256'),'hex')
  into v_rows,v_row_count,v_pad_count,v_wellhead_count,v_saved_count,
    v_content_sha256
  from reference_rows reference;

  if v_row_count>1000
     or v_row_count<>v_pad_count+v_wellhead_count+v_saved_count
     or v_content_sha256!~'^[0-9a-f]{64}$' then
    return null;
  end if;

  return pg_catalog.jsonb_build_object(
    'schemaVersion',1,
    'snapshotId',v_snapshot.snapshot_id,
    'sourceRevision',v_snapshot.source_revision::text,
    'rowCount',v_row_count,
    'kindCounts',pg_catalog.jsonb_build_object(
      'officialPadReference',v_pad_count,
      'officialWellheadReference',v_wellhead_count,
      'savedPadReference',v_saved_count
    ),
    'contentSha256',v_content_sha256,
    'rows',v_rows
  );
exception when others then
  return null;
end;
$$;

revoke all on function
  public.brinesearch_v18_pad_reference_coordinates(uuid)
from public,anon,authenticated,service_role;
grant execute on function
  public.brinesearch_v18_pad_reference_coordinates(uuid)
to anon,authenticated,service_role;

comment on function public.brinesearch_v18_pad_reference_coordinates(uuid) is
  'Display-only exact official pad/wellhead and saved pad GPS references for current Ohio directory pads without a verified entrance. Never route or Google authority.';

do $verify$
declare
  v_expected_snapshot constant uuid:=
    '586344d2-7118-4f61-b6bc-98a97a690fd1';
  v_expected_sha constant text:=
    'f73b74cd91a103c7ebd1f425f61c15142110e861972318c0f754901cc6bccaa9';
  v_oid oid;
  v_definition text;
  v_security_definer boolean;
  v_volatility "char";
  v_config text[];
  v_payload jsonb;
begin
  select procedure.oid,procedure.prosecdef,procedure.provolatile,
    procedure.proconfig,pg_catalog.pg_get_functiondef(procedure.oid)
  into v_oid,v_security_definer,v_volatility,v_config,v_definition
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
  where namespace.nspname='public'
    and procedure.proname='brinesearch_v18_pad_reference_coordinates'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid)=
      'p_snapshot_id uuid';

  if v_oid is null
     or not v_security_definer
     or v_volatility<>'s'
     or not v_config@>array[
       'search_path=""','statement_timeout=2500ms','lock_timeout=500ms'
     ]::text[] then
    raise exception 'V18 public pad-reference function security contract failed';
  end if;

  if not pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE')
     or not pg_catalog.has_function_privilege(
       'authenticated',v_oid,'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',v_oid,'EXECUTE'
     )
     or exists(
       select 1
       from pg_catalog.aclexplode(coalesce(
         (select procedure.proacl
          from pg_catalog.pg_proc procedure where procedure.oid=v_oid),
         pg_catalog.acldefault('f',
           (select procedure.proowner
            from pg_catalog.pg_proc procedure where procedure.oid=v_oid))
       )) acl
       where acl.grantee=0 and acl.privilege_type='EXECUTE'
     ) then
    raise exception 'V18 public pad-reference function grants failed';
  end if;

  if pg_catalog.strpos(v_definition,'''official_pad_layer''')=0
     or pg_catalog.strpos(
       v_definition,'''normalized_existing_pad_attachment'''
     )=0
     or pg_catalog.strpos(v_definition,'''saved_api_exact_official''')=0
     or pg_catalog.strpos(
       v_definition,'''official_well_added_to_existing_pad'''
     )=0
     or pg_catalog.strpos(v_definition,'''saved_pad_reference''')=0
     or pg_catalog.strpos(v_definition,'coordinate_state')=0
     or pg_catalog.strpos(v_definition,'written_directions')>0
     or pg_catalog.strpos(v_definition,'directions_clear')>0
     or pg_catalog.strpos(v_definition,'research_note')>0
     or pg_catalog.strpos(pg_catalog.lower(v_definition),'similarity(')>0
     or pg_catalog.strpos(pg_catalog.lower(v_definition),'levenshtein')>0
     or pg_catalog.strpos(pg_catalog.lower(v_definition),' ilike ')>0
     or pg_catalog.strpos(pg_catalog.lower(v_definition),'st_distance')>0 then
    raise exception 'V18 public pad-reference authority boundary failed';
  end if;

  v_payload:=public.brinesearch_v18_pad_reference_coordinates(
    v_expected_snapshot
  );

  if v_payload is null
     or v_payload->>'snapshotId'<>v_expected_snapshot::text
     or v_payload->>'sourceRevision'<>'5'
     or (v_payload->>'rowCount')::integer<>731
     or (v_payload->'kindCounts'->>'officialPadReference')::integer<>64
     or (v_payload->'kindCounts'->>'officialWellheadReference')::integer<>85
     or (v_payload->'kindCounts'->>'savedPadReference')::integer<>582
     or v_payload->>'contentSha256'<>v_expected_sha
     or pg_catalog.jsonb_array_length(v_payload->'rows')<>731 then
    raise exception 'V18 public pad-reference pinned production contract failed';
  end if;

  if exists(
    select 1
    from pg_catalog.jsonb_array_elements(v_payload->'rows') row(value)
    where (select pg_catalog.array_agg(key order by key)
           from pg_catalog.jsonb_object_keys(row.value) key)
          <>array['latitude','longitude','padId','referenceKind']::text[]
       or row.value->>'padId'!~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or row.value->>'referenceKind' not in (
          'official_pad_reference','official_wellhead_reference',
          'saved_pad_reference'
       )
       or pg_catalog.jsonb_typeof(row.value->'latitude')<>'number'
       or pg_catalog.jsonb_typeof(row.value->'longitude')<>'number'
       or (row.value->>'latitude')::numeric not between 36.5 and 43.5
       or (row.value->>'longitude')::numeric not between -84.5 and -73.5
  ) or exists(
    select row.value->>'padId'
    from pg_catalog.jsonb_array_elements(v_payload->'rows') row(value)
    group by row.value->>'padId'
    having pg_catalog.count(*)<>1
  ) then
    raise exception 'V18 public pad-reference row boundary failed';
  end if;
end;
$verify$;

