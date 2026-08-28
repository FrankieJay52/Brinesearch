# Issue #97 — Ascent reviewed handoff batch 9 evidence (2026-08-28)

## Scope and authority boundary

This batch adds eight exact-record, owner-reviewed Google Maps handoffs: PANG, HASTINGS, WHEELING VALLEY, JACKALOPE, LODGE, ECHO, NORTH STAR, and LODESTAR. Each link keeps the phone's current location as origin, uses no more than three reviewed shaping points, and terminates at that record's existing trusted coordinate.

These links are client-side reviewed handoffs only. They do not add graph releases, approved public-Google rows, verified lease geometry, or verified driver entrances. Final access, lease, wellhead-reference, and saved-GPS movements stay explicitly unapproved. Connectivity evidence below comes from exact current-build road-identity memberships, never a distance threshold. Production database reads were read-only. Production writes, migrations, route cutover, embedded Google Maps, Google Maps JavaScript API use, and `VITE_GOOGLE_MAPS_API_KEY` use are all zero.

## PANG

Exact binding: UUID `74032b6e-179d-4672-8720-55ac86cab232`; legacy `ascent--pang`; revision `1786258360881449`; Ascent / Ohio / Belmont / WHEELING; saved pad reference `40.147178,-80.948742`.

Raw sequence: `Main St → OH-9 → Shepherdstown Rd → Access Road → OR → Marietta St → Newell Ave → OH-9 → Shepherdstown Rd → Access Road`.

Current Belmont build `9543e07c-f6eb-4682-a2dd-4d1f961377d5` contains exact OH-9 identity `522b1cb2-67de-1eb0-0f9f-0a087c7fd0d2`, exact Shepherdstown Road / CR-64 identity `a1151dc7-6a4b-7d65-17e4-02ea0a1e1d1a`, and their verified shared membership `37ea2057-41f5-6711-a206-118607d92bd4`. Control `40.151952334248,-80.961064815011` sits inside exact CR-64 after the shared boundary.

`https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.147178%2C-80.948742&waypoints=40.151952334248%2C-80.961064815011`

Live turn-list review from Saint Clairsville and Cadiz preserved OH-9 → Shepherdstown Road, continued forward, and used the final unnamed access to PANG without a loop or backtrack. That unnamed access and saved pin are not approved geometry.

## HASTINGS

Exact binding: UUID `f2f82142-f6d8-4f8d-b440-2ff86f624158`; legacy `ascent--hastings`; revision `1786265812046205`; Ascent / Ohio / Belmont / WHEELING; saved pad reference `40.163138,-81.021428`.

Raw sequence: `I-70 → Exit 213 → OH-331 → OH-149 → Chaney Rd → Lease Road`.

The current Belmont build contains exact OH-149 identity `7e83261b-9301-e0db-f5ab-ca6482408325`, exact Chaney Road / TR-386 identity `5439b292-2535-97e8-12f4-06136f944caa`, and verified junction `6d011c96-199b-1c81-d040-81b45941c3f4` at `40.1599489,-81.0166644`. Control `40.160397859316,-81.016701259012` sits 50 metres inside exact Chaney Road.

`https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.163138%2C-81.021428&waypoints=40.160397859316%2C-81.016701259012`

Live review from Saint Clairsville and Cadiz preserved OH-149 → Chaney Road and reached the exact pin without a loop. The upstream state-highway approach remains origin-dependent rather than falsely forcing OH-331. Google's terminal Crazy/Jockey labels are renderer context only; the final access remains unapproved.

## WHEELING VALLEY

Exact binding: UUID `25dc9adf-e09a-4cfa-8900-59492fbad0ec`; legacy `ascent--wheeling-valley`; revision `1786258360881449`; Ascent / Ohio / Belmont / WHEELING; saved pad reference `40.153061,-80.923517`.

Raw sequence: `I-70 → OH-9 / N Toward Shepherdstown Rd → Fairpoint Shepherdstown Rd → Sloans Run Rd → Dunn Rd → Morgan Rd`.

Exact current identities are OH-9 `522b1cb2-67de-1eb0-0f9f-0a087c7fd0d2`, CR-64 `a1151dc7-6a4b-7d65-17e4-02ea0a1e1d1a`, Fairpoint-Shepherdstown / TR-216 `1d50fe94-4287-57b9-1733-e87d7a1140c6`, main Sloans Run / TR-704 `73655b2f-2465-8da8-1bf2-5c6ad39d0f58`, Dunn / TR-424 `d36cc601-b95c-b0b7-9e53-cc0e731b2f0b`, and Morgan / TR-423 component `2dab3b9a-45d9-0c43-9109-b49e46979287`. Current verified junctions include Fairpoint/Sloans `0bbbaffa-3422-da74-7b4c-f5ca0dfb9d4f`, Sloans/Dunn `db3c6471-a2c2-f10f-3061-40f720a5bd2d`, and Dunn/Morgan `43f32464-b94e-0ea4-1c0d-41ba08ba5afd`.

Ordered controls: `40.15863093394,-80.943718975075`; `40.147055385412,-80.922842319818`; `40.153787436713,-80.924159995223`.

`https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.153061%2C-80.923517&waypoints=40.15863093394%2C-80.943718975075%7C40.147055385412%2C-80.922842319818%7C40.153787436713%2C-80.924159995223`

Live review from Saint Clairsville and Cadiz preserved Shepherdstown → Fairpoint-Shepherdstown → Sloans Run → Dunn → Morgan without a skipped road, reversal, or backtrack. Street-address labels are renderer context; the saved pin is not a verified entrance.

## JACKALOPE and LODGE shared corridor

Current Guernsey evidence uses OH-258 identity `1d61e8f0-527b-582a-022a-673001d546df`, Martha / CR-781 `b80b9fff-6d0e-b5b7-3b93-e8c28b476fca`, Titus / CR-878 component `9b5c2aa5-35b2-fc3d-5265-c1b1941a058a`, Lodge / CR-78 `31f107cb-6afd-72fe-70a7-9cf0fb0de77a`, and Cox / TR-8772 `e4be4730-79fc-be25-111e-c286a08a4dcd`. Exact verified junctions include OH-258/Martha `8fbffb61-a040-e849-f122-0493995399c1` and Martha/Titus `6e9f62fd-a2fb-74f8-6a68-56a43b4900ee`; Titus/Lodge concurrency receipt `27a6f23d-ba39-b0b9-49c0-e386b0d9e50b` and Cox/Lodge receipt `6b2d114b-3efd-8981-be8a-b8fb50d327d3` support the shared corridor. The Titus/Lodge/Sligo point junction remains held, so neither link is graph approval.

Shared controls: `40.211888715,-81.390778629`; `40.204197138,-81.382414119`; `40.174296992,-81.360075011`.

### JACKALOPE

Exact binding: UUID `f80dea77-db11-45f8-b30c-6c6abb85e469`; legacy `ascent--jackalope`; revision `1786265812046205`; Ascent / Ohio / Guernsey / WASHINGTON; saved pad reference `40.164159,-81.356092`.

Raw sequence: `OH-800 → OH-342 → OH-258 → Martha Rd → Titus Rd → Lodge Rd → Cox → Pad`.

`https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.164159%2C-81.356092&waypoints=40.211888715%2C-81.390778629%7C40.204197138%2C-81.382414119%7C40.174296992%2C-81.360075011`

Live review from Freeport and Cambridge preserved Martha → Titus → Lodge → right Cox → immediate left Lodge, crossed the noted one-lane bridge, and reached JACKALOPE without a loop or backtrack. The final saved-GPS movement is unapproved.

### LODGE

Exact binding: UUID `5c4a497e-cf33-48dd-8272-9fd06ebb9e6a`; legacy `ascent--lodge`; revision `1786265812046205`; Ascent / Ohio / Guernsey / WASHINGTON; official wellhead reference `40.164138,-81.351162`.

Raw sequence: `OH-342 → OH-258 → Martha Rd → Titus Rd → Lodge Rd → Lease Road → OR → Pad`.

`https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.164138%2C-81.351162&waypoints=40.211888715%2C-81.390778629%7C40.204197138%2C-81.382414119%7C40.174296992%2C-81.360075011`

Live review from Freeport and Cambridge preserved Martha → Titus → Lodge, crossed the one-lane bridge, then followed Google's McLaughlin Lane renderer label to the exact wellhead reference. That label is not promoted to a public-road identity. The destination is a wellhead reference, not a verified entrance; the lease movement remains unapproved.

## ECHO

Exact binding: UUID `83b27fd3-4615-4ea1-ad36-0b05b359f5d2`; legacy `ascent--echo`; revision `1786265812046205`; Ascent / Ohio / Harrison / ATHENS; saved pad reference `40.179321,-81.026812`.

Raw sequence: `OH-519 → Hite Rd → Jokey Hollow Rd → Lease Road`.

Current Harrison build `f4e4d43f-e86c-499c-893f-73f2eef3dc29` contains OH-519 identity `e883315b-bf54-9192-4556-342bcb7bb1a5`, Hite / TR-274 `4633577f-7e9c-b4ef-30fa-1641f9e00f11`, and Jockey Hollow / TR-254 `cf4f5778-7434-accb-165d-0eebc02bfbfe`. Verified junctions are OH-519/Hite `2c234f78-0324-dd2d-cefd-fb043933c641` at `40.1863324,-81.0142236` and Hite/Jockey `d951d971-5fdf-d2f6-3c4d-c4cf57b94897` at `40.1644961,-81.0162731`. Exact membership distinguishes the source's `Jokey` spelling from the separate Jockey Hollow Run identity.

Controls: `40.185661298825,-81.014226704981`; `40.164465208939,-81.016699529454`; `40.173032633439,-81.025592955042`.

`https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.179321%2C-81.026812&waypoints=40.185661298825%2C-81.014226704981%7C40.164465208939%2C-81.016699529454%7C40.173032633439%2C-81.025592955042`

Live review from New Athens and Freeport preserved OH-519 → Hite → Jockey Hollow and then used the unnamed lease movement to the exact pin without a loop or backtrack. Google currently renders Hite as Crazy Road; that is context only. The last lease movement remains unapproved.

## NORTH STAR and LODESTAR shared corridor

Current Noble build `200d56dc-5b13-4f84-82cb-946b8ebeada2` contains OH-78 identity `2eab7dfb-788a-1181-28e6-b643922b62be`, Archers Ridge / CR-2 identity `82f10f05-7192-22a8-d175-c669b918e98e`, and Hill / TR-307 identity `04dc51fc-4d22-d7aa-287c-02c5f18693cd`. Read-only production checks independently confirmed the active route identities and the verified authoritative T-junctions OH-78/CR-2 `397e428e-0b05-d450-3ecf-56d48d826043` at `39.7744321,-81.4515933` and CR-2/Hill `1fb86c08-dcac-c23c-d3a3-417a51db1090` at `39.7549384,-81.4129486`. Local names stored at individual segments vary; route-system/number and exact identity IDs provide the binding. The active name catalog includes `ARCHERS RIDGE RD` on the CR-2 identity.

### NORTH STAR

Exact binding: UUID `475462f4-7e7a-4432-801c-5e513d5e953f`; legacy `ascent--north-star`; revision `1786258360881449`; Ascent / Ohio / Noble / ENOCH; saved pad reference `39.739847,-81.420197`.

Raw sequence: `I-77 → Exit 25 → OH-78 → Archer Ridge Rd → Lease Road`.

The first one-control candidate was rejected because Google left Archers Ridge on Hohman Road / TR-265 and Town Highway 87 before rejoining it. The corrected controls are `39.774007303642,-81.451385717411` inside CR-2 after OH-78 and `39.755313742543,-81.424376369949` on CR-2 after the verified Hohman departure but before the verified Schockling re-entry. Requiring that intermediate CR-2 point prevents the Hohman/Town Highway 87 shortcut from satisfying the controls.

`https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.739847%2C-81.420197&waypoints=39.774007303642%2C-81.451385717411%7C39.755313742543%2C-81.424376369949`

Live review from Cambridge and Caldwell preserved OH-78 → Archers Ridge continuously, with no Hohman/TH-87 shortcut, loop, or backtrack. The final short GPS movement remains unapproved and the saved point is not relabeled as an entrance.

### LODESTAR

Exact binding: UUID `691fb27b-2b35-471d-81fa-9239f6bd4081`; legacy `ascent--lodestar`; revision `1786258360881449`; Ascent / Ohio / Noble / STOCK; saved pad reference `39.750091,-81.409571`.

Raw sequence: `I-77 → Exit 25 → OH-78 E → Archer Ridge Rd / CR-2 → Hill Rd / TR-307 → Lease Road`.

Controls: `39.774007303642,-81.451385717411` inside CR-2 after OH-78 and `39.754750338267,-81.412456525463` inside Hill after the verified CR-2/Hill junction.

`https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.750091%2C-81.409571&waypoints=39.774007303642%2C-81.451385717411%7C39.754750338267%2C-81.412456525463`

Live review from Cambridge and Caldwell preserved OH-78 → Archers Ridge → Hill Road without a skipped road, shortcut, loop, or backtrack. The action-prefixed Hill occurrence remains unresolved by the older parser, but current exact CR-2/Hill identity membership independently proves that road-to-road connection. Graph authority and the final GPS movement stay held.

## Candidates kept on GPS-only navigation

- VANNELLE remains GPS-only because its tested shared-corridor control made Google turn onto Shepherdstown for 89 feet and then return to OH-9.
- VICTOR remains GPS-only because its current directory record says Harrison/Athens while its route, destination, address, and official wells point to Belmont/Warren. A mechanically successful link cannot override that exact-record conflict.
- WINSTON SMITH remains GPS-only. Google preserved OH-78 → Archers Ridge → Hill → Gurewicz in two-origin review, but its persisted Gurewicz occurrence receipt is still held because the older parser failed on the action prefix. This batch does not silently bypass or repair that stored receipt.

## Regression boundary

- Existing reviewed links and exact bindings are unchanged.
- The eight new records move only from truthful GPS-only navigation to exact-record reviewed Google handoffs; graph/public-Google authority stays held.
- Every link omits `origin`, so Google uses the phone's current location.
- Every link is an ordinary external `https://www.google.com/maps/dir/?api=1...` handoff. No Google API key is read, embedded, logged, or required.
- Public Google remains at the existing COLOGIE baseline; cutover remains off.
- Production reads were read-only. Production writes and migrations were zero.
