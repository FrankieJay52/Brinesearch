-- BrineSearch V18 -- exact official wellhead references from saved Ohio APIs.
--
-- This public-safe display contract adds a reference only when every valid
-- saved Ohio API token on a currently unresolved pad has one current pad owner,
-- exactly one official 14-digit API match, an exact county match, no township
-- conflict, valid Ohio coordinates, and a <=250 metre multiwell cluster. A
-- 10- or 12-digit token is the defined base prefix of the official 14-digit API;
-- this is exact identifier semantics, not name, fuzzy, nearest, or road matching.
-- The deterministic first official API supplies a display-only wellhead point.
-- Nothing here changes pads, directions, routes, graphs, Google, or cutover.

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

  with missing_ohio_pads as materialized (
    select pad.*
    from public.brinesearch_directory_snapshot_rows_v18 snapshot_row
    join public.pads pad on pad.id=snapshot_row.pad_id
    where snapshot_row.snapshot_id=v_snapshot.snapshot_id
      and snapshot_row.state='Ohio'
      and snapshot_row.record_type='pad'
      and (pad.latitude is null or pad.longitude is null)
  ), current_directory_pads as materialized (
    select snapshot_row.*
    from public.brinesearch_directory_snapshot_rows_v18 snapshot_row
    where snapshot_row.snapshot_id=v_snapshot.snapshot_id
      and snapshot_row.record_type='pad'
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
  ), embedded_official_well_candidates as (
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
  ), ranked_embedded_well_references as (
    select candidate.*,
      pg_catalog.row_number() over(
        partition by candidate.id
        order by candidate.api_digits,candidate.latitude,candidate.longitude
      ) as candidate_order
    from embedded_official_well_candidates candidate
    where candidate.latitude between 36.5 and 43.5
      and candidate.longitude between -84.5 and -73.5
  ), embedded_official_references as materialized (
    select pad.id,'official_pad_reference'::text as reference_kind,
      pad.latitude,pad.longitude
    from official_pad_references pad
    union all
    select well.id,'official_wellhead_reference'::text,
      well.latitude,well.longitude
    from ranked_embedded_well_references well
    where well.candidate_order=1
      and not exists(
        select 1 from official_pad_references pad where pad.id=well.id
      )
  ), current_api_tokens as materialized (
    select distinct snapshot_row.pad_id,
      pg_catalog.regexp_replace(
        api_source.api_value,'[^0-9]','','g'
      ) as api_digits
    from current_directory_pads snapshot_row
    join public.pads pad on pad.id=snapshot_row.pad_id
    cross join lateral (
      select parsed_api.value as api_value
      from pg_catalog.unnest(
        coalesce(snapshot_row.api_numbers,array[]::text[])
      ) parsed_api(value)
      union all
      select raw_api.value
      from pg_catalog.regexp_split_to_table(
        case when pg_catalog.length(coalesce(pad.api,''))<=4096
          then coalesce(pad.api,'') else '' end,
        E'\\s*[|]\\s*'
      ) raw_api(value)
    ) api_source
    where pg_catalog.regexp_replace(
      api_source.api_value,'[^0-9]','','g'
    )~'^34[0-9]{8}([0-9]{2})?([0-9]{2})?$'
  ), remaining_api_tokens as materialized (
    select token.pad_id,token.api_digits
    from current_api_tokens token
    join missing_ohio_pads pad on pad.id=token.pad_id
    where not exists(
      select 1 from embedded_official_references reference
      where reference.id=token.pad_id
    )
  ), token_owners as materialized (
    select token.api_digits,
      pg_catalog.count(distinct token.pad_id)::integer as owner_count
    from current_api_tokens token
    group by token.api_digits
  ), official_ohio_wells as materialized (
    select official.canonical_api,official.county,official.township,
      official.latitude::numeric as latitude,
      official.longitude::numeric as longitude
    from private_verification.official_wells_unified_20260803 official
    where pg_catalog.lower(coalesce(official.state,'')) in ('oh','ohio')
      and coalesce(official.canonical_api,'')~'^34[0-9]{12}$'
      and official.latitude between 37 and 43
      and official.longitude between -84 and -74
  ), token_matches as materialized (
    select token.pad_id,token.api_digits,owner.owner_count,
      pg_catalog.count(official.canonical_api)::integer
        as official_match_count,
      pg_catalog.min(official.canonical_api) as canonical_api,
      pg_catalog.min(official.county) as county,
      pg_catalog.min(official.township) as township,
      pg_catalog.min(official.latitude) as latitude,
      pg_catalog.min(official.longitude) as longitude
    from remaining_api_tokens token
    join token_owners owner on owner.api_digits=token.api_digits
    left join official_ohio_wells official
      on pg_catalog.left(
        official.canonical_api,pg_catalog.length(token.api_digits)
      )=token.api_digits
    group by token.pad_id,token.api_digits,owner.owner_count
  ), unique_token_matches as materialized (
    select match.*
    from token_matches match
    where match.owner_count=1
      and match.official_match_count=1
  ), pad_token_proof as materialized (
    select pad.id,
      pg_catalog.count(token.api_digits)::integer as token_count,
      pg_catalog.count(match.api_digits)::integer as exact_token_count,
      pg_catalog.count(match.api_digits) filter(
        where pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(pad.county,'')),
          '[^a-z0-9]','','g'
        )=pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(match.county,'')),
          '[^a-z0-9]','','g'
        )
      )::integer as county_match_count,
      pg_catalog.count(match.api_digits) filter(
        where coalesce(pg_catalog.btrim(pad.township),'')=''
          or pg_catalog.regexp_replace(
            pg_catalog.regexp_replace(
              pg_catalog.lower(pad.township),
              '(township|twp)[.]?$','','g'
            ),'[^a-z0-9]','','g'
          )=pg_catalog.regexp_replace(
            pg_catalog.regexp_replace(
              pg_catalog.lower(coalesce(match.township,'')),
              '(township|twp)[.]?$','','g'
            ),'[^a-z0-9]','','g'
          )
      )::integer as township_match_count
    from missing_ohio_pads pad
    join remaining_api_tokens token on token.pad_id=pad.id
    left join unique_token_matches match
      on match.pad_id=token.pad_id and match.api_digits=token.api_digits
    group by pad.id,pad.county,pad.township
  ), cluster_proof as materialized (
    select left_match.pad_id,
      coalesce(pg_catalog.max(
        2*6371000*pg_catalog.asin(pg_catalog.sqrt(
          pg_catalog.power(pg_catalog.sin(pg_catalog.radians(
            (right_match.latitude-left_match.latitude)/2
          )),2)
          +pg_catalog.cos(pg_catalog.radians(left_match.latitude))
          *pg_catalog.cos(pg_catalog.radians(right_match.latitude))
          *pg_catalog.power(pg_catalog.sin(pg_catalog.radians(
            (right_match.longitude-left_match.longitude)/2
          )),2)
        ))
      ),0) as maximum_pairwise_metres
    from unique_token_matches left_match
    join unique_token_matches right_match
      on right_match.pad_id=left_match.pad_id
    group by left_match.pad_id
  ), eligible_api_pads as materialized (
    select proof.id
    from pad_token_proof proof
    join cluster_proof cluster on cluster.pad_id=proof.id
    where proof.token_count=proof.exact_token_count
      and proof.token_count=proof.county_match_count
      and proof.token_count=proof.township_match_count
      and cluster.maximum_pairwise_metres<=250
  ), exact_api_references as materialized (
    select eligible.id,'official_wellhead_reference'::text
        as reference_kind,
      chosen.latitude,chosen.longitude
    from eligible_api_pads eligible
    cross join lateral (
      select match.latitude,match.longitude
      from unique_token_matches match
      where match.pad_id=eligible.id
      order by match.canonical_api,match.latitude,match.longitude
      limit 1
    ) chosen
  ), official_references as (
    select * from embedded_official_references
    union all
    select * from exact_api_references
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
  'Display-only exact official pad/wellhead and saved pad GPS references for current Ohio directory pads without a verified entrance. Exact saved base APIs may identify one official wellhead; never route or Google authority.';

do $verify$
declare
  v_expected_snapshot constant uuid:=
    '586344d2-7118-4f61-b6bc-98a97a690fd1';
  v_expected_sha constant text:=
    '65af6626f38c372ed6263b861cf4d62375d6246c5581692dff1b9bbf2fc4dd47';
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

  if pg_catalog.strpos(
       v_definition,'official_wells_unified_20260803'
     )=0
     or pg_catalog.strpos(v_definition,'canonical_api')=0
     or pg_catalog.strpos(v_definition,'owner_count=1')=0
     or pg_catalog.strpos(v_definition,'official_match_count=1')=0
     or pg_catalog.strpos(v_definition,'maximum_pairwise_metres<=250')=0
     or pg_catalog.strpos(v_definition,'''saved_pad_reference''')=0
     or pg_catalog.strpos(v_definition,'written_directions')>0
     or pg_catalog.strpos(v_definition,'directions_clear')>0
     or pg_catalog.strpos(v_definition,'research_note')>0
     or pg_catalog.strpos(pg_catalog.lower(v_definition),'similarity(')>0
     or pg_catalog.strpos(pg_catalog.lower(v_definition),'levenshtein')>0
     or pg_catalog.strpos(pg_catalog.lower(v_definition),' ilike ')>0
     or pg_catalog.strpos(pg_catalog.lower(v_definition),'st_distance')>0 then
    raise exception 'V18 exact API pad-reference authority boundary failed';
  end if;

  v_payload:=public.brinesearch_v18_pad_reference_coordinates(
    v_expected_snapshot
  );

  if v_payload is null
     or v_payload->>'snapshotId'<>v_expected_snapshot::text
     or v_payload->>'sourceRevision'<>'5'
     or (v_payload->>'rowCount')::integer<>741
     or (v_payload->'kindCounts'->>'officialPadReference')::integer<>64
     or (v_payload->'kindCounts'->>'officialWellheadReference')::integer<>95
     or (v_payload->'kindCounts'->>'savedPadReference')::integer<>582
     or v_payload->>'contentSha256'<>v_expected_sha
     or pg_catalog.jsonb_array_length(v_payload->'rows')<>741 then
    raise exception 'V18 exact API pad-reference pinned contract failed';
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
    raise exception 'V18 exact API pad-reference row boundary failed';
  end if;

  if exists(
    select 1
    from (values
      ('cf86addd-cbea-4036-ad84-7ab9c6ef8ead'::uuid,40.547507875807::numeric,-80.8567132122738::numeric),
      ('a2a09410-ebe7-41d0-8270-8f627070a58e'::uuid,40.5207533698739::numeric,-80.9167703621456::numeric),
      ('51c477b2-d4b0-44c4-8363-ba4b31f4b01e'::uuid,40.73839536063::numeric,-80.8682468779825::numeric),
      ('54268967-e9d8-44f8-93c6-32e19727cad6'::uuid,40.6020421903195::numeric,-81.0007434903202::numeric),
      ('864157a4-2d97-4af3-b10b-7022737b53a0'::uuid,40.4414462111575::numeric,-80.9695507544873::numeric),
      ('0e01bbf2-0bdb-44d8-bd12-baae1da226f6'::uuid,39.8314053778446::numeric,-80.9138057517851::numeric),
      ('c1b95a10-c9ec-499f-ae6c-84430175b9b3'::uuid,40.671684933511::numeric,-80.9832585654543::numeric),
      ('254d4d73-5795-49b6-b89c-333809aac154'::uuid,40.7191582180736::numeric,-80.9952819009549::numeric),
      ('133d1688-e886-4d50-a60f-75d71da41487'::uuid,40.8324267487522::numeric,-80.6781239253112::numeric),
      ('2f4e6e6e-869b-515a-8259-69ddb5bf70c8'::uuid,40.0057164107057::numeric,-81.3890887521733::numeric)
    ) expected(pad_id,latitude,longitude)
    where not exists(
      select 1
      from pg_catalog.jsonb_array_elements(v_payload->'rows') row(value)
      where row.value->>'padId'=expected.pad_id::text
        and row.value->>'referenceKind'='official_wellhead_reference'
        and (row.value->>'latitude')::numeric=expected.latitude
        and (row.value->>'longitude')::numeric=expected.longitude
    )
  ) then
    raise exception 'V18 exact API pad-reference candidate proof failed';
  end if;

  if (select pg_catalog.count(*)
      from public.brinesearch_driver_google_routes_public)<>0
     or (select cutover_at
         from public.brinesearch_issue97_release_state where singleton)
       is not null then
    raise exception 'V18 exact API pad-reference release boundary failed';
  end if;
end;
$verify$;
