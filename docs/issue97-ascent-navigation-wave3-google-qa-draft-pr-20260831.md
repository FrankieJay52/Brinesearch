# Issue #97 — Ascent navigation wave 3 Google QA (Draft PR, 2026-08-31)

## Status and authority boundary

This notebook covers exactly ten independent exact-record reviewed handoffs:
PUGGLE, REITZ, ELITE, MARQUARD, J BARR J, MOHOROVICH, WATSON, CRAVAT COAL,
MONROE NORTH, and CERMAK.

The production action is phone-origin Google Navigate. Every URL below omits
`origin`, uses one to three reviewed controls, and ends at the exact saved pad
GPS. Named origins mentioned below are proof inputs only; they are not written
into the production URL. Where the forwarded evidence said only "both reviewed
directions," this notebook does not invent origin labels.

On this unmerged and undeployed Draft branch, the proposed accounting is **87
navigable**, **160 GPS-only**, and **78 exact-record reviewed handoffs**. Those
78 are the unchanged **46 receipt-bound** handoffs plus **32 independent**
handoffs without owner receipts. This wave adds no owner receipt and changes no
receipt fingerprint. The frozen **55-entry static display catalog** and **192
batch-2 approach records** are unchanged. No production database, GPS,
`directions_clear`, graph geometry, or public-Google row is changed.

Renderer labels below are continuity context only. They do not replace the
exact directory identity, rewrite the byte-exact stored sequence, establish a
Road Manager identity, or turn the final lease/access connector into official
navigation geometry.

## Exact records and reviewed evidence

### PUGGLE

- Exact binding: `padId` / `canonicalId`
  `ce1bff99-9c64-435e-a517-e5b8f1a102b7`; `legacyId`
  `ascent--puggle`; revision `1787459253071652`; Ascent, Ohio, Jefferson.
- Byte-exact sequence: `US-22 → CR-23 → CR-26 → Pad`.
- Trusted destination: `saved_pad_gps`, saved pad reference,
  `40.318098,-80.774283`.
- Reviewed controls: `40.341887,-80.815764`;
  `40.340191,-80.795637`; `40.322794,-80.778771`.
- Phone URL: <https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.318098%2C-80.774283&waypoints=40.341887%2C-80.815764%7C40.340191%2C-80.795637%7C40.322794%2C-80.778771>
- Two-origin road order: the Cadiz and Steubenville proofs both preserve US-22,
  the Bloomingdale / OH-152 exit, CR-23, and CR-26 before the saved pin.
- Satellite: the labeled Ascent NAC-B site and its visible connector reach the
  saved destination; the final movement remains unapproved.
- Renderer context: Google shows CR-25 during the final continuation and may
  show nearby Boich Mining. Neither label is promoted to the exact record.

### REITZ

- Exact binding: `padId` / `canonicalId`
  `b8490b6c-0924-4b1d-a46e-6dc54e7e7267`; `legacyId` `ascent--reitz`;
  revision `1786265812046205`; Ascent, Ohio, Belmont.
- Byte-exact sequence: `OH-147 → Old Gas Station Wegee Rd → Lease Road`.
- Trusted destination: `saved_pad_gps`, saved pad reference,
  `39.95176,-80.857579`.
- Reviewed controls: `39.973035,-80.866785`; `39.957356,-80.858561`.
- Phone URL: <https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.95176%2C-80.857579&waypoints=39.973035%2C-80.866785%7C39.957356%2C-80.858561>
- Two-origin road order: the Bethesda and Bellaire proofs both preserve OH-147
  and the written Wegee Road occurrence before the saved pin.
- Satellite: the Reitz well pad and final connector are visible; the connector
  remains unapproved.
- Renderer aliases: Crozier, Crosier, and TR-291 describe final-continuation
  context only and do not replace `Old Gas Station Wegee Rd` in the exact
  record.

### ELITE

- Exact binding: `padId` / `canonicalId`
  `5484ef9c-cc1f-4eca-9527-63d4a64183fb`; `legacyId` `ascent--elite`;
  revision `1787459253071652`; Ascent, Ohio, Jefferson.
- Byte-exact sequence: `OH-150`.
- Trusted destination: `saved_pad_gps`, saved pad reference,
  `40.188588,-80.805198`.
- Reviewed control: `40.18229024541456,-80.81216401929144`.
- Phone URL: <https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.188588%2C-80.805198&waypoints=40.18229024541456%2C-80.81216401929144>
- Two-origin road order: the Harrisville and Dillonvale proofs both preserve
  the US-250 / OH-150 corridor and TR-107A to ELITE's separate western deck.
- Satellite: the western deck and continuous access are visible; the final
  access remains unapproved.
- Renderer context: nearby `Marquad` may appear as destination context. It does
  not replace ELITE or create another identity.

### MARQUARD

- Exact binding: `padId` / `canonicalId`
  `638487d0-2ef4-4e5c-8a16-cbb478c490c6`; `legacyId` `ascent--marquard`;
  revision `1787459253071652`; Ascent, Ohio, Jefferson.
- Byte-exact sequence: `OH-150 → Access Road`.
- Trusted destination: `saved_pad_gps`, saved pad reference,
  `40.190145,-80.798772`.
- Reviewed control: `40.18229024541456,-80.81216401929144`.
- Phone URL: <https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.190145%2C-80.798772&waypoints=40.18229024541456%2C-80.81216401929144>
- Two-origin road order: the Harrisville and Dillonvale proofs both preserve
  the shared US-250 / OH-150 and TR-107A corridor, then continue behind ELITE
  without backtracking to MARQUARD's separate east / northeast deck.
- Satellite: the separate deck and continuous access are visible; the final
  access remains unapproved.
- Renderer context: no separate road alias was forwarded. ELITE is a neighboring
  pad cue only, not an alias or replacement identity for MARQUARD.

### J BARR J

- Exact binding: `padId` / `canonicalId`
  `8698112a-c3b4-453e-94d0-bcf4b2476cfb`; `legacyId`
  `ascent--j-barr-j`; revision `1786258360881449`; Ascent, Ohio, Guernsey.
- Byte-exact sequence: `I-70 → Exit 193 → OH-513 → Oxford Rd → Lease Road`.
- Trusted destination: `saved_pad_gps`, saved pad reference,
  `40.03226,-81.263847`.
- Reviewed controls: `40.017045,-81.299503`; `40.024285,-81.282984`.
- Phone URL: <https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.03226%2C-81.263847&waypoints=40.017045%2C-81.299503%7C40.024285%2C-81.282984>
- Two-origin road order: both reviewed directions preserve I-70 Exit 193,
  OH-513, and Oxford Road before the saved pin. The forwarded evidence did not
  name the two proof origins.
- Satellite: the pad approach is visible and confirmed; the final connector
  remains unapproved.
- Renderer alias: Google's short `Pisgah` rendering is continuity context only
  and is not promoted to a directory identity.

### MOHOROVICH

- Exact binding: `padId` / `canonicalId`
  `fc8a81c6-ccd5-4d1c-9eb6-507f05317688`; `legacyId`
  `ascent--mohorovich`; revision `1786265812046205`; Ascent, Ohio, Guernsey.
- Byte-exact sequence: `I-70 → OH-513 → OH-265 → OH-761 → Sparrow Rd`.
- Trusted destination: `saved_pad_gps`, saved pad reference,
  `39.951763,-81.374778`.
- Reviewed controls: `40.017045,-81.299503`;
  `39.9537789,-81.3563461`; `39.9408465,-81.3706626`.
- Phone URL: <https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.951763%2C-81.374778&waypoints=40.017045%2C-81.299503%7C39.9537789%2C-81.3563461%7C39.9408465%2C-81.3706626>
- Two-origin road order: both reviewed directions preserve OH-513, OH-265,
  OH-761, and Sparrow Road before the saved pin. The forwarded evidence did not
  name the two proof origins.
- Satellite: the pad approach is visible and confirmed; the final movement
  remains unapproved.
- Renderer aliases: Google's `OK-761` typo and `Mel Frakes` / `Frankfort`
  labels are context only and do not rewrite the exact record.

### WATSON

- Exact binding: `padId` / `canonicalId`
  `88709ded-fda7-42df-ba94-b6bb6c04e45a`; `legacyId` `ascent--watson`;
  revision `1786265812046205`; Ascent, Ohio, Guernsey.
- Byte-exact sequence: `Route 70 → Exit 193 → OH-513 → OH-265 → OH-761 → Mel Franks Rd → Pad`.
- Trusted destination: `saved_pad_gps`, saved pad reference,
  `39.963226,-81.362466`.
- Reviewed controls: `40.017045,-81.299503`;
  `39.9537789,-81.3563461`; `39.9408465,-81.3706626`.
- Phone URL: <https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.963226%2C-81.362466&waypoints=40.017045%2C-81.299503%7C39.9537789%2C-81.3563461%7C39.9408465%2C-81.3706626>
- Two-origin road order: both reviewed directions render the numbered route as
  I-70 and preserve Exit 193, OH-513, OH-265, OH-761, and Mel Franks Road
  before the saved pin. The forwarded evidence did not name the two origins.
- Satellite: the visible pad approach is confirmed; the final movement remains
  unapproved.
- Renderer alias: `Yeoman Lane` is final-approach context only and is not
  promoted to the exact record.

### CRAVAT COAL

- Exact binding: `padId` / `canonicalId`
  `4b0b99b7-da77-4b27-a2f7-7e8d3a9875d3`; `legacyId`
  `ascent--cravat-coal`; revision `1786258360881449`; Ascent, Ohio, Harrison.
- Byte-exact sequence: `I-70 → Exit 216 → OH-9 → Shepherdstown Rd → 5. Continue Onto City Rd → OR → OH-9 → Shepherdstown Rd → 3. Continue Onto City Rd → OR → OH-149 → OH-9 → Shepherdstown Rd → 5. Continue Onto City Rd`.
- Trusted destination: `saved_pad_gps`, saved pad reference,
  `40.168593,-80.931288`.
- Reviewed controls: `40.071,-80.9002`; `40.154305,-80.952863`;
  `40.165847,-80.936123`.
- Phone URL: <https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.168593%2C-80.931288&waypoints=40.071%2C-80.9002%7C40.154305%2C-80.952863%7C40.165847%2C-80.936123>
- Two-origin road order: both reviewed directions preserve I-70 Exit 216,
  OH-9 N, Shepherdstown Road, and City Road 36 before the saved pin. The
  forwarded evidence did not name the two origins.
- Satellite: Google leaves about 125 feet on the visible continuous pad
  approach. That connector remains unapproved, and the exact three-alternative
  record remains unchanged.
- Renderer context: no additional alias was forwarded; `City Road 36` is the
  proof rendering for the written City Road continuation, not a replacement
  directory identity.

### MONROE NORTH

- Exact binding: `padId` / `canonicalId`
  `314652b0-0abb-47cb-a263-88ca23582144`; `legacyId`
  `ascent--monroe-north`; revision `1787459253071652`; Ascent, Ohio, Monroe.
- Byte-exact sequence: `I-70E → I-470 → Exit 6 → OH-7 → Krebbs Hill Rd`.
- Trusted destination: `saved_pad_gps`, saved pad reference,
  `39.822655,-80.851694`.
- Reviewed controls: `39.834949,-80.827452`; `39.827478,-80.843496`;
  `39.8235,-80.85185`.
- Phone URL: <https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.822655%2C-80.851694&waypoints=39.834949%2C-80.827452%7C39.827478%2C-80.843496%7C39.8235%2C-80.85185>
- Two-origin road order: the north proof preserves I-70 E, I-470 Exit 6, and
  OH-7 S; the south proof uses the opposite OH-7 N approach. Both preserve the
  intended Krebbs Hill occurrence and TR-910 before the saved pin.
- Satellite: the deck and continuous connector are visible; the final movement
  remains unapproved.
- Renderer alias: `Krebs Ridge` is context only and does not replace the exact
  record's `Krebbs Hill Rd`.

### CERMAK

- Exact binding: `padId` / `canonicalId`
  `3e31e56b-6c85-4f0c-9a38-0554b42581a5`; `legacyId` `ascent--cermak`;
  revision `1787459253071652`; Ascent, Ohio, Jefferson.
- Byte-exact sequence: `OH-9 → I-70 → I-470 → Exit 6 → OH-7 → 2nd St → CR-80 → Liberty Ave → OH-150 → OH-152 → CR-11 → Piney Fork Rd → OR → US-22 → OH-151 / Mill St → OH-152 / South/main St → CR-11 → Piney Fork Rd`.
- Trusted destination: `saved_pad_gps`, saved pad reference,
  `40.244707,-80.807728`.
- Reviewed controls: `40.25843,-80.796177`; `40.250469,-80.806159`.
- Phone URL: <https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.244707%2C-80.807728&waypoints=40.25843%2C-80.796177%7C40.250469%2C-80.806159>
- Two-origin road order: the Hopedale and Dillonvale proofs both preserve
  OH-152 followed by the intended CR-11 / Piney Fork Road occurrence before the
  saved pin.
- Satellite: the visible final approach and pad deck are confirmed; the
  connector remains unapproved and the exact two-alternative record is
  unchanged.
- Renderer context: no separate alias was forwarded. `CR-11 / Piney Fork Rd`
  describes the reviewed intended occurrence and does not authorize any nearby
  same-numbered road.

## Review conclusion

All ten proposed contracts remain fail-closed on the complete exact current
directory record: UUID/canonical identity, legacy identity, revision, company,
name, state, county, byte-exact sequence, trusted saved destination, ordered
controls, and serialized phone-origin URL. Record drift or URL drift removes
the reviewed action. The proof descriptions and renderer aliases above create
no owner receipt, graph promotion, public-Google publication, official lease
geometry, or production deployment.
