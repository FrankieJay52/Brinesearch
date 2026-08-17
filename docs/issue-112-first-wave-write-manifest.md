# Issue #112 first-wave controlled write manifest

Prepared from current `main` `4066834452e1f79ab5a6da967d2576127cada0a6`. The complete 1,328-page inventory remains the checkpoint at Issue #112 comment `5317266169`; it was not recrawled.

## Decision

The first wave contains three new Ohio pad identities and no updates or disposals:

| Candidate | Proposed change | Independent authoritative basis | Driver-location treatment |
|---|---:|---|---|
| Ascent / EZEKIEL | add pad | ODNR live pad OBJECTID 167 plus exact API 34-013-2-1669-00-00 | address, canonical GPS, property, entrance, and directions held |
| Ascent / LASSO | add pad | ODNR live pad OBJECTID 735 plus exact APIs 34-067-2-1873/1874/1875-00-00 | address, canonical GPS, property, entrance, and directions held |
| Ascent / SHUGERT DADDY | add pad | ODNR live pad OBJECTID 593 plus exact APIs 34-059-2-4314/4334/4335-00-00 | address, canonical GPS, property, entrance, and directions held |

ODNR pad coordinates and wellheads are retained only inside provenance JSON with their precise roles. Canonical `address`, `latitude`, `longitude`, `property_number`, directions, road, route, and graph fields remain null/default. BrinePads contributes discovery URLs and raw-page hashes only; none of its candidate field values are promoted.

Counts: manifest 3; new pads 3; pad updates 0; new disposals 0; disposal updates 0; held records 48. The held set comprises the remaining 43 missing-record candidates plus GAS SEARCH, CLEARWATER 5, PAC, MUD MASTER, and VALLEY GROVE update candidates.

## Before-state and collision expectations

The current production baseline checked 2026-08-17 was 1,174 `public.pads` rows and 1,174 `public.public_pad_detail` rows. All three UUIDs, legacy IDs, same-county exact names, official pad IDs, and seven API numbers were absent. The SQL does not use an upsert: any collision raises and aborts the entire transaction.

The migration takes a transaction-scoped advisory lock, records live pre-counts, requires projection parity, performs exact collision checks, inserts the three rows and their verification states, then verifies the private rows and synchronized public projection. Any failed assertion rolls back the batch.

## Verification and rollback

The companion audit script checks manifest counts, UUID/API uniqueness, provenance roles, held fields, forbidden route/location mutations, SQL guards, and a deterministic forward/rollback count simulation. The rollback artifact refuses to delete unless every target retains the prepared identity/provenance markers, deletes only the three explicit UUIDs, and verifies projection parity.

No production SQL is executed by this preparation branch. Production application remains gated on the requested Grok read-only audit and a fresh before-state/collision recheck.

The exact machine-readable record list, held reasons, evidence URLs, source hashes, and expected fields are in `docs/issue-112-first-wave-write-manifest.json`.
