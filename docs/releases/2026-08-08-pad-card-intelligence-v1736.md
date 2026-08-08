# BrineSearch V17.3.6 — Pad Card Intelligence

## Goal

Make the selected-pad page more useful to a driver without weakening BrineSearch's no-guess road and mileage rules.

V17.3.6 builds on the all-pad route-reference audit already published in V17.3.5. It does not rewrite Clear Directions, pad coordinates, road facts, or saved driver/navigation points.

## Approach Reference improvements

The driver card now explains the route reference instead of showing only an anchor and number.

For usable references it can show:

- the reviewed approach road
- road type: Interstate, U.S. Route, State Route, County Road, Township Road, or verified public road
- mileage or saved qualified wording
- what that mileage means
- the exact safe start/reference point when one was reviewed
- the evidence basis
- the reference update date

The browser also reads the public `is_stale` flag. If the underlying pad route changes after review, the card hides the old mileage and shows that the route reference needs to be refreshed.

## More information on mileage-unavailable pads

The finalized audit contains 319 `distance_unavailable` outcomes. Of those, 317 still have a defensible known approach road; only the remaining mileage is unavailable.

V17.3.5 hid the road together with the unavailable mileage. V17.3.6 safely publishes the known road for those 317 records while continuing to withhold a numeric distance.

Example:

- `FROM OH-146`
- `Mileage not verified`
- `State Route`
- `Known approach road; remaining mileage is not verified`
- optional reviewed departure point such as `Turn from OH-146 onto Old Infirmary Rd`

Research-only nearest highways, no-route records, and route/location conflicts still expose no private candidate road or research distance.

## Road-type audit

A final type audit found stale inherited labels on 45 anchor records. The audited anchor text is now the first authority for explicit route families:

- `I-*` → Interstate
- `US-*` → U.S. Route
- `OH-*`, `WV-*`, `PA-*`, explicit `SR-*` → State Route
- explicit `CR-*` / County Road → County Road
- explicit `TR-*` / Township Road → Township Road

Road Manager type is used for plain named roads after that.

This fixes display problems such as an OH route inherited as an Interstate or a TR road inherited as a State Route without changing the actual audited anchor name.

## Official Public Data card

When the state's official pad name differs from the BrineSearch/field name, the Current Pad Snapshot now shows **Official pad name** beside the legal operator name.

This exposes useful information such as operator unit naming and `fka` former names without changing the familiar driver-facing pad name or navigation point.

The public database currently contains official pad records for 845 pads; 546 of those use an official pad name different from the BrineSearch name.

## Data guarantees

The V17.3.6 refresh is assertion-gated:

- exactly 1,173 public route-reference rows
- exactly 678 numeric driver distances preserved from the finalized audit
- exactly 317 distance-unavailable records gain a known road anchor, never a generated mileage
- zero obvious road-family display mismatches after normalization
- zero stale route-reference rows immediately after refresh
- research-only, no-route, and blocked-conflict records expose no public anchor, mileage, or reference point

Saved mileage ranges and qualified source wording remain ranges/qualified wording; BrineSearch does not invent a midpoint or convert phrases such as `a couple of miles` into a false exact number.

## Compatibility

V17.3.6 keeps authoritative live Supabase Clear Directions, Road Manager, public-data review, verification, Field Feed, and saved navigation behavior unchanged.

The service-worker cache is bumped so installed iPhones replace the V17.3.5 card code and styles after the production release.
