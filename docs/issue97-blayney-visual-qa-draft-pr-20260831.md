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

## Two-origin Google QA — expanded maneuver transcripts captured; PASS

Same two shaping points and the same saved pin. Phone remains the production origin. These named-origin checks only prove road order.

**Current QA status: PASS.** Google's expanded Details lists are recorded below.
Both named-origin routes leave I-70 at Exit 213, use the intended OH-331
occurrence, take Lafferty-Bannock / CR-10, and then use the same unlabeled
lease / approach turns to reach the saved pin without a wrong-road substitution.

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

#### Expanded maneuver transcript

1. Exit Pilot parking lot toward OH-149 N (164 ft).
2. Turn right OH-149 N (0.1 mi).
3. Turn right merge I-70 E (4.4 mi).
4. Take Exit 213 for US-40 toward OH-331 (0.3 mi).
5. Turn right US-40 W (0.1 mi).
6. Turn left OH-331 N (2.5 mi) to 70160 Main St.
7. Head toward Crabapple Rd (0.2 mi).
8. Turn left Lafferty-Bannock (466 ft) to 45104.
9. Head west on Lafferty-Bannock (0.7 mi).
10. Turn right (0.3 mi).
11. Turn left.
12. Destination on right (371 ft) at saved pin.

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

#### Expanded maneuver transcript

1. Head toward US-40 E (223 ft).
2. Turn left US-40 W (0.6 mi).
3. Turn left Mall Rd (0.2 mi).
4. Turn right merge I-70 W (5.2 mi).
5. Take Exit 213 for OH-331 toward Flushing (0.2 mi).
6. Turn right OH-331 N (2.3 mi) to 70160 Main St.
7. Head toward Crabapple Rd (0.2 mi).
8. Turn left Lafferty-Bannock (466 ft) to 45104.
9. Head west on Lafferty-Bannock (0.7 mi).
10. Turn right (0.3 mi).
11. Turn left.
12. Destination on right (371 ft) at saved pin.

### What this evidence does and does not prove

The expanded maneuver lists prove the required road order from both directions.
The west route follows I-70 E to Exit 213, uses the short US-40 W connection to
the intended OH-331 N occurrence, and reaches the Lafferty-Bannock / CR-10
control. The east route follows I-70 W to Exit 213, turns directly onto the same
OH-331 N occurrence, and reaches the same Lafferty-Bannock / CR-10 control.
Both lists then show the same unlabeled lease / approach sequence: west on
Lafferty-Bannock, right, left, and destination on the right at the saved pin.
There is no wrong-road substitution before the reviewed named-road sequence is
complete. The unlabeled final turns are maneuver evidence only; they do not
create road identities or approved geometry.

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
