# Batch 0 Ascent six-county navigation ledger — 2026-08-27
- Base origin/main SHA: `158687893c207e8514f5afdb512de5586228c692`
- Candidate implementation HEAD: `b75978aad228dfecf151df1e481a8eaed028509a`
- Candidate content SHA-256: `7869deee13ec0284474f5be025e63d6493c0169777ddb2667f4d2e54fe3c8140`
- Uncommitted non-generated changes: **no**
- 247 / 1 approved / 8 core+GPS / 233 GPS-only / 5 reviewed-held
- Production writes zero
- LAWSON + BILINOVICH + BEETLE + DUKE + PORTERFIELD GAS UNIT: `reviewed_handoff_authority_held`

This candidate ledger binds the 247 current Ascent pads in Belmont, Guernsey, Harrison, Jefferson, Monroe, and Noble counties to production directory snapshot `68f1d076-fe03-4519-a5cd-c68f8a28b06c` and source revision `8`. It describes candidate implementation content based on origin/main; it does not claim that unmerged work is already on main.

## Candidate implementation files

- `v18/scripts/audit-batch0-ascent-navigation.mjs`
- `v18/scripts/audit-batch0-ascent-navigation.test.mjs`

## Counts

- State 1 — Reviewed approved route: **1**
- State 2 — Approved roads then GPS: **8**
- State 3 — GPS destination only: **233**
- Reviewed handoff authority held: **5**
- No trusted GPS: **0**
- Exactly one navigation action destination: **247**

| County | Pads | State 1 | State 2 | State 3 | Reviewed-held | No GPS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Belmont | 77 | 0 | 0 | 76 | 1 | 0 |
| Guernsey | 44 | 0 | 0 | 42 | 2 | 0 |
| Harrison | 49 | 1 | 8 | 38 | 2 | 0 |
| Jefferson | 66 | 0 | 0 | 66 | 0 | 0 |
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
- LAWSON, BILINOVICH, BEETLE, DUKE, and PORTERFIELD GAS UNIT remain `reviewed_handoff_authority_held` rather than being promoted: their exact record-bound reviewed handoffs are separate from graph/public-Google authority. The owner completed phone/field validation of the exact DUKE and PORTERFIELD links on 2026-08-27; that visual proof does not promote graph or public-Google authority.
- Written directions are not converted into geometry, and ODNR points are never labeled as entrances.
- The public reference projection SHA-256 is `1dfa303193d52cff7e6cefe358afca52d1e4406e9378d16ac993f1482e0f3e45`.
- The generated CSV SHA-256 is `a17eed1ebe33ba346c87260a235a72f38c9a3928710577c825050b0e92cbb352`.
- Production database writes for this ledger: **0**.

Regenerate from the current live public contracts with `npm --prefix v18 run audit:batch0-navigation -- --write`. The audit performs one request per page/contract and has no retry path.
