# BrineSearch Public Data Discovery

This subsystem enriches BrineSearch from official/public oil-and-gas records without automatically changing live driver data.

## Safety boundaries
- Never write `directions_clear`, `written_directions`, `structured_road_sequence`, Road Manager route facts, mileage, road matches, or navigation coordinates.
- Official pad/well coordinates are evidence, not replacements for driver navigation points.
- Preserve field-used pad names; official names are aliases/evidence until owner review.
- Operator changes are staged as history/review, never automatic company moves.
- Proximity and fuzzy names can create candidates but cannot confirm matches.
- Every live change must be field-level, owner-approved, and auditable.

## Match evidence order
1. Exact API.
2. Exact official pad ID or permit ID.
3. Exact official well identifier.
4. Exact pad name + county + compatible operator/alias.
5. Proven pad alias + official geography.
6. Documented operator/acquisition history + exact name/county.
7. Multiple independent strong pieces of evidence.

## Import lifecycle
source -> import run -> idempotent source record -> match candidate -> field proposal -> owner decision -> applied audit event.

Source records use `(source_id, source_record_id)` identity and retain `first_seen_at`, `last_seen_at`, optional content hash, publication date, fetch/run information, and retirement state.

## Controlled batches
Run one state/source/operator group at a time. Prefer 25-50 staged candidates per write batch, verify committed state before retrying, and never assume a failed client response means the database transaction failed.

Initial source order: Ohio ODNR Well Pads, Ohio wells/permits, Ohio injection; WVDEP/WVGES wells/permits/UIC/production; PA DEP well pads/wells/permits/production; then FracFocus enrichment.
