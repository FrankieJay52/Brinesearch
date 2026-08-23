# BrineSearch V18 map-first release

V18 is the mobile-first public driver and owner experience. Its production
build is scoped to `/v18/`, including its web-app manifest and service worker,
and every main or legacy BrineSearch entry point redirects there. V17 pages and
runtime assets are not included in either production deployment.

## Product shape

- **Map** is the default screen and uses OpenFreeMap only as a basemap renderer.
- **Search** shares one deterministic directory and ranking contract with Map.
- **Saved** shows favorites, recent locations, and the complete directory source
  available on this device. Individual saved route/detail downloads are a later
  release and are not claimed by this release.
- **More** contains personal Settings plus the native V18 Field Updates and
  Control Center pages.
- **Control Center** opens the native V18 owner sign-in and exact read-only road
  map. A link never grants owner access; the server-backed role check remains
  authoritative.
- The pad screen always separates route source, road-graph state, and public
  Google availability.

Google is renderer-only. An approved Google action is built exclusively from a
current public BrineSearch manifest. A destination pin is labeled separately
and requires a validated `driver_entrance`; null, partial, invalid, or `0,0`
coordinates never enable navigation.

## Data boundaries

- Live directory pages are immutable and pinned to one snapshot ID.
- A failed or mixed page set is discarded as a whole.
- Device cache activation is atomic and its rows are checked with a device
  SHA-256 before reuse.
- The packaged fallback is a generated allowlist. Raw research, audit,
  submitter, provenance, internal route fields, and legacy written directions
  are not bundled. Written directions remain unavailable until a separately
  reviewed public-safe projection exists.
- Exact route cards and geometry come from the Issue #97 occurrence,
  transition, and geometry receipts—not from legacy pad route snapshots.
- Shared-road and name-change presentation requires explicit graph receipts;
  names, aliases, or proximity never create those semantics.
- Identity merges and tombstones are not projected in this release. A live
  directory is accepted only when `identityEventCount` is zero; fallback rows
  remain non-authoritative for route navigation. A safe public identity-state
  projection and offline reconciliation are required before V18 can support a
  release containing merges or deletions.

## Local verification

From this directory:

```text
npm ci
npm run verify
npm run build
npm run dev
```

`npm run verify` checks the fallback artifact, the driver directory/status and
company-road SQL/static contracts, TypeScript, and unit tests. The production
build is written to `../dist-v18`.

## Release gates

The migration at
`../supabase/migrations/20260823002719_v18_driver_directory_status_contract.sql`
and the company-road overlay migration at
`../supabase/migrations/20260823002729_v18_public_company_road_overlay_contract.sql`
passed their SQL contract tests on the production schema inside rollback-only
transactions and were installed as the exact production migration receipts in
their filenames. The covering-index migration is
`../supabase/migrations/20260823003031_v18_overlay_foreign_key_indexes.sql`.
The company overlay installs empty and fail-closed; populating it still requires
its dedicated owner-approved public-overlay release authority. Netlify and
GitHub Pages publish only V18 runtime files. Netlify redirects `/`,
`/index.html`, the former root manifest, and `/v17/*` to V18. Its minimal root
retirement worker deletes V17 caches and moves installed old clients to V18
while leaving the `/v18/` service-worker scope untouched.

Historical source and database evidence remain in the repository only to
preserve reviewed road, map, graph, and migration provenance. Root commands and
continuous-integration workflows neither execute nor publish the retired app.
