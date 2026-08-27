# Batch 0 Ascent six-county navigation ledger — 2026-08-27
- SHA `fc82ff186c3136920e6031fa7dda9f89eb52fe44`
- 247 / 1 approved / 8 core+GPS / 236 GPS-only / 2 reviewed-held
- Production writes zero
- LAWSON + BILINOVICH: `reviewed_handoff_authority_held`

This ledger binds the 247 current Ascent pads in Belmont, Guernsey, Harrison, Jefferson, Monroe, and Noble counties to production directory snapshot `68f1d076-fe03-4519-a5cd-c68f8a28b06c`, source revision `8`, on main `fc82ff186c3136920e6031fa7dda9f89eb52fe44`.

## Counts

- State 1 — Reviewed approved route: **1**
- State 2 — Approved roads then GPS: **8**
- State 3 — GPS destination only: **236**
- Reviewed handoff authority held: **2**
- No trusted GPS: **0**
- Exactly one trusted destination: **247**

| County | Pads | State 1 | State 2 | State 3 | Reviewed-held | No GPS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Belmont | 77 | 0 | 0 | 77 | 0 | 0 |
| Guernsey | 44 | 0 | 0 | 42 | 2 | 0 |
| Harrison | 49 | 1 | 8 | 40 | 0 | 0 |
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
- LAWSON and BILINOVICH remain `reviewed_handoff_authority_held` rather than being promoted: their exact record-bound reviewed handoffs work, but their frozen receipts keep graph/public-Google approval separate or held.
- Written directions are not converted into geometry, and ODNR points are never labeled as entrances.
- The public reference projection SHA-256 is `1dfa303193d52cff7e6cefe358afca52d1e4406e9378d16ac993f1482e0f3e45`.
- Production database writes for this ledger: **0**.

Regenerate from the current live public contracts with `npm --prefix v18 run audit:batch0-navigation -- --write`. The audit performs one request per page/contract and has no retry path.
