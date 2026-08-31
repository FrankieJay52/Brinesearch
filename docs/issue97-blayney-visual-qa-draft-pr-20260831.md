# BLAYNEY reviewed Google handoff — draft PR evidence

Date: 2026-08-31
Branch: `feature/v18-blayney-reviewed-handoff`
Base: `main` @ `46a4710`
Status: **DRAFT ONLY. DO NOT MERGE.**
Scope: BLAYNEY only.

## Bound record

- padId / canonicalId: `f896d00c-da26-41b6-bf5b-e9d91afbdbc6`
- legacyId: `ascent--blayney`
- recordRevision: `1788117937351112`
- stored structuredRoadSequence: `I-70 → Exit 213 → OH-331 → OR → OH-9 → OH-149 → OH-331`
- destination source: `saved_pad_gps`
- destination: `40.115603, -80.992706`
- waypoints:
  - OH-331: `40.105927699, -80.975684341`
  - Lafferty-Bannock / CR-10: `40.108586794, -80.978877279`

Phone-origin URL:

https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.115603%2C-80.992706&waypoints=40.105927699%2C-80.975684341%7C40.108586794%2C-80.978877279

## Satellite

Google satellite at the saved pin shows the labeled Blayney pad deck. The public-road approach is I-70 → Exit 213 → OH-331 → Lafferty-Bannock / CR-10. The last movement from CR-10 onto the deck is the lease / approach road. Google may render that connector as Gas Station Road / Pamela Ave; those labels are not new road identities.

## Two-origin Google QA — summary capture only; maneuver transcript pending

Same two shaping points and the same saved pin. Phone remains the production origin. These named-origin checks only prove road order.

**Current QA status: incomplete.** The observations below preserve Google's
route summaries, stop labels, and Exit 213 map label. They are not the expanded
road-by-road maneuver transcript requested for final visual QA.

### West origin (I-70 eastbound toward Exit 213)

- Origin used: Pilot Travel Center / I-70 Exit 208, Morristown, OH
- Google summary: **via I-70 E and OH-331 N** · 14 min · 8.9 miles
- Ordered stops Google displayed:
  1. Pilot Travel Center, 663 Belmont Morristown
  2. 70160 Main St, St Clairsville, OH 43950 (OH-331 control)
  3. 45104 Lafferty-Bannock, St Clairsville, OH (CR-10 control)
  4. 70630 Pamela Ave GAS WELL PAD (saved BLAYNEY pin)
- Map label at the interstate departure: **213**
- Check URL: https://www.google.com/maps/dir/I-70+Exit+208,+Ohio/40.105927699,-80.975684341/40.108586794,-80.978877279/40.115603,-80.992706

### East origin (I-70 westbound toward Exit 213)

- Origin used: 51400 National Rd E, St Clairsville, OH
- Google summary: **via I-70 W and OH-331 N** · 14 min · 10.1 miles
- Ordered stops Google displayed:
  1. 51400 National Rd E, St Clairsville, OH
  2. 70160 Main St, St Clairsville, OH 43950 (OH-331 control)
  3. 45104 Lafferty-Bannock, St Clairsville, OH (CR-10 control)
  4. 70630 Pamela Ave GAS WELL PAD (saved BLAYNEY pin)
- Map label at the interstate departure: **213**
- Check URL: https://www.google.com/maps/dir/40.072,-80.860/40.105927699,-80.975684341/40.108586794,-80.978877279/40.115603,-80.992706

### What this evidence does and does not prove

Observed in the captured summaries and stop order: both directions use I-70,
OH-331, the Lafferty-Bannock / CR-10 control, and the saved pin, with Exit 213
shown on the map.

Still pending: open **Details** for both named-origin checks and record the
complete road-by-road maneuver lists, or attach screenshots of both expanded
step lists. The pass condition remains that both origins leave I-70 at Exit
213, stay on the intended OH-331 occurrence, take Lafferty-Bannock / CR-10,
and finish at the saved pin without a wrong-road substitution. Stop labels by
themselves are not a complete maneuver transcript.

Not proved / not published: lease geometry, verified entrance, graph membership, public-Google authority, owner-approval receipt, or a change to PR #212.

## Tests

Exact local run after this contract only:

```
RUN  v4.1.11

✓ src/data/reviewedNavigationCandidates.test.ts (110 tests)
✓ src/data/ascentBatch0NavigationLedger.test.ts (5 tests)

Test Files  2 passed (2)
     Tests  115 passed (115)
```

Named-road contract audit target:

`62 Ascent pads are navigable, 185 remain GPS-only`

Unchanged:

- 46 owner-approval receipts
- frozen 55-entry static display catalog
- 192 batch-2 approach records
- PR #212
- ALBERT, CROSS CREEK, HINDMAN, COLEMAN

## Proposed accounting if this draft is later merged

- 62 navigable
- 185 GPS-only
- 53 exact-record reviewed Google handoffs
- plus 9 existing database releases

Current `main` remains 61 / 186 / 52 until this draft is merged by a human.
