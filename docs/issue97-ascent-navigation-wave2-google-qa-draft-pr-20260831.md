# Ascent navigation second wave — Google and satellite QA evidence

Date: 2026-08-31  
Branch: `feature/v18-ascent-navigation-completion-20260831`  
Base: `main` at `46a4710`  
Status: **DRAFT ONLY. DO NOT MERGE OR DEPLOY.**

## Decision and authority boundary

ALABASTER, COOK, SIDWELL, DONNA, CECELIA, DICKSON, SHUTWAY, CARLOS, CRAVAT NORTH, and KURTH passed opposite-direction Google road-order review and satellite review. The phone-origin links below are bound to the exact current directory records in this Draft tree.

These ten handoffs create no owner-approval receipt, static display entry, graph membership, public-Google authority, official road identity, or lease geometry. The phone remains the production origin; named or coordinate origins were proof inputs only. PR #212 was not changed. Earlier rejected CARLOS, CRAVAT NORTH, and KURTH waypoint variants remain rejected and are not present in the runtime.

## ALABASTER — PASS

- Exact bind: `0f848006-4c09-4c7f-b9f2-4743d5ccd37f` / `ascent--alabaster` / revision `1786258360881449` / Noble, Ohio
- Exact sequence: `I-77 → Exit 25 → OH-78 → Bean Ridge Rd / CR-54 → Curtis Ridge Rd / TR-233 → Buckingham Rd / TR-232 → Lease Road`
- Verified driver entrance: `39.753932,-81.340877`
- Controls: Bean Ridge / CR-54 `39.781098,-81.326968`; Curtis Ridge / TR-233 `39.764877,-81.318449`; Buckingham / TR-232 `39.759918,-81.333307`
- Phone URL: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.753932%2C-81.340877&waypoints=39.781098%2C-81.326968%7C39.764877%2C-81.318449%7C39.759918%2C-81.333307`

Cambridge and Marietta proofs both used I-77 Exit 25, OH-78, Bean Ridge / CR-54, Curtis Ridge / TR-233, and Buckingham / TR-232 in order before the exact entrance. Google's final movement was about 30 feet. Satellite showed a continuous approach to the pad; it is ALABASTER's pad approach, not official road or navigation geometry.

## COOK — PASS

- Exact bind: `4213711f-0f23-440a-b0ec-42a1f9be4db0` / `ascent--cook` / revision `1786265812046205` / Belmont, Ohio
- Exact sequence: `St Bellaire Exit On St → OH-149 → Tar Run Rd → Cumberland Run Rd → Lease Road`
- Saved GPS: `40.002019,-80.875167`
- Controls: Tar Run `40.002767,-80.875883`; Cumberland Run `40.002715,-80.875455`
- Phone URL: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.002019%2C-80.875167&waypoints=40.002767%2C-80.875883%7C40.002715%2C-80.875455`

Bellaire and Belmont proofs both used OH-149, Tar Run Road, and Cumberland Run Road in order before the saved pin. Google's final movement was about 39 feet. Satellite showed the short gravel spur into the site; it is COOK's pad approach, not official road or navigation geometry.

## SIDWELL — PASS

- Exact bind: `5a0ede1b-4586-4edc-9438-7cb29a24e58e` / `ascent--sidwell` / revision `1787459253071652` / Belmont, Ohio
- Exact sequence: `OH-1 → OH-9 → Unity Church Rd → Pad → OR → I-70 → Exit 216 → OH-9 → Newell Ave → OH-9N → Unity Church Rd → OR → OH-1 → OH-331S → OH-149N → OH-9S → Unity Church Rd`
- Saved GPS: `40.146316,-80.979282`
- Controls: intended OH-9 occurrence `40.137945,-80.952025`; Unity Church `40.149932,-80.974296`
- Phone URL: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.146316%2C-80.979282&waypoints=40.137945%2C-80.952025%7C40.149932%2C-80.974296`

Cadiz and St Clairsville proofs both used the intended OH-9 occurrence and then Unity Church Road to the saved pin. Satellite showed a short continuous site access. The exact three-alternative directory string remains unchanged.

## DONNA — PASS

- Exact bind: `8a7b9669-169d-45a5-bf55-b9be5cbd51e2` / `ascent--donna` / revision `1787459253071652` / Guernsey, Ohio
- Exact sequence: `OH-800 → US-22 → Skull Fork Rd → Bond Ln → OR → I-77 → Exit 47 → US-22 → Skull Fork Rd → Bond Ln → OR → I-70 → Exit 193 → OH-513 → US-22 → Skull Fork Rd → Bond Ln`
- Saved GPS: `40.123656,-81.252093`
- Controls: Skull Fork `40.142887,-81.262548`; Bond `40.120272,-81.254445`
- Phone URL: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.123656%2C-81.252093&waypoints=40.142887%2C-81.262548%7C40.120272%2C-81.254445`

Cambridge and Cadiz proofs both used US-22, Skull Fork Road, and Bond Lane in order. Satellite placed the saved pin at the site entrance on Bond Lane with the pad visible. Any final site movement remains DONNA's pad approach.

## CECELIA — PASS

- Exact bind: `45b2cfd7-1936-406d-bf6c-de0b8acc8e88` / `ascent--cecelia` / revision `1787459253071652` / Jefferson, Ohio
- Exact sequence: `US-22 → OH-151 → A Left Onto County Rd → CR-25 → Pad`
- Saved GPS: `40.282447,-80.756322`
- Controls: OH-151 `40.28077,-80.758898`; intended CR-25 occurrence `40.282425,-80.757726`
- Phone URL: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.282447%2C-80.756322&waypoints=40.28077%2C-80.758898%7C40.282425%2C-80.757726`

Hopedale and Smithfield proofs both used OH-151 and then the intended CR-25 occurrence, with about 0.1 mile remaining to the saved pin. Google rendered the local control as Weems Road / 3990 County Road 25; that is renderer context only. Satellite showed the clear pad deck immediately off CR-25.

## DICKSON — PASS

- Exact bind: `18257dbf-d681-46dd-be38-a8e4a6aab56f` / `ascent--dickson` / revision `1787459253071652` / Jefferson, Ohio
- Exact sequence: `OH-1 → OH-152 → Steubenville St → Bloomingdale- Smithfield- Chandl/high St → Fernwood Bloomingdale Rd → Dawson Rd → Township Hwy → TR-187`
- Saved GPS: `40.307082,-80.694744`
- Controls: OH-152 `40.355752,-80.808421`; East Steubenville `40.346345,-80.814842`; Dawson `40.316061,-80.716008`
- Phone URL: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.307082%2C-80.694744&waypoints=40.355752%2C-80.808421%7C40.346345%2C-80.814842%7C40.316061%2C-80.716008`

Both opposite-direction proofs followed East Steubenville, Bloomingdale-Smithfield-Chandl / High, Fernwood Bloomingdale, and Dawson in the written order after the numbered anchor, then continued toward TR-187 and the saved pin. Satellite showed a clear deck and continuous pad approach.

## SHUTWAY — PASS

- Exact bind: `69c63442-de05-4d15-95da-07da587bc070` / `ascent--shutway` / revision `1788117937351112` / Belmont, Ohio
- Exact sequence: `I-70 → Exit 208 → OH-149 → Pad`
- Saved GPS: `40.113559,-81.076149`
- Control: OH-149 `40.113608,-81.077486`
- Phone URL: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.113559%2C-81.076149&waypoints=40.113608%2C-81.077486`

The Cambridge proof used I-70 E and the Exit 208 / OH-149 interchange. The east-origin proof explicitly used I-70 W Exit 208 toward Belmont / Morristown. Both continued on OH-149 N to the saved pin. Satellite centered the pin on the labeled Shutway deck with a direct driveway off OH-149.

## CARLOS — PASS

- Exact bind: `b9d1a8de-2ddd-4345-82a1-7e2a1f6ff2cb` / `ascent--carlos` / revision `1786265812046205` / Belmont, Ohio
- Exact sequence: `I-70E → Exit 208 → OH-149 → Elm States Rd → Pad`
- Saved GPS: `40.042305,-80.972809`
- Controls: OH-149 south occurrence `40.0295248,-81.0390724`; Elm Station approach controls `40.03522,-80.974717` and `40.03788,-80.975034`
- Phone URL: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.042305%2C-80.972809&waypoints=40.0295248%2C-81.0390724%7C40.03522%2C-80.974717%7C40.03788%2C-80.975034`

The west Exit 208 / Pilot and east-coordinate proofs both explicitly used I-70 Exit 208 and OH-149 S. Google's short official Belmont continuation rendered Palmer, John, and East Main, then OH-149 E and Elm Station Road to the pin. Written `Elm States Rd` versus rendered `Elm Station Road` is alias context only. Satellite showed road shield 82 / Elm Station labeling and the saved pin at the driveway into a clear deck. Only this corrected three-control set passed.

## CRAVAT NORTH — PASS

- Exact bind: `23053421-06d5-47a2-bf77-5c3fdea4939b` / `ascent--cravat-north` / revision `1786258360881449` / Belmont, Ohio
- Exact sequence: `I-70 → Exit 216 → OH-9 → Shepherstown Rd → CR-36`
- Saved GPS: `40.158191,-80.913312`
- Controls: OH-9 `40.0691313,-80.9002496`; Shepherdstown occurrence `40.151952334248,-80.961064815011`; City Road 36 / approach occurrence `40.165847,-80.936123`
- Phone URL: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.158191%2C-80.913312&waypoints=40.0691313%2C-80.9002496%7C40.151952334248%2C-80.961064815011%7C40.165847%2C-80.936123`

Both west and east proofs explicitly used I-70 Exit 216, OH-9 N, Shepherdstown, City Road 36, Stiers renderer context, and the restricted approach to the saved pin. Written `Shepherstown` versus rendered `Shepherdstown` is spelling context only. Satellite showed a clear deck and continuous approach. Only this corrected three-control set passed.

## KURTH — PASS

- Exact bind: `83499ca1-3c45-4502-b7c2-688e88343093` / `ascent--kurth` / revision `1786258360881449` / Belmont, Ohio
- Exact sequence: `I-70 → Exit 216 → OH-9 → CR-5 → Methodist Ridge Rd → Campbell-johnson Hill Rd → Lease Road`
- Saved GPS: `40.031709,-80.841961`
- Controls: OH-9 / CR-5 junction `40.0537082,-80.9182359`; Methodist Ridge `40.039338,-80.857119`; Campbell-Johnson Hill approach `40.03185,-80.842057`
- Phone URL: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.031709%2C-80.841961&waypoints=40.0537082%2C-80.9182359%7C40.039338%2C-80.857119%7C40.03185%2C-80.842057`

Both proofs used I-70 Exit 216 and OH-9 S to the Google-canonical OH-9 / Glencoe Road CR-5 junction, then physical Glencoe / CR-5, Methodist Ridge Road, and Campbell-Johnson Hill Road to the saved pin. Glencoe is renderer context for CR-5 only. Satellite showed the clear entrance split and pad deck. Only this corrected three-control set passed.

## Draft accounting

This second wave adds ten exact-record reviewed handoffs to the six-route first wave already on this branch:

- 77 navigable
- 170 GPS-only
- 68 exact-record reviewed handoffs
- 46 owner-approval receipts unchanged
- frozen 55-entry static display catalog unchanged
- 192 batch-2 approach records unchanged

Main remains 61 / 186 / 52 until a human merge. BLAYNEY remains isolated on PR #215 and is not included here.
