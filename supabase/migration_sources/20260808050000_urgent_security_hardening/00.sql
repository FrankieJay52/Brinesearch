create schema if not exists private_verification;
revoke all on schema private_verification from public, anon, authenticated;
drop table if exists private_verification.security_function_acl_backup_20260808;
create table private_verification.security_function_acl_backup_20260808 as
select
  clock_timestamp() as captured_at,
  p.oid as function_oid,
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_userbyid(p.proowner) as function_owner,
  p.prosecdef as security_definer,
  p.proconfig as function_config,
  p.proacl as function_acl,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','private_verification')
  and p.prokind = 'f';
drop table if exists private_verification.security_relation_acl_backup_20260808;
create table private_verification.security_relation_acl_backup_20260808 as
select
  clock_timestamp() as captured_at,
  n.nspname as schema_name,
  c.relname as relation_name,
  c.relkind,
  c.relrowsecurity,
  c.relforcerowsecurity,
  c.relacl
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public','storage','private_verification')
  and c.relkind in ('r','v','m','S');
drop table if exists private_verification.security_policy_backup_20260808;
create table private_verification.security_policy_backup_20260808 as
select clock_timestamp() as captured_at, p.*
from pg_policies p
where p.schemaname in ('public','storage');
drop table if exists private_verification.security_trigger_backup_20260808;
create table private_verification.security_trigger_backup_20260808 as
select
  clock_timestamp() as captured_at,
  n.nspname as table_schema,
  c.relname as table_name,
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid, true) as trigger_definition,
  pn.nspname as function_schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as function_arguments
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
join pg_proc p on p.oid=t.tgfoid
join pg_namespace pn on pn.oid=p.pronamespace
where not t.tgisinternal
  and n.nspname in ('public','storage');
revoke all on all tables in schema private_verification from public, anon, authenticated;
revoke all on all sequences in schema private_verification from public, anon, authenticated;
comment on table private_verification.security_function_acl_backup_20260808 is
  'Pre-hardening function definitions and ACLs captured immediately before the 2026-08-08 security migration.';
comment on table private_verification.security_relation_acl_backup_20260808 is
  'Pre-hardening relation and sequence ACLs captured immediately before the 2026-08-08 security migration.';
comment on table private_verification.security_policy_backup_20260808 is
  'Pre-hardening RLS policy inventory captured immediately before the 2026-08-08 security migration.';
comment on table private_verification.security_trigger_backup_20260808 is
  'Pre-hardening trigger inventory captured immediately before the 2026-08-08 security migration.';
drop function if exists public.import_pads_temp(jsonb,text);
create or replace function public.brinesearch_user_email_verified(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, auth
as $function$
  select check_user is not null
     and exists (
       select 1
       from auth.users u
       where u.id = check_user
         and u.email_confirmed_at is not null
     );
$function$;
create or replace function public.is_brinesearch_owner(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
  select check_user is not null
     and exists (
       select 1
       from public.editor_accounts ea
       join auth.users u on u.id=ea.user_id
       where ea.user_id=check_user
         and u.email_confirmed_at is not null
         and ('owner'=any(coalesce(ea.permissions,'{}'::text[])) or ea.role='owner')
     );
$function$;
create or replace function public.is_brinesearch_editor(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
  select check_user is not null
     and exists (
       select 1
       from public.editor_accounts ea
       join auth.users u on u.id=ea.user_id
       where ea.user_id=check_user
         and u.email_confirmed_at is not null
         and ea.role<>'suspended'
         and ea.permissions && array['owner','administrator','editor']::text[]
     );
$function$;
create or replace function public.is_brinesearch_moderator(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
  select check_user is not null
     and exists (
       select 1
       from public.editor_accounts ea
       join auth.users u on u.id=ea.user_id
       where ea.user_id=check_user
         and u.email_confirmed_at is not null
         and ea.role<>'suspended'
         and ea.permissions && array['owner','administrator','moderator']::text[]
     );
$function$;
create or replace function public.field_profile_can_post(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
  select check_user is not null
     and public.brinesearch_user_email_verified(check_user)
     and exists (
       select 1
       from public.field_profiles fp
       where fp.user_id=check_user
         and fp.status='active'
         and fp.real_name is not null
         and char_length(btrim(fp.real_name)) between 3 and 80
         and position(' ' in btrim(fp.real_name)) > 0
     );
$function$;
do $security_patch$
