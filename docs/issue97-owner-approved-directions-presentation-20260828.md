# Issue #97 — owner-approved directions presentation (2026-08-28)

## Decision

The owner explicitly approved the 46 current exact-record reviewed Google handoffs for driver use. V18 may present those links as **Owner-approved directions** and show their stored sequence as numbered direction steps.

This approval is narrower than Cologie's released exact-graph route. It does not create graph geometry, a public-Google release, an approved-road overlay, or a teal route line. The existing destination, waypoint order, and Google URL for every pad remain unchanged.

## Evidence split

Twenty-eight handoffs already have exact named-road identity and junction evidence:

LAWSON, BILINOVICH, BEETLE, DUKE, BAKOS, BANNOCK, GIL, GILCHER, CIRCLE-OAKS, SADLER, TOWE, DUTTON, KUNGLE B, TRUCHAN NW, MOONSTONE, JEFFCO, KUNGLE A, TRUCHAN NE, LORRAINE, PANG, HASTINGS, WHEELING VALLEY, ECHO, NORTH STAR, LODESTAR, WINSTON SMITH, BRAVO, and PICKENS.

Eighteen handoffs have exact pad/revision/destination/URL binding and validated Google turn-list evidence, while their complete exact road-identity receipt remains pending:

PORTERFIELD GAS UNIT, PORTERFIELD B, ROCK RIDGE, CROWIE, CASTON, LAKE, THOMAS, TROYER, MATUSEK, JACKALOPE, LODGE, ALBATROSS, MALDON, WITHEY, SKULL FORK, HOOP, RUTH, and ATHENA.

Both groups may display **Owner-approved directions**. Only the first group may say its named-road identities are exact. Neither group receives graph/public-Google/overlay authority from this presentation receipt.

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
- Existing higher-priority released routes and named approaches continue to outrank static reviewed handoffs.

## Authority and mutation boundary

- Production database writes: zero.
- Migrations and graph rebuilds: zero.
- New public-Google rows: zero; the existing Cologie baseline is unchanged.
- Cutover change: zero.
- Google Maps API key use: zero.
- No static reviewed handoff is injected into the public company-road or owner-road geometry overlays.
