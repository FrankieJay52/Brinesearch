-- BrineSearch V18 -- exact verified ODNR pad references.
--
-- Five currently unresolved Ohio pads have an immutable saved ODNR pad ID,
-- one row in the frozen ODNR pad layer, the same selected official ID with
-- county/township proof, and confirmed exact-ID receipts from both the frozen
-- snapshot and current live ODNR sources. Coordinates must be identical across
-- all evidence. These are display-only pad references, never driver entrances,
-- route geometry, graph authority, Google authority, or inferred directions.

do $preflight$
declare
  v_definition_md5 text;
begin
  select pg_catalog.md5(pg_catalog.pg_get_functiondef(procedure.oid))
  into v_definition_md5
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
  where namespace.nspname='public'
    and procedure.proname='brinesearch_v18_pad_reference_coordinates'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid)=
      'p_snapshot_id uuid';

  if v_definition_md5<>'c49745b57f68275ca2d5017b2e054834'
     or pg_catalog.to_regprocedure(
       'private_verification.brinesearch_v18_pad_reference_coordinates_base_20260825100521(uuid)'
     ) is not null then
    raise exception 'V18 verified official-pad reference preflight drifted';
  end if;
end;
$preflight$;

alter function public.brinesearch_v18_pad_reference_coordinates(uuid)
  set schema private_verification;
alter function private_verification.brinesearch_v18_pad_reference_coordinates(uuid)
  rename to brinesearch_v18_pad_reference_coordinates_base_20260825100521;

revoke all on function
  private_verification.brinesearch_v18_pad_reference_coordinates_base_20260825100521(uuid)
from public,anon,authenticated,service_role;

comment on function
  private_verification.brinesearch_v18_pad_reference_coordinates_base_20260825100521(uuid)
is 'Private frozen base for the 20260825103402 exact verified-ODNR-pad public reference wrapper.';

create function public.brinesearch_v18_pad_reference_coordinates(
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
  v_base jsonb;
  v_rows jsonb:='[]'::jsonb;
  v_row_count integer:=0;
  v_pad_count integer:=0;
  v_wellhead_count integer:=0;
  v_saved_count integer:=0;
  v_content_sha256 text;
begin
  v_base:=private_verification.brinesearch_v18_pad_reference_coordinates_base_20260825100521(
    p_snapshot_id
  );

  if v_base is null
     or v_base?'error'
     or pg_catalog.jsonb_typeof(v_base->'rows')<>'array' then
    return v_base;
  end if;

  with expected_targets(
    pad_id,pad_name,company,county,township,official_pad_id,
    frozen_object_id,latitude,longitude
  ) as materialized (
    values
      ('0dc102c5-1640-47bf-9975-736cf684c227'::uuid,'BROWN','Ascent','Guernsey','Washington','PadGuernseyWashingtonSection14-1',343::bigint,40.182389::numeric,-81.413411::numeric),
      ('4166a215-45bb-4662-82e2-80bb0184703b'::uuid,'EXETER','Ascent','Belmont','Richland','PadBelmontRichlandSection35-2',868::bigint,40.099352::numeric,-80.984043::numeric),
      ('07b566cd-393e-49f6-9547-676438aefc1a'::uuid,'HINDMAN','Ascent','Belmont','Richland','PadBelmontRichlandSection22-2',908::bigint,40.080894::numeric,-80.842001::numeric),
      ('54bbef2d-fc87-4a33-b999-1fec24fc3c62'::uuid,'RILEY','Ascent','Jefferson','Mount Pleasant','PadJeffersonMtPleasantSection16-1',927::bigint,40.167109::numeric,-80.821194::numeric),
      ('c4ef4511-c391-48af-9e1a-7b70b90e9294'::uuid,'WAGNER','Ascent','Guernsey','Oxford','PadGuernseyOxfordSection5-2',438::bigint,40.021181::numeric,-81.239429::numeric)
  ), base_rows as materialized (
    select (item.value->>'padId')::uuid as id,
      item.value->>'referenceKind' as reference_kind,
      (item.value->>'latitude')::numeric as latitude,
      (item.value->>'longitude')::numeric as longitude
    from pg_catalog.jsonb_array_elements(v_base->'rows') item(value)
  ), receipt_proof as materialized (
    select target.pad_id,
      pg_catalog.count(*)::integer as receipt_count,
      pg_catalog.count(distinct source.source_key)::integer as source_count,
      pg_catalog.count(*) filter(
        where source.source_key='oh_odnr_wellpads_snapshot_20260804'
          and record.source_record_id='OBJECTID:'||target.frozen_object_id::text
          and record.normalized_facts->>'source_object_id'=
            target.frozen_object_id::text
      )::integer as frozen_receipt_count,
      pg_catalog.count(*) filter(
        where source.source_key='oh_odnr_live_wellpads'
          and record.source_record_id~'^OBJECTID:[0-9]+$'
          and coalesce(record.normalized_facts->>'source_object_id','')
            ~'^[0-9]+$'
      )::integer as live_receipt_count
    from expected_targets target
    join private_verification.public_data_match_candidates candidate
      on candidate.pad_id=target.pad_id
    join private_verification.public_data_source_records record
      on record.id=candidate.source_record_id
    join private_verification.public_data_sources source
      on source.id=record.source_id
    where source.source_key in (
        'oh_odnr_wellpads_snapshot_20260804','oh_odnr_live_wellpads'
      )
      and source.official
      and source.active
      and record.entity_type='pad'
      and pg_catalog.lower(record.state) in ('oh','ohio')
      and record.retired_at is null
      and record.normalized_facts->>'official_pad_id'=target.official_pad_id
      and record.latitude::numeric=target.latitude
      and record.longitude::numeric=target.longitude
      and candidate.result_category='VERIFIED_EXISTING_RECORD'
      and candidate.match_method='exact_official_pad_id'
      and candidate.confidence=0.99
      and candidate.review_status='confirmed'
      and candidate.conflicts='[]'::jsonb
    group by target.pad_id
  ), eligible_targets as materialized (
    select target.pad_id as id,
      'official_pad_reference'::text as reference_kind,
      target.latitude,target.longitude
    from expected_targets target
    join public.brinesearch_directory_snapshot_rows_v18 snapshot_row
      on snapshot_row.snapshot_id=p_snapshot_id
     and snapshot_row.pad_id=target.pad_id
     and snapshot_row.record_type='pad'
     and snapshot_row.state='Ohio'
     and snapshot_row.driver_latitude is null
     and snapshot_row.driver_longitude is null
    join public.pads pad on pad.id=target.pad_id
    join private_verification.pad_match_v2_selected_20260803 selected
      on selected.pad_id=target.pad_id
     and selected.source='ODNR'
     and selected.official_id=target.official_pad_id
     and selected.selection_reason='verified_live_official_pad'
     and selected.coordinate_county_match
     and selected.coordinate_township_match
    join private_verification.ohio_pad_layer_20260804 frozen
      on frozen.pad_id=target.official_pad_id
     and frozen.object_id=target.frozen_object_id
     and frozen.latitude::numeric=target.latitude
     and frozen.longitude::numeric=target.longitude
    join receipt_proof receipt
      on receipt.pad_id=target.pad_id
     and receipt.receipt_count=2
     and receipt.source_count=2
     and receipt.frozen_receipt_count=1
     and receipt.live_receipt_count=1
    where (pad.latitude is null or pad.longitude is null)
      and pad.pad_name=target.pad_name
      and pad.company=target.company
      and pg_catalog.regexp_replace(pg_catalog.lower(pad.county),'[^a-z0-9]','','g')=
          pg_catalog.regexp_replace(pg_catalog.lower(target.county),'[^a-z0-9]','','g')
      and pg_catalog.regexp_replace(
            pg_catalog.regexp_replace(pg_catalog.lower(pad.township),'(township|twp)[.]?$','','g'),
            '[^a-z0-9]','','g'
          )=pg_catalog.regexp_replace(
            pg_catalog.regexp_replace(pg_catalog.lower(target.township),'(township|twp)[.]?$','','g'),
            '[^a-z0-9]','','g'
          )
      and pg_catalog.regexp_replace(pg_catalog.lower(frozen.county),'[^a-z0-9]','','g')=
          pg_catalog.regexp_replace(pg_catalog.lower(target.county),'[^a-z0-9]','','g')
      and pg_catalog.jsonb_typeof(pad.extra_data->'official_pad_record')='object'
      and pad.extra_data->'official_pad_record'->>'pad_id'=target.official_pad_id
      and pad.extra_data->'official_pad_record'->>'object_id'=target.frozen_object_id::text
      and pg_catalog.regexp_replace(
            pg_catalog.lower(pad.extra_data->'official_pad_record'->>'county'),
            '[^a-z0-9]','','g'
          )=pg_catalog.regexp_replace(
            pg_catalog.lower(target.county),'[^a-z0-9]','','g'
          )
      and pg_catalog.regexp_replace(
            pg_catalog.regexp_replace(
              pg_catalog.lower(pad.extra_data->'official_pad_record'->>'township'),
              '(township|twp)[.]?$','','g'
            ),'[^a-z0-9]','','g'
          )=pg_catalog.regexp_replace(
            pg_catalog.regexp_replace(
              pg_catalog.lower(target.township),
              '(township|twp)[.]?$','','g'
            ),'[^a-z0-9]','','g'
          )
      and (pad.extra_data->'official_pad_record'->>'latitude')::numeric=target.latitude
      and (pad.extra_data->'official_pad_record'->>'longitude')::numeric=target.longitude
      and (select pg_catalog.count(*)
           from private_verification.ohio_pad_layer_20260804 layer_count
           where layer_count.pad_id=target.official_pad_id)=1
      and (select pg_catalog.count(*)
           from private_verification.ohio_pad_layer_20260804 object_count
           where object_count.object_id=target.frozen_object_id)=1
      and not exists(select 1 from base_rows base where base.id=target.pad_id)
  ), reference_rows as materialized (
    select * from base_rows
    union all
    select * from eligible_targets
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

  if v_row_count<>746
     or v_pad_count<>69
     or v_wellhead_count<>95
     or v_saved_count<>582
     or v_row_count<>v_pad_count+v_wellhead_count+v_saved_count
     or v_content_sha256<>
       '1dfa303193d52cff7e6cefe358afca52d1e4406e9378d16ac993f1482e0f3e45' then
    return null;
  end if;

  return pg_catalog.jsonb_build_object(
    'schemaVersion',1,
    'snapshotId',v_base->>'snapshotId',
    'sourceRevision',v_base->>'sourceRevision',
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
  'Display-only exact official pad/wellhead and saved pad GPS references for current Ohio directory pads without a verified entrance. Five ODNR pad references require duplicate frozen/live exact-ID proof; never route or Google authority.';

do $verify$
declare
  v_expected_snapshot constant uuid:=
    '586344d2-7118-4f61-b6bc-98a97a690fd1';
  v_expected_sha constant text:=
    '1dfa303193d52cff7e6cefe358afca52d1e4406e9378d16ac993f1482e0f3e45';
  v_oid oid;
  v_base_oid oid;
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

  select procedure.oid into v_base_oid
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
  where namespace.nspname='private_verification'
    and procedure.proname=
      'brinesearch_v18_pad_reference_coordinates_base_20260825100521'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid)=
      'p_snapshot_id uuid';

  if v_oid is null
     or v_base_oid is null
     or not v_security_definer
     or v_volatility<>'s'
     or not v_config@>array[
       'search_path=""','statement_timeout=2500ms','lock_timeout=500ms'
     ]::text[] then
    raise exception 'V18 verified official-pad function security contract failed';
  end if;

  if not pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role',v_oid,'EXECUTE')
     or pg_catalog.has_function_privilege('anon',v_base_oid,'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated',v_base_oid,'EXECUTE')
     or pg_catalog.has_function_privilege('service_role',v_base_oid,'EXECUTE')
     or exists(
       select 1
       from pg_catalog.aclexplode(coalesce(
         (select procedure.proacl from pg_catalog.pg_proc procedure
          where procedure.oid=v_oid),
         pg_catalog.acldefault('f',(select procedure.proowner
           from pg_catalog.pg_proc procedure where procedure.oid=v_oid))
       )) acl
       where acl.grantee=0 and acl.privilege_type='EXECUTE'
     ) then
    raise exception 'V18 verified official-pad function grants failed';
  end if;

  if pg_catalog.strpos(v_definition,'ohio_pad_layer_20260804')=0
     or pg_catalog.strpos(v_definition,'pad_match_v2_selected_20260803')=0
     or pg_catalog.strpos(v_definition,'public_data_match_candidates')=0
     or pg_catalog.strpos(v_definition,'oh_odnr_wellpads_snapshot_20260804')=0
     or pg_catalog.strpos(v_definition,'oh_odnr_live_wellpads')=0
     or pg_catalog.strpos(v_definition,'''exact_official_pad_id''')=0
     or pg_catalog.strpos(v_definition,'''verified_live_official_pad''')=0
     or pg_catalog.strpos(v_definition,'''official_pad_reference''')=0
     or pg_catalog.strpos(v_definition,'0dc102c5-1640-47bf-9975-736cf684c227')=0
     or pg_catalog.strpos(v_definition,'4166a215-45bb-4662-82e2-80bb0184703b')=0
     or pg_catalog.strpos(v_definition,'07b566cd-393e-49f6-9547-676438aefc1a')=0
     or pg_catalog.strpos(v_definition,'54bbef2d-fc87-4a33-b999-1fec24fc3c62')=0
     or pg_catalog.strpos(v_definition,'c4ef4511-c391-48af-9e1a-7b70b90e9294')=0
     or pg_catalog.strpos(v_definition,'written_directions')>0
     or pg_catalog.strpos(v_definition,'directions_clear')>0
     or pg_catalog.strpos(v_definition,'route_prep')>0
     or pg_catalog.strpos(v_definition,'google_route')>0
     or pg_catalog.strpos(pg_catalog.lower(v_definition),'similarity(')>0
     or pg_catalog.strpos(pg_catalog.lower(v_definition),'levenshtein')>0
     or pg_catalog.strpos(pg_catalog.lower(v_definition),' ilike ')>0
     or pg_catalog.strpos(pg_catalog.lower(v_definition),'st_distance')>0 then
    raise exception 'V18 verified official-pad authority boundary failed';
  end if;

  v_payload:=public.brinesearch_v18_pad_reference_coordinates(
    v_expected_snapshot
  );

  if v_payload is null
     or v_payload->>'snapshotId'<>v_expected_snapshot::text
     or v_payload->>'sourceRevision'<>'5'
     or (v_payload->>'rowCount')::integer<>746
     or (v_payload->'kindCounts'->>'officialPadReference')::integer<>69
     or (v_payload->'kindCounts'->>'officialWellheadReference')::integer<>95
     or (v_payload->'kindCounts'->>'savedPadReference')::integer<>582
     or v_payload->>'contentSha256'<>v_expected_sha
     or pg_catalog.jsonb_array_length(v_payload->'rows')<>746 then
    raise exception 'V18 verified official-pad pinned contract failed';
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
    raise exception 'V18 verified official-pad row boundary failed';
  end if;

  if exists(
    select 1
    from (values
      ('0dc102c5-1640-47bf-9975-736cf684c227'::uuid,40.182389::numeric,-81.413411::numeric),
      ('4166a215-45bb-4662-82e2-80bb0184703b'::uuid,40.099352::numeric,-80.984043::numeric),
      ('07b566cd-393e-49f6-9547-676438aefc1a'::uuid,40.080894::numeric,-80.842001::numeric),
      ('54bbef2d-fc87-4a33-b999-1fec24fc3c62'::uuid,40.167109::numeric,-80.821194::numeric),
      ('c4ef4511-c391-48af-9e1a-7b70b90e9294'::uuid,40.021181::numeric,-81.239429::numeric)
    ) expected(pad_id,latitude,longitude)
    where not exists(
      select 1
      from pg_catalog.jsonb_array_elements(v_payload->'rows') row(value)
      where row.value->>'padId'=expected.pad_id::text
        and row.value->>'referenceKind'='official_pad_reference'
        and (row.value->>'latitude')::numeric=expected.latitude
        and (row.value->>'longitude')::numeric=expected.longitude
    )
  ) then
    raise exception 'V18 verified official-pad candidate proof failed';
  end if;

  if (select pg_catalog.count(*)
      from public.brinesearch_directory_snapshot_rows_v18 snapshot_row
      where snapshot_row.snapshot_id=v_expected_snapshot
        and snapshot_row.state='Ohio'
        and snapshot_row.record_type='pad'
        and (snapshot_row.driver_latitude is null
             or snapshot_row.driver_longitude is null)
        and not exists(
          select 1
          from pg_catalog.jsonb_array_elements(v_payload->'rows') row(value)
          where row.value->>'padId'=snapshot_row.pad_id::text
        ))<>48
     or (select pg_catalog.count(*)
         from public.brinesearch_driver_google_routes_public)<>0
     or (select cutover_at
         from public.brinesearch_issue97_release_state where singleton)
       is not null then
    raise exception 'V18 verified official-pad release boundary failed';
  end if;
end;
$verify$;
