# Ascent Ohio route completion checkpoint — 2026-08-30

This repository checkpoint accounts for **254 current Ohio Ascent pads** against immutable production directory snapshot `f5cf25b5-e130-47a1-8d20-17ebb59f4b64` (source revision 12, 1215 rows, content SHA-256 `388c41f955e374b9e13d1f9125db45c871882fec23ed8f8100cc12fdece86416`). It starts from main `4ca9a97c91acee1f14c11b9a32880ab3c19fbad5` / tree `1a75097c9bc577dcee41362ab4ebafb5229ee1bc`.

It is source-first: `directions_clear` is primary, `written_directions` is fallback only, and `structured_road_sequence` is historical/conflict evidence only. Text does not create identity, geometry, route authority, teal authority, or Google authority.

## Denominator reconciliation: 247 → 254

The prior ledger intentionally covered six named Ohio counties. Production now returns seven additional Ascent/Ohio/pad records with null county, township, and destination coordinates. They were omitted from the six-county 247 corpus for that exact reason and are now represented as `HELD_DESTINATION` rather than silently omitted.

| Pad | UUID | revision | exact reason absent from old corpus |
|---|---|---:|---|
| ALDERMAN | `f52bdf46-6b4a-4901-8f66-175bb7220ad8` | `1786246617744175` | Outside old explicit six-county corpus: current county/township and saved GPS are null. |
| DURR | `7adbf888-6f25-4f8f-b306-649fcc9387f5` | `1786314389553451` | Outside old explicit six-county corpus: current county/township and saved GPS are null. |
| GATTI | `878e60fe-cdfc-4bbb-a4e4-93b588bd2059` | `1786246617744175` | Outside old explicit six-county corpus: current county/township and saved GPS are null. |
| KANTOR | `a77e7898-9f9b-4fd8-82bb-da9ce26abd08` | `1786165584958501` | Outside old explicit six-county corpus: current county/township and saved GPS are null. |
| ROLIFF | `31d0f9bb-09be-4253-bc6b-778e3e19a879` | `1786246617744175` | Outside old explicit six-county corpus: current county/township and saved GPS are null. |
| WEIDINGER W | `e537c3cb-ac98-4a26-91b9-4d3bcfa1e525` | `1786165584958501` | Outside old explicit six-county corpus: current county/township and saved GPS are null. |
| WILEY | `72b25dba-6279-41b6-b9fd-8ead758d0294` | `1786246617744175` | Outside old explicit six-county corpus: current county/township and saved GPS are null. |

## Final dispositions

| disposition | pads |
|---|---:|
| COLOGIE_READY | 1 |
| GOOGLE_QA_PENDING | 2 |
| HELD_DESTINATION | 7 |
| HELD_GEOMETRY | 6 |
| HELD_IDENTITY | 104 |
| HELD_TRANSITION | 71 |
| INSUFFICIENT | 3 |
| REVIEWED_HANDOFF_READY | 60 |

Current navigation accounting remains **61 navigable / 186 GPS-only / 7 unavailable without destination**. No existing reviewed navigation contract was rewritten. COLOGIE remains the sole `COLOGIE_READY` record and is byte-stable. The other 60 current reviewed contracts remain `REVIEWED_HANDOFF_READY` with neutral/held terminal remainders where applicable.

Source coverage is 249 cleaned records and 5 written-only fallbacks. The ledger contains 1058 named public occurrences (509 exact-identity / 549 held-identity), 809 transitions (27 exact / 749 held / 33 same-road not-applicable), and 1058 named occurrence geometry checks (59 exact clips / 999 held).

SHUTWAY and VANNELLE retain evidence-backed, phone-origin candidates but are `GOOGLE_QA_PENDING`: precise coordinates were not transmitted to Google during this run, so two-origin renderer QA remains a later privacy-confirmed action. Google remains renderer-only.

## Applied exact evidence work and release hold

| migration | pads | normalized SHA-256 | state |
|---|---|---|---|
| `20260830181546_ascent_bella_airport_identity.sql` | BELLA | `9c53f20bcd5204b2a8d160bcdf54f3f9dbf1eb7f22c97241f2153a153d58ef5d` | APPLIED |
| `20260830182440_ascent_howell_occurrence_checkpoint.sql` | HOWELL | `d3b579584666f67487334faffbc26b2ed58dbc9056d9caf5484c34191e7bd6d4` | APPLIED |
| `20260830182511_ascent_cricket_foxes_identity_binding.sql` | CRICKET | `4889af4234ee163d74690b154bd23be9f176208404679ae474b6d61e604a9855` | APPLIED |

BELLA's Harrison Airport Rd / CR-38 identity, HOWELL's SR-151/SR-152 non-authority checkpoint, and CRICKET's already-existing Foxes Bottom identity binding were applied once. HOWELL initially failed closed because its rounded junction checkpoint was 1.266 m from the immutable verified junction; the corrected migration uses the stored junction coordinate without widening the 1 m tolerance.

**Release remains blocked.** BELLA's new exact mapping correctly invalidated the active Harrison graph fingerprint. Current read-only postflight shows Harrison build `f4e4d43f-e86c-499c-893f-73f2eef3dc29` is stale and seven pads are fail-closed: CARDINAL, COLOGIE, CONOTTON, DUKE, HAMILTON, LASSO, and SPROULL. No graph rebuild/activation or compensating rollback is authorized by this checkpoint, so PR merge and deployment must not proceed until one of those permanent paths is separately authorized and verified.

## Every non-ready pad and exact primary hold

| pad | county | disposition | exact primary hold |
|---|---|---|---|
| ALDERMAN | — | HELD_DESTINATION | Current production county, township, latitude, and longitude are null; no jurisdiction, route occurrence, entrance, or Google destination may be inferred. |
| DURR | — | HELD_DESTINATION | Current production county, township, latitude, and longitude are null; no jurisdiction, route occurrence, entrance, or Google destination may be inferred. |
| GATTI | — | HELD_DESTINATION | Current production county, township, latitude, and longitude are null; no jurisdiction, route occurrence, entrance, or Google destination may be inferred. |
| KANTOR | — | HELD_DESTINATION | Current production county, township, latitude, and longitude are null; no jurisdiction, route occurrence, entrance, or Google destination may be inferred. |
| ROLIFF | — | HELD_DESTINATION | Current production county, township, latitude, and longitude are null; no jurisdiction, route occurrence, entrance, or Google destination may be inferred. |
| WEIDINGER W | — | HELD_DESTINATION | Current production county, township, latitude, and longitude are null; no jurisdiction, route occurrence, entrance, or Google destination may be inferred. |
| WILEY | — | HELD_DESTINATION | Current production county, township, latitude, and longitude are null; no jurisdiction, route occurrence, entrance, or Google destination may be inferred. |
| ALBERT | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| ALBRIGHT | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| ANCHOR | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| ANTELOK | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| BEDWAY | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| BENNINGTON | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| BLAYNEY | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| BLESSED | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| BOROVICH | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| BREEZE | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| CARLOS | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| COFFIELD | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| COLEMAN | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| COOK | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| CRAVAT NORTH | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| EMERSYN | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| EUREKA | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| EXETER | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| EZEKIEL | Belmont | INSUFFICIENT | Only unstructured written directions are available; a canonical route cannot be inferred without guessing. |
| FLEAGANE | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| GEOFLO | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| GRAND | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| HENDERSON | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| HINDMAN | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| KASETTA | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| KRNYAICH | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| KURTH | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| LEE | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| MILLER | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| OBOY | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| OLIVER | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| PAVICH | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| POL | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| PREMIERE | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| PROSSER E | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| R HOOVER | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| REITZ | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| RICHLAND B | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| ROBINSON | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| ROSS | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| SCHNEGG | Belmont | HELD_GEOMETRY | Identity/occurrence evidence is sufficient to avoid an identity hold, but exact clipped traveled geometry or the pad-specific terminal connector is not proven. |
| SEABRIGHT | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| SHUTWAY | Belmont | GOOGLE_QA_PENDING | Source-first route and evidence-backed phone-origin candidate are prepared; two-origin interactive Google rendering QA was not transmitted in this run. |
| SIDWELL | Belmont | HELD_GEOMETRY | Identity/occurrence evidence is sufficient to avoid an identity hold, but exact clipped traveled geometry or the pad-specific terminal connector is not proven. |
| SKYLINE | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| SMITH | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| SOPHIA JOE | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| THREE DADS | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| VANNELLE | Belmont | GOOGLE_QA_PENDING | Source-first route and evidence-backed phone-origin candidate are prepared; two-origin interactive Google rendering QA was not transmitted in this run. |
| VIOLET | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| WASSMANN | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| WEST | Belmont | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| WISE | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| WRIGHT | Belmont | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| ATMOS | Guernsey | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| AYERS | Guernsey | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| BETTS | Guernsey | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| BROWN | Guernsey | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| COAD | Guernsey | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| COOPER | Guernsey | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| DONNA | Guernsey | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| EGGLESTON | Guernsey | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| GINGERICH | Guernsey | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| HENRY | Guernsey | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| J BARR J | Guernsey | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| KROBY | Guernsey | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| LAVADA | Guernsey | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| LEILA | Guernsey | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| LINCOLN | Guernsey | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| MILLER FARMS | Guernsey | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| MOHOROVICH | Guernsey | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| RABER | Guernsey | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| RECTOR-C | Guernsey | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| SHIPMAN | Guernsey | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| SHUGERT DADDY | Guernsey | INSUFFICIENT | Only unstructured written directions are available; a canonical route cannot be inferred without guessing. |
| SLABAUGH | Guernsey | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| STELLA | Guernsey | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| TARPLEY | Guernsey | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| WAGLER | Guernsey | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| WAGNER | Guernsey | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| WALDO | Guernsey | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| WAMPUM | Guernsey | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| WATSON | Guernsey | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| ABLE | Harrison | INSUFFICIENT | Only unstructured written directions are available; a canonical route cannot be inferred without guessing. |
| ACE | Harrison | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| ALPHA | Harrison | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| BEACON | Harrison | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| BELLA | Harrison | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| BOUSKA | Harrison | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| BSA | Harrison | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| CHARLEY | Harrison | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| COBRA | Harrison | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| COLLECTORS | Harrison | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| CORDER | Harrison | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| CRAVAT COAL | Harrison | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| CRICKET | Harrison | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| CYPRESS | Harrison | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| DOMINO | Harrison | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| DWAYNE | Harrison | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| EDINGTON | Harrison | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| FOXTROT | Harrison | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| JONES | Harrison | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| LIGGETT | Harrison | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| MEDINAH | Harrison | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| PINE VALLEY | Harrison | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| ROSE | Harrison | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| SCOUT | Harrison | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| SHEPORGI | Harrison | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| SHERWOOD | Harrison | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| SPARGER | Harrison | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| TARBERT | Harrison | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| TRIPLETT | Harrison | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| UNA | Harrison | HELD_GEOMETRY | Identity/occurrence evidence is sufficient to avoid an identity hold, but exact clipped traveled geometry or the pad-specific terminal connector is not proven. |
| VICTOR | Harrison | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| VICTORIA | Harrison | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| AMBER | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| ARCHIE | Jefferson | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| ATLAS | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| BESECE | Jefferson | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| BORUM | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| CECELIA | Jefferson | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| CENA | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| CERMAK | Jefferson | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| CESARIO | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| CLUB | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| COLAIANNI | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| COLLINS | Jefferson | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| CREAMER | Jefferson | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| CROSS CREEK | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| CROWELL | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| DALRYMPLE | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| DARROW | Jefferson | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| DAWSON | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| DICKSON | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| DOYEN | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| ELITE | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| FALDOWSKI | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| FAUNA | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| FERGUSON | Jefferson | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| GABRIEL | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| GENO | Jefferson | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| GIUSTO | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| GORDON | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| GRISWOLD | Jefferson | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| GRYWALSKI | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| HAMMOCK | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| HARR | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| HOWELL | Jefferson | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| JACK HAMILTON | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| JADE | Jefferson | HELD_GEOMETRY | Identity/occurrence evidence is sufficient to avoid an identity hold, but exact clipped traveled geometry or the pad-specific terminal connector is not proven. |
| KELPIE | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| KRINKE | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| LORI | Jefferson | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| MARQUARD | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| MINGO | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| NOELLE | Jefferson | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| NOLAN | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| OMAITS | Jefferson | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| PACKER | Jefferson | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| PATRIOT | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| PEARL | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| PHILLIPS | Jefferson | HELD_GEOMETRY | Identity/occurrence evidence is sufficient to avoid an identity hold, but exact clipped traveled geometry or the pad-specific terminal connector is not proven. |
| PIERGALLINI | Jefferson | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| PORCO | Jefferson | HELD_GEOMETRY | Identity/occurrence evidence is sufficient to avoid an identity hold, but exact clipped traveled geometry or the pad-specific terminal connector is not proven. |
| PUGGLE | Jefferson | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| RECTOR | Jefferson | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| RILEY | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| RONALD | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| ROXY | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| SATORI | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| SMITHFIELD | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| SPORT | Jefferson | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| STONE | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| TANNER | Jefferson | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| THOMPSON | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| VINCENT | Jefferson | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| WILMA | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| ZEDS | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| ZIMNOX | Jefferson | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| MONROE NORTH | Monroe | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| ALABASTER | Noble | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| BILLY SHERMAN | Noble | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| DEBASER | Noble | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| MATADOR | Noble | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |
| RUBY-OPAL | Noble | HELD_IDENTITY | The earliest unresolved cleaned-source blocker is an exact authoritative identity/Road Manager mapping gap. |
| VAULT | Noble | HELD_TRANSITION | Named road evidence exists, but at least one exact traveled junction or occurrence receipt is unresolved. |

The complete per-occurrence identities, candidate evidence, mappings, occurrence receipts, junctions, geometry states, source bytes/digests, private-tail handling, and current navigation evidence are in `v18/scripts/fixtures/ascent-ohio-route-completion-20260830.json`; the one-row-per-pad ledger is `docs/ascent-ohio-route-completion-20260830.csv`.

## Safety checkpoint

- production writes = 0
- migrations applied = 0
- graph changes = 0
- graph activation = 0
- public Google publication = 0
- cutover = 0
- merge = 0
- deployment = 0
- straight GPS tethers promoted to teal = 0
- unresolved private connectors promoted to teal = 0
- service keys or secrets added = 0

The #211 map recovery contract is frozen by Git-blob digest: saved directory rows survive refresh errors, neutral/red approaches remain under verified highways such as OH-7, and MAMMOTH remains represented by its current production directory evidence.
