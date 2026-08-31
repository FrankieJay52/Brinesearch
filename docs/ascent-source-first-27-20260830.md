# Ascent source-first 27 checkpoint

This Draft-PR package starts from main `4bfba0d2a07e2c7318c1227743c5765e6dce9094`
(tree `5aff08bc0e9210137f3f890c507e9efe45523350`). It reuses the read-only
247-pad source-first audit and keeps the audited source order:

1. `directions_clear` is the primary route source.
2. `written_directions` is fallback only.
3. `structured_road_sequence` is historical/conflict evidence only.

The checked-in package is
`v18/scripts/fixtures/ascent-source-first-27-20260830.json`. It exact-binds all
27 scoped pads by UUID, current revision, saved GPS, cleaned source bytes, road
order, current evidence, and blocker. It does not turn source text into identity,
geometry, graph, Google, route, or teal authority.

Normalized package SHA-256:
`022b614e3a0e1b0c8b3e4e6c156ac0d07e9b8606c77e2ffbe81fd6ee6591c1ea`.

## Current disposition

| Disposition | Pads | Result in this checkpoint |
| --- | --- | --- |
| Google QA pending | SHUTWAY, VANNELLE | Candidate phone-origin URLs are exact-record and frozen-evidence bound. Both remain `GPS_ONLY` until two-origin Google QA proves the cleaned road order. |
| Exact identity adoption prepared, unapplied | BELLA | Airport Rd / CR-38 can be adopted from one exact current ODOT identity. The migration remains unapplied and explicitly requires later graph/overlay reconciliation. |
| Source-first occurrence checkpoint prepared, unapplied | HOWELL | A private checkpoint proves current SR-151/SR-152 evidence without promoting the legacy-bound display receipt. Its authoritative SR-152 clip is computed only during an authorized migration phase. |
| Held: identity evidence insufficient | OLIVER, RABER, BEACON, PATRIOT | No name-only, nearest-road, fuzzy, or borrowed BELLA identity is permitted. |
| Held: occurrence/junction evidence insufficient | BEDWAY, BLAYNEY, BOROVICH, COLEMAN, EUREKA, PREMIERE, SIDWELL, THREE DADS, BETTS, GINGERICH, LEILA, ALPHA, PACKER, SHERWOOD, CECELIA, CERMAK, DARROW, PIERGALLINI, BILLY SHERMAN | Existing identities/display lines do not prove the exact cleaned pad-bound transition chain. |

The exact per-pad blocker is retained in the package fixture. In particular:

- BOROVICH does not import its legacy-only OH-1/OH-800/OH-145/Main/North/
  Belmont/OH-148 alternatives.
- BETTS does not import legacy-only Skullfork or Styx Hill.
- VANNELLE treats Shepherdstown Rd / CR-64 as proximity wording; it is not a
  required cleaned-route turn.
- BEACON cannot borrow BELLA's Airport Rd identity.
- HOWELL's prior Batch-2 receipt is bound to the older legacy sequence. Its
  SR-151 and SR-152 sections are `graph_named_only`, not cleaned-order route
  authority. The stored 3.488 miles remains baseline display evidence only.

## Unapplied SQL

- `20260830083409_ascent_source_first_bella_airport_identity.sql` prepares one
  exact ODOT identity, one Road Manager mapping, and BELLA's exact route-prep
  identity binding. It creates no occurrence, graph, Google, route, or teal
  authority. Applying it later will stale the Harrison mapping fingerprint and
  requires a separately authorized graph/overlay reconciliation.
  Normalized SHA-256:
  `9c53f20bcd5204b2a8d160bcdf54f3f9dbf1eb7f22c97241f2153a153d58ef5d`.
- `20260830083415_ascent_source_first_howell_occurrence_checkpoint.sql` creates
  one private, RLS-forced, non-runtime checkpoint. It leaves formal occurrence,
  transition, and geometry receipts byte-stable and keeps HOWELL `GPS_ONLY`.
  Normalized SHA-256:
  `dd1383cae3d98028da365bc4406f6b1161fc4b7e2a840d8d9db2838a0a78bc75`.

Neither migration is applied by this package.

## Accounting

Baseline accounting remains **61 DONE / 186 GPS_ONLY / 247 total**. Repository
preparation alone changes no production status.

- If SHUTWAY alone passes both Google origins and is later frozen, projected
  accounting is **62 DONE / 185 GPS_ONLY**.
- If both SHUTWAY and VANNELLE pass and are later frozen, projected accounting
  is **63 DONE / 184 GPS_ONLY**.
- BELLA and HOWELL remain `GPS_ONLY` after their prepared migrations unless
  separately authorized evidence/reconciliation phases complete.

## Safety checkpoint

- Production writes: 0
- Migrations applied: 0
- Road Manager production writes: 0
- Graph rebuilds or activations: 0
- Public Google publications: 0
- New teal authority: 0
- Straight GPS tether promotion: 0
- Cutover changes: 0
- Merges: 0
- Deployments: 0

The frozen 52 pre-existing reviewed navigation contracts are asserted in exact
order and by full-content SHA-256. Any addition, deletion, reorder, URL-byte
change, or contract-content drift fails the targeted checkpoint test.
