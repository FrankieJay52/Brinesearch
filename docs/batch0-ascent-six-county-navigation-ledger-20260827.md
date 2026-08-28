# Batch 0 Ascent six-county navigation ledger — 2026-08-27
- Base origin/main SHA: `cca91bc6b06c1dac1a7a5b59095a36b3c3176120`
- Candidate implementation HEAD: `b853572d3091b7f883e11a38ecdef435e1e73e61`
- Candidate content SHA-256: `c880f55c1c67c3aed86cf6ee4ee0aca5c80441917012fdfedd93429df333a70b`
- Uncommitted non-generated changes: **no**
- 247 / 1 approved / 8 core+GPS / 218 GPS-only / 20 reviewed-held
- Production writes zero
- ALBATROSS + ATHENA + BEETLE + BILINOVICH + BRAVO + CASTON + CROWIE + DUKE + GIL + GILCHER + HOOP + LAKE + LAWSON + MALDON + PICKENS + PORTERFIELD GAS UNIT + RUTH + SKULL FORK + THOMAS + WITHEY: `reviewed_handoff_authority_held`

This candidate ledger binds the 247 current Ascent pads in Belmont, Guernsey, Harrison, Jefferson, Monroe, and Noble counties to production directory snapshot `68f1d076-fe03-4519-a5cd-c68f8a28b06c` and source revision `8`. It describes candidate implementation content based on origin/main; it does not claim that unmerged work is already on main.

## Candidate implementation files

- `docs/issue97-ascent-reviewed-handoffs-batch4-20260828.md`
- `v18/scripts/audit-batch0-ascent-navigation.mjs`
- `v18/scripts/audit-batch0-ascent-navigation.test.mjs`
- `v18/src/data/ascentBatch0NavigationLedger.test.ts`
- `v18/src/data/releasedGoogleHandoff.test.ts`
- `v18/src/data/releasedGoogleHandoff.ts`
- `v18/src/data/reviewedNavigationCandidates.test.ts`
- `v18/src/data/reviewedNavigationCandidates.ts`
- `v18/src/features/map/MapPage.test.ts`
- `v18/src/features/map/MapPage.tsx`
- `v18/src/features/pad/PadPage.test.ts`
- `v18/src/features/pad/PadPage.tsx`

## Counts

- State 1 — Reviewed approved route: **1**
- State 2 — Approved roads then GPS: **8**
- State 3 — GPS destination only: **218**
- Reviewed handoff authority held: **20**
- No trusted GPS: **0**
- Exactly one navigation action destination: **247**

| County | Pads | State 1 | State 2 | State 3 | Reviewed-held | No GPS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Belmont | 77 | 0 | 0 | 72 | 5 | 0 |
| Guernsey | 44 | 0 | 0 | 35 | 9 | 0 |
| Harrison | 49 | 1 | 8 | 36 | 4 | 0 |
| Jefferson | 66 | 0 | 0 | 64 | 2 | 0 |
| Monroe | 1 | 0 | 0 | 1 | 0 | 0 |
| Noble | 10 | 0 | 0 | 10 | 0 | 0 |

## GPS source accounting

The required `gps_source` column describes the coordinate used by the Navigate action: saved **230**, ODNR pad **12**, ODNR wellhead **5**, missing **0**. The separate `directory_gps_source` column preserves the canonical public-directory source: saved **231**, ODNR pad **11**, ODNR wellhead **5**, missing **0**.

BILINOVICH is the one deliberate distinction: its frozen PR #174 handoff navigates to the ODNR pad-surface destination `40.08738445, -81.30282620`; its current directory reference remains the saved lease-approach coordinate `40.08863, -81.304164`. Neither coordinate is called an entrance. The frozen URL and receipt remain unchanged, and Blaze Road remains excluded.

## Authority boundary

- The phone's current location is the origin. State 3 URLs contain no origin or waypoint.
- State 1 is limited to Cologie's exact clipped public route and reviewed Google handoff.
- State 2 draws approved public-road geometry only to its exact handoff. Its lease/pin leg is GPS-only.
- State 3 uses an exact saved or ODNR coordinate without approving Google's chosen roads.
- ALBATROSS, ATHENA, BEETLE, BILINOVICH, BRAVO, CASTON, CROWIE, DUKE, GIL, GILCHER, HOOP, LAKE, LAWSON, MALDON, PICKENS, PORTERFIELD GAS UNIT, RUTH, SKULL FORK, THOMAS, and WITHEY remain `reviewed_handoff_authority_held` rather than being promoted: their exact record-bound reviewed handoffs are separate from graph/public-Google authority. The exact DUKE, PICKENS, and PORTERFIELD links have owner phone/field validation; the six batch-2 and eight batch-3 links have live Google turn-list validation. That proof does not promote graph or public-Google authority.
- Written directions are not converted into geometry, and ODNR points are never labeled as entrances.
- The public reference projection SHA-256 is `1dfa303193d52cff7e6cefe358afca52d1e4406e9378d16ac993f1482e0f3e45`.
- The generated CSV SHA-256 is `2098d6df6775c0abda581401fee61458606e32e4436cdd486f1fa43d2d7bd3a5`.
- Production database writes for this ledger: **0**.

Regenerate from the current live public contracts with `npm --prefix v18 run audit:batch0-navigation -- --write`. The audit performs one request per page/contract and has no retry path.
