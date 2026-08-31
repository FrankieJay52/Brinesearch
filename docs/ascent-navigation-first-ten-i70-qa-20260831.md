# Ascent navigation — first-ten I-70 QA board (2026-08-31)

## Authority and scope

This board records the first-ten review outcome on Draft PR #216. It does not edit an owner-approval receipt, change production GPS/geometry/directions, grant graph/public-Google authority, merge, or deploy.

The exact directory bindings and current runtime strings below come from `main` at `46a4710`. The current batch-2 approach source, display, and graph-run receipts on that tree were used only to select controls on an existing occurrence. Cleaned `directions_clear` evidence on PR #212 at `be2ebba` was read only; PR #212 was not modified. Two-direction Google maneuver evidence and satellite findings supplied for this review are recorded below and in the companion evidence note.

Six records passed: RICHLAND B, LAVADA, WAMPUM, SLABAUGH, TARPLEY, and RECTOR-C. Their exact-record contracts are implemented only in this independent Draft tree. BREEZE and THREE DADS failed Google road-order QA and remain GPS-only. HENDERSON and BEDWAY remain `NOT_PROPOSED`.

The machine-readable companion is [ascent-navigation-first-ten-i70-qa-20260831.csv](ascent-navigation-first-ten-i70-qa-20260831.csv).

## Candidate matrix

| Pad | Exact record binding | Destination | Proposed controls, in order | Status | Why / next gate |
| --- | --- | --- | --- | --- | --- |
| BREEZE | `05c3de57-2e9b-4a24-9c5b-59584fbec133` / `ascent--breeze` / `1786258360881449` / `I-70 → Exit 216 → OH-149 → Airport Rd → Lease Road` | saved pad GPS `40.035226,-80.97599` | rejected control `40.034953,-80.975587` on Airport Rd / CR-82 | `QA_FAILED_GPS_ONLY` | West substituted OH-149 S → Palmer → John → E Main → OH-149 E / Belmont Warnock → Elm Station and bypassed the written Exit 216 / OH-9 approach. East-only success cannot publish a phone-origin route. |
| RICHLAND B | `73f48788-9990-435a-adee-999740e958de` / `ascent--richland-b` / `1786258360881449` / `I-70 → Exit 213 → OH-331 → US-40 → Lloydsville Bannock Rd → Lude Rd → OR → OH-149 → US-40 → Lloydsville Bannock Rd → Lude Rd → OR → I-70 → Exit 208 → OH-149 → US-40 → Lloydsville Bannock Rd → Lude Rd` | saved pad GPS `40.077481,-80.995772` | `40.075237,-80.990567` — Lloydsville-Bannock / CR-80; `40.076936,-80.994184` — Lude / TR-264 | `DRAFT_IMPLEMENTED_QA_PASSED` | West uses the OH-149 alternative; east uses I-70 W / Exit 213 / OH-331. Both preserve US-40 → Lloydsville-Bannock → Lude without pass-and-return. Satellite confirms the pad approach west of Lude. POGUE RD remains alias context only. |
| THREE DADS | `d70f5f1d-7f44-4a5e-9b05-06264f56470d` / `ascent--three-dads` / `1786265812046205` / `OH-7 → Route 70 → Exit 218 → Mall Rd → US-40 → Barton Rd → Pad` | saved pad GPS `40.099252,-80.855031` | rejected control `40.087743,-80.886921` on Barton Rd / CR-4 | `QA_FAILED_GPS_ONLY` | West used Exit 215 and east used Exit 220; neither used written Exit 218 / Mall Road. |
| LAVADA | `883420b3-07b9-4682-912e-42ba278d1132` / `ascent--lavada` / `1786265812046205` / `I-70 → Exit 186 → OH-285 → OH-265 → Salem Rd → Lease Road` | saved pad GPS `39.97411,-81.412098` | `39.981189,-81.414833` — Salem Rd / CR-74 | `DRAFT_IMPLEMENTED_QA_PASSED` | Both practical directions reach approved OH-265 / Leatherwood then written Salem Road. Satellite confirms a continuous private pad approach north to labeled Salem Road. Leatherwood is OH-265 renderer context only. |
| HENDERSON | `036d0ac7-d72e-49e4-a400-ee0a631029e1` / `ascent--henderson` / `1786265812046205` / `Exit 208 → I-70 → OH-149 → OH-147 → OH-9 → Henderson Rd → Lease Road` | saved pad GPS `40.050354,-80.935656` | none | `NOT_PROPOSED` | The card explicitly prohibits a southbound OH-9 approach because the turn is too sharp for a commercial vehicle. The source proves local TR-722 but supplies no exact interior OH-9 control south of the turn to force northbound travel. |
| BEDWAY | `98eec273-b8aa-49b6-b791-2d53b5f256c6` / `ascent--bedway` / `1786258360881449` / `I-70 → Exit 208 → OH-149 → US-40 → Pancoast Rd` | verified driver entrance `40.072874,-81.021494` | none | `NOT_PROPOSED` | The intended final occurrence is Pancoast / TR-263. The retained route selects National-Oco / CR-78 instead, matching the earlier live-Google wrong-road rejection. National-Oco must not be promoted as a Pancoast alias. |
| WAMPUM | `8e823835-2c10-4275-84e9-4067376fa364` / `ascent--wampum` / `1786258360881449` / `I-70 → OH-285 → OH-313 → Salem Rd → Nighthawk Rd → Keep Right Onto Divison Rd → Lease Road` | saved pad GPS `39.962923,-81.440117` | `39.941409,-81.446907` — Salem; `39.953452,-81.440293` — pre-fork Nighthawk occurrence; `39.961901,-81.441644` — post-fork Division occurrence | `DRAFT_IMPLEMENTED_QA_PASSED` | Both directions preserve Salem → Nighthawk → Division. Satellite proves the controls lie before and after the fork and the pin continues northeast on the post-fork occurrence. Google's corrected Division spelling is context only; the exact record retains `Divison`. |
| SLABAUGH | `eae4741b-7fb4-4bc3-8b20-26043032acda` / `ascent--slabaugh` / `1786265512886177` / `I-70 → OH-285 → OH-313 → Salem Rd → Nighthawk Rd → Lease Road` | saved pad GPS `39.95541,-81.4408` | `39.941409,-81.446907` — Salem; `39.952222,-81.440069` — source-bound Nighthawk occurrence | `DRAFT_IMPLEMENTED_QA_PASSED` | Both directions preserve Salem → Nighthawk. Satellite shows the saved pin immediately beside the visible facility connector on labeled Nighthawk Road. DIVISION RD remains alias context only. |
| TARPLEY | `25dc64b5-4a52-4cef-8b2c-62e7e36d64c7` / `ascent--tarpley` / `1786265812046205` / `Route 70 → OH-513 → Bridgewater Rd → Lease Road` | saved pad GPS `40.063839,-81.293734` | `40.05541,-81.319658` — Bridgewater; `40.058189,-81.295487` — Pisgah occurrence | `DRAFT_IMPLEMENTED_QA_PASSED` | Both directions use I-70 Exit 193 / OH-513 N, then Bridgewater → Pisgah → the unnamed final approach to the saved pin. Satellite shows the pin on the pad deck and the continuous approach south to the written corridor. Pisgah and Google's `Morris Ln` address label remain renderer context only. |
| RECTOR-C | `0a2a4a64-6e64-4b7d-9652-e1a97db4fc4f` / `ascent--rector-c` / `1786265812046205` / `OH-285 → OH-313E → Salem Rd → New Gottengen Rd → Meadowlark Rd → Lease Road` | saved pad GPS `39.955552,-81.395087` | `39.941409,-81.446907` — Salem / CR-74; `39.9652842,-81.3804816` — New Gottengen at 19277 | `DRAFT_IMPLEMENTED_QA_PASSED` | The final two-control route preserves Salem → New Gottengen → Meadowlark from both directions. Satellite shows the pin on labeled Meadowlark beside the facility connector. Earlier one-control / Locust Grove attempts remain rejected. |

## Draft-implemented phone-origin URLs

The six passing URLs omit `origin`, use `travelmode=driving`, use `dir_action=navigate`, terminate at the exact saved destination, and stay within the three-waypoint mobile budget.

- RICHLAND B: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.077481%2C-80.995772&waypoints=40.075237%2C-80.990567%7C40.076936%2C-80.994184`
- LAVADA: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.97411%2C-81.412098&waypoints=39.981189%2C-81.414833`
- WAMPUM: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.962923%2C-81.440117&waypoints=39.941409%2C-81.446907%7C39.953452%2C-81.440293%7C39.961901%2C-81.441644`
- SLABAUGH: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.95541%2C-81.4408&waypoints=39.941409%2C-81.446907%7C39.952222%2C-81.440069`
- TARPLEY: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.063839%2C-81.293734&waypoints=40.05541%2C-81.319658%7C40.058189%2C-81.295487`
- RECTOR-C: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.955552%2C-81.395087&waypoints=39.941409%2C-81.446907%7C39.9652842%2C-81.3804816`

BREEZE and THREE DADS have no production URL because their tested candidates failed. HENDERSON and BEDWAY remain `NOT_PROPOSED`; no phone-origin URL should be inferred from diagnostic geometry.

## Two-direction Google QA outcome

These are proof-only URLs. They are not production links. Each origin is a research point on the opposite side of the target corridor; it is not contract data or a newly asserted pad-route fact.

| Pad | West proof | East proof | West QA | East QA |
| --- | --- | --- | --- | --- |
| BREEZE | `https://www.google.com/maps/dir/I-70+Exit+208,+Ohio/40.034953,-80.975587/40.035226,-80.97599` | `https://www.google.com/maps/dir/40.072,-80.860/40.034953,-80.975587/40.035226,-80.97599` | `FAIL · unwritten local-road substitution` | `PASS east only` |
| RICHLAND B | `https://www.google.com/maps/dir/I-70+Exit+208,+Ohio/40.075237,-80.990567/40.076936,-80.994184/40.077481,-80.995772` | `https://www.google.com/maps/dir/40.072,-80.860/40.075237,-80.990567/40.076936,-80.994184/40.077481,-80.995772` | `PASS` | `PASS` |
| THREE DADS | `https://www.google.com/maps/dir/I-70+Exit+208,+Ohio/40.087743,-80.886921/40.099252,-80.855031` | `https://www.google.com/maps/dir/Bridgeport,+Ohio/40.087743,-80.886921/40.099252,-80.855031` | `FAIL · Exit 215` | `FAIL · Exit 220` |
| LAVADA | `https://www.google.com/maps/dir/Cambridge,+Ohio/39.981189,-81.414833/39.97411,-81.412098` | `https://www.google.com/maps/dir/Barnesville,+Ohio/39.981189,-81.414833/39.97411,-81.412098` | `PASS` | `PASS` |
| WAMPUM | `https://www.google.com/maps/dir/Cambridge,+Ohio/39.941409,-81.446907/39.953452,-81.440293/39.961901,-81.441644/39.962923,-81.440117` | `https://www.google.com/maps/dir/Barnesville,+Ohio/39.941409,-81.446907/39.953452,-81.440293/39.961901,-81.441644/39.962923,-81.440117` | `PASS` | `PASS` |
| SLABAUGH | `https://www.google.com/maps/dir/Cambridge,+Ohio/39.941409,-81.446907/39.952222,-81.440069/39.95541,-81.4408` | `https://www.google.com/maps/dir/Barnesville,+Ohio/39.941409,-81.446907/39.952222,-81.440069/39.95541,-81.4408` | `PASS` | `PASS` |
| HENDERSON | `NOT_PROPOSED` | `NOT_PROPOSED` | `BLOCKED_NO_SAFE_URL` | `BLOCKED_NO_SAFE_URL` |
| BEDWAY | `NOT_PROPOSED` | `NOT_PROPOSED` | `BLOCKED_NO_SAFE_URL` | `BLOCKED_NO_SAFE_URL` |
| TARPLEY | `https://www.google.com/maps/dir/Cambridge,+Ohio/40.05541,-81.319658/40.058189,-81.295487/40.063839,-81.293734` | `https://www.google.com/maps/dir/Barnesville,+Ohio/40.05541,-81.319658/40.058189,-81.295487/40.063839,-81.293734` | `PASS` | `PASS` |
| RECTOR-C | `https://www.google.com/maps/dir/Cambridge,+Ohio/39.941409,-81.446907/39.9652842,-81.3804816/39.955552,-81.395087` | `https://www.google.com/maps/dir/Barnesville,+Ohio/39.941409,-81.446907/39.9652842,-81.3804816/39.955552,-81.395087` | `PASS` | `PASS` |

## Acceptance boundary

RICHLAND B, LAVADA, WAMPUM, SLABAUGH, TARPLEY, and RECTOR-C passed the current two-direction and satellite gates and are implemented only on Draft PR #216. BREEZE and THREE DADS failed closed and remain GPS-only. A `NOT_PROPOSED` row has no safe URL to test and remains GPS-only until its missing occurrence or control is proved. On this main-based Draft tree the proposed accounting is 67 navigable, 180 GPS-only, and 58 exact-record reviewed handoffs. Main remains 61 / 186 / 52 until a human merge.
