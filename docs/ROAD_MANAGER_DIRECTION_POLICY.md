# Road Manager Direction Readiness Policy

The everyday V18 driver law is
[`V18_NAMED_ROAD_NAVIGATION_CONTRACT.md`](V18_NAMED_ROAD_NAVIGATION_CONTRACT.md).
It applies equally to every pad: a working Google link that preserves the
verified directed named roads in order to the trusted pin is done. Cologie is an
example, not a higher grade.

## Non-negotiable rule

BrineSearch never guesses a local-road route.

- Existing written directions may be matched to official road geometry, measured, and reversed from the saved pad GPS.
- Ambiguous or missing local-road sequences are marked **Blocked — No Guess**.
- A clearly labeled estimate is allowed only when official road geometry proves the pad sits directly on an interstate, U.S. route, or state route.
- A state-route estimate remains inside Road Manager and never becomes live Pad directions until the Owner reviews it.
- No background process automatically changes `directions_clear`.

## Future State-1 promotion workflow

This graph-authority workflow is parked. It is not a prerequisite for an
everyday Navigate action or named-road display highlight, and it is used only
after an explicit `PROMOTE <PAD NAME> TO STATE 1` instruction.

1. Queue pads that have GPS and a structured road sequence.
2. Match every named road to an official source or an Owner-confirmed master-road record.
3. Measure from the pad GPS outward to the first approved highway.
4. Reverse the segment order and turns for inbound directions.
5. Place the result in Owner review.
6. Publish only after Owner approval; retain the evidence and field-confirmation status.

The database enforces the state-route-only estimate exception and rejects estimated local-road segments.

## Everyday current-location Google handoff standard

This handoff makes a verified directed named-road sequence usable from the
driver's current phone location without turning it into graph, road, or
public-Google authority.

1. Bind the candidate to the exact pad UUID, canonical/legacy IDs, record
   revision, company, name, state, county, stored road sequence, trusted
   coordinate, and coordinate source. Any drift removes the candidate.
2. Treat the explicitly sourced saved coordinate as the destination. Use an
   ODNR destination only when it is already frozen for that exact pad. Keep the
   coordinate's real role visible; a pad/well point is not silently promoted to
   a public-road entrance or required to sit on the visible white pad deck.
3. Use only the pad's verified directed interstate, U.S., state, county, and
   township roads, in order, to the trusted pin. A nearby town may be displayed
   as a reference; it is not a fixed Google origin.
4. Omit `origin` from the Google URL so the phone supplies the driver's current
   location. Require HTTPS, `api=1`, driving mode, and navigate action.
5. Put shaping points just inside the verified named roads after their turns.
   Do not put the first control beyond a state-road turn in a way that forces a
   driver approaching from the other direction to pass the turn and backtrack.
6. Use the minimum ordered controls needed for Google to keep every required
   named-road turn. Never reorder or optimize them. Preserve an already-working
   URL byte-for-byte unless evidence proves that it takes the wrong road.
7. A shaping point controls the renderer. It does not approve a road, create
   graph geometry, verify a lease road, or authorize travel beyond the pad's
   own destination.
8. Reuse a proven shared trunk only when every shared turn is exact. Each pad
   keeps its own final turn and destination and clips at that pad.
9. Independently route-check the ordered controls and visually inspect Google
   for backtracking, skipped roads, wrong-side approaches, and shortcuts before
   deployment. Until then, the link remains a candidate.
10. Success means Google stays on the directed named roads in order and then
    reaches the pin. A different road before that sequence ends is failure. An
    unnamed lease or dirt tail is allowed only after the final named road; do
    not name or approve it.
11. Show one driver Navigate button. Written directions remain text and do not
    become geometry.
12. Highlight every supplied, separately reviewed named-road geometry feature
    in bright teal, even while graph, State-1, or public-Google authority is
    held. A pad-bound arrival may remain visible on All routes and its exact
    company filter only when it is bound to the exact current pad record and its
    final coordinate exactly equals that pad's saved GPS. Selecting the pad
    brightens the same geometry. A partial or handoff display stays
    selection-only and stops at its proved endpoint. With no verified named
    sequence, no supplied geometry, record drift, or an endpoint mismatch, show
    that pad's pin only and draw no substitute pad route from text, controls,
    whole roads, basemap classes, or nearest-road results. The independent exact
    released approved-road network remains teal and may be separated by company
    or shown as All approved routes; it is never attributed to a selected pad.
    After the final pad on an exactly identified county, township, or local road,
    show the remaining road in red only when exact corridor evidence proves no
    farther pad exists and the geometry ends at the next Interstate, U.S., or
    state-highway junction. Interstate, U.S., and state routes are always teal.
    Missing downstream-pad or junction proof means no red. Red is field
    orientation only, not a closure, approval, or inferred road.
13. The map may add a thin, connected highway-reference layer from the loaded
    OpenFreeMap Liberty vector basemap only when its structured `network`
    identity is exactly `us-interstate`, `us-highway`, or `us-state`. This is
    public basemap context, not an approved BrineSearch route: never match by
    road name, never turn it into Navigate geometry, and fail closed when the
    Liberty source/layer contract is absent. Clip that presentation layer to
    the repository's 39 confirmed pad counties using the compact U.S. Census
    Bureau 2025 1:20m county boundary union. Dissolve shared county borders so
    through-highways remain connected; do not render it statewide. Draw
    exact released approved roads in stronger teal above it, exact GPS-reaching
    pad arrivals above that network, and the selected pad's separately reviewed
    display brightest above both.
14. Publishing this client-side handoff never changes graph activation, route
    approval, the public-Google table, or cutover state.
