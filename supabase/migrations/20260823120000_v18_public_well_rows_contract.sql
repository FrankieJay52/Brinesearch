-- BrineSearch V18 -- reviewed public well/API/property row contract.
--
-- The V18 directory intentionally exposes independently sanitized identifier
-- arrays for search. Those arrays are sorted and therefore cannot establish a
-- well-to-API-to-property relationship. This detail RPC preserves the existing
-- reviewed public well_entries order while returning only the three display
-- fields. It never exposes the additional audit/operator metadata stored in the
-- source JSON.

create or replace function public.brinesearch_v18_driver_pad_well_rows(
  p_pad_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
set statement_timeout='1500ms'
set lock_timeout='500ms'
as $$
declare
  v_record_revision bigint;
  v_well_entries jsonb;
  v_rows jsonb;
begin
  select snapshot_row.record_revision,detail.well_entries
  into v_record_revision,v_well_entries
  from public.brinesearch_directory_snapshot_rows_v18 snapshot_row
  join public.brinesearch_directory_snapshots_v18 snapshot
    on snapshot.snapshot_id=snapshot_row.snapshot_id
   and snapshot.publication_state='current'
  join public.public_pad_detail detail
    on detail.id=snapshot_row.pad_id
  where snapshot_row.pad_id=p_pad_id;

  if not found then return null; end if;
  if pg_catalog.jsonb_typeof(v_well_entries) is distinct from 'array' then
    return null;
  end if;
  if pg_catalog.jsonb_array_length(v_well_entries)>32 then
    return null;
  end if;

  with raw_rows as (
    select entry.value,entry.row_order
    from pg_catalog.jsonb_array_elements(v_well_entries)
      with ordinality as entry(value,row_order)
    where pg_catalog.jsonb_typeof(entry.value)='object'
  ),
  safe_rows as (
    select
      row_order,
      private_verification.brinesearch_v18_safe_directory_text(
        value->>'well_name','well_name'
      ) as well_name,
      private_verification.brinesearch_v18_safe_directory_text(
        value->>'api','api'
      ) as api_number,
      private_verification.brinesearch_v18_safe_directory_text(
        value->>'property_number','property_number'
      ) as property_number
    from raw_rows
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'wellName',safe_rows.well_name,
    'apiNumber',safe_rows.api_number,
    'propertyNumber',safe_rows.property_number
  ) order by safe_rows.row_order),'[]'::jsonb)
  into v_rows
  from safe_rows
  where safe_rows.well_name is not null
     or safe_rows.api_number is not null
     or safe_rows.property_number is not null;

  return pg_catalog.jsonb_build_object(
    'padId',p_pad_id,
    'recordRevision',v_record_revision::text,
    'rows',v_rows
  );
exception when others then
  return null;
end;
$$;

revoke all on function
  public.brinesearch_v18_driver_pad_well_rows(uuid)
from public;
grant execute on function
  public.brinesearch_v18_driver_pad_well_rows(uuid)
to anon,authenticated,service_role;

do $verify$
declare
  v_oid oid;
  v_definition text;
  v_security_definer boolean;
  v_volatility "char";
  v_config text[];
begin
  select p.oid,p.prosecdef,p.provolatile,p.proconfig,
    pg_catalog.pg_get_functiondef(p.oid)
  into v_oid,v_security_definer,v_volatility,v_config,v_definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='brinesearch_v18_driver_pad_well_rows'
    and pg_catalog.pg_get_function_identity_arguments(p.oid)='p_pad_id uuid';

  if v_oid is null
     or not v_security_definer
     or v_volatility<>'s'
     or not v_config@>array[
       'search_path=""','statement_timeout=1500ms','lock_timeout=500ms'
     ]::text[] then
    raise exception 'V18 public well-row function security contract failed';
  end if;

  if not pg_catalog.has_function_privilege(
      'anon',v_oid,'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'authenticated',v_oid,'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'service_role',v_oid,'EXECUTE'
    )
    or exists(
      select 1
      from pg_catalog.aclexplode(coalesce(
        (select p.proacl from pg_catalog.pg_proc p where p.oid=v_oid),
        pg_catalog.acldefault('f',
          (select p.proowner from pg_catalog.pg_proc p where p.oid=v_oid))
      )) acl
      where acl.grantee=0 and acl.privilege_type='EXECUTE'
    ) then
    raise exception 'V18 public well-row function grants failed';
  end if;

  if pg_catalog.strpos(v_definition,'public.public_pad_detail')=0
     or pg_catalog.strpos(
       v_definition,'public.brinesearch_directory_snapshot_rows_v18'
     )=0
     or pg_catalog.strpos(v_definition,'''wellName''')=0
     or pg_catalog.strpos(v_definition,'''apiNumber''')=0
     or pg_catalog.strpos(v_definition,'''propertyNumber''')=0
     or pg_catalog.strpos(v_definition,'official_operator')>0
     or pg_catalog.strpos(v_definition,'official_status')>0
     or pg_catalog.strpos(v_definition,'resolution_method')>0 then
    raise exception 'V18 public well-row projection boundary failed';
  end if;
end;
$verify$;
