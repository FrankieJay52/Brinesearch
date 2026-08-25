# Issue #97 Ohio pad completeness ledger — 2026-08-25

Status: **read-only production inventory**. This checkpoint does not approve, reconcile, build, activate, publish, refresh, or modify any pad, route, graph, Google output, or source data.

## Frozen source

- Checked at: `2026-08-25T07:56:23.70539+00:00`
- Current V18 directory snapshot: `586344d2-7118-4f61-b6bc-98a97a690fd1`
- Source revision: `5`
- Directory rows/searchable: 1,214 / 1,214
- Directory SHA-256: `4de973d403e4d4413d83eb90dd6a3816538bfa58d02c14e55b60609505839e2b`
- Ohio directory scope: 970 locations = **926 pads** in this ledger + 44 disposals outside this pad-only ledger.
- Ohio pad rows marked list-only: 0
- Full pad ledger: [issue97-ohio-pad-ledger-20260825.csv](issue97-ohio-pad-ledger-20260825.csv)

## Completeness

| Gate | Present / ready | Missing / not ready |
| --- | ---: | ---: |
| GPS pair | 714 | 212 |
| Reviewed public directions | 856 | 70 |
| Structured road sequence | 858 | 68 |
| Active primary route prep | 654 | 272 |
| Exact route-ready receipt | 2 | 924 |

## Google authority

- Private: 2 ready, 10 held, 23 stale, 891 absent.
- Public Google: **0**.
- Global cutover remains OFF. A GPS point, reviewed prose, or saved road sequence does not create route or Google authority.

## Largest GPS gaps by company

| Company | Pads missing GPS |
| --- | ---: |
| Eog | 87 |
| Gulfport | 47 |
| Ascent | 23 |
| Chesapeake | 9 |
| Eclipse | 7 |
| Infinity | 7 |
| Cnx | 6 |
| Hilcorp | 6 |
| Swn | 6 |
| Eqt | 5 |
| Antero | 2 |
| Edgemarc | 2 |

## Largest reviewed-direction gaps by company

| Company | Pads missing reviewed directions |
| --- | ---: |
| Eog | 16 |
| Chesapeake | 14 |
| Ascent | 5 |
| Hilcorp | 5 |
| Uro | 4 |
| Cnx | 3 |
| Eclipse | 3 |
| Edgemarc | 3 |
| Infinity | 3 |
| Swn | 3 |
| Diversified | 2 |
| Grenadier | 2 |

## Largest active-primary-route gaps by county

| County | Pads without active primary route |
| --- | ---: |
| Carroll | 61 |
| Belmont | 45 |
| Harrison | 27 |
| Monroe | 27 |
| Guernsey | 23 |
| Columbiana | 22 |
| — | 20 |
| Jefferson | 16 |
| Noble | 15 |
| Tuscarawas | 4 |
| Washington | 4 |
| Tusc | 3 |

## Current primary receipt stages

| Stage | Pads |
| --- | ---: |
| identity_reconciliation | 623 |
| — | 272 |
| exact_geometry | 25 |
| google_manifest | 4 |
| ready | 2 |

## Interpretation

The 926 rows are all accounted for, but they are not all route-approved. Only `route_status=route_ready` is exact structured route readiness. Missing GPS, reviewed directions, sequences, route prep, identity, or geometry remain explicit gaps. The CSV contains booleans and authority receipts only; it does not copy private notes or unreviewed directions.
