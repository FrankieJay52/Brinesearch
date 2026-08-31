# Issue #97 — owner-approved directions presentation (2026-08-28)

> **Current everyday rule:** This evidence receipt is preserved, but its old
> graph-evidence split is not a driver grade. The current universal contract is
> [`V18_NAMED_ROAD_NAVIGATION_CONTRACT.md`](V18_NAMED_ROAD_NAVIGATION_CONTRACT.md).
> A working reviewed named-road handoff may provide Navigate and a display-only
> teal highlight without State-1 receipts. State-1 promotion remains separate.

## Decision

The owner explicitly approved 46 exact-record reviewed Google handoffs for
driver use. Together with the 9 existing database releases, they remain the
exact frozen 55-entry Ascent display catalog. Twenty-two additional exact-record
reviewed handoffs remain outside that owner-approved set. Six—HELLER, JENNINGS,
KEMPER, RED-HILL-FARM, AXLE, and KALDOR—use existing batch-2 terminal-highway
evidence. Six—RICHLAND B, LAVADA, WAMPUM, SLABAUGH, RECTOR-C, and TARPLEY—use
separate two-direction Google and satellite-reviewed controls. Ten—ALABASTER,
COOK, SIDWELL, DONNA, CECELIA, DICKSON, SHUTWAY, CARLOS, CRAVAT NORTH, and
KURTH—use the same exact-record, opposite-direction, and satellite gate.
Together they bring the current navigation count to **77**, with **170 pads
still GPS-only**. Those twenty-two do not inherit an owner-approval receipt and must not be presented as
**Owner-approved directions**.

This approval does not create graph geometry, a public-Google release, or an approved-road overlay. Cologie is the first working example, not a higher grade. A separately verified named-road highlight is display only and creates none of those authorities. The existing destination, waypoint order, and Google URL for every working pad remain unchanged unless evidence proves that Google uses the wrong road.

## Evidence split

Twenty-eight handoffs already have exact named-road identity and junction evidence:

LAWSON, BILINOVICH, BEETLE, DUKE, BAKOS, BANNOCK, GIL, GILCHER, CIRCLE-OAKS, SADLER, TOWE, DUTTON, KUNGLE B, TRUCHAN NW, MOONSTONE, JEFFCO, KUNGLE A, TRUCHAN NE, LORRAINE, PANG, HASTINGS, WHEELING VALLEY, ECHO, NORTH STAR, LODESTAR, WINSTON SMITH, BRAVO, and PICKENS.

Eighteen handoffs have exact pad/revision/destination/URL binding and validated Google turn-list evidence, while their complete exact road-identity receipt remains pending:

PORTERFIELD GAS UNIT, PORTERFIELD B, ROCK RIDGE, CROWIE, CASTON, LAKE, THOMAS, TROYER, MATUSEK, JACKALOPE, LODGE, ALBATROSS, MALDON, WITHEY, SKULL FORK, HOOP, RUTH, and ATHENA.

Both groups may display **Owner-approved directions** under the same everyday driver rule. The evidence description may still distinguish exact identities from a validated Google handoff, but that distinction does not withhold Navigate. One build-time catalog covers the frozen 55-entry display set: it reuses existing exact public graph geometry where present and performs offline routed reconstruction through frozen destinations and ordered controls for the remaining static reviewed contracts. It does not modify or replace any frozen Google URL, destination, or waypoint.

HELLER, JENNINGS, KEMPER, RED-HILL-FARM, AXLE, KALDOR, RICHLAND B, LAVADA,
WAMPUM, SLABAUGH, RECTOR-C, TARPLEY, ALABASTER, COOK, SIDWELL, DONNA,
CECELIA, DICKSON, SHUTWAY, CARLOS, CRAVAT NORTH, and KURTH are a separate
reviewed-handoff group. Their
phone-origin Google links are exact-record-bound, but no row was
added to the 46 owner-approval receipts and no row was added to the frozen
55-entry static display catalog. Their map presentation continues to come from
the existing batch-2 record: exact ordered terminal-highway geometry may be
teal, while any post-receipt mapped remainder and the separate GPS/access tether
remain solid neutral, unapproved, excluded from route authority, and explicitly
not navigation geometry.

The catalog's routable named-road portion is solid teal and display only. When a routable network line stops short of the frozen GPS, an optional thin solid neutral `unapproved_gps_tether` may reach the destination without asserting a road name, lease shape, or approval. In the current batch, 31 reconstructed handoffs stay solid through the network endpoint, 13 stop at the first unreviewed step and continue with solid neutral unapproved geometry, and BEETLE fails closed with no visible false-teal line because its candidate path left the reviewed road order. Exact database and frozen geometries are outside those reconstruction counts. All 55 entries persist on the All map and Ascent filter and brighten on selection; other-company and disposal-only filters hide them. BANNOCK's separately proved exit is the only red continuation. Red beyond any other final pad remains held unless exact no-downstream-pad proof and exact geometry to the next highway junction are supplied. Interstate, U.S., and state routes are never red. None of these displays creates graph, public-Google, or approved-road-overlay authority.

Each approval is frozen to the complete reviewed contract content: exact pad and legacy identities, record revision, company/county/name, saved structured sequence, trusted destination source and coordinates, action destination, waypoint order, Google URL, driver-facing sequence, and final-leg warning. The build-time display catalog consumes those immutable values; it cannot rewrite them. Any later change fails closed and removes the owner-approved presentation until a new receipt is explicitly reviewed.

## Separate remaining-pad approach evidence

The additive batch-2 highway-to-pad catalog is not itself part of the 46
owner-approved Google handoffs or the 9 database releases. It still covers 192
Ascent records as separate field display and direction evidence. Twenty-two of
those records correspond to additional reviewed handoffs. Six remain
cross-bound to terminal-highway evidence for HELLER, JENNINGS, KEMPER,
RED-HILL-FARM, AXLE, and KALDOR. The records for RICHLAND B, LAVADA, WAMPUM,
SLABAUGH, RECTOR-C, TARPLEY, ALABASTER, COOK, SIDWELL, DONNA, CECELIA,
DICKSON, SHUTWAY, CARLOS, CRAVAT NORTH, and KURTH remain display-only evidence
separate from their reviewed Navigate controls. The other **170 remain GPS-only
for navigation**. The
original 55-record catalog, 46 owner receipts, URLs, controls,
receipt hashes, database releases, and parked states remain unchanged.

Every batch-2 record is limited to the last Interstate, U.S., or state highway
whose road identity is exact in its stored ordered sequence, through the pad's
exact frozen GPS. Exact road identity and start-coordinate authority stay
separate. Of the 111 displayed approaches, 32 start at a stored exact
highway-to-next-road intersection. The other 79 use a build-time
nearest-highway candidate that passed the bounded 100-metre snap gate. That
candidate is a routing/display seed, not an approved or exact intersection,
handoff, road identity, or public route. Neither start mode stores the trip from
the phone to that highway. Each routed section retains its raw distance in
metres so the bounded approach can present measured step-by-step directions.
Those measurements describe the routed sections only; they do not approve the
roads or convert source prose into geometry.

A matching route number, normalized name, or alias alone never establishes the
highway. Every displayed start must bind to the exact master `roadId` for the
record's last highway and must be within 25 air miles of that pad's frozen GPS.
Fuzzy, nearest-road, name-only, and unanchored master-road matching are rejected.
The bounded nearest-highway candidate mode finds a point only on a highway whose
master identity is already exact; proximity cannot choose or create the road
identity.

The exact road-identity or exact-alias-matched prefix may be solid teal. At the
first mismatch, unresolved identity, private road, lease, or other unreviewed
movement, the rest of the routed approach remains visible as solid neutral,
unapproved access geometry and teal cannot resume. A truly unnamed first
mismatch is labeled `Unnamed / unapproved access`; named identity mismatches
and later unverified sections are labeled `Unverified / unapproved access`.
Any separate straight tether from the routed endpoint to the frozen GPS is
solid neutral destination context, is
not road or navigation geometry, and is excluded from the section and total
approach mileage.

For the measured Ascent approach catalog, a sealed graph-evidence receipt may
split the preserved routed line into exact authoritative road runs. Exact graph
names and measured run mileage remain visible after the first source-order gap,
but those later runs stay solid neutral and explicitly unapproved. Teal requires
both the exact graph identity and the uninterrupted exact stored source-step
`roadId` binding. A graph-only name never promotes a route, never changes the
Google handoff, and never resumes teal after the first gap.

Missing exact highway identity, no bounded start candidate, failed routing, or
stale record binding fails that record closed to its frozen pin. Pin-only
records have no teal, no fabricated turn, no straight-line mileage, and no
borrowed road tail. A successful bounded route with no sealed graph receipt or
no ordered exact prefix is retained as measured solid-neutral geometry with no
teal authority; any router-reported names remain graph-unverified. Batch-2
evidence does not mint a Google route, public-road identity, graph occurrence,
approved overlay, State-1 grade, or owner release.
The fixed evidence file records 111 routed displays, zero internally rejected
successful routes, and 81 direct pin-only results. Ninety-five displays have
sealed graph receipts; 16 successful no-receipt routes remain visible as solid
neutral. CENA, NOELLE, ROXY, SPORT, and TANNER are five of the pin-only results
because their proposed starts were more than 25 air miles from their frozen GPS.
The farthest retained display start is 14.306095 air miles from its destination.
All 111 successful routed results retain their candidate start, road geometry,
measured sections, GPS tether, directions, and mileage. Only the 81 pin-only
records omit route evidence from the driver presentation.

## Driver presentation

- The fixed and map-card action remains one button labelled `GET DIRECTIONS`.
- The saved reviewed sequence is shown as numbered items without inventing left/right, mileage, or geometry.
- The route card distinguishes exact named-road evidence from validated Google-handoff evidence.
- The route-status panel keeps route/graph/public-Google authority separate.
- A reviewed GPS/private tail remains explicitly unapproved where the existing record says so.

## Frozen behavior

- Cologie remains unchanged.
- BILINOVICH remains the no-Blaze McCoy → Merry → Penrose → Logan → Turkle route with its separately reviewed ODNR pad-surface action destination.
- Skull Fork remains Cadiz Road / US-22 → Repik Lane / TR-9876 → its exact trusted pin. Its URL, destination, and turn control are unchanged.
- ROCK RIDGE displays the current official sequence Fairview Rd → Douglass Rd → Pultney Ridge Rd without changing its URL or turn controls.
- CROWIE explicitly ends named-road authority on Williams Road and labels the remaining movement as an unapproved access / GPS handoff without changing its URL or destination.
- Existing working destinations, waypoint order, and Google URLs remain byte-stable. A released route does not replace a working reviewed handoff merely to make another pad resemble Cologie; a handoff changes only when evidence proves it uses the wrong road.

## Authority and mutation boundary

- Production database writes: zero.
- Migrations and graph rebuilds: zero.
- New public-Google rows: zero; the existing Cologie baseline is unchanged.
- Cutover change: zero.
- Google Maps API key use: zero.
- Browser route-service calls and browser coordinate hashing: zero. Catalog routing and validation finish before the app build.
- No static reviewed handoff or batch-2 highway-to-pad approach is injected into the authoritative public company-road or owner-road geometry overlays. The separate 55-pad display catalog and the additive 192-pad approach catalog are presentation only. The persistent released company-road overlay remains a different authority and may be shown for all available companies or separated by one exact company; it is never inferred from these handoffs.
