# Ascent I-70 navigation wave evidence board — 2026-08-31

## Status and safety boundary

This is a documentation-only research board for the next Ascent Google Navigate wave. It is **not a reviewed navigation contract**, it does **not publish a Google Navigate URL**, and it does **not approve any coordinate below as a waypoint**. A pad remains GPS-only unless its exact current directory record, intended road occurrences, one-to-three waypoint budget, two-origin Google road order, and satellite-confirmed final approach all pass the reviewed-handoff gate in the same implementation tree.

The map overlay and its `ordered_exact`, routed-display, neutral-tether, or pin-only evidence are display/research inputs only. They do not create a public-road identity, an owner approval, a reviewed handoff, or a Google route. An "interior" coordinate below means only that existing evidence places a point inside the named road occurrence; it must not be copied into a production URL without the remaining checks.

- Accepted `main` accounting remains **61 navigable / 186 GPS-only / 52 exact-record reviewed handoffs**.
- Draft PR #215 proposes BLAYNEY only at commit `24e12eb`: **62 / 185 / 53** if a human later merges it. It is not merged.
- This board creates **zero** additional proposed or accepted handoffs. It changes no runtime code, test, ledger row, production data, owner-approval receipt, or PR #212 artifact.
- SHUTWAY and VANNELLE are the only candidates with separately prepared Google-QA-ready material. That preparation is not acceptance and does not publish either pad.

## Count definitions

The **52 direct candidates** are the current I-70 research pool after source precedence and explicit exclusions. They partition exactly into A0 through A4:

| Bucket | Count | Evidence boundary |
| --- | ---: | --- |
| A0 — `TEMPLATE_PR215` | 1 | BLAYNEY only. Its exact-record implementation is proposed separately on Draft PR #215; this board neither duplicates nor modifies it. |
| A1 — `EVIDENCE_BOUNDARY_NEEDS_GOOGLE_QA` | 13 | Saved destination, routed display, and an exact highway-to-next-road boundary. Boundary evidence is not automatically a waypoint. |
| A2 — `CANDIDATE_NEAREST_NEEDS_EXACT_OCCURRENCE` | 23 | Saved destination and routed display, but only a candidate-nearest start. Never promote that candidate-nearest coordinate; locate and prove the intended occurrence. |
| A3 — `PIN_ONLY_MISSING_APPROACH_EVIDENCE` | 9 | Saved destination exists, but the current display evidence is pin-only. Keep GPS-only until the written approach is proved. |
| A4 — `PIN_ONLY_NON_SAVED_DESTINATION` | 6 | ODNR reference and pin-only evidence. The reference is not an entrance; no last-leg route may be inferred from it. |
| **Direct total** | **52** | **A0 + A1 + A2 + A3 + A4.** |

The same 52-pad pool has these independent accounting views:

- **37 routed-display / 15 pin-only**: A0+A1+A2 = 37; A3+A4 = 15.
- **46 saved / 4 ODNR pad / 2 ODNR wellhead destinations**. Source describes the trusted reference only; an ODNR point is never promoted to an entrance.
- **32 with at least one `ordered_exact` evidence section / 20 with none**. This is overlay evidence, not 32 approved handoffs.
- **28 with mechanical pressure above the three-waypoint mobile budget**. That count flags records whose written/derived road chain cannot be copied mechanically. It requires evidence-led compression to one-to-three controls or a fail-closed GPS-only result.

The **13 `ALT_ONLY_SOURCE_PRECEDENCE_HOLD` pads are not part of the 52**. I-70 occurs only in an older or alternate stored direction branch and is absent from the newer selected/cleaned source. Do not revive the older branch merely to put the pad in the I-70 wave.

Cross-board reconciliation: the exhaustive 186-row GPS-only classification applies a stricter direct-I-70 identity gate and classifies 33 of these 52 as `CLEAN_DIRECT_I70_CANDIDATE`. BENNINGTON, CERMAK, FLEAGANE, MILLER, TARPLEY, THREE DADS, VIOLET, VICTORIA, and WAGNER classify under another numbered-highway context because a generic `Route 70` start or a different starting anchor remains gated while a later approved anchor is still usable. BOROVICH, CENA, COFFIELD, EGGLESTON, MOHOROVICH, PROSSER E, SHIPMAN, STELLA, VICTOR, and WATSON classify as alias/source-order ambiguities. All 52 remain accounted for; no production denominator changes.

## Complete direct-candidate roster

| Bucket | Count | Pads |
| --- | ---: | --- |
| A0 | 1 | BLAYNEY |
| A1 | 13 | BEDWAY; BREEZE; HENDERSON; RICHLAND B; THREE DADS; LAVADA; RECTOR-C; SLABAUGH; TARPLEY; WAMPUM; BSA; COLLECTORS; CORDER |
| A2 | 23 | BLESSED; CARLOS; CRAVAT NORTH; KASETTA; KURTH; MILLER; PROSSER E; ROSS; SHUTWAY; VANNELLE; VIOLET; WASSMANN; WEST; WRIGHT; COAD; EGGLESTON; J BARR J; MOHOROVICH; SHIPMAN; WATSON; CRAVAT COAL; CERMAK; MONROE NORTH |
| A3 | 9 | ANTELOK; BOROVICH; COFFIELD; FLEAGANE; ATMOS; STELLA; VICTOR; VICTORIA; CENA |
| A4 | 6 | BENNINGTON; EXETER; GRAND; PREMIERE; SKYLINE; WAGNER |

## Source-precedence holds

`ALT_ONLY_SOURCE_PRECEDENCE_HOLD` (**13**): EMERSYN; EUREKA; LEE; SIDWELL; DONNA; GINGERICH; RABER; ALPHA; BOUSKA; COBRA; TARBERT; HARR; PIERGALLINI.

These names stay outside the direct pool unless the authoritative current record later selects and binds an I-70 sequence. The board does not choose among `OR` branches or treat a stale alternate as current truth.

## Exclusions and identity holds

- **ALBERT** — inspectable only; no publication without the same exact-record gate used for BLAYNEY.
- **COLEMAN** — candidate only unless a later exact current record establishes the handoff.
- **HINDMAN** — official ODNR pin, not a verified entrance; always held from ordinary entrance navigation.
- **CROSS CREEK** — inspectable only; do not revive the older four-pad patch.
- **ALDERMAN, DURR, GATTI, KANTOR, ROLIFF, WEIDINGER W, WILEY** — held destinations with no saved GPS; a pin cannot be invented.
- **ABLE, EZEKIEL, SHUGERT DADDY** — insufficient authoritative directions.
- **HENRY** — `US 70` is an ambiguous road identity, not proof of I-70; hold until the exact intended identity is established.

None of these pads is counted in the 52 direct candidates or the 13 alternate-only holds.

## First-ten A1 evidence queue

These ten rows are the first evidence queue, not an implementation list. Every row still needs two-origin Google maneuver proof and satellite review. The exact structured string in the directory remains the contract bind even when the research note describes a cleaned interpretation or a Google renderer alias.

| # | Pad and exact-record bind | Current written sequence / route under review | Trusted destination | Existing occurrence evidence | Unresolved gate; required proof |
| ---: | --- | --- | --- | --- | --- |
| 1 | **BREEZE** — `05c3de57-2e9b-4a24-9c5b-59584fbec133`; `ascent--breeze`; rev `1786258360881449`; Belmont | I-70 → Exit 216 → OH-149 → Airport Rd → Lease Road | saved `40.035226,-80.97599` | Airport Rd interior lead `40.034953,-80.975587` | Prove both I-70 origins use Exit 216, OH-149, then the intended Airport Rd occurrence; confirm the visible final approach by satellite. No URL or waypoint is approved. |
| 2 | **RICHLAND B** — `73f48788-9990-435a-adee-999740e958de`; `ascent--richland-b`; rev `1786258360881449`; Belmont | Primary bound branch: I-70 → Exit 213 → OH-331 → US-40 → Lloydsville Bannock Rd → Lude Rd. The record also contains OH-149 and Exit 208 `OR` alternatives. | saved `40.077481,-80.995772` | Lloydsville-Bannock / CR-80 interior `40.074775,-80.990828`; Lude / TR-264 interior `40.076972,-80.992428` | Prove one authoritative branch and ordered roads from both origins; record `Pogue` only as a renderer alias if Google shows it; confirm the last approach by satellite. Do not silently discard the bound alternatives. |
| 3 | **THREE DADS** — `d70f5f1d-7f44-4a5e-9b05-06264f56470d`; `ascent--three-dads`; rev `1786265812046205`; Belmont | OH-7 → Route 70 → Exit 218 → Mall Rd → US-40 → Barton Rd → Pad | saved `40.099252,-80.855031` | Barton Rd interior lead `40.097864,-80.870567` | Establish that `Route 70` means the intended I-70 occurrence, then prove Exit 218 → Mall Rd → US-40 → Barton Rd from both directions and confirm the final approach by satellite. |
| 4 | **LAVADA** — `883420b3-07b9-4682-912e-42ba278d1132`; `ascent--lavada`; rev `1786265812046205`; Guernsey | I-70 → Exit 186 → OH-285 → OH-265 → Salem Rd → Lease Road | saved `39.97411,-81.412098` | Salem Rd interior lead `39.978952,-81.415617` | Prove Exit 186 and the OH-285 → OH-265 → Salem order from both origins; satellite-confirm the unnamed final approach. |
| 5 | **HENDERSON** — `036d0ac7-d72e-49e4-a400-ee0a631029e1`; `ascent--henderson`; rev `1786265812046205`; Belmont | Exit 208 → I-70 → OH-149 → OH-147 → OH-9 → Henderson Rd → Lease Road | saved `40.050354,-80.935656` | TR-722 / local-road interior lead `40.044631,-80.930937`; existing neutral tether is about 191 m | The stored order begins with Exit 208 before I-70 and needs exact interpretation, not a rewrite. Prove the highway exit and full road order from both origins, preserve `Reservoir` only as a possible renderer alias, and satellite-check the 191 m final gap. |
| 6 | **BEDWAY** — `98eec273-b8aa-49b6-b791-2d53b5f256c6`; `ascent--bedway`; rev `1786258360881449`; Belmont | I-70 → Exit 208 → OH-149 → US-40 → Pancoast Rd | saved verified-driver-entrance `40.072874,-81.021494` | US-40 interior lead `40.06974,-81.029408` | Exact Pancoast occurrence control is missing. Prove Exit 208 → OH-149 → US-40 → Pancoast from both origins; do not reuse NATIONAL-OCO controls merely because the corridor is nearby. Satellite-check the final movement. |
| 7 | **WAMPUM** — `8e823835-2c10-4275-84e9-4067376fa364`; `ascent--wampum`; rev `1786258360881449`; Guernsey | I-70 → OH-285 → OH-313 → Salem Rd → Nighthawk Rd → Keep Right Onto Divison Rd → Lease Road | saved `39.962923,-81.440117` | Salem interior `39.941409,-81.446907`; source-bound Nighthawk / display-alias Division occurrence `39.953452,-81.440293`; later Division occurrence `39.961901,-81.441644` | Exact source evidence exists, while display context renders the Nighthawk/Division sequence under Division. Establish the I-70 exit and prove the ordered keep-right movement from both origins; retain `Divison`/`Division` only as spelling/renderer context and satellite-confirm the lease approach. |
| 8 | **SLABAUGH** — `eae4741b-7fb4-4bc3-8b20-26043032acda`; `ascent--slabaugh`; rev `1786265512886177`; Guernsey | I-70 → OH-285 → OH-313 → Salem Rd → Nighthawk Rd → Lease Road | saved `39.95541,-81.4408` | Salem interior `39.941409,-81.446907`; exact source-bound Nighthawk occurrence `39.952222,-81.440069`, displayed as Division | Prove the OH-313 → Salem → Nighthawk/Division order from both origins without a shortcut; satellite-confirm the final approach without promoting the overlay alias to a new directory identity. |
| 9 | **TARPLEY** — `25dc64b5-4a52-4cef-8b2c-62e7e36d64c7`; `ascent--tarpley`; rev `1786265812046205`; Guernsey | Route 70 → OH-513 → Bridgewater Rd → Lease Road. Research interpretation adds Exit 193, OH-513 N, Bridgewater / 690 E, and 94 N / Pisgah; it does not alter the bound string. | saved `40.063839,-81.293734` | Bridgewater interior lead `40.05541,-81.319658` | `Route 70` identity and exact Pisgah control are missing. Prove the intended I-70 occurrence, exit, road order, and aliases from both origins; satellite-confirm the last approach. |
| 10 | **RECTOR-C** — `0a2a4a64-6e64-4b7d-9652-e1a97db4fc4f`; `ascent--rector-c`; rev `1786265812046205`; Guernsey | Bound string: OH-285 → OH-313E → Salem Rd → New Gottengen Rd → Meadowlark Rd → Lease Road. The selected cleaned research source adds I-70 Exit 186; the exact bound string must remain unchanged. | saved `39.955552,-81.395087` | OH-313 interior lead `39.937984,-81.420226` | Exact local-road controls are missing. Prove the I-70/Exit 186 context and complete ordered local sequence from both origins; satellite-confirm the final approach. |

## Promotion gate for every later implementation

For any candidate that advances beyond this board:

1. Re-read the current directory row and bind UUID, canonical ID, legacy ID, revision, exact structured sequence, company, state, county, destination source, and destination coordinates.
2. Locate one-to-three controls on the intended road occurrences. Never use a candidate-nearest coordinate or same-numbered road merely because it is close.
3. Run west/east or otherwise opposite-direction Google checks and capture the actual maneuver list. Stop labels or summary cards are not a maneuver transcript.
4. Verify the last visible connector to the saved pin in satellite view. Describe it only as that pad's approach/lease road; do not create an official road identity or geometry.
5. If the route cannot fit the three-waypoint mobile budget without losing the required written road order, or any identity remains ambiguous, keep the pad GPS-only.
6. Only then add the reviewed exact-record contract, exact URL/no-origin tests, that pad's ledger row, synchronized accounting, audit documentation, and evidence note on one SHA. Do not add or edit an owner-approval receipt.

This board deliberately contains no production phone-origin URL. BLAYNEY remains isolated on Draft PR #215, PR #212 remains untouched, and every other name above remains a research candidate or explicit hold.
