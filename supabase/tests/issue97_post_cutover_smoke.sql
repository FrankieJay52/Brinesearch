-- GitHub #97 — post-cutover live smoke.
-- This suite must never authorize cutover. It runs only after the irreversible
-- release switch and proves the public Google projection/dispatcher remain
-- bound to ready current receipts while every current non-list-only pad is
-- explicitly ready or held.
begin transaction read only;
set local statement_timeout='15min';
set local lock_timeout='5s';

do $issue97_post_cutover$
declare
  v_pad_scope integer;
  v_ready integer;
  v_held integer;
  v_stale integer;
  v_public integer;
  v_missing integer;
begin
  if not public.brinesearch_issue97_cutover_active() then
    raise exception '#97 post-cutover smoke requires cutover ACTIVE';
  end if;

  select count(*)::integer into v_pad_scope
  from public.pads p
  where coalesce(p.record_type,'pad')<>'list_only';

  select count(*) filter(where status='ready')::integer,
    count(*) filter(where status='held')::integer,
    count(*) filter(where status='stale')::integer
  into v_ready,v_held,v_stale
  from private_verification.brinesearch_google_route_receipts_issue97 receipt
  join public.pads p on p.id=receipt.pad_id
  where coalesce(p.record_type,'pad')<>'list_only';

  if v_ready+v_held+v_stale<>v_pad_scope or v_stale<>0 then
    raise exception '#97 post-cutover Google receipt accounting incomplete: scope %, ready %, held %, stale %',
      v_pad_scope,v_ready,v_held,v_stale;
  end if;

  select count(*)::integer into v_public
  from public.brinesearch_driver_google_routes_public;
  if v_public<>v_ready then
    raise exception '#97 post-cutover public Google projection count % differs from ready receipt count %',
      v_public,v_ready;
  end if;

  select count(*)::integer into v_missing
  from private_verification.brinesearch_google_route_receipts_issue97 receipt
  join public.pads p on p.id=receipt.pad_id
  where coalesce(p.record_type,'pad')<>'list_only'
    and receipt.status='ready'
    and (
      not public.brinesearch_issue97_google_route_current(receipt.pad_id)
      or not exists(select 1 from public.brinesearch_driver_google_routes_public public_route
          where public_route.pad_id=receipt.pad_id
            and public_route.route_revision=receipt.route_revision)
    );
  if v_missing<>0 then
    raise exception '#97 post-cutover has % ready Google receipts that are not current/public',v_missing;
  end if;

  if exists(select 1 from public.brinesearch_driver_google_routes_public public_route
      where not public.brinesearch_issue97_google_route_current(public_route.pad_id)) then
    raise exception '#97 post-cutover public projection exposed a non-current Google route';
  end if;

  -- Representative product classes must remain present in the reviewed release
  -- corpus. Their detailed coordinate/chunk behavior is covered by the existing
  -- Google-route planner/browser regressions and live-site verification.
  if not exists(select 1 from public.pads p where coalesce(p.record_type,'pad')<>'list_only'
      and p.latitude is not null and p.longitude is not null) then
    raise exception '#97 post-cutover has no exact-GPS pad available for live route smoke';
  end if;
end
$issue97_post_cutover$;

rollback;
