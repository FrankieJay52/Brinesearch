# Four-pad visual-QA evidence package
Date: 2026-08-31
Repo: FrankieJay52/Brinesearch
Base main SHA: 46a4710a33aa713843749038886aac55ab08e489
Status: NOT MERGED. NOT PRODUCTION.

ChatGPT was correct: this branch originally pointed at main with zero code delta because the contract payload was never pushed.

## Exact phone-origin Google URLs

No origin parameter. `api=1`, `travelmode=driving`, `dir_action=navigate`.

### ALBERT
- padId: `12da2a9f-c9ae-467f-abf5-723c31daecfe`
- legacyId: `ascent--albert`
- recordRevision: `1786405417119866`
- destination source: `saved_pad_gps`
- destination: `40.04569, -81.21533`
- waypoints: `40.0485, -81.218`
- structuredRoadSequence: `I-70 → Exit 198 → OH-114 → Lease Road`
- URL: https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.04569%2C-81.21533&waypoints=40.0485%2C-81.218
- East test: https://www.google.com/maps/dir/40.052,-81.17/40.0485,-81.218/40.04569,-81.21533
- West test: https://www.google.com/maps/dir/40.055,-81.28/40.0485,-81.218/40.04569,-81.21533

### CROSS CREEK
- padId: `69c4cf2d-f404-48c5-b4a9-08099de4664b`
- legacyId: `ascent--cross-creek`
- recordRevision: `1787459253071652`
- destination source: `saved_pad_gps`
- destination: `40.310116, -80.711596`
- waypoints: `40.3422, -80.8178` | `40.342, -80.800`
- URL: https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.310116%2C-80.711596&waypoints=40.3422%2C-80.8178%7C40.342%2C-80.8
- East test: https://www.google.com/maps/dir/Steubenville,+OH/40.3422,-80.8178/40.342,-80.800/40.310116,-80.711596
- West test: https://www.google.com/maps/dir/Hopedale,+OH/40.3422,-80.8178/40.342,-80.800/40.310116,-80.711596
- Unshaped control: https://www.google.com/maps/dir/Steubenville,+OH/40.310116,-80.711596

### HINDMAN — reference only, not ordinary entrance navigation
- padId: `07b566cd-393e-49f6-9547-676438aefc1a`
- legacyId: `ascent--hindman`
- recordRevision: `1786246617744175`
- destination source: `official_pad_reference`
- destination: `40.080894, -80.842001`
- waypoints: `40.074, -80.853`
- structuredRoadSequence: `I-70 → Exit 218 → Mall Rd → Hindman Rd`
- URL: https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.080894%2C-80.842001&waypoints=40.074%2C-80.853
- Do not merge as a normal navigate-to-entrance contract. Official ODNR pin. NOT BUILT.

### BLAYNEY
- padId: `f896d00c-da26-41b6-bf5b-e9d91afbdbc6`
- legacyId: `ascent--blayney`
- recordRevision: `1788117937351112`
- destination source: `saved_pad_gps`
- destination: `40.115603, -80.992706`
- waypoints: `40.078, -80.986` | `40.112, -80.993`
- structuredRoadSequence: `I-70 → Exit 213 → OH-331 → OR → OH-9 → OH-149 → OH-331`
- URL: https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.115603%2C-80.992706&waypoints=40.078%2C-80.986%7C40.112%2C-80.993

### COLEMAN candidate only
- padId: `ab964acf-05ac-4e18-b8cd-e5cb3914105c`
- recordRevision: `1787459253071652`
- destination: `40.07909, -80.93528`
- waypoint: `40.075329, -80.934736`
- URL: https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.07909%2C-80.93528&waypoints=40.075329%2C-80.934736
- West check: https://www.google.com/maps/dir/40.07,-81.05/40.075329,-80.934736/40.07909,-80.93528
- East check: https://www.google.com/maps/dir/40.07,-80.75/40.075329,-80.934736/40.07909,-80.93528

## Verdict after the ChatGPT audit

- Remote empty branch: agreed. This file is the first remote delta.
- Do not merge contracts to main from this evidence file alone.
- HINDMAN must not be published as ordinary entrance navigation.
- COLEMAN stays candidate-only.
- 46 owner-approval receipts and PR #212 remain untouched.
