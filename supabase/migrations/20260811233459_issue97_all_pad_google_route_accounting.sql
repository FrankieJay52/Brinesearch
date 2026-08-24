-- GitHub #97 — every current BrineSearch pad must end the batch in an
-- explicit route-ready or held state. The initial Google-route backfill only
-- iterated pads that already had exact published brinesearch_pad_roads rows,
-- which could silently skip current pads whose route still needed #97/#69
-- reconciliation. This forward override closes that gap without relaxing any
-- exact-route, authoritative-source, graph, safety, or no-guess gate.

create or replace function public.brinesearch_issue97_refresh_google_routes(
  p_pad_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  r record;
  v_result jsonb;
  v_ready integer:=0;
  v_held integer:=0;
  v_stale integer:=0;
  v_processed integer:=0;
  v_scope record;
  v_total_current integer:=0;
begin
  -- Standalone/bulk refreshes take the same deterministic source-generation
  -- locks as graph publication before the global mapping lock. Route publish
  -- and cutover already hold these locks, so calls are transaction-reentrant.
  for v_scope in
    select scope.dataset_id,scope.state_code,scope.county_code
    from public.brinesearch_road_source_dataset_counties scope
    where scope.active and scope.ingest_enabled
    order by scope.dataset_id,scope.state_code,scope.county_code
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      'brinesearch:issue97:ingest:'||v_scope.dataset_id::text||':'||v_scope.county_code
    ));
  end loop;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
  );

  select count(*)::integer into v_total_current
  from public.pads p
  where coalesce(p.list_only,false)=false;

  for r in
    select p.id
    from public.pads p
    where (p_pad_id is not null and p.id=p_pad_id)
       or (p_pad_id is null and coalesce(p.list_only,false)=false)
    order by p.id
  loop
    v_result:=private_verification.brinesearch_issue97_refresh_google_route(r.id);
    v_processed:=v_processed+1;
    case coalesce(v_result->>'status','held')
      when 'ready' then v_ready:=v_ready+1;
      when 'stale' then v_stale:=v_stale+1;
      else v_held:=v_held+1;
    end case;
  end loop;

  if p_pad_id is not null and v_processed=0 then
    raise exception 'Pad not found' using errcode='P0002';
  end if;

  if p_pad_id is null and v_processed<>v_total_current then
    raise exception 'Issue #97 all-pad Google route accounting drift: expected %, processed %',
      v_total_current,v_processed;
  end if;

  return pg_catalog.jsonb_build_object(
    'scope_pad_id',p_pad_id,
    'current_pad_scope',case when p_pad_id is null then v_total_current else v_processed end,
    'ready',v_ready,
    'held',v_held,
    'stale',v_stale,
    'processed',v_processed,
    'all_current_pads_accounted',case when p_pad_id is null then v_processed=v_total_current else true end
  );
end
$$;

revoke all on function public.brinesearch_issue97_refresh_google_routes(uuid)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_refresh_google_routes(uuid)
to service_role;

-- Service-only completion report used after the all-pad backfill. It exposes no
-- private review data to browsers; it exists to prove that every current pad is
-- accounted for and to group the exception queue by exact hold reason.
create or replace function public.brinesearch_issue97_google_route_readiness_report()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_total integer;
  v_routed integer;
  v_without_sequence integer;
  v_receipts integer;
  v_ready integer;
  v_held integer;
  v_stale integer;
  v_not_evaluated integer;
  v_public_rows integer;
  v_current_public_rows integer;
  v_ready_without_public integer;
  v_public_without_ready integer;
  v_reasons jsonb;
begin
  select
    count(*)::integer,
    count(*) filter(where nullif(pg_catalog.btrim(p.structured_road_sequence),'') is not null)::integer,
    count(*) filter(where nullif(pg_catalog.btrim(p.structured_road_sequence),'') is null)::integer,
    count(*) filter(where p.brinesearch_google_route_status_issue97='ready')::integer,
    count(*) filter(where p.brinesearch_google_route_status_issue97='held')::integer,
    count(*) filter(where p.brinesearch_google_route_status_issue97='stale')::integer,
    count(*) filter(where p.brinesearch_google_route_status_issue97='not_evaluated')::integer
  into v_total,v_routed,v_without_sequence,v_ready,v_held,v_stale,v_not_evaluated
  from public.pads p
  where coalesce(p.list_only,false)=false;

  select count(*)::integer into v_receipts
  from private_verification.brinesearch_google_route_receipts_issue97 receipt
  join public.pads p on p.id=receipt.pad_id
  where coalesce(p.list_only,false)=false;

  select count(*)::integer into v_public_rows
  from public.brinesearch_driver_google_routes_public route
  join public.pads p on p.id=route.pad_id
  where coalesce(p.list_only,false)=false;

  select count(*)::integer into v_current_public_rows
  from public.brinesearch_driver_google_routes_public route
  join public.pads p on p.id=route.pad_id
  where coalesce(p.list_only,false)=false
    and public.brinesearch_issue97_google_route_current(route.pad_id);

  select count(*)::integer into v_ready_without_public
  from public.pads p
  where coalesce(p.list_only,false)=false
    and p.brinesearch_google_route_status_issue97='ready'
    and not exists(
      select 1 from public.brinesearch_driver_google_routes_public route
      where route.pad_id=p.id
        and public.brinesearch_issue97_google_route_current(route.pad_id)
    );

  select count(*)::integer into v_public_without_ready
  from public.brinesearch_driver_google_routes_public route
  join public.pads p on p.id=route.pad_id
  where coalesce(p.list_only,false)=false
    and (
      p.brinesearch_google_route_status_issue97<>'ready'
      or not public.brinesearch_issue97_google_route_current(route.pad_id)
    );

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'reason',reason,
      'pads',pads,
      'sample_pad_ids',sample_pad_ids
    ) order by pads desc,reason
  ),'[]'::jsonb)
  into v_reasons
  from (
    select coalesce(nullif(pg_catalog.btrim(receipt.hold_reason),''),'unspecified_hold') as reason,
      count(*)::integer as pads,
      (array_agg(receipt.pad_id order by receipt.pad_id))[1:10] as sample_pad_ids
    from private_verification.brinesearch_google_route_receipts_issue97 receipt
    join public.pads p on p.id=receipt.pad_id
    where coalesce(p.list_only,false)=false and receipt.status in ('held','stale')
    group by coalesce(nullif(pg_catalog.btrim(receipt.hold_reason),''),'unspecified_hold')
  ) grouped;

  return pg_catalog.jsonb_build_object(
    'current_pad_scope',v_total,
    'pads_with_saved_structured_sequence',v_routed,
    'pads_without_saved_structured_sequence',v_without_sequence,
    'receipt_count',v_receipts,
    'status',pg_catalog.jsonb_build_object(
      'ready',v_ready,
      'held',v_held,
      'stale',v_stale,
      'not_evaluated',v_not_evaluated
    ),
    'public_manifest_rows',v_public_rows,
    'current_public_manifest_rows',v_current_public_rows,
    'ready_without_current_public_manifest',v_ready_without_public,
    'public_manifest_without_current_ready_pad',v_public_without_ready,
    'unaccounted_current_pads',v_total-v_receipts,
    'all_current_pads_accounted',v_receipts=v_total,
    'ready_manifest_invariant',v_ready_without_public=0 and v_public_without_ready=0,
    'held_by_reason',v_reasons,
    'policy',pg_catalog.jsonb_build_object(
      'ready','exact authoritative published route + current coordinate-only Google manifest',
      'held','explicit exception reason; no guessed route published',
      'manual_map_editor','review_exception_qa_only',
      'fuzzy_name_or_nearest_resolution',false
    )
  );
end
$$;

revoke all on function public.brinesearch_issue97_google_route_readiness_report()
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_google_route_readiness_report()
to service_role;

comment on function public.brinesearch_issue97_google_route_readiness_report() is
  'Issue #97 service-only all-current-pad ready/held completion report with exact exception reasons and ready-manifest invariants.';
