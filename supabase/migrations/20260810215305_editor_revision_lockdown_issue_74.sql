-- GitHub #74 stage 2: close direct table-write bypass after the RPC-backed
-- browser editor has deployed and been live-verified.
--
-- editor_add_pad() remains the reviewed SECURITY DEFINER creation path.
-- editor_update_pad() is the reviewed existing-pad edit path. Removing raw
-- authenticated INSERT/UPDATE prevents crafted PostgREST requests from mutating
-- hidden pad fields or bypassing optimistic concurrency.

revoke insert, update on table public.pads from anon;
revoke insert, update on table public.pads from authenticated;

drop policy if exists "Editors can insert pads" on public.pads;
drop policy if exists "Editors can update pads" on public.pads;

do $$
begin
  if pg_catalog.has_table_privilege('authenticated', 'public.pads', 'UPDATE') then
    raise exception 'issue74 invariant failed: authenticated still has direct UPDATE on public.pads';
  end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.pads', 'INSERT') then
    raise exception 'issue74 invariant failed: authenticated still has direct INSERT on public.pads';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.editor_update_pad(uuid,timestamp with time zone,jsonb)', 'EXECUTE') then
    raise exception 'issue74 invariant failed: anon can execute editor_update_pad';
  end if;
  if not pg_catalog.has_function_privilege('authenticated', 'public.editor_update_pad(uuid,timestamp with time zone,jsonb)', 'EXECUTE') then
    raise exception 'issue74 invariant failed: authenticated cannot execute editor_update_pad';
  end if;
  if not pg_catalog.has_function_privilege('authenticated', 'public.editor_add_pad(text,text,text,text,text,double precision,double precision,text,text,text,text,text,jsonb,text,text,text)', 'EXECUTE') then
    raise exception 'issue74 invariant failed: authenticated editor creation RPC is unavailable';
  end if;
end;
$$;
