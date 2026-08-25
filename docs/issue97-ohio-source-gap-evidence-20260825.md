# Issue #97 Ohio source-gap evidence — 2026-08-25

This checkpoint is read-only evidence for the current V18 Ohio pad directory.
It does not approve, reconcile, activate, rebuild, publish, or edit any pad,
direction, route, graph, Google output, or cutover state.

## Pinned source

- Current directory snapshot: `586344d2-7118-4f61-b6bc-98a97a690fd1`
- Source revision: `5`
- Snapshot SHA-256: `4de973d403e4d4413d83eb90dd6a3816538bfa58d02c14e55b60609505839e2b`
- Ohio pad rows: `926`

## Exact coordinate result

- Verified driver entrances already present: `714`
- Pads missing a verified driver entrance: `212`
- Exact reviewed official pad references: `64`
- Exact official API/wellhead references used only when no eligible pad
  reference exists: `85`
- Safe display-only references: `149`
- Pads still lacking any exact safe map reference: `63`
- Duplicate reference assignments: `0`
- Reference-set SHA-256:
  `9e9220e0e6fbb9eae45555f09704c1846ef763549464730a3a44dcc9e8567792`

The 149 references can raise map visibility from 714 to 863 Ohio pads. They
remain display-only. They are not driver entrances and cannot supply a route
endpoint, route step, route geometry, graph approval, or Google destination.

Official pad references require one of these reviewed recommendation classes:

- `official_pad_layer`
- `normalized_existing_pad_attachment`
- `corrected_exact_api_pad_match`

Official wellhead references require an exact 14-digit API plus one of the
explicit API-backed verification methods listed in the companion SQL. A single
wellhead is selected deterministically by API and coordinate order. No centroid,
nearest point, fuzzy name, road inference, or manufactured coordinate is used.

The `44` name-only official-pad candidates are excluded. Retired copied points,
conflict/insufficient-evidence candidates, unaudited candidates, and invalid or
out-of-area coordinates are excluded. The remaining 63 pads stay unmapped.

## Direction and road-sequence gaps

- Reviewed public directions present: `856`; missing: `70`
- Structured road sequence present: `858`; missing: `68`
- Of the 70 public-direction gaps, `49` have an explicit
  `field_or_dispatch_route_required` exception.
- Raw or legacy prose is not promoted into the reviewed public projection.
- Missing structured sequences are not manufactured from prose.

Reproduce the counts with
`ops/issue97-computer-rollout/sql/47-ohio-source-gap-evidence.sql`.

## Production execution

- Starting `main`: `4f3cb4c1f60831672deb6f6940df0f84105e386e`
- Starting tree: `0cfaf09ab69f302809850daea6cf99cde99d9925`
- Migration: `20260825081500_v18_public_pad_reference_coordinates.sql`
- Corrected migration SHA-256:
  `b7c22eb048dd80f19f12670c29a41ea1c85dce77c4f654514fbc308446a1d4c7`

The first authorized rehearsal did not execute the migration. PostgreSQL
returned `SQLSTATE 42601` at the CTE name `references`, which is reserved
syntax. The open transaction was explicitly rolled back and a single
read-only persisted-state inspection proved that the function and migration
receipt were absent and every protected digest still matched the preflight.
There was no automatic retry.

After explicit authorization, the only correction renamed that CTE to
`reference_rows`. The one corrected rollback-only rehearsal then passed:

- transaction-local function definition MD5:
  `77e567a85ef748a21da8959054cd6e4f`
- exact payload: `149` rows (`64` official pad, `85` official wellhead)
- exact payload SHA-256:
  `9e9220e0e6fbb9eae45555f09704c1846ef763549464730a3a44dcc9e8567792`
- expected execute ACL: owner, `anon`, `authenticated`, and `service_role`;
  no implicit `PUBLIC` execute
- explicit rollback completed
- post-rollback function: absent
- post-rollback migration receipt: absent
- persistent delta: zero

The permanent installation then applied that exact passed migration once and
committed it with its migration receipt:

- function OID: `4210032`
- function definition MD5: `77e567a85ef748a21da8959054cd6e4f`
- migration receipt count: `1`
- migration statement MD5: `1e47ae15598f07a12145a21ccf365bea`
- permanent payload: `149` rows (`64` official pad, `85` official wellhead)
- public Google rows: `0`
- cutover timestamp: `null`
- current company-road overlay: `10` rows, snapshot
  `44be7249-711f-4ae3-a44f-c5f27e7658d8`, SHA-256
  `b3a67f64355cb412a657eae5c1650a61580946227e850e1ea9206ea302d63f8b`

Protected data was byte-for-byte stable across rehearsal and permanent apply:

- pads MD5: `6670b55572e446504a65056d9420de8c`
- reviewed directions MD5: `7c31ba793ff44c7bd44462239fb5ad6a`
- route-prep MD5: `2eca6b1c43bfa8a3cdd00f0e572d7efd`
- route-step MD5: `938f0602d119df89182f1ae61a9f7e7e`
- graph-build MD5: `1fe95d415ed91aba9568257bdf5f9bab`
- private Google MD5: `7e6d98519345b9d4f41d91d60633f002`
- company-road overlay-row MD5: `be8f24ec27137f625ab7c3b3328d0489`

An anonymous production REST readback returned HTTP `200`, the exact counts
and content hash above, and only these row keys: `padId`, `referenceKind`,
`latitude`, and `longitude`. No direction, route, geometry, road, well, API,
property, address, company, operator, name, or note field was present.

Supabase's performance advisor reported no advisory for the new function. Its
security advisor reported the expected anonymous/authenticated
`SECURITY DEFINER` executable warnings. Those grants are intentional for this
public-safe display projection; the function has an empty `search_path`, fully
qualified dependencies, bounded timeouts, an exact response allowlist, and no
implicit `PUBLIC` execute grant.

## Local release gates

- V18 verification: `32` test files and `171` tests passed
- TypeScript typecheck: passed
- fallback, driver-directory/status, company-road, and owner-road authority
  audits: passed
- production runtime audit: passed
- production assembly: passed as V18-only; every V17 page/runtime asset absent
- dependency audit: `0` vulnerabilities
- `git diff --check`: passed
