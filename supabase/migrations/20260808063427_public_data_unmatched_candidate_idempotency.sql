-- NULL pad_id values do not collide under a normal UNIQUE constraint.
-- This partial index makes NEW_PAD_CANDIDATE and other unmatched classifications idempotent.
create unique index if not exists public_data_match_candidates_unmatched_unique_idx
on private_verification.public_data_match_candidates(source_record_id, result_category)
where pad_id is null;
