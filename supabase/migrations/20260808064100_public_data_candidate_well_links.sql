create table if not exists private_verification.public_data_candidate_well_links (
  id uuid primary key default gen_random_uuid(),
  pad_source_record_id uuid not null references private_verification.public_data_source_records(id) on delete cascade,
  well_source text not null,
  well_source_record_id text not null,
  canonical_api text,
  well_name text,
  operator text,
  county text,
  township text,
  well_status text,
  latitude double precision,
  longitude double precision,
  distance_miles double precision,
  link_method text not null,
  confidence numeric check(confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence jsonb not null default '[]'::jsonb,
  conflicts jsonb not null default '[]'::jsonb,
  review_status text not null default 'pending' check(review_status in ('pending','confirmed','needs_owner_review','rejected','deferred')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(pad_source_record_id, well_source, well_source_record_id)
);
create index if not exists public_data_candidate_well_links_pad_idx on private_verification.public_data_candidate_well_links(pad_source_record_id);
create index if not exists public_data_candidate_well_links_api_idx on private_verification.public_data_candidate_well_links(canonical_api) where canonical_api is not null;
revoke all on private_verification.public_data_candidate_well_links from public, anon, authenticated;
comment on table private_verification.public_data_candidate_well_links is 'Staged official well-to-pad links. Link evidence must exceed proximity alone; no live pad API or well fields are changed automatically.';
