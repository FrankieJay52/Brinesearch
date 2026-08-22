-- GitHub #97 — bind the public Google-route RLS policy to the final dispatcher.
--
-- Migration 20260811242000 renamed the original predicate to
-- brinesearch_issue97_google_route_current_published_core(uuid) and installed a
-- new dispatcher under the original name. PostgreSQL policy dependencies follow
-- function OIDs across renames, so the original policy remained bound to the
-- published-only core. This forward-only repair deliberately changes no route,
-- graph, cutover or manifest data.

drop table if exists pg_temp.tmp_issue97_google_route_policy_before;
create temporary table tmp_issue97_google_route_policy_before on commit drop as
select
  (select s.cutover_at from public.brinesearch_issue97_release_state s
    where s.singleton) as cutover_at,
  (select count(*)::bigint
    from public.brinesearch_driver_google_routes_public) as public_row_count;

do $preflight$
declare
  v_dispatcher oid:=pg_catalog.to_regprocedure(
    'public.brinesearch_issue97_google_route_current(uuid)'
  );
  v_core oid:=pg_catalog.to_regprocedure(
    'public.brinesearch_issue97_google_route_current_published_core(uuid)'
  );
  v_definition text;
begin
  if (select count(*) from public.brinesearch_issue97_release_state where singleton)<>1 then
    raise exception 'Issue #97 release-state singleton is missing or duplicated';
  end if;
  if pg_catalog.to_regclass('public.brinesearch_driver_google_routes_public') is null
     or v_dispatcher is null or v_core is null or v_dispatcher=v_core then
    raise exception 'Issue #97 Google-route dispatcher/core preflight failed';
  end if;

  if not exists(
    select 1
    from pg_catalog.pg_class c
    where c.oid='public.brinesearch_driver_google_routes_public'::pg_catalog.regclass
      and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'Issue #97 Google-route public projection is not FORCE RLS';
  end if;

  select pg_catalog.pg_get_functiondef(v_dispatcher) into v_definition;
  if not exists(
       select 1
       from pg_catalog.pg_proc p
       join pg_catalog.pg_roles owner_role on owner_role.oid=p.proowner
       where p.oid=v_dispatcher
         and owner_role.rolname='postgres'
         and p.prosecdef
         and p.provolatile='s'
         and p.proconfig @> array['search_path=""']::text[]
     )
     or pg_catalog.strpos(v_definition,'brinesearch_issue97_cutover_active()')=0
     or pg_catalog.strpos(v_definition,'transition_geometry')=0
     or pg_catalog.strpos(
       v_definition,'brinesearch_issue97_google_route_current_published_core'
     )=0 then
    raise exception 'Issue #97 final Google-route dispatcher contract changed';
  end if;
end
$preflight$;

revoke all on function public.brinesearch_issue97_google_route_current(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.brinesearch_issue97_google_route_current(uuid)
to anon,authenticated,service_role;

-- The dispatcher is SECURITY DEFINER and is the only public path. Direct access
-- to the renamed core would bypass its cutover and manifest-mode checks.
revoke all on function public.brinesearch_issue97_google_route_current_published_core(uuid)
from public,anon,authenticated,service_role;

drop policy if exists brinesearch_driver_google_routes_public_read_issue97
on public.brinesearch_driver_google_routes_public;
create policy brinesearch_driver_google_routes_public_read_issue97
on public.brinesearch_driver_google_routes_public
for select to anon,authenticated
using (public.brinesearch_issue97_google_route_current(pad_id));

do $postcheck$
declare
  v_dispatcher oid:='public.brinesearch_issue97_google_route_current(uuid)'::pg_catalog.regprocedure;
  v_core oid:='public.brinesearch_issue97_google_route_current_published_core(uuid)'::pg_catalog.regprocedure;
  v_policy oid;
  v_before record;
begin
  select p.oid into strict v_policy
  from pg_catalog.pg_policy p
  where p.polrelid='public.brinesearch_driver_google_routes_public'::pg_catalog.regclass
    and p.polname='brinesearch_driver_google_routes_public_read_issue97';

  if not exists(
       select 1 from pg_catalog.pg_policy p
       where p.oid=v_policy
         and p.polcmd='r'
         and p.polpermissive
         and pg_catalog.array_length(p.polroles,1)=2
         and p.polroles @> array[
           'anon'::pg_catalog.regrole::oid,
           'authenticated'::pg_catalog.regrole::oid
         ]
     )
     or not exists(
       select 1 from pg_catalog.pg_depend d
       where d.classid='pg_catalog.pg_policy'::pg_catalog.regclass
         and d.objid=v_policy
         and d.refclassid='pg_catalog.pg_proc'::pg_catalog.regclass
         and d.refobjid=v_dispatcher
     )
     or exists(
       select 1 from pg_catalog.pg_depend d
       where d.classid='pg_catalog.pg_policy'::pg_catalog.regclass
         and d.objid=v_policy
         and d.refclassid='pg_catalog.pg_proc'::pg_catalog.regclass
         and d.refobjid=v_core
     ) then
    raise exception 'Issue #97 Google-route policy is not bound only to the dispatcher';
  end if;

  if not pg_catalog.has_function_privilege(
       'anon','public.brinesearch_issue97_google_route_current(uuid)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated','public.brinesearch_issue97_google_route_current(uuid)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.brinesearch_issue97_google_route_current(uuid)','EXECUTE'
     )
     or exists(
       select 1
       from pg_catalog.pg_proc p
       cross join lateral pg_catalog.aclexplode(
         coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))
       ) acl
       where p.oid=v_dispatcher and acl.grantee=0 and acl.privilege_type='EXECUTE'
     ) then
    raise exception 'Issue #97 Google-route dispatcher ACL is incorrect';
  end if;

  if pg_catalog.has_function_privilege(
       'anon','public.brinesearch_issue97_google_route_current_published_core(uuid)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated','public.brinesearch_issue97_google_route_current_published_core(uuid)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role','public.brinesearch_issue97_google_route_current_published_core(uuid)','EXECUTE'
     )
     or exists(
       select 1
       from pg_catalog.pg_proc p
       cross join lateral pg_catalog.aclexplode(
         coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))
       ) acl
       where p.oid=v_core and acl.grantee=0 and acl.privilege_type='EXECUTE'
     ) then
    raise exception 'Issue #97 published-core predicate remains directly executable';
  end if;

  if not pg_catalog.has_table_privilege(
       'anon','public.brinesearch_driver_google_routes_public','SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'authenticated','public.brinesearch_driver_google_routes_public','SELECT'
     )
     or pg_catalog.has_table_privilege(
       'anon','public.brinesearch_driver_google_routes_public','INSERT,UPDATE,DELETE,TRUNCATE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated','public.brinesearch_driver_google_routes_public','INSERT,UPDATE,DELETE,TRUNCATE'
     ) then
    raise exception 'Issue #97 Google-route projection table ACL changed';
  end if;

  select * into strict v_before from pg_temp.tmp_issue97_google_route_policy_before;
  if (select s.cutover_at from public.brinesearch_issue97_release_state s where s.singleton)
       is distinct from v_before.cutover_at
     or (select count(*)::bigint from public.brinesearch_driver_google_routes_public)
       is distinct from v_before.public_row_count then
    raise exception 'Issue #97 policy repair changed cutover or route data';
  end if;
end
$postcheck$;

comment on policy brinesearch_driver_google_routes_public_read_issue97
on public.brinesearch_driver_google_routes_public is
  'Issue #97 public ready-manifest SELECT gate, bound by OID to the final cutover-aware dispatcher.';
