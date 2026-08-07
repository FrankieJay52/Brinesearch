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
