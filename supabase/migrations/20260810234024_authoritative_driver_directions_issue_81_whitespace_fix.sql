-- GitHub #81 production follow-up.
-- The first migration's sanitizer used [[:space:]] for cosmetic whitespace
-- collapsing, which also collapsed newlines. Preserve step/section line breaks
-- by normalizing horizontal spaces/tabs only, then refresh the public projection.

create or replace function private_verification.brinesearch_driver_safe_clear_v17330(p_text text)
returns text
language plpgsql
immutable
set search_path = 'pg_catalog', 'private_verification', 'public', 'pg_temp'
as $$
declare
  v text := p_text;
begin
  if v is null then return null; end if;
  v := pg_catalog.regexp_replace(v,'[[:space:]]+Nearest[[:space:]]+Hospital.*$','','i');
  v := pg_catalog.regexp_replace(v,'[[:space:]]*\([^)]*(McDonald''?s?|dealership|YMCA|VFD|post[[:space:]]+office|Dairy[[:space:]]+Queen|restaurant|church[[:space:]]+(is|parking)|cemetery[[:space:]]+(is|at|on)|school[[:space:]]+(is|on)|hospital|medical[[:space:]]+center)[^)]*\)','','gi');
  v := pg_catalog.regexp_replace(v,'[ \t]{2,}',' ','g');
  v := pg_catalog.regexp_replace(v,'[ \t]+([,.;])','\1','g');
  return nullif(pg_catalog.btrim(v),'');
end;
$$;

update public.public_pad_detail d
set directions_clear=private_verification.brinesearch_driver_safe_clear_v17330(p.directions_clear)
from public.pads p
where d.id=p.id
  and d.directions_clear is distinct from private_verification.brinesearch_driver_safe_clear_v17330(p.directions_clear);

do $$
begin
  if exists(select 1 from public.public_pad_detail where directions_clear ~* 'Nearest[[:space:]]+Hospital') then
    raise exception 'issue81 whitespace fix failed: hospital tail remains';
  end if;
  if exists(
    select 1
    from public.pads p
    join public.public_pad_detail d on d.id=p.id
    where p.directions_clear like E'%\n%'
      and private_verification.brinesearch_driver_safe_clear_v17330(p.directions_clear) like E'%\n%'
      and d.directions_clear not like E'%\n%'
  ) then
    raise exception 'issue81 whitespace fix failed: public line breaks lost';
  end if;
end;
$$;
