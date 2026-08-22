-- GitHub #97 — current safety dependency helpers for automatic Google route receipts.
-- The earlier transition-Google draft referenced helpers that were never part of the
-- current #69/#81 schema. Rebuild them from the canonical private safety-fact table.
-- Private hold text is never returned or copied into a public route manifest.

create or replace function private_verification.brinesearch_issue97_pad_safety_facts(
  p_pad_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  with current_facts as (
    select f.*
    from private_verification.brinesearch_driver_safety_facts_issue69 f
    where f.pad_id=p_pad_id
      and (f.effective_from is null or f.effective_from<=current_date)
      and (f.effective_until is null or f.effective_until>=current_date)
      and f.publication_status in ('verified_public','private_hold')
  ), public_receipts as (
    select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id',f.id,
        'context_key',f.context_key,
        'route_step_id',f.route_step_id,
        'road_id',f.road_id,
        'display_order',f.display_order,
        'category',f.category,
        'direction_scope',f.direction_scope,
        'source_kind',f.source_kind,
        'source_record_id',f.source_record_id,
        'source_revision',f.source_revision,
        'source_text_digest',f.source_text_digest,
        'source_excerpt_digest',f.source_excerpt_digest,
        'verification_method',f.verification_method,
        'verified_at',f.verified_at,
        'updated_at',f.updated_at
      ) order by f.display_order,f.id
    ),'[]'::jsonb) as facts
    from current_facts f
    where f.publication_status='verified_public'
  )
  select pg_catalog.jsonb_build_object(
    'has_hold',exists(select 1 from current_facts where publication_status='private_hold'),
    'hold_count',(select count(*) from current_facts where publication_status='private_hold'),
    'verified_public_count',(select count(*) from current_facts where publication_status='verified_public'),
    'verified_public_receipts',(select facts from public_receipts),
    'private_hold_text_exposed',false
  )
$$;

revoke all on function private_verification.brinesearch_issue97_pad_safety_facts(uuid)
from public,anon,authenticated;
grant execute on function private_verification.brinesearch_issue97_pad_safety_facts(uuid)
to service_role;

comment on function private_verification.brinesearch_issue97_pad_safety_facts(uuid) is
  'Issue #97 dependency projection over current #69/#81 canonical safety facts. Any active private_hold fails closed; private hold text is never returned.';

create or replace function private_verification.brinesearch_issue97_route_data_blocked(
  p_pad_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce((
    private_verification.brinesearch_issue97_pad_safety_facts(p_pad_id)->>'has_hold'
  )::boolean,false)
$$;

revoke all on function private_verification.brinesearch_issue97_route_data_blocked(uuid)
from public,anon,authenticated;
grant execute on function private_verification.brinesearch_issue97_route_data_blocked(uuid)
to service_role;

comment on function private_verification.brinesearch_issue97_route_data_blocked(uuid) is
  'Issue #97 fail-closed route safety gate. An active private_hold in the canonical #69/#81 safety table blocks automatic Google publication.';

do $issue97_assert_current_safety_dependency_helpers$
begin
  if private_verification.brinesearch_issue97_pad_safety_facts(
       '00000000-0000-0000-0000-000000000000'::uuid
     ) is null then
    raise exception 'Issue #97 safety dependency helper did not install cleanly';
  end if;
end
$issue97_assert_current_safety_dependency_helpers$;
