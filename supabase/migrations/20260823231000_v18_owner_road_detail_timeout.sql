-- GitHub #108 — keep exact owner road details available without weakening graph authority.
--
-- The detail RPC proves the selected county graph is release-current before it
-- returns junctions. Production evidence shows the build-wide name and
-- supplemental-input digests can legitimately exceed the original five-second
-- ceiling on a cold cache. Give those ordered digest checks bounded sort memory
-- and a bounded execution window; the function body, data, and authority gates
-- are intentionally unchanged.

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue108:owner-road-detail-timeout')
);

alter function public.owner_approved_routes_map_road_detail(uuid)
  set statement_timeout = '15s';

alter function public.owner_approved_routes_map_road_detail(uuid)
  set work_mem = '32MB';

do $migration_assertions$
declare
  v_oid oid := 'public.owner_approved_routes_map_road_detail(uuid)'::pg_catalog.regprocedure::oid;
  v_config text[];
  v_definition text;
  v_security_definer boolean;
  v_acl pg_catalog.aclitem[];
begin
  select p.proconfig,p.prosecdef,p.proacl,pg_catalog.pg_get_functiondef(p.oid)
    into v_config,v_security_definer,v_acl,v_definition
  from pg_catalog.pg_proc p
  where p.oid=v_oid;

  if not v_security_definer
     or not ('search_path=""'=any(v_config))
     or not ('statement_timeout=15s'=any(v_config))
     or not ('work_mem=32MB'=any(v_config)) then
    raise exception 'Issue #108 owner road detail safety configuration assertion failed';
  end if;

  if pg_catalog.strpos(
       v_definition,
       'private_verification.brinesearch_issue97_graph_build_release_current(gb.id)'
     )=0 then
    raise exception 'Issue #108 release-current graph authority assertion failed';
  end if;

  if not pg_catalog.has_function_privilege(
       'authenticated',v_oid,'EXECUTE'
     )
     or pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE')
     or exists(
       select 1
       from pg_catalog.aclexplode(
         coalesce(v_acl,pg_catalog.acldefault('f',(select p.proowner from pg_catalog.pg_proc p where p.oid=v_oid)))
       ) privilege
       where privilege.grantee=0 and privilege.privilege_type='EXECUTE'
     ) then
    raise exception 'Issue #108 owner road detail execute-grant assertion failed';
  end if;
end
$migration_assertions$;
