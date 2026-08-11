-- GitHub #70 — strict context neighbor-evidence invariant.
--
-- A route-prep step can have a previous/next Road Manager ID even when that
-- neighbor does not yet have trustworthy centerline geometry. Such an ID was
-- metadata, not spatial evidence. The first strict-context draft stored that ID
-- together with a NULL geometry digest, causing the apply revalidation to hold a
-- valid pad-endpoint decision even though the neighbor was intentionally not used.
--
-- This follow-up makes the evidence contract explicit: a neighbor road ID is
-- retained only when a non-null geometry digest proves that its centerline was
-- actually used as evidence. Pad-only endpoint decisions therefore do not become
-- dependent on an ungeometrized neighboring step.

create or replace function private_verification.brinesearch_normalize_context_neighbor_evidence_issue70()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.prev_geometry_digest is null then
    new.prev_road_id:=null;
  elsif new.prev_road_id is null then
    raise exception 'Issue #70 previous-neighbor geometry evidence requires a Road Manager ID';
  end if;

  if new.next_geometry_digest is null then
    new.next_road_id:=null;
  elsif new.next_road_id is null then
    raise exception 'Issue #70 next-neighbor geometry evidence requires a Road Manager ID';
  end if;

  return new;
end;
$$;

revoke all on function private_verification.brinesearch_normalize_context_neighbor_evidence_issue70()
from public,anon,authenticated;

-- No production rows exist before this slice is released, but make the migration
-- idempotently safe for a rehearsed or interrupted deployment.
update private_verification.brinesearch_oh_context_resolutions_issue70
set prev_road_id=null
where prev_geometry_digest is null and prev_road_id is not null;

update private_verification.brinesearch_oh_context_resolutions_issue70
set next_road_id=null
where next_geometry_digest is null and next_road_id is not null;

alter table private_verification.brinesearch_oh_context_resolutions_issue70
  drop constraint if exists brinesearch_oh_context_issue70_prev_evidence_pair,
  drop constraint if exists brinesearch_oh_context_issue70_next_evidence_pair;

alter table private_verification.brinesearch_oh_context_resolutions_issue70
  add constraint brinesearch_oh_context_issue70_prev_evidence_pair check (
    (prev_road_id is null)=(prev_geometry_digest is null)
  ),
  add constraint brinesearch_oh_context_issue70_next_evidence_pair check (
    (next_road_id is null)=(next_geometry_digest is null)
  );

drop trigger if exists brinesearch_normalize_context_neighbor_evidence_issue70
  on private_verification.brinesearch_oh_context_resolutions_issue70;
create trigger brinesearch_normalize_context_neighbor_evidence_issue70
before insert or update of prev_road_id,next_road_id,prev_geometry_digest,next_geometry_digest
on private_verification.brinesearch_oh_context_resolutions_issue70
for each row execute function
  private_verification.brinesearch_normalize_context_neighbor_evidence_issue70();

comment on function private_verification.brinesearch_normalize_context_neighbor_evidence_issue70() is
  'Issue #70: neighbor IDs are evidence only when paired with the exact centerline digest used by strict context staging.';
