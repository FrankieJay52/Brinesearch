# BrineSearch V17.3.6 — Pad Card Intelligence

## Goal

Make the selected-pad page more useful to a driver without weakening BrineSearch's no-guess road and mileage rules.

V17.3.6 builds on the all-pad route-reference audit already published in V17.3.5. It does not rewrite Clear Directions, pad coordinates, road facts, or saved driver/navigation points.

## Approach Reference improvements

The driver card now explains the route reference instead of showing only an anchor and number.

For usable references it can show:

- the reviewed approach road
- road type: Interstate, U.S. Route, State Route, County Road, Township Road, verified public road, or a verified route/junction reference
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
- compound references such as `US-250 / CR-94 junction` stay a route/junction reference instead of pretending one side of the junction is the only road type

Road Manager type is used for plain named roads after that.

This fixes display problems such as an OH route inherited as an Interstate or a TR road inherited as a State Route without changing the actual audited anchor name.

## Official Public Data card

The Current Pad Snapshot now surfaces more of the safe official record that was already available to the selected-pad page.

When present, the card shows:

- official operator
- official pad name when it differs from the familiar BrineSearch/field name
- official county and township
- official pad permit number
- saved API match count against official records, including review/pending counts when applicable
- official match basis, such as `Exact API plus official pad record` or `Nearby official well plus pad-level match`
- official wells linked, producing/current/permitted counts
- latest public check date and official source

The public-data audit currently shows:

- **1,173** total BrineSearch records
- **845** with an official public pad record
- **845** official records with county
- **588** official records with township
- **258** official pad permits
- **629** official records with a recorded match method
- **214** stored API-verification summaries
- **1,121** records with BrineSearch county data
- **1,096** records with BrineSearch township data

The additional fields are conditional: sparse records do not get empty boxes.

The official name/location can legitimately differ from field naming or a saved driver label. V17.3.6 displays the official record without replacing the familiar pad name, saved navigation point, or driver directions.

## Data guarantees

The V17.3.6 refresh is assertion-gated:

- exactly 1,173 public route-reference rows
- exactly 678 numeric driver distances preserved from the finalized audit
- exactly 317 distance-unavailable records gain a known road anchor, never a generated mileage
- zero stale route-reference rows immediately after refresh
- research-only, no-route, and blocked-conflict records expose no public anchor, mileage, or reference point
- explicit route families are normalized for display; compound junction references remain compound references rather than being mislabeled

Saved mileage ranges and qualified source wording remain ranges/qualified wording; BrineSearch does not invent a midpoint or convert phrases such as `a couple of miles` into a false exact number.

## Production database state

The production Supabase project already contains the two V17.3.6 route-reference migrations:

- `20260808212630_driver_route_reference_v1736`
- `20260808212856_driver_route_reference_kind_guard_v1736`

Post-migration validation shows all 1,173 route-reference rows on source version `20260808-v1736`, all 317 safe mileage-unavailable anchors exposed, and zero stale rows at refresh time.

## Compatibility

V17.3.6 keeps authoritative live Supabase Clear Directions, Road Manager, public-data review, verification, Field Feed, and saved navigation behavior unchanged.

The service-worker cache is bumped so installed iPhones replace the V17.3.5 card code and styles after the production release.
