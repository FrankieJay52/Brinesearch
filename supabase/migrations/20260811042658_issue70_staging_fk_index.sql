-- GitHub #70 — cover the applied_road_id foreign key used by the private match audit trail.
-- Added from the post-apply Supabase Performance Advisor review.
create index if not exists brinesearch_oh_road_matches_issue70_applied_road_idx
  on private_verification.brinesearch_oh_road_matches_issue70(applied_road_id)
  where applied_road_id is not null;
