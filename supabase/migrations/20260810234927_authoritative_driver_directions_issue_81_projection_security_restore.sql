-- GitHub #81 follow-up: restore the #73 projection view's security options exactly.
-- CREATE OR REPLACE VIEW in the first #81 migration reset reloptions even though
-- grants and JSON sanitizers remained intact. Restore SECURITY INVOKER + BARRIER
-- and reassert the private schema ACL boundary before release.

alter view private_verification.public_pad_projection_source
  set (security_invoker = true, security_barrier = true);

revoke all on private_verification.public_pad_projection_source
from public, anon, authenticated;
grant select on private_verification.public_pad_projection_source to service_role;

do $$
declare
  v_options text[];
begin
  select c.reloptions into v_options
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'private_verification'
    and c.relname = 'public_pad_projection_source';

  if not coalesce('security_invoker=true' = any(v_options), false) then
    raise exception 'issue81 projection restore failed: security_invoker missing';
  end if;
  if not coalesce('security_barrier=true' = any(v_options), false) then
    raise exception 'issue81 projection restore failed: security_barrier missing';
  end if;
  if pg_catalog.has_table_privilege('anon','private_verification.public_pad_projection_source','SELECT')
     or pg_catalog.has_table_privilege('authenticated','private_verification.public_pad_projection_source','SELECT') then
    raise exception 'issue81 projection restore failed: private projection became directly readable';
  end if;
  if not pg_catalog.has_table_privilege('service_role','private_verification.public_pad_projection_source','SELECT') then
    raise exception 'issue81 projection restore failed: service role lost projection read';
  end if;
end;
$$;
