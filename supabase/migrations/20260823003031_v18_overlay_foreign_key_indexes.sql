-- Cover the three V18 overlay foreign-key lookup paths reported by the
-- Supabase performance advisor. The overlay/release tables remain private and
-- fail closed; these indexes do not change grants, policies, or publication.

create index brinesearch_v18_overlay_release_directory_snapshot_idx
on private_verification.brinesearch_v18_company_road_overlay_releases(
  directory_snapshot_id
);

create index brinesearch_v18_overlay_release_overlay_snapshot_idx
on private_verification.brinesearch_v18_company_road_overlay_releases(
  overlay_snapshot_id
)
where overlay_snapshot_id is not null;

create index brinesearch_v18_overlay_snapshot_directory_idx
on public.brinesearch_company_road_overlay_snapshots_v18(
  directory_snapshot_id
);
