# Ascent navigation — first-ten I-70 QA board (2026-08-31)

## Authority and scope

This is a docs-only proposal board. It does not publish a reviewed navigation contract, change the six-county ledger, edit an owner-approval receipt, change production GPS/geometry/directions, or grant graph/public-Google authority.

The exact directory bindings and current runtime strings below come from `main` at `46a4710`. The current batch-2 approach source, display, and graph-run receipts on that tree are used only to select interior points on an existing exact occurrence. Cleaned `directions_clear` evidence on PR #212 at `be2ebba` was read only; PR #212 was not modified. No Google route, Google turn list, or satellite view was opened for this board. Proposed-route Google checks and all satellite checks are therefore `PENDING`; Google checks for rows without a safe URL are `BLOCKED_NO_SAFE_URL`.

Six records have a defensible 1–3-control URL to take into interactive QA. Four records remain `NOT_PROPOSED` because the available evidence cannot encode the required occurrence safely. `PROPOSED_FOR_QA` is not `DONE` and is not permission to add a runtime contract.

The machine-readable companion is [ascent-navigation-first-ten-i70-qa-20260831.csv](ascent-navigation-first-ten-i70-qa-20260831.csv).

## Candidate matrix

| Pad | Exact record binding | Destination | Proposed controls, in order | Status | Why / next gate |
| --- | --- | --- | --- | --- | --- |
| BREEZE | `05c3de57-2e9b-4a24-9c5b-59584fbec133` / `ascent--breeze` / `1786258360881449` / `I-70 → Exit 216 → OH-149 → Airport Rd → Lease Road` | saved pad GPS `40.035226,-80.97599` | `40.034953,-80.975587` — interior exact Airport Rd / CR-82 | `PROPOSED_FOR_QA` | Exact directory string omits OH-9 while `directions_clear` includes Exit 216 → OH-9 S → OH-149. Both Google lists must prove that full written order; satellite must confirm the short left-side lease approach. |
| RICHLAND B | `73f48788-9990-435a-adee-999740e958de` / `ascent--richland-b` / `1786258360881449` / `I-70 → Exit 213 → OH-331 → US-40 → Lloydsville Bannock Rd → Lude Rd → OR → OH-149 → US-40 → Lloydsville Bannock Rd → Lude Rd → OR → I-70 → Exit 208 → OH-149 → US-40 → Lloydsville Bannock Rd → Lude Rd` | saved pad GPS `40.077481,-80.995772` | `40.075237,-80.990567` — exact Lloydsville-Bannock / CR-80; `40.076936,-80.994184` — exact Lude / TR-264 | `PROPOSED_FOR_QA` | Current graph display `POGUE RD` is alias context for the exact source-bound CR-80 identity. Google must preserve CR-80 → Lude from both I-70 directions without pass-and-return. |
| THREE DADS | `d70f5f1d-7f44-4a5e-9b05-06264f56470d` / `ascent--three-dads` / `1786265812046205` / `OH-7 → Route 70 → Exit 218 → Mall Rd → US-40 → Barton Rd → Pad` | saved pad GPS `40.099252,-80.855031` | `40.087743,-80.886921` — interior exact Barton Rd / CR-4 | `PROPOSED_FOR_QA` | Google must show I-70 Exit 218 → Mall Rd → US-40 W → Barton Rd. The available exact evidence does not provide a separate Mall Road control, so the two step lists are decisive. |
| LAVADA | `883420b3-07b9-4682-912e-42ba278d1132` / `ascent--lavada` / `1786265812046205` / `I-70 → Exit 186 → OH-285 → OH-265 → Salem Rd → Lease Road` | saved pad GPS `39.97411,-81.412098` | `39.981189,-81.414833` — interior exact Salem Rd / CR-74 | `PROPOSED_FOR_QA` | OH-265 may render as Leatherwood. Google must preserve Exit 186 → OH-285 S → OH-265 E/Leatherwood → Salem from both directions; satellite must confirm the right-side lease approach. |
| HENDERSON | `036d0ac7-d72e-49e4-a400-ee0a631029e1` / `ascent--henderson` / `1786265812046205` / `Exit 208 → I-70 → OH-149 → OH-147 → OH-9 → Henderson Rd → Lease Road` | saved pad GPS `40.050354,-80.935656` | none | `NOT_PROPOSED` | The card explicitly prohibits a southbound OH-9 approach because the turn is too sharp for a commercial vehicle. The source proves local TR-722 but supplies no exact interior OH-9 control south of the turn to force northbound travel. |
| BEDWAY | `98eec273-b8aa-49b6-b791-2d53b5f256c6` / `ascent--bedway` / `1786258360881449` / `I-70 → Exit 208 → OH-149 → US-40 → Pancoast Rd` | verified driver entrance `40.072874,-81.021494` | none | `NOT_PROPOSED` | The intended final occurrence is Pancoast / TR-263. The retained route selects National-Oco / CR-78 instead, matching the earlier live-Google wrong-road rejection. National-Oco must not be promoted as a Pancoast alias. |
| WAMPUM | `8e823835-2c10-4275-84e9-4067376fa364` / `ascent--wampum` / `1786258360881449` / `I-70 → OH-285 → OH-313 → Salem Rd → Nighthawk Rd → Keep Right Onto Divison Rd → Lease Road` | saved pad GPS `39.962923,-81.440117` | `39.941409,-81.446907` — exact Salem; `39.953452,-81.440293` — first exact Division-rendered occurrence; `39.961901,-81.441644` — second exact Division occurrence after the right turn | `PROPOSED_FOR_QA` | The source distinguishes `Nighthawk` then misspelled `Divison`; current exact graph evidence renders both occurrences under one Division identity. Google must show the ordered keep-right movement, and satellite must confirm the last right-side lease approach. No directory identity is renamed. |
| SLABAUGH | `eae4741b-7fb4-4bc3-8b20-26043032acda` / `ascent--slabaugh` / `1786265512886177` / `I-70 → OH-285 → OH-313 → Salem Rd → Nighthawk Rd → Lease Road` | saved pad GPS `39.95541,-81.4408` | `39.941409,-81.446907` — exact Salem; `39.952222,-81.440069` — exact source-bound Nighthawk occurrence, graph display Division | `PROPOSED_FOR_QA` | Division is alias/rendering context for the source-bound Nighthawk occurrence. Both Google lists must preserve OH-313 → Salem → Nighthawk/Division without a shortcut; satellite must confirm the left-side lease approach. |
| TARPLEY | `25dc64b5-4a52-4cef-8b2c-62e7e36d64c7` / `ascent--tarpley` / `1786265812046205` / `Route 70 → OH-513 → Bridgewater Rd → Lease Road` | saved pad GPS `40.063839,-81.293734` | none | `NOT_PROPOSED` | `directions_clear` adds about 0.5 mile on Pisgah / CR-94, while the current exact string omits it. The retained route uses only a short Pisgah segment, then Wells and Morris, and ends about 183 m from the pin. The intended Pisgah-to-lease occurrence is not proven. |
| RECTOR-C | `0a2a4a64-6e64-4b7d-9652-e1a97db4fc4f` / `ascent--rector-c` / `1786265812046205` / `OH-285 → OH-313E → Salem Rd → New Gottengen Rd → Meadowlark Rd → Lease Road` | saved pad GPS `39.955552,-81.395087` | none | `NOT_PROPOSED` | Earlier live Google QA used Leatherwood before Salem. The retained batch-2 route also skips the written Salem → New Gottengen chain. No supported three-control set both blocks that shortcut and preserves Salem → New Gottengen → Meadowlark. |

## Proposed phone-origin URLs

All six candidates omit `origin`, use `travelmode=driving`, use `dir_action=navigate`, terminate at the exact saved destination, and stay within the three-waypoint mobile budget.

- BREEZE: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.035226%2C-80.97599&waypoints=40.034953%2C-80.975587`
- RICHLAND B: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.077481%2C-80.995772&waypoints=40.075237%2C-80.990567%7C40.076936%2C-80.994184`
- THREE DADS: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.099252%2C-80.855031&waypoints=40.087743%2C-80.886921`
- LAVADA: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.97411%2C-81.412098&waypoints=39.981189%2C-81.414833`
- WAMPUM: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.962923%2C-81.440117&waypoints=39.941409%2C-81.446907%7C39.953452%2C-81.440293%7C39.961901%2C-81.441644`
- SLABAUGH: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.95541%2C-81.4408&waypoints=39.941409%2C-81.446907%7C39.952222%2C-81.440069`

HENDERSON, BEDWAY, TARPLEY, and RECTOR-C are `NOT_PROPOSED`; no phone-origin URL should be inferred from the diagnostic geometry.

## Two-direction Google QA URLs — proposed rows PENDING; held rows BLOCKED

These are proof-only URLs. They are not production links. Each origin is a research point on the opposite side of the target corridor; it is not contract data or a newly asserted pad-route fact.

| Pad | West proof | East proof | West QA | East QA |
| --- | --- | --- | --- | --- |
| BREEZE | `https://www.google.com/maps/dir/I-70+Exit+208,+Ohio/40.034953,-80.975587/40.035226,-80.97599` | `https://www.google.com/maps/dir/40.072,-80.860/40.034953,-80.975587/40.035226,-80.97599` | `PENDING` | `PENDING` |
| RICHLAND B | `https://www.google.com/maps/dir/I-70+Exit+208,+Ohio/40.075237,-80.990567/40.076936,-80.994184/40.077481,-80.995772` | `https://www.google.com/maps/dir/40.072,-80.860/40.075237,-80.990567/40.076936,-80.994184/40.077481,-80.995772` | `PENDING` | `PENDING` |
| THREE DADS | `https://www.google.com/maps/dir/I-70+Exit+208,+Ohio/40.087743,-80.886921/40.099252,-80.855031` | `https://www.google.com/maps/dir/Bridgeport,+Ohio/40.087743,-80.886921/40.099252,-80.855031` | `PENDING` | `PENDING` |
| LAVADA | `https://www.google.com/maps/dir/Cambridge,+Ohio/39.981189,-81.414833/39.97411,-81.412098` | `https://www.google.com/maps/dir/Barnesville,+Ohio/39.981189,-81.414833/39.97411,-81.412098` | `PENDING` | `PENDING` |
| WAMPUM | `https://www.google.com/maps/dir/Cambridge,+Ohio/39.941409,-81.446907/39.953452,-81.440293/39.961901,-81.441644/39.962923,-81.440117` | `https://www.google.com/maps/dir/Barnesville,+Ohio/39.941409,-81.446907/39.953452,-81.440293/39.961901,-81.441644/39.962923,-81.440117` | `PENDING` | `PENDING` |
| SLABAUGH | `https://www.google.com/maps/dir/Cambridge,+Ohio/39.941409,-81.446907/39.952222,-81.440069/39.95541,-81.4408` | `https://www.google.com/maps/dir/Barnesville,+Ohio/39.941409,-81.446907/39.952222,-81.440069/39.95541,-81.4408` | `PENDING` | `PENDING` |
| HENDERSON | `NOT_PROPOSED` | `NOT_PROPOSED` | `BLOCKED_NO_SAFE_URL` | `BLOCKED_NO_SAFE_URL` |
| BEDWAY | `NOT_PROPOSED` | `NOT_PROPOSED` | `BLOCKED_NO_SAFE_URL` | `BLOCKED_NO_SAFE_URL` |
| TARPLEY | `NOT_PROPOSED` | `NOT_PROPOSED` | `BLOCKED_NO_SAFE_URL` | `BLOCKED_NO_SAFE_URL` |
| RECTOR-C | `NOT_PROPOSED` | `NOT_PROPOSED` | `BLOCKED_NO_SAFE_URL` | `BLOCKED_NO_SAFE_URL` |

## Acceptance boundary

For a proposed row to become an implementation candidate, both proof URLs must expose an expanded road-by-road list in the written order, with no wrong-road substitution, skipped local road, loop, pass-and-return, or backtrack. Satellite review must also confirm that the visible final connector is that pad's approach/lease movement to the saved pin. A `NOT_PROPOSED` row has no safe URL to test, so its Google checks remain `BLOCKED_NO_SAFE_URL` until the missing occurrence or control is proved; satellite research may continue independently. Until both checks are recorded, the pad remains GPS-only and production accounting does not change.
