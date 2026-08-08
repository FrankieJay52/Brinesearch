create index if not exists public_data_import_runs_source_id_idx on private_verification.public_data_import_runs(source_id);
create index if not exists public_data_source_records_last_run_idx on private_verification.public_data_source_records(last_import_run_id);
create index if not exists public_data_match_candidates_pad_id_idx on private_verification.public_data_match_candidates(pad_id) where pad_id is not null;
create index if not exists public_data_proposals_match_candidate_idx on private_verification.public_data_proposals(match_candidate_id);
create index if not exists public_data_proposals_pad_id_idx on private_verification.public_data_proposals(pad_id) where pad_id is not null;
create index if not exists public_data_review_events_proposal_idx on private_verification.public_data_review_events(proposal_id) where proposal_id is not null;
create index if not exists public_data_review_events_match_candidate_idx on private_verification.public_data_review_events(match_candidate_id) where match_candidate_id is not null;
create index if not exists public_data_review_events_pad_id_idx on private_verification.public_data_review_events(pad_id) where pad_id is not null;
