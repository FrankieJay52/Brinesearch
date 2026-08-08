-- BrineSearch public-data discovery/enrichment staging.
-- Staging only: does not update public.pads, directions, roads, mileage, or navigation coordinates.
create table if not exists private_verification.public_data_sources (
 id uuid primary key default gen_random_uuid(), source_key text not null unique, agency text not null,
 source_name text not null, source_type text not null, state text, official boolean not null default true,
 base_url text not null, active boolean not null default true, refresh_strategy text, rate_limit_notes text,
 last_success_at timestamptz, last_attempt_at timestamptz, health_status text not null default 'not_checked',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists private_verification.public_data_import_runs (
 id uuid primary key default gen_random_uuid(), source_id uuid not null references private_verification.public_data_sources(id),
 state text, operator_filter text, date_from date, date_to date, import_mode text not null default 'full',
 status text not null default 'running' check(status in('running','completed','partial','failed','cancelled')),
 checkpoint jsonb not null default '{}'::jsonb, request_count integer not null default 0,
 records_seen integer not null default 0, records_inserted integer not null default 0,
 records_changed integer not null default 0, records_unchanged integer not null default 0,
 errors jsonb not null default '[]'::jsonb, exact_endpoint text, exact_query jsonb not null default '{}'::jsonb,
 started_at timestamptz not null default now(), completed_at timestamptz);
create table if not exists private_verification.public_data_source_records (
 id uuid primary key default gen_random_uuid(), source_id uuid not null references private_verification.public_data_sources(id),
 source_record_id text not null, source_publication_date timestamptz,
 entity_type text not null check(entity_type in('pad','well','disposal','injection','water_source','impoundment','facility','unknown')),
 state text, operator_raw text, operator_normalized text, official_name text, official_status text, county text,
 township_or_municipality text, latitude double precision, longitude double precision,
 raw_facts jsonb not null default '{}'::jsonb, normalized_facts jsonb not null default '{}'::jsonb,
 source_content_hash text, first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
 retired_at timestamptz, last_import_run_id uuid references private_verification.public_data_import_runs(id),
 unique(source_id,source_record_id));
create index if not exists public_data_source_records_state_type_idx on private_verification.public_data_source_records(state,entity_type);
create index if not exists public_data_source_records_operator_idx on private_verification.public_data_source_records(operator_normalized);
create table if not exists private_verification.public_data_match_candidates (
 id uuid primary key default gen_random_uuid(), source_record_id uuid not null references private_verification.public_data_source_records(id) on delete cascade,
 pad_id uuid references public.pads(id), result_category text not null, match_method text,
 confidence numeric check(confidence is null or(confidence>=0 and confidence<=1)), evidence jsonb not null default '[]'::jsonb,
 conflicts jsonb not null default '[]'::jsonb, distance_miles double precision, fuzzy_name_score double precision,
 review_status text not null default 'pending' check(review_status in('pending','needs_owner_review','needs_field_confirmation','confirmed','rejected','deferred')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(source_record_id,pad_id,result_category));
create table if not exists private_verification.public_data_proposals (
 id uuid primary key default gen_random_uuid(), match_candidate_id uuid not null references private_verification.public_data_match_candidates(id) on delete cascade,
 pad_id uuid references public.pads(id), target_scope text not null, field_name text not null, saved_value jsonb,
 proposed_value jsonb, source_value jsonb, confidence numeric check(confidence is null or(confidence>=0 and confidence<=1)),
 conflict boolean not null default false, review_status text not null default 'pending' check(review_status in('pending','accepted','keep_saved','save_as_alias','needs_field_check','rejected','deferred')),
 reviewed_by uuid, reviewed_at timestamptz, applied_at timestamptz, created_at timestamptz not null default now());
create table if not exists private_verification.public_data_review_events (
 id bigint generated always as identity primary key, proposal_id uuid references private_verification.public_data_proposals(id),
 match_candidate_id uuid references private_verification.public_data_match_candidates(id), pad_id uuid references public.pads(id),
 decision text not null, previous_value jsonb, proposed_value jsonb, evidence jsonb not null default '{}'::jsonb,
 reviewer_id uuid, reviewer_note text, created_at timestamptz not null default now());
revoke all on private_verification.public_data_sources from public,anon,authenticated;
revoke all on private_verification.public_data_import_runs from public,anon,authenticated;
revoke all on private_verification.public_data_source_records from public,anon,authenticated;
revoke all on private_verification.public_data_match_candidates from public,anon,authenticated;
revoke all on private_verification.public_data_proposals from public,anon,authenticated;
revoke all on private_verification.public_data_review_events from public,anon,authenticated;
comment on table private_verification.public_data_source_records is 'Idempotent official/public source staging; never writes live pads automatically.';
comment on table private_verification.public_data_match_candidates is 'Candidate matching only; proximity and fuzzy names are never sufficient proof.';
comment on table private_verification.public_data_proposals is 'Field-level owner-review proposals; no bulk accept-all semantics.';
