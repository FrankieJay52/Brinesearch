# BrineSearch V17.3.5 — Verified Road Reference Mileage

## Goal

Give drivers a clean reference such as `OH-800 — 4.5 mi to pad/access` without changing or replacing the saved Clear Directions route.

The reference road is the closest defensible public/truck-used road supported by saved haul directions and official road evidence. A geographically nearby highway is not used unless the route connection is actually supported.

## Full database audit

All **1,173** current BrineSearch pads, facilities and disposals received a final anchor/mileage outcome.

No record remains in `needs measurement`, `needs gap`, or unresolved staging status.

Only **743** reviewed references are driver-safe and published to the public mileage table:

- 677 numeric exact/approximate/measured references
- 53 direct/no-separate-road-mileage references
- 6 records located on the verified anchor road
- 3 saved mileage ranges, preserved as ranges
- 3 qualified text distances/limits
- 1 saved route mile-marker reference

The remaining records stay out of the driver card because their mileage is unavailable, coordinate-reference-only, or blocked by a route/location/source conflict.

## No-guess rules

- Saved field/Clear Directions mileage is preferred.
- Official road geometry may measure a public road only when route topology proves the relevant endpoints.
- County/township/local roads must be identified in the correct county; identical route numbers in another county do not count.
- Bare route numbers are classified only when official state road data proves the route family/context.
- Private/lease-road mileage is blank unless explicitly saved or independently verified.
- Saved ranges remain ranges; no midpoint is invented.
- Qualitative wording such as `less than 1 mile` or `a couple of miles` stays qualitative.
- Direct access never displays a fake `0.0 mi`.
- Route/location conflicts are blocked rather than forced.

## Driver UI

A new **Verified Road Reference / Closest Known Road** card appears immediately above Clear Directions when a current safe reference exists.

The card shows:

- reference road
- distance or qualifier
- whether the number reaches the pad/access or only the lease/access
- a clean road/intersection reference point when useful
- whether the value comes from saved driver directions or official-road evidence

The card explicitly states that it is a distance reference only and that Clear Directions remain the actual truck route.

Unavailable/conflicted/reference-only records do not render a card.

## Offline behavior

Road-reference mileage is intentionally **live-only**. The app does not cache the mileage snapshot in local storage.

If the current safe Supabase snapshot cannot be fetched during app startup, the road-reference card stays hidden for that session. Clear Directions keep their existing offline behavior independently.

This is deliberate: a route may change while an installed phone still has older cached app data. Hiding mileage when the current safe snapshot cannot be confirmed is safer than displaying a stale road-distance reference.

## Automatic stale protection

Migration `20260808202932_publish_public_pad_anchor_mileage.sql` adds a safe public table and a route-hash trigger.

If a pad's company, state, county, coordinates, structured route, written directions, or Clear Directions change, its mileage row is automatically marked stale. RLS hides stale rows from anonymous/authenticated clients until the mileage is re-reviewed and republished.

Together with the live-only browser behavior, this prevents an old mileage card from surviving a later route edit.

## Important examples

- Ascent Wheeling Valley: Morgan Rd / TR-423 — **0.16 mi**, measured from official topology and saved right-turn/end-of-road instructions.
- Ascent Skull Fork: Repik Ln / TR-9876 — **0.57 mi**, official centerline plus saved end-of-road destination.
- EOG Scott: Ponder Rd / TR-380 — **0.70 mi**, official geometry from Aster Rd junction to road end.
- EOG Huffman Trust: Winona Rd / CR-408 — **0.6 mi**, resolved against the competing township Winona using Depot Rd intersection + pad geometry.
- EOG Hartz: Crestview Rd / TR-857 — **0.4 mi**, the only Crestview candidate that intersects the saved OH-164 route.
- Ascent Porco: Jefferson CR-15 — **3–4 mi**, source range preserved.
- EOG Deere: Chapel Rd — **< 1 mi**, source qualifier preserved.
- EOG Hutchison: Moccasin Rd — **a couple of miles**, source wording preserved.
- EOG Trushell: **OH-151 mile marker 9**, stored as a marker rather than false nine-mile distance.

## Blocked examples

- Ascent Durr: saved routes terminate at Sidwell.
- SWN Borton: saved route terminates at Weekender.
- EQT Son Uva Digger: saved text identifies Gold-Digger.
- EQT Radcliff: Ohio record conflicts with a West Virginia route.
- EOG Cooper: stored coordinate is about 29 miles from the saved Perron Rd route.
- Gulfport Charlie/Shriver: conflicting or ambiguous source mileage.

No blocked example enters the public road-reference table.
