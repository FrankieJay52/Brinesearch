# Issue #97 — owner-approved directions presentation (2026-08-28)

> **Current everyday rule:** This evidence receipt is preserved, but its old
> graph-evidence split is not a driver grade. The current universal contract is
> [`V18_NAMED_ROAD_NAVIGATION_CONTRACT.md`](V18_NAMED_ROAD_NAVIGATION_CONTRACT.md).
> A working reviewed named-road handoff may provide Navigate and a display-only
> teal highlight without State-1 receipts. State-1 promotion remains separate.

## Decision

The owner explicitly approved the 46 current exact-record reviewed Google handoffs for driver use. V18 may present those links as **Owner-approved directions** and show their stored sequence as numbered direction steps.

This approval does not create graph geometry, a public-Google release, or an approved-road overlay. Cologie is the first working example, not a higher grade. A separately verified named-road highlight is display only and creates none of those authorities. The existing destination, waypoint order, and Google URL for every working pad remain unchanged unless evidence proves that Google uses the wrong road.

## Evidence split

Twenty-eight handoffs already have exact named-road identity and junction evidence:

LAWSON, BILINOVICH, BEETLE, DUKE, BAKOS, BANNOCK, GIL, GILCHER, CIRCLE-OAKS, SADLER, TOWE, DUTTON, KUNGLE B, TRUCHAN NW, MOONSTONE, JEFFCO, KUNGLE A, TRUCHAN NE, LORRAINE, PANG, HASTINGS, WHEELING VALLEY, ECHO, NORTH STAR, LODESTAR, WINSTON SMITH, BRAVO, and PICKENS.

Eighteen handoffs have exact pad/revision/destination/URL binding and validated Google turn-list evidence, while their complete exact road-identity receipt remains pending:

PORTERFIELD GAS UNIT, PORTERFIELD B, ROCK RIDGE, CROWIE, CASTON, LAKE, THOMAS, TROYER, MATUSEK, JACKALOPE, LODGE, ALBATROSS, MALDON, WITHEY, SKULL FORK, HOOP, RUTH, and ATHENA.

Both groups may display **Owner-approved directions** under the same everyday driver rule. The evidence description may still distinguish exact identities from a validated Google handoff, but that distinction does not withhold Navigate. Every separately supplied pad-bound named-road geometry feature may display in bright teal without a State-1 stamp, but only while that exact pad is selected. A text sequence or Google control-point URL alone is not geometry, so a handoff with no supplied line stays pin-only until its road sections are captured. Neither group receives graph/public-Google/approved-road-overlay authority from this presentation receipt.

Each approval is frozen to the complete reviewed contract content: exact pad and legacy identities, record revision, company/county/name, saved structured sequence, trusted destination source and coordinates, action destination, waypoint order, Google URL, driver-facing sequence, and final-leg warning. Any later change fails closed and removes the owner-approved presentation until a new receipt is explicitly reviewed.

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
- No static reviewed handoff is injected into the authoritative public company-road or owner-road geometry overlays. A separately verified selected-pad highlight remains presentation only. The persistent teal network is the independent exact released company-road overlay and may be shown for all available companies or separated by one exact company; it is never inferred from these handoffs.
