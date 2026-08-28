# Issue #97 — Ascent reviewed handoff batch 8 evidence (2026-08-28)

## Scope and authority boundary

This batch adds four exact-record, owner-reviewed Google Maps handoffs: KUNGLE A, TRUCHAN NE, MATUSEK, and LORRAINE. Each handoff keeps the phone's current location as origin, uses one to three reviewed shaping points, and ends at that pad's existing saved reference coordinate.

These are not graph releases, approved public Google rows, verified lease geometry, or verified driver entrances. All four current records have zero structured route steps and structured route revision zero. Their final saved-GPS/access movements remain explicitly unapproved. Production database writes, migrations, public-Google publication, route cutover, embedded Google Maps, and Google Maps API-key use are all zero.

Connectivity below is proven by current-build junction memberships between exact authoritative road identities. Coordinate-to-centerline distances are endpoint context only; they are never used as connectivity or entrance proof.

Current Belmont graph receipt for all four pads:

- Build: `9543e07c-f6eb-4682-a2dd-4d1f961377d5`
- Algorithm: `issue97-authoritative-topology-v2`
- Source revision digest: `47539575759695c086eed36d3d14c4b1`
- Graph digest: `723e33e621bc6b1bc93e0c6fe73a85b2`
- Activated: `2026-08-24T23:53:01.785257Z`

## KUNGLE A

Exact record binding:

- Pad/canonical UUID: `47a0305e-c641-499b-990c-0f7fe83493b8`
- Legacy ID: `ascent--kungle-a`
- Record revision: `1787459253071652`
- Company/state/county/township: Ascent / Ohio / Belmont / YORK
- Raw structured sequence: `OH-2 → OH-872 → OH-7 → OH-148 → Potts Rd → OR → OH-556 → Clover Ridge Rd → OH-148 → Potts Rd → OR → OH-147 → OH-148 → Potts Rd`
- Trusted destination: saved pad reference `39.88507,-80.88258`

Exact road and junction receipts:

- OH-148: identity `36386818-82ec-10ca-71e8-58e1727504c7`, key `OH:ODOT:NLF:SBELSR00148**C`
- Potts Road / TR-506: identity `95895bfe-4bd7-0218-8cf1-342350ccec2c`, key `OH:ODOT:NLF:TBELTR00506**C`
- Verified OH-148/Potts junction: `c220f98b-bb92-0b14-08ec-49de0ac41c40`, physical point `39.8870901,-80.8695418`
- Google-safe point inside exact Potts Road: `39.886820116283,-80.869735364419`

The destination is about 309.214 metres from exact Potts geometry. That measurement does not prove a lease entrance. It is why the final movement stays an unapproved saved-GPS/access handoff.

Current-location handoff:

`https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.88507%2C-80.88258&waypoints=39.886820116283%2C-80.869735364419`

Live Google turn-list QA:

- From Powhatan Point: OH-148 west, left Potts Road, then forward to the exact destination; no pass-and-return or backtrack.
- From Barnesville: OH-800 south, OH-148 east, right Potts Road, then forward to the exact destination; no pass-and-return or backtrack.

## TRUCHAN NE

Exact record binding:

- Pad/canonical UUID: `cd4f6dcc-b603-4155-84b2-30d7ee87bbc7`
- Legacy ID: `ascent--truchan-ne`
- Record revision: `1786258360881449`
- Company/state/county/township: Ascent / Ohio / Belmont / WHEELING
- Raw structured sequence: `I-70 → Exit 216 → OH-9 → Shepherdstown Rd → Fairpoint Shepherdstown Rd → Sloans Run Rd → OR → OH-9 → Shepherdstown Rd → Fairpoint Shepherdstown Rd → Sloans Run Rd`
- Trusted destination: saved pad reference `40.146637,-80.931651`

Exact road identities:

- OH-9: `522b1cb2-67de-1eb0-0f9f-0a087c7fd0d2`, key `OH:ODOT:NLF:SBELSR00009**C`
- Shepherdstown Road / CR-64: `a1151dc7-6a4b-7d65-17e4-02ea0a1e1d1a`, key `OH:ODOT:NLF:CBELCR00064**C`
- Fairpoint-Shepherdstown Road / TR-216: `1d50fe94-4287-57b9-1733-e87d7a1140c6`, key `OH:ODOT:NLF:TBELTR00216**C`
- Main Sloans Run Road / TR-704: `73655b2f-2465-8da8-1bf2-5c6ad39d0f58`, key `OH:ODOT:NLF:TBELTR00704**C`

Current-build junction membership receipts:

- OH-9/CR-64 shared membership: `37ea2057-41f5-6711-a206-118607d92bd4`
- CR-64/TR-216 point membership: `14e5a54d-2423-d340-229a-a2fd9bc313e6`, physical `40.1587016,-80.9439999`
- TR-216/main TR-704 point membership: `0bbbaffa-3422-da74-7b4c-f5ca0dfb9d4f`, physical `40.1465564,-80.9345811`

Ordered Google-safe controls:

1. `40.151952334248,-80.961064815011` — inside exact CR-64
2. `40.15863093394,-80.943718975075` — inside exact TR-216
3. `40.146780343386,-80.934175287918` — inside exact main TR-704 after the verified junction

The destination is about 12.838 metres from exact main Sloans Run geometry. That is endpoint context, not entrance or lease proof.

Current-location handoff:

`https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.146637%2C-80.931651&waypoints=40.151952334248%2C-80.961064815011%7C40.15863093394%2C-80.943718975075%7C40.146780343386%2C-80.934175287918`

Live Google turn-list QA from both Saint Clairsville and Cadiz preserved OH-9 → Shepherdstown → Fairpoint-Shepherdstown → Sloans Run and then clipped at TRUCHAN NE. Neither reviewed origin passed the turn or backtracked. Google's `Shepardstown` spelling is renderer context only.

## MATUSEK

Exact record binding:

- Pad/canonical UUID: `d6d0a0fd-1cd3-48ae-8e41-90d744b9f8f6`
- Legacy ID: `ascent--matusek`
- Record revision: `1786258360881449`
- Company/state/county/township: Ascent / Ohio / Belmont / WHEELING
- Raw structured sequence: `I-70 → OH-9 / Shepherdstown Rd → Fairpoint Shepherdstown Rd → Sloans Run Rd → See Dunn Rd → Lease Road → OR → Dunn Rd`
- Trusted destination: saved pad reference `40.146555,-80.922785`

MATUSEK uses the same exact OH-9 → CR-64 → TR-216 → main TR-704 identities, current-build junction receipts, and three Google-safe controls listed for TRUCHAN NE, then clips at MATUSEK's own saved coordinate. The destination is about 5.633 metres from exact main Sloans Run geometry; that measurement is not entrance proof. Dunn Road is not promoted into exact route geometry from text or Google's renderer label.

Current-location handoff:

`https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.146555%2C-80.922785&waypoints=40.151952334248%2C-80.961064815011%7C40.15863093394%2C-80.943718975075%7C40.146780343386%2C-80.934175287918`

Live Google turn-list QA from both Saint Clairsville and Cadiz preserved the shared corridor, stayed on Sloans Run through the Truchan pads, and then reached MATUSEK without a shortcut or backtrack. Google rendered the destination as `72918 Dunn Rd`; that display text is not promoted to road authority.

## LORRAINE

Exact record binding:

- Pad/canonical UUID: `a35f0ea7-13d7-45dd-8fe2-fe73e4964df2`
- Legacy ID: `ascent--lorraine`
- Record revision: `1786265812046205`
- Company/state/county/township: Ascent / Ohio / Belmont / RICHLAND
- Raw structured sequence: `US-250 → CR-5 / Crescent Rd → CR-10 → CR10 Barton Blaine Rd`
- Trusted destination: saved pad reference `40.09955,-80.840213`

Exact road identities:

- US-250: `ebbc1392-345c-882e-2708-6ecc27a76f3c`, key `OH:ODOT:NLF:SBELUS00250**C`
- CR-5: `d6d42c9f-2edc-fe67-5362-e31fa506097a`, key `OH:ODOT:NLF:CBELCR00005**C`
- CR-10 / Barton-Blaine Road: `e6e4ecc9-d88c-a203-b339-ce748de98c8b`, key `OH:ODOT:NLF:CBELCR00010**C`

Current-build membership receipts:

- US-250/CR-5 point: `cb0b010f-7bbe-41ac-4e9d-48a7a5b7808a`, physical `40.150295,-80.8424401`
- US-250/CR-5 verified shared segment: `38981d72-905a-48ba-6c07-430bfbe39695`
- CR-5/CR-10 verified shared segment: `ba2b02b0-7114-6b5d-6ad5-88a32b4bb817`

Ordered Google-safe controls:

1. `40.149707596819,-80.842549734013` — inside CR-5 after the US-250/CR-5 shared endpoint
2. `40.116658061827,-80.859991873154` — inside CR-10 after the CR-5/CR-10 shared segment
3. `40.101497884455,-80.841503024754` — on CR-10 / Barton-Blaine near the final access

The route does not describe the verified CR-5/CR-10 shared pavement as an invented turn. The destination is about 216.743 metres from exact CR-10 geometry, so its final movement remains an unapproved saved-GPS/access handoff.

Current-location handoff:

`https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.09955%2C-80.840213&waypoints=40.149707596819%2C-80.842549734013%7C40.116658061827%2C-80.859991873154%7C40.101497884455%2C-80.841503024754`

Live Google turn-list QA from both Cadiz and Bridgeport preserved US-250 → Crescent → Barton Crescent → Barton Colerain → right onto Barton-Blaine, then reached the exact destination. Neither approach skipped the right-after-town turn, chose a shortcut, or backtracked.

## Rejected candidate: VANNELLE

VANNELLE remains on the existing exact GPS-only action. With the tempting shared Shepherdstown control, live Google QA turned onto Shepherdstown for 89 feet, then returned to OH-9 and drove to the pin. That explicit pass-and-return/backtrack fails the reviewed-handoff gate. No candidate was added and no route authority was inferred.

Exact excluded record: UUID `ce5d219e-1d2c-47c8-b921-3f2abfe45c5d`, legacy `ascent--vannelle`, revision `1786258360881449`, saved destination `40.14744,-80.961696`.

## Regression boundary

- Existing reviewed handoff URLs and exact bindings remain unchanged.
- The four new records move only from truthful GPS-only navigation to exact-record reviewed Google handoffs; their graph/public-Google authority stays held.
- Every link omits `origin`, so Google uses the phone's current location.
- No link uses the Google Maps JavaScript API or the Netlify `VITE_GOOGLE_MAPS_API_KEY`.
- Public Google baseline remains the existing COLOGIE row; cutover remains off.
- Production reads were read-only. Production writes and migrations were zero.
