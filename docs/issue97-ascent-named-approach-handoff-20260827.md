# Issue #97 — Ascent named-approach handoff notes (2026-08-27)

Written for a cold reader: another agent, another session, or a human picking
this up later. Everything here was measured against production
(`wvxzqtoiwhrgovzddtvz`) with read-only SQL. **No production write was made.**

---

## 1. Read this first — the two things that block everyone

### 1.1 Junction road names are local street names, not route numbers

`brinesearch_road_junction_memberships.road_name_at_junction` stores
`STUMPTOWN RD`, `CADIZ DENNISON RD`, `MAIN ST`. It does **not** store `OH-519`
or `US-250`.

Matching a route number against junction names returns **zero rows**, which is
indistinguishable from "this junction does not exist." Every pad then looks
unreleasable. This is almost certainly the single largest time sink on this
work to date.

The join that actually works:

```sql
-- does a verified junction exist between two numbered routes in a county?
select count(distinct j.id)
from public.brinesearch_road_graph_builds gb
join public.brinesearch_road_junctions j
  on j.build_id = gb.id and j.verification_status = 'verified'
join public.brinesearch_road_junction_memberships ma on ma.junction_id = j.id
join public.brinesearch_authoritative_road_identities ia on ia.id = ma.identity_id
 and ia.route_system = 'SR' and ia.route_number = '519'
join public.brinesearch_road_junction_memberships mb on mb.junction_id = j.id
join public.brinesearch_authoritative_road_identities ib on ib.id = mb.identity_id
 and ib.route_system = 'US' and ib.route_number = '250'
where gb.state_code = 'OH' and gb.county_name = 'Harrison' and gb.status = 'active';
```

`route_system` values in use: `SR` (state route), `US` (US route), `IR`
(interstate). Sequence tokens are written `OH-519`, `US-250`, `I-70`, so
`OH-` maps to `SR`.

### 1.2 `structured_road_sequence` order is NOT reliable

Some pads list roads drive-order (outermost first), some list them pad-outward
(nearest first). Same county, both conventions:

| Pad | Sequence | Pad actually sits on | Order |
|---|---|---|---|
| BEETLE | `OH-519 → US-250` | OH-519 (339.6 ft) | pad-outward — reversed |
| FOXTROT | `US-22 → OH-519` | OH-519 (1,155.6 ft) | drive-order |

**No digest or receipt assertion catches this.** A migration built on token
order rehearses clean, applies clean, and ships a route pointing the wrong
way. Any migration authored before 2026-08-27 must be re-checked on this axis
regardless of what it passed.

**Correct method:** the core road is whichever spine road the pad is measurably
closest to. The ingress is the verified junction linking it to the other spine
road. Derive it, never trust token order:

```sql
select round((min(extensions.st_distance(
         s.geom::extensions.geography,
         extensions.st_setsrid(extensions.st_makepoint(<lng>,<lat>),4326)::extensions.geography
       )) * 3.28084)::numeric, 0) as ft_pad_to_road
from public.brinesearch_authoritative_road_identities i
join public.brinesearch_authoritative_road_segments s
  on s.identity_id = i.id and s.active and s.county_code = '<CC>'
 and s.geom && extensions.st_expand(
       extensions.st_setsrid(extensions.st_makepoint(<lng>,<lat>),4326), 0.12)
where i.state_code='OH' and i.county_name='<County>' and i.active
  and i.route_system='<SR|US|IR>' and i.route_number='<num>';
```

The `&&` bbox prefilter matters — without it these queries hit the 60-second
tool timeout.

---

## 2. Current state

- Branch: `claude/brinesearch-finish-audit-eks1cv`
- Commit: `ea07b58` — Add BEETLE OH-519 named approach migration
- File: `supabase/migrations/20260827180000_issue97_beetle_oh519_named_core.sql`
- Status: **written, rehearsed against production, NOT applied**

Rehearsed 2026-08-27 in two guarded passes, each ending in a deliberate
`raise` so the transaction could only abort. Zero persistent delta confirmed
afterwards (BEETLE private 0 / public 0, named_total unchanged at 13).

| Pass | Result |
|---|---|
| Release logic + both inserts | `core_mi=0.574593 tail_ft=340.5 frac=1.0->0.94656907 pub_rows=1 steps=1 wp=2 leak=f` |
| Full preflight gate | `google=1/1 cutover=null anchors=1 build=active receipts=ok` |

Both inserts satisfied every CHECK constraint, the digest function accepted the
row, and the public projection rendered with no private-field leak.

Two bugs were found and fixed by rehearsing — neither was visible by reading:

1. `extensions.gen_random_uuid()` — the function lives in `pg_catalog`, not
   `extensions`. Would have failed at the insert.
2. The preflight asserted public Google rows `= 0`. Production has 1 (COLOGIE).
   The migration would have failed its own preflight. See §8.

Validated before commit (all returned true / matching):
- `brinesearch_v18_named_approach_waypoints_valid(...)` on the exact waypoint array
- `approach_key` against `^[a-z0-9][a-z0-9_-]{0,63}$`
- `approach_label` length within 1–120
- `brinesearch_v18_named_approach_release_digest(p_release <table rowtype>)`
- `brinesearch_issue97_authoritative_identity_geometry(p_identity_id uuid)`

**Not yet done:** the rollback-only rehearsal. It is a ~25 KB transaction with
heavy PostGIS work; the MCP `execute_sql` tool times out at 60 s and simpler
queries were already hitting that ceiling. Run it somewhere without that limit
(psql, or the existing `ops/issue97-computer-rollout` rehearsal harness).

A rehearsal script pattern that cannot accidentally commit — it raises at the
end, so the transaction can only abort, with the evidence in the error text:

```
begin;
<migration body>
do $g$ declare v_priv int; begin
  select count(*) into v_priv
    from private_verification.brinesearch_v18_named_approach_releases
   where pad_id='0e6f23f1-3bfb-44b0-aa4e-f24dde611880';
  raise exception 'REHEARSAL_PASSED private=%', v_priv;
end $g$;
rollback;
```

---

## 3. BEETLE — the complete build sheet

| Field | Value |
|---|---|
| pad_id | `0e6f23f1-3bfb-44b0-aa4e-f24dde611880` |
| pad coords | 40.185403, -80.922718 |
| route_prep_id (primary) | `d6f74d54-3102-4f02-bd8a-ee19e1b986cb` |
| graph_build_id (Harrison active) | `f4e4d43f-e86c-499c-893f-73f2eef3dc29` |
| graph_digest | `71cb3479ac57b6f5dc26d0985a056d06` |
| core identity (OH-519 / STUMPTOWN RD) | `e883315b-bf54-9192-4556-342bcb7bb1a5` |
| ingress junction (US-250 × OH-519) | `4fc9143f-604a-b331-8536-abf72dfd4bba` (`OH-HAS-JCT-F6047610`, t_junction, authoritative) |
| ingress anchor (single) | `fbb28b88-ce62-33f6-ca3e-dc57783b8d99` |
| ingress coords | 40.1883181, -80.9122508 |
| core_end coords | 40.1863325, -80.9225909 |
| line fraction ingress → core_end | 1.00000000 → 0.94656907 (**westbound**) |
| core length | 0.574593 mi |
| unapproved tail | 339.6 ft |
| receipts | 3 steps / 3 occurrences / **2 resolved** / 0 transitions / 0 geometry |

**BEETLE shares the OH-519 identity with the already-released BANJO.** BANJO
enters at the OH-9 end travelling **eastbound**; BEETLE enters at the opposite
US-250 end travelling **westbound**. BANJO's migration hardcodes
`if v_fraction_start >= v_fraction_end then raise` — that assertion is false
for BEETLE and must be inverted, not copied. The committed migration asserts
direction from the measured fractions.

BANJO reference route_preps: primary `20bc6634-c5de-46bd-9da7-e0785a3796fe`,
alternate `ea636bc7-2800-4a8f-b3e5-d4b292856d1d`.

---

## 4. Active graph builds (as of 2026-08-27)

| County | Code | build_id | status |
|---|---|---|---|
| Belmont | BEL | `9543e07c-f6eb-4682-a2dd-4d1f961377d5` | active |
| Guernsey | GUE | `f982e6dd-ff37-4fe0-b2e8-756112793bd5` | active |
| Harrison | HAS | `f4e4d43f-e86c-499c-893f-73f2eef3dc29` | active |
| Jefferson | JEF | `c9bac3a2-82d4-4b76-813c-6a29c1bf062a` | active |

Note `brinesearch_road_graph_builds` has **no `created_at`** column — use
`activated_at`.

---

## 5. The funnel — 247 down to 1

Every stage is a measurement, reproducible with the queries above.

| Stage | Pads |
|---|---|
| Ascent pads, six counties | 247 |
| `route_prep.readiness_status = 'ready_for_road_matching'` (primary) | 158 |
| Has a leading state/US/Interstate spine | 146 |
| Spine ≥ 2 roads with **every** junction verified | 23 |
| Survives clean-spine rules (no loops / prose / >3-road spines) | 14 |
| Unapproved tail short enough for the handoff to be real | 3 |
| Receipt profile matches shipped BANJO reference | **1 (BEETLE)** |

Readiness distribution across the 247:

| readiness_status | pads |
|---|---|
| ready_for_road_matching | 159 |
| (no route_prep row) | 24 |
| needs_sequence_reorder | 21 |
| needs_highway_anchor | 18 |
| needs_sequence_cleanup | 10 |
| field_check | 9 |
| needs_sequence_rebuild | 6 |

### 5.1 Tail length is the gate that kills most candidates

Distance from pad to its own core road. BANJO (shipped) is ~55 ft — a lease
stub. Beyond roughly a quarter mile the projected handoff is almost certainly
**not the real turnoff**, and publishing it strands the driver at an arbitrary
roadside point with more confidence than the data supports.

| Pad | County | Core road | Tail |
|---|---|---|---|
| BEETLE | Harrison | OH-519 | 340 ft ✅ |
| FOXTROT | Harrison | OH-519 | 1,156 ft — but 0 resolved occurrences ❌ |
| PHILLIPS | Jefferson | US-250 | 2,091 ft |
| MOONSTONE | Noble | OH-146 | 2,473 ft |
| VINCENT | Jefferson | OH-150 | 2,504 ft |
| PATRIOT | Jefferson | OH-151 | 2,619 ft |
| COLAIANNI | Jefferson | OH-150 | 3,101 ft |
| RECTOR-C | Guernsey | OH-313 | 3,541 ft |
| SMITH | Belmont | US-250 | 3,772 ft |
| RECTOR | Jefferson | OH-150 | 4,737 ft |
| EMERSYN | Belmont | US-40 | 5,775 ft |
| THOMPSON | Jefferson | OH-151 | 6,153 ft |
| SATORI | Jefferson | OH-151 | 6,212 ft |
| SPORT | Jefferson | US-22 | 10,814 ft |

---

## 6. Traps — verified dead ends, do not re-litigate

- **Do not use a distance threshold as a connectivity test.** No 15 m, no any
  radius. An Interstate crossing a state route is an overpass: ~0 m apart in
  plan view, correctly held as *not* a junction. Confirmed zero verified
  junctions for I-70 × OH-800 (AXLE), I-70 × OH-285 (JENNINGS), I-70 × OH-149
  (SHUTWAY). Interstate-to-state links are a graph-coverage gap.
- **Ascent PICKENS is `field_check`** and cannot be released. The
  `ready_for_road_matching` PICKENS at 40.411777, -80.924732 is **EOG's**
  pad — same name, different operator. Not an identity-reconciliation defect.
- **VICTORIA** has no `route_prep` row at all, and its coordinates
  (40.9992946, -81.0666759) are ~60 miles north of Harrison County.
- **Cross-county route references silently return zero.** PACKER (Jefferson)
  references OH-519, which has zero identities in Jefferson — it lives in
  Harrison. Same class as SCOUT's held same-road source boundary.
- **Concatenated alternates** masquerade as long chains: EMERSYN and
  PIERGALLINI each contain two complete alternate routes; RED-HILL-FARM reads
  `US-22 → OH-513 → US-22` and loops back.
- **Prose contamination:** tokens like `R 7 Take Hanover St`,
  `OH-7 North Take Hanover St`. KRINKE's spine collapses to a single road once
  prose is stripped.
- **A lone junction anchor is not enough.** Migration
  `20260826215136_issue97_revoke_incomplete_harrison_core_handoffs.sql` revoked
  two *released* receipts for exactly this: "Google can therefore approach the
  required junction from the wrong side and choose an unreviewed final path."
  Pin both ends — ingress **and** core_end.
- **Waypoints are capped at 1–3** by
  `private_verification.brinesearch_v18_named_approach_waypoints_valid`. A
  spine needing more than 3 constraint points cannot be expressed honestly.
  Drop the pad; do not truncate.

---

## 7. What the remaining 246 actually need

Not code. 179 of the 236 GPS-only pads require a township or county road after
their last state route — no graph work reaches them. The twelve measured above
are too far off the state system for a projected handoff to be meaningful.

What moves them is **field-verified entrances**, which is what the
`field_check` status has been saying all along. That is a field programme, not
a migration.

All 247 remain usable destinations today (exactly one trusted destination per
pad, zero missing). That has been true since Batch 0 / PR #177.

---

## 8. Standing constraints

- Public Google rows: **1 route + 1 handoff — NOT zero.** That one row is
  COLOGIE (`e2b32e85-9e93-4388-8215-9d8167cbbeb8`), released by migration
  `20260825210231_v18_cologie_exact_public_google_release.sql`. Several repo
  docs — including `docs/issue97-ohio-source-gap-evidence-20260825.md` and the
  Batch 0 ledger — still say "public Google rows: 0", because they predate that
  release. **Verify against production, not the docs.** A migration that
  asserts zero fails its own preflight; pin the COLOGIE baseline instead.
- Cutover: **OFF** (`cutover_at is null`). Must stay off.
- PR #98 is **closed and unmerged** — leave it closed.
- COLOGIE is the only public Google row that exists. Any identity/mapping
  refresh queues dependent private-Google receipts through
  `private_verification.brinesearch_issue97_google_route_refresh_deferred`
  (`DEFERRABLE INITIALLY DEFERRED`); the HAS dependency set includes COLOGIE.
  Restaling it is the worst available outcome — assert it untouched.
- Migrations are **county-atomic**. The state manifest requires exactly one
  release-current build for each of 19 Ohio counties; a cross-county
  transaction trips it (see the HAS/Scout fail-stop of 2026-08-24).
- Process: read-only preflight → **one** rollback-only rehearsal → **one**
  permanent apply. **No retry on failure** — fail-stop, report, stop.
- Expect ~700 s per attempt. Set `statement_timeout` accordingly.

---

## 9. Related artifacts

- Banjo-Class Work Order (published page):
  <https://claude.ai/code/artifact/8bb758c1-d69a-47a3-902b-2147bfe5df00>
  **Superseded** — it lists 20 candidate pads from `pad-fallback-data.json`
  screening, before live verification cut that to 1. Do not plan from it.
- `pad-fallback-data.json` is explicitly excluded from navigation by the Batch 0
  ledger. Useful for shape analysis only; never as authority.
- Template to follow: `supabase/migrations/20260827015800_issue97_banjo_oh519_named_core.sql`
- Contract: `supabase/migrations/20260826223616_v18_named_approach_release_contract.sql`
- Policy: `docs/ROAD_MANAGER_DIRECTION_POLICY.md`
- Prior failure evidence: `docs/issue97-held-route-checkpoint-20260824.md`

---

## 10. Next action

Rehearse `20260827180000_issue97_beetle_oh519_named_core.sql` rollback-only,
outside the 60-second tool timeout. If it passes, get explicit owner
authorization, then apply once. Do not retry on failure.
