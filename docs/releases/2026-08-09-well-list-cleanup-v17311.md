# BrineSearch V17.3.11 — well-list cleanup

## What changed

- Audited every saved well/API/property list in the 1,173-pad production database.
- Rebuilt legacy pipe-delimited and combined `well_entries` records into synchronized one-row-per-well data.
- Corrected evidence-backed bad saved APIs and restored current official well names from Ohio, Pennsylvania, and West Virginia public records.
- Added missing wells only where the official pad/well relationship was confirmed or the current public record supplied a high-confidence exact pad association.
- Resolved cross-pad API contamination where official wellhead, county, pad-ID, or confirmed pad/well evidence proved which legacy attachment was wrong.
- Classified the remaining repeated APIs as verified duplicate/historical pad aliases instead of treating them as separate conflicting wells.
- Removed duplicate shorthand names and obvious non-well annotations while retaining private backups of every original value.
- Rebuilt `official_well_records` and API-verification summaries from the audited well rows.
- Unresolved records remain explicitly in Review; no well name or API was invented.

## Production audit after cleanup

- 3,670 total well rows.
- 3,667 rows have an API number.
- 3,664 rows are verified official attachments.
- 3 API rows remain Review because no exact current official record could be established.
- 3 saved name-only rows remain Review because no confirmed API could be established.
- 7 repeated API values remain only on verified duplicate/historical pad aliases.
- 0 unsafe/unclassified duplicate APIs.
- 850 pads now have structured one-row-per-well data.
- 0 API / well-entry count mismatches.
- 0 well-name / well-entry count mismatches.
- 0 property / well-entry count mismatches.

### Cross Creek example

Cross Creek now resolves to seven aligned rows, including `Nac 3p-20` for API `34-081-2-0528-00-00` instead of a blank seventh well name. The three `SE-CRC-JF-*` rows are now tied to their current official Cross Creek A names and APIs.

## Driver UI polish

- A saved API with no confirmed well name displays **Name needs review** instead of a naked dash.
- A saved name with no confirmed API remains visibly **Review** rather than appearing verified.
- The **View official source** action is constrained to the official-source card width and centered on mobile.

## Production migrations already applied

- `20260809063910` — `v17311_well_list_cleanup_and_official_sync`
- `20260809064409` — `v17311_confirmed_cross_pad_well_conflicts`
- `20260809064721` — `v17311_finish_duplicate_well_audit`
- `20260809064815` — `v17311_verify_surviving_conflict_well_rows`
- `20260809065240` — `v17311_resolve_remaining_name_only_wells`

All destructive cleanup stages were preceded by private backup tables in production.
