# Road Manager Direction Readiness Policy

## Non-negotiable rule

BrineSearch never guesses a local-road route.

- Existing written directions may be matched to official road geometry, measured, and reversed from the saved pad GPS.
- Ambiguous or missing local-road sequences are marked **Blocked — No Guess**.
- A clearly labeled estimate is allowed only when official road geometry proves the pad sits directly on an interstate, U.S. route, or state route.
- A state-route estimate remains inside Road Manager and never becomes live Pad directions until the Owner reviews it.
- No background process automatically changes `directions_clear`.

## Road Manager workflow

1. Queue pads that have GPS and a structured road sequence.
2. Match every named road to an official source or an Owner-confirmed master-road record.
3. Measure from the pad GPS outward to the first approved highway.
4. Reverse the segment order and turns for inbound directions.
5. Place the result in Owner review.
6. Publish only after Owner approval; retain the evidence and field-confirmation status.

The database enforces the state-route-only estimate exception and rejects estimated local-road segments.

## Current-location Google handoff standard

This handoff makes a reviewed local-road sequence usable from the driver's
current phone location without turning it into graph or public-Google authority.

1. Bind the candidate to the exact pad UUID, canonical/legacy IDs, record
   revision, company, name, state, county, stored road sequence, trusted
   coordinate, and coordinate source. Any drift removes the candidate.
2. Treat the explicitly sourced saved coordinate as the destination. Keep its
   real role visible: verified entrance, saved pad reference, official pad
   reference, or official wellhead reference. A pad/well point is not silently
   promoted to a public-road entrance.
3. Work backward only through the pad's reviewed named local-road sequence to
   the first proven connected state, U.S., or interstate road. A nearby town
   may be displayed as a reference; it is not a fixed Google origin.
4. Omit `origin` from the Google URL so the phone supplies the driver's current
   location. Require HTTPS, `api=1`, driving mode, and navigate action.
5. Put shaping points just inside the reviewed local roads after their turns.
   Do not put the first control beyond a state-road turn in a way that forces a
   driver approaching from the other direction to pass the turn and backtrack.
6. Use at most three ordered mobile waypoints. Split a longer route only at a
   reviewed continuous handoff; never drop a required local-road turn.
7. A shaping point controls the renderer. It does not approve a road, create
   graph geometry, verify a lease road, or authorize travel beyond the pad's
   own destination.
8. Reuse a proven shared trunk only when every shared turn is exact. Each pad
   keeps its own final turn and destination and clips at that pad.
9. Independently route-check the ordered controls and visually inspect Google
   for backtracking, skipped roads, wrong-side approaches, and shortcuts before
   deployment. Until then, the link remains a candidate.
10. Publishing this client-side handoff never changes graph activation, route
    approval, the public-Google table, or cutover state.
