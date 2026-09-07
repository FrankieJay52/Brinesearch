# Ascent GPS-only navigation classification — 2026-08-31

Planning status: docs-only, fail-closed, Draft-PR support. This board does not create Google navigation authority, owner approval, public-road identity, graph membership, teal authority, a merge, or a deployment.

## Source boundary

- Current production tree: origin/main 46a4710a33aa713843749038886aac55ab08e489.
- Exact 247-row six-county ledger: docs/batch0-ascent-six-county-navigation-ledger-20260827.csv.
- Current display evidence: v18/src/features/map/ascentPadApproaches.batch2.json. Overlay evidence is display-only.
- PR #212 evidence was read only at be2ebba4966dc64594797200638c7f2eb4793532. Its directions_clear source precedence and exact record evidence help classification; its graph dispositions are not treated as a ban on a simpler reviewed Google handoff.

## Reconciled accounting

| bucket | rows | operational meaning |
|---|---:|---|
| CLEAN_DIRECT_I70_CANDIDATE | 33 | The exact current record or primary directions name I-70 directly and retain a usable last numbered-highway handoff; every row still needs exact occurrence waypoints, satellite confirmation, two-origin Google detail, and an exact-record contract. |
| OTHER_NUMBERED_HIGHWAY_CANDIDATE | 95 | The exact current record or primary directions contain a usable Interstate, U.S., or Ohio state-route handoff outside the strict direct-I-70 subset; generic `Route 70` starts and source-order discrepancies remain explicit gates. |
| ALIAS_OR_SOURCE_ORDER_AMBIGUITY | 49 | Primary last-anchor wording is an uncorroborated alias or conflicts with the historical-overlay last-highway order. Do not choose an occurrence by guess. |
| NO_USABLE_NUMBERED_HIGHWAY_ANCHOR | 2 | Neither the exact current structured sequence nor the authoritative written directions supplies a usable Interstate, U.S., or Ohio state-route anchor. |
| EXCLUDED_OR_INSUFFICIENT | 7 | Explicit owner scope exclusion or insufficient canonical directions takes precedence over any inspectable route text. |
| **Total current GPS-only rows** | **186** | Exact one-to-one partition of the six-county ledger GPS_ONLY set. |

Accepted main accounting remains 61 navigable / 186 GPS-only / 52 exact-record reviewed handoffs. Draft work does not change those accepted numbers.

The 33-row `CLEAN_DIRECT_I70_CANDIDATE` bucket is exactly the strict, explicitly named I-70 subset of the separate 52-pad direct-I-70 research pool. The other 19 research-pool names are not dropped. BENNINGTON, CERMAK, FLEAGANE, MILLER, TARPLEY, THREE DADS, VIOLET, VICTORIA, and WAGNER move to `OTHER_NUMBERED_HIGHWAY_CANDIDATE` because a generic `Route 70` start or another numbered-road context remains a gate while a later approved anchor is still usable. BOROVICH, CENA, COFFIELD, EGGLESTON, MOHOROVICH, PROSSER E, SHIPMAN, STELLA, VICTOR, and WATSON move to `ALIAS_OR_SOURCE_ORDER_AMBIGUITY`. The 52 and 33 counts therefore describe different evidence gates, not different production denominators.

## Reading the CSV

- record_id/canonical_id, legacy_id, record_revision, company/name/state/county, and structured_road_sequence are copied from the exact current ledger row.
- trusted_destination_source is normalized to the runtime source vocabulary: verified_driver_entrance, saved_pad_gps, official_pad_reference, or official_wellhead_reference. Official references remain explicitly not entrances.
- last_usable_approved_highway_anchor comes from the PR #212 primary cleaned direction order by default, but the exact current structured sequence may supply a visibly gated fallback when the newer text omits a numbered anchor. DALRYMPLE is that explicit fallback: current `OH-1` is retained while the source-order discrepancy blocks publication. Ambiguous and stale-revision rows retain a provisional or historical value only so the conflict is inspectable; their bucket, revision marker, and fail_closed_reason prohibit publication.
- overlay_status, overlay_reason, overlay_last_highway, ordered_exact evidence, and teal count are read from main. Teal or ordered_exact evidence does not create a Google URL or owner approval.
- fail_closed_reason states why main remains GPS-only. next_gate is the minimum evidence gate before a future exact-record contract may be proposed.

## PR #212 revision guard

PR #212 binds revision `1787615581785257` for BLAYNEY, SHUTWAY, SCOUT, and BESECE, while all four current `main` records bind revision `1788117937351112`. Their PR #212-derived `primary_*` fields and dispositions are retained only as visibly marked historical context in the CSV. They cannot satisfy an exact-record gate. In particular, SHUTWAY's old `GOOGLE_QA_PENDING` candidate must be re-derived at the current revision before it is opened or promoted. BLAYNEY's current binding is handled separately by Draft PR #215; this board does not borrow authority from the stale PR #212 row.

## Bucket roster

### CLEAN_DIRECT_I70_CANDIDATE (33)

ANTELOK, BEDWAY, BLAYNEY, BLESSED, BREEZE, CARLOS, CRAVAT NORTH, EXETER, GRAND, HENDERSON, KASETTA, KURTH, PREMIERE, RICHLAND B, ROSS, SHUTWAY, SKYLINE, VANNELLE, WASSMANN, WEST, WRIGHT, ATMOS, COAD, J BARR J, LAVADA, RECTOR-C, SLABAUGH, WAMPUM, BSA, COLLECTORS, CORDER, CRAVAT COAL, MONROE NORTH

### OTHER_NUMBERED_HIGHWAY_CANDIDATE (95)

ANCHOR, BENNINGTON, COOK, EMERSYN, FLEAGANE, GEOFLO, LEE, MILLER, OBOY, OLIVER, PAVICH, POL, REITZ, ROBINSON, SEABRIGHT, SIDWELL, SMITH, SOPHIA JOE, TARPLEY, THREE DADS, VIOLET, WISE, AYERS, BETTS, COOPER, DONNA, HENRY, KROBY, LEILA, LINCOLN, RABER, WAGNER, ACE, ALPHA, BELLA, BOUSKA, CHARLEY, COBRA, CRICKET, DOMINO, DWAYNE, JONES, LIGGETT, PINE VALLEY, ROSE, SCOUT, SHEPORGI, SPARGER, TARBERT, TRIPLETT, UNA, ATLAS, BESECE, BORUM, CECELIA, CERMAK, CESARIO, CLUB, COLAIANNI, CREAMER, CROWELL, DALRYMPLE, DARROW, DAWSON, DICKSON, ELITE, FALDOWSKI, FAUNA, FERGUSON, GIUSTO, GRYWALSKI, HARR, JACK HAMILTON, KRINKE, MARQUARD, MINGO, PACKER, PATRIOT, PEARL, PHILLIPS, PIERGALLINI, PUGGLE, RILEY, RONALD, SMITHFIELD, THOMPSON, VICTORIA, VINCENT, WILMA, ALABASTER, BILLY SHERMAN, DEBASER, MATADOR, RUBY-OPAL, VAULT

### ALIAS_OR_SOURCE_ORDER_AMBIGUITY (49)

ALBRIGHT, BOROVICH, COFFIELD, EUREKA, KRNYAICH, PROSSER E, R HOOVER, SCHNEGG, BROWN, EGGLESTON, GINGERICH, MILLER FARMS, MOHOROVICH, SHIPMAN, STELLA, WAGLER, WALDO, WATSON, CYPRESS, EDINGTON, FOXTROT, MEDINAH, SHERWOOD, VICTOR, AMBER, ARCHIE, CENA, COLLINS, DOYEN, GABRIEL, GENO, GORDON, GRISWOLD, HAMMOCK, HOWELL, JADE, KELPIE, LORI, NOELLE, NOLAN, OMAITS, PORCO, RECTOR, ROXY, SATORI, SPORT, STONE, TANNER, ZIMNOX

### NO_USABLE_NUMBERED_HIGHWAY_ANCHOR (2)

BEACON, ZEDS

### EXCLUDED_OR_INSUFFICIENT (7)

ALBERT, COLEMAN, EZEKIEL, HINDMAN, SHUGERT DADDY, ABLE, CROSS CREEK

## Seven null-destination denominator addendum

These seven records are not rows in the 247-row six-county ledger or the 186-row CSV. They are the separate PR #212 denominator addendum: 247 + 7 = 254. All remain HELD_DESTINATION; no pin, county, route occurrence, or entrance may be invented.

| name | UUID | legacy ID | revision | primary source | primary cleaned order | destination |
|---|---|---|---:|---|---|---|
| ALDERMAN | f52bdf46-6b4a-4901-8f66-175bb7220ad8 | ascent--alderman | 1786246617744175 | directions_clear | I-70 → Exit 216 → OH-9 S (4.2 miles) → OH-149 (2.4 miles) → Airport Rd / CR-82 (2.4 miles) → Lease Road | unavailable: current county/township/latitude/longitude are null |
| DURR | 7adbf888-6f25-4f8f-b306-649fcc9387f5 | ascent--durr | 1786314389553451 | written_directions | none | unavailable: current county/township/latitude/longitude are null |
| GATTI | 878e60fe-cdfc-4bbb-a4e4-93b588bd2059 | ascent--gatti | 1786246617744175 | directions_clear | OH-147 E / Barnesville Bethesda Rd / E Main St (6.3 miles) → OH-147 E / Maple Ave (1.5 miles) → OH-149 N → Palmer Rd (1.2 miles) → Entrance | unavailable: current county/township/latitude/longitude are null |
| KANTOR | a77e7898-9f9b-4fd8-82bb-da9ce26abd08 | ascent--kantor | 1786165584958501 | directions_clear | US-22 E (12.3 miles) → OH-151 W exit (0.1 mile) → Gable Rd (0.2 mile) → Old Hopedale Rd (1.2 miles) → Rabbit Rd (0.5 mile) → OH-151 E (7.9 miles) → OH-152 S / Main St (3.5 miles) | unavailable: current county/township/latitude/longitude are null |
| ROLIFF | 31d0f9bb-09be-4253-bc6b-778e3e19a879 | ascent--roliff | 1786246617744175 | directions_clear | E Main St E (0.2 mile) → OH-800 N / Cemetery Hill Rd (1.4 miles) → OH-799 (2.8 miles) → Kennedy Ridge Rd (4.2 miles) → Kennedy Ridge Rd (0.2 mile) → Old Piedmont Rd (0.2 mile) → Access Road | unavailable: current county/township/latitude/longitude are null |
| WEIDINGER W | e537c3cb-ac98-4a26-91b9-4d3bcfa1e525 | ascent--weidinger-w | 1786165584958501 | directions_clear | CR-11 / Piney Fork Rd W → TR-138 | unavailable: current county/township/latitude/longitude are null |
| WILEY | 72b25dba-6279-41b6-b9fd-8ead758d0294 | ascent--wiley | 1786246617744175 | directions_clear | WV-2 S (1.7 miles) → WV-180 S (7.3 miles) → WV-18 S (11.1 miles) → Indian Creek Rd / CR-13 (9.0 miles) → Stackpole Run / CR-13/3 (0.7 mile) → Left Hand Fork / CR-13/8 (1.0 mile) → Entrance | unavailable: current county/township/latitude/longitude are null |

## Validation invariants

- CSV data rows: 186.
- Unique record_id values: 186; unique legacy_id values: 186.
- Every CSV record matches one and only one current main GPS_ONLY ledger row by UUID, legacy ID, revision, exact structured sequence, destination source/role, and coordinates.
- Bucket sum: 33 + 95 + 49 + 2 + 7 = 186.
- The seven HELD_DESTINATION addendum rows are absent from the 186-row CSV.
- BLAYNEY, SHUTWAY, SCOUT, and BESECE explicitly mark their stale PR #212 evidence revision and require a current-record re-derivation or the separately current-bound PR #215 contract.
