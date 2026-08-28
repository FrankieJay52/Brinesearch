# Issue #97 — Ascent reviewed Google handoffs batch 2 — 2026-08-27

## Scope

This batch adds six exact-record, owner-reviewed Google handoffs. It does not create graph geometry, approve a lease road, publish a public Google route, change cutover, or write production data.

Every app URL omits `origin`, so Google starts from the phone's current location. The ordered controls only preserve the reviewed local-road approach. Except for CROWIE's validated driver entrance, each destination remains an exact saved pad GPS and is not relabeled as an entrance.

## Live Google validation

The exact URLs were opened in the signed-in Google Maps web app. A second check isolated each local-road segment by temporarily using its first shaping point as the test origin; that test-only origin is not present in the BrineSearch URL.

| Pad | Exact record | Trusted destination | Ordered controls | Google local turn list | Result |
| --- | --- | --- | --- | --- | --- |
| CROWIE | `fba35b8e-ccc6-406b-b27c-ac9ce4eed29d` · rev `1786265812046205` | verified driver entrance `40.0979,-80.9384` | `40.073689,-80.945041`; `40.088246,-80.944086` | US-40 → Vineyard Rd → Williams Rd → CROWIE | Passed; no shortcut or backtrack |
| CASTON | `58c94af4-32b1-4f80-a278-a5f73688fa23` · rev `1786258360881449` | saved pad GPS `40.130458,-81.328059` | `40.123106982,-81.353948693`; `40.113698669772,-81.314757942078`; `40.127876178092,-81.316090497685` | McCoy Rd → Jasper Rd → Caston Rd → saved GPS | Passed; 9 minutes / 4.1 local miles |
| GIL | `bd2e0e20-8aa8-4e05-a4c0-0af312234853` · rev `1786258360881449` | saved pad GPS `40.09387,-81.29646` | `40.123106982,-81.353948693`; `40.095922776519,-81.284173854530`; `40.099552104984,-81.297815548031` | McCoy Rd → Merry Rd → Penrose Rd → Logan Rd → saved GPS | Passed; no Blaze or other shortcut |
| GILCHER | `71c9c874-5514-46a4-8d91-b105c6734799` · rev `1786258360881449` | saved pad GPS `40.100079,-81.295657` | `40.123106982,-81.353948693`; `40.105015636324,-81.279619885553`; `40.095922776519,-81.284173854530` | McCoy Rd → Merry Rd → Penrose Rd → saved GPS | Passed; no shortcut or backtrack |
| LAKE | `ccf7415a-331b-440a-829d-28282a33cde1` · rev `1786258360881449` | saved pad GPS `40.14776,-81.295527` | `40.123106982,-81.353948693`; `40.111840810550,-81.300972387724`; `40.134573026404,-81.287284993921` | McCoy Rd → Tyson Mill Rd → Pennyroyal Rd → unnamed final turn to saved GPS | Passed; unnamed final movement remains unapproved |
| THOMAS | `1e898176-672d-4174-8878-4aae0aee2128` · rev `1786265812046205` | saved pad GPS `40.096986,-81.307667` | `40.087850494651,-81.320561551360` | OH-513 → Tyson Mill Rd → unnamed final right to saved GPS | Passed; unnamed final movement remains unapproved |

The Google turn lists matched the current reviewed road order. The displayed Google address at a shaping point may differ from BrineSearch's road label; the contract binds the exact coordinates and ordered road sequence, not Google's address prose.

## Fail-closed exclusions

- BETTS remains GPS-only. Its proposed one-control route left McCoy Road and looped through US-22, Skull Fork Road, and Styx Hill Road.
- HENRY remains GPS-only. Its current exact record contains contradictory `US-70` / `OH-1` sequence tokens and therefore cannot receive an exact-record reviewed handoff in this batch.

## Authority result

- Six pads move from GPS-only action to exact-record reviewed Google handoff.
- All six remain `reviewed_handoff_authority_held` for graph/public-Google authority.
- Saved pad destinations remain saved GPS evidence, not verified entrances or approved lease geometry.
- Existing released/approved routes continue to outrank these reviewed handoffs.
- Public Google publication: unchanged.
- Cutover: unchanged/off.
- Production database writes: zero.
- Migrations: zero.
