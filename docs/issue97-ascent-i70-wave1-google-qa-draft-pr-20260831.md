# Ascent I-70 first wave — Google and satellite QA evidence

Date: 2026-08-31
Branch: `feature/v18-ascent-navigation-completion-20260831`
Base: `main` at `46a4710`
Status: **DRAFT ONLY. DO NOT MERGE OR DEPLOY.**

## Decision

RICHLAND B, LAVADA, WAMPUM, SLABAUGH, TARPLEY, and RECTOR-C passed two-direction Google maneuver review and satellite review. Their phone-origin URLs are exact-record-bound in this Draft tree. BREEZE and THREE DADS failed road-order review and remain GPS-only. HENDERSON and BEDWAY remain without a safe proposed URL.

This evidence creates no owner-approval receipt, static display entry, road identity, graph membership, public-Google authority, or official lease geometry. PR #212 was not changed. The phone remains the production origin; the named origins below are proof only.

## RICHLAND B — PASS

- Exact record: `73f48788-9990-435a-adee-999740e958de` / `ascent--richland-b` / revision `1786258360881449`
- Exact stored sequence: `I-70 → Exit 213 → OH-331 → US-40 → Lloydsville Bannock Rd → Lude Rd → OR → OH-149 → US-40 → Lloydsville Bannock Rd → Lude Rd → OR → I-70 → Exit 208 → OH-149 → US-40 → Lloydsville Bannock Rd → Lude Rd`
- Saved GPS: `40.077481,-80.995772`
- Controls: Lloydsville-Bannock / CR-80 `40.075237,-80.990567`; Lude / TR-264 `40.076936,-80.994184`
- Phone URL: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.077481%2C-80.995772&waypoints=40.075237%2C-80.990567%7C40.076936%2C-80.994184`

West proof from I-70 Exit 208:

1. Leave the Pilot lot.
2. Take OH-149 N for 0.8 mile.
3. Take US-40 E for 3.7 miles.
4. Turn left onto Lloydsville-Bannock Road and continue 0.1 mile to 44625 National Road.
5. Continue toward Moriah for 0.1 mile.
6. Turn left onto Lude Road and continue 0.2 mile to 45537 Lude Road.
7. Head northwest on Lude Road for 217 feet.
8. Turn left to stay on Lude Road for 325 feet.
9. The saved destination is on the right at 45540 Lude Road Gas Well Pad.

East proof from `40.072,-80.860`:

1. Take US-40 W.
2. Enter I-70 W.
3. Take Exit 213 / OH-331 S.
4. Continue on US-40 W.
5. Take Lloydsville-Bannock Road.
6. Take Lude Road and follow the same final Lude steps to the saved destination.

Both routes match an allowed alternative in the byte-exact record and contain no pass-and-return. Satellite shows a clear pad deck west of, and continuously connected to, labeled Lude Road. `POGUE RD` remains graph/renderer context for the Lloydsville-Bannock / CR-80 occurrence only.

## LAVADA — PASS

- Exact record: `883420b3-07b9-4682-912e-42ba278d1132` / `ascent--lavada` / revision `1786265812046205`
- Exact stored sequence: `I-70 → Exit 186 → OH-285 → OH-265 → Salem Rd → Lease Road`
- Saved GPS: `39.97411,-81.412098`
- Control: Salem / CR-74 `39.981189,-81.414833`
- Phone URL: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.97411%2C-81.412098&waypoints=39.981189%2C-81.414833`

West proof from Cambridge:

1. Take US-40 E for 3.8 miles.
2. Turn right onto OH-265 E / Leatherwood Road for 7.1 miles.
3. Turn right onto Salem Road and continue 0.2 mile to the control near 61021 Salem Road.
4. Continue on Salem Road for 0.6 mile to the saved destination near 60485 Salem Road.

East proof from Barnesville:

1. Use local Church / Chestnut streets.
2. Take OH-147 W.
3. Take OH-265 W / Leatherwood Road.
4. Turn left onto Salem Road and follow the same final Salem segment.

Under the current owner rule, the U.S. and Ohio routes are approved anchors and Salem Road is approved because it is written for this exact pad. The practical routes need not reproduce the stored I-70 / Exit 186 / OH-285 preamble when the phone begins elsewhere. Satellite at the saved GPS shows the full pad deck and a continuous private approach north to labeled Salem Road / CR-74. That connector is called LAVADA's pad approach, not an official road identity. Leatherwood is renderer context for OH-265.

## WAMPUM — PASS

- Exact record: `8e823835-2c10-4275-84e9-4067376fa364` / `ascent--wampum` / revision `1786258360881449`
- Exact stored sequence: `I-70 → OH-285 → OH-313 → Salem Rd → Nighthawk Rd → Keep Right Onto Divison Rd → Lease Road`
- Saved GPS: `39.962923,-81.440117`
- Controls: Salem `39.941409,-81.446907`; pre-fork Nighthawk `39.953452,-81.440293`; post-fork Division `39.961901,-81.441644`
- Phone URL: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.962923%2C-81.440117&waypoints=39.941409%2C-81.446907%7C39.953452%2C-81.440293%7C39.961901%2C-81.441644`

West proof from Cambridge, 21 minutes / 16.6 miles via I-77 S and OH-313 E:

1. Use Cambridge / I-70 alternate streets to I-77 S.
2. Take I-77 S to Exit 37 / OH-313.
3. Turn left onto OH-313 E.
4. Turn left onto Salem Road and continue to 58213.
5. Continue toward Nighthawk Road for 0.7 mile.
6. Turn left onto Nighthawk Road and continue 0.2 mile to 59144.
7. Continue toward Division Road for 0.4 mile.
8. Continue on Division Road for 0.2 mile to 59711.
9. Continue northeast on Division Road for 0.1 mile to the saved destination at 59898 Division Road.

East proof from Barnesville, 32 minutes / 21.0 miles via OH-265 W:

1. Use Church / Chestnut streets.
2. Take OH-147 W.
3. Take OH-265 W / Leatherwood Road.
4. Turn left onto Salem Road.
5. Follow the same ordered Salem → Nighthawk → Division steps to the saved destination.

Satellite pins prove control 2 lies on the pre-fork Nighthawk occurrence, control 3 lies on the post-fork Division occurrence, and the saved GPS lies farther northeast on that same post-fork occurrence. Google renders the written misspelling `Divison` as `Division`; that alias is context only and the exact stored string remains unchanged.

## SLABAUGH — PASS

- Exact record: `eae4741b-7fb4-4bc3-8b20-26043032acda` / `ascent--slabaugh` / revision `1786265512886177`
- Exact stored sequence: `I-70 → OH-285 → OH-313 → Salem Rd → Nighthawk Rd → Lease Road`
- Saved GPS: `39.95541,-81.4408`
- Controls: Salem `39.941409,-81.446907`; Nighthawk occurrence `39.952222,-81.440069`
- Phone URL: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.95541%2C-81.4408&waypoints=39.941409%2C-81.446907%7C39.952222%2C-81.440069`

West proof from Cambridge, 20 minutes / 16.1 miles via I-77 S and OH-313 E:

1. Use Cambridge / I-70 alternate streets to I-77 S.
2. Take I-77 S to Exit 37 / OH-313.
3. Turn left onto OH-313 E.
4. Turn left onto Salem Road and continue to 58213.
5. Continue toward Nighthawk Road for 0.7 mile.
6. Turn left onto Nighthawk Road and continue 0.2 mile to 58918.
7. Continue toward Division Road for 0.2 mile to the saved destination at 59144 Nighthawk Road.

East proof from Barnesville, 30 minutes / 20.4 miles via OH-265 W:

1. Use Church / Chestnut streets.
2. Take OH-147 W.
3. Take OH-265 W / Leatherwood Road.
4. Turn left onto Salem Road.
5. Follow the same ordered Salem → Nighthawk final steps.

Satellite at the saved GPS shows the pin on labeled Nighthawk Road immediately beside the visible facility / pad connector, with a continuous approach. Current graph rendering of `DIVISION RD` is alias context only and does not replace Nighthawk in the exact contract.

## RECTOR-C — PASS

- Exact record: `0a2a4a64-6e64-4b7d-9652-e1a97db4fc4f` / `ascent--rector-c` / revision `1786265812046205`
- Exact stored sequence: `OH-285 → OH-313E → Salem Rd → New Gottengen Rd → Meadowlark Rd → Lease Road`
- Saved GPS: `39.955552,-81.395087`
- Controls: Salem / CR-74 `39.941409,-81.446907`; New Gottengen Road `39.9652842,-81.3804816`
- Phone URL: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.955552%2C-81.395087&waypoints=39.941409%2C-81.446907%7C39.9652842%2C-81.3804816`

West proof from Cambridge:

1. Use Cambridge / I-70 alternate streets to I-77 S.
2. Take I-77 S to Exit 37 / OH-313.
3. Turn onto OH-313 E.
4. Turn left onto Salem Road and continue to 58213.
5. Continue toward Nighthawk Road for 2.5 miles.
6. Turn right onto New Gottengen Road and continue 2.0 miles to the control at 19277 New Gottengen Road.
7. Continue toward Meadowlark Road for 0.5 mile.
8. Turn left onto Meadowlark Road and continue 0.8 mile.
9. Turn right for 13 feet to the saved pin.

East proof from Barnesville:

1. Use Church / Chestnut streets.
2. Take OH-147 W.
3. Take OH-265 W / Leatherwood Road.
4. Turn left onto Salem Road and continue 4.0 miles.
5. Follow the same New Gottengen → Meadowlark steps to the saved pin.

Both directions preserve the written Salem → New Gottengen → Meadowlark order under the current numbered-anchor rule. Satellite places the exact pin on labeled Meadowlark Road immediately beside a visible facility / pad deck with a short continuous connector. That connector is RECTOR-C's pad approach, not an official road identity. Earlier one-control and wrong-intermediate attempts that stayed on OH-313 or rendered Locust Grove failed and are not published.

## TARPLEY — PASS

- Exact record: `25dc64b5-4a52-4cef-8b2c-62e7e36d64c7` / `ascent--tarpley` / revision `1786265812046205`
- Exact stored sequence: `Route 70 → OH-513 → Bridgewater Rd → Lease Road`
- Saved GPS: `40.063839,-81.293734`
- Controls: Bridgewater `40.05541,-81.319658`; Pisgah occurrence `40.058189,-81.295487`
- Phone URL: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.063839%2C-81.293734&waypoints=40.05541%2C-81.319658%7C40.058189%2C-81.295487`

West proof from Cambridge:

1. Take US-40 E and enter I-70 E.
2. Take Exit 193 / OH-513 N.
3. Continue onto Bridgewater Road.
4. Continue onto the intended Pisgah occurrence.
5. Turn right onto the unnamed final approach and continue about 0.1 mile to the saved pin.

East proof from Barnesville:

1. Take OH-800 N and enter I-70 W.
2. Take Exit 193 / OH-513 N.
3. Continue onto Bridgewater Road.
4. Continue onto the intended Pisgah occurrence.
5. Turn right onto the unnamed final approach to the saved pin.

Both directions use the same I-70 Exit 193 / OH-513 N → Bridgewater → Pisgah order and finish on the visible pad approach. Satellite shows the saved pin on a large pad deck with a continuous winding approach south to the written corridor. Pisgah is maneuver context on the route to the written lease road, and Google's `Morris Ln` address label is renderer context only; neither is promoted to the exact directory identity. Earlier one-control and wrong-intermediate attempts are rejected; only this final two-control URL passed.

## Failed closed

### BREEZE

The west proof used OH-149 S → Palmer → John → E Main → OH-149 E / Belmont-Warnock → Elm Station. It bypassed the written Exit 216 / OH-9 sequence and introduced unwritten local roads. The east proof used US-40 / I-70 / OH-9 / OH-149 before Elm Station, but one-direction success is insufficient. BREEZE remains GPS-only and has no reviewed phone URL in this Draft.

### THREE DADS

The west proof used Exit 215 → US-40 → Barton Road. The east proof used Exit 220 → US-40 → Barton Road. Neither used written Exit 218 / Mall Road. THREE DADS remains GPS-only and has no reviewed phone URL in this Draft.

## Draft accounting

This independent main-based Draft adds six reviewed handoffs:

- 67 navigable
- 180 GPS-only
- 58 exact-record reviewed handoffs
- 46 owner-approval receipts unchanged
- frozen 55-entry static display catalog unchanged
- 192 batch-2 approach records unchanged

Main remains 61 / 186 / 52 until a human merge. BLAYNEY remains isolated on PR #215 and is not included here.
