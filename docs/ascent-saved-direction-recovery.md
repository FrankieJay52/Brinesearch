# Ascent saved-direction recovery checkpoint

## What was recovered

The saved driver directions were not lost. BrineSearch has two separate route representations:

- `written_directions` and cleaned `directions_clear` preserve the field source: original road order, turns, mileage, notes, and wording.
- Active primary route prep and its steps are a separate exact-road layer. They may contain Road Manager IDs and matching evidence, but only when that evidence exists.

V18 now treats the saved directions as a first-class reference instead of silently replacing them when a newer exact route, reviewed Google handoff, or measured display route is present. On a pad page, the reviewed/exact navigation section appears first and **Saved field directions** follows it. The saved section remains labeled **Original road wording and mileage** and **Text only · no teal geometry**.

An exact-record safety or cross-binding hold still fails closed. A route-selection state or the presence of displayed route steps does not, by itself, hide the saved source.

## Authority boundary

Saved text is source evidence. It is not, by itself:

- exact road geometry;
- a canonical Road Manager identity;
- graph membership or exact junction proof;
- route-lock or approved-haul authority;
- a public Google route release; or
- permission to color a straight GPS tether teal.

This checkpoint changes no map geometry, route release, Road Manager mapping, graph, Google publication, or cutover state. Future exact-road matching must begin with the saved ordered route and then prove each exact identity separately. Lease Road, Access Road, Gate, and Pad wording stays source text unless separate exact evidence exists.

## Deterministic reconciliation audit

`v18/scripts/audit-ascent-saved-direction-reconciliation.mjs` accepts a credential-free JSON export and produces one stable row per pad. It:

- selects only Ascent pads in Belmont, Guernsey, Harrison, Jefferson, Monroe, and Noble counties in Ohio;
- compares the explicit saved sequence with the active primary route-prep source sequence in order;
- normalizes only Unicode form, case, and whitespace for comparison;
- does not equate aliases such as `OH-78` and `SR-78`, `Maynard` and `Maynard Road`, or any nearest/fuzzy/name-only match;
- compares numbered saved steps only when route prep explicitly stores the exact saved text it matched;
- reports attached road IDs, identity work still pending, clear-vs-structured sequence conflicts, generic/ambiguous steps, private/lease steps, forbidden match methods, Road-ID/status contradictions, and exact blockers; and
- keeps output order deterministic by county, pad name, and pad ID.

The script contains a read-only export query. It can be printed with:

```text
node --experimental-strip-types scripts/audit-ascent-saved-direction-reconciliation.mjs --print-read-only-sql
```

After a trusted operator exports that SELECT result, run:

```text
node --experimental-strip-types scripts/audit-ascent-saved-direction-reconciliation.mjs --input <export.json> --output <ledger.json>
```

Neither mode contains database credentials or performs database mutations.

## Production read-only observation

Observed through a SELECT-only Supabase connection at **2026-08-29 22:43:23.826717+00:00**:

| Metric | Count |
| --- | ---: |
| Ascent Ohio pads in the original six counties | 247 |
| `written_directions` present | 247 |
| `directions_clear` present | 243 |
| `structured_road_sequence` present | 243 |
| `pads.structured_route_steps` nonempty | 0 |
| Active primary route-prep records | 223 |
| Pads without active primary route prep | 24 |
| Duplicate active primary route prep records | 0 |
| Active primary route-prep steps | 1,125 |

The deterministic exact-source pass classified the 247 rows as:

| Classification | Pads |
| --- | ---: |
| `SOURCE_STEP_DROPPED` | 222 |
| `SOURCE_PRESENT_PREP_MISSING` | 21 |
| `SOURCE_ONLY_UNSTRUCTURED` | 4 |
| `EXACT_SOURCE_PRESERVED` | 0 |
| `PREP_STEP_NOT_IN_SAVED_SOURCE` | 0 |
| `ROAD_IDENTITY_PENDING` | 0 |
| `GENERIC_OR_AMBIGUOUS` | 0 |
| `PRIVATE_ACCESS_PENDING` | 0 |

The classification is a single deterministic primary category. Concurrent blocker fields remain populated even when an earlier category wins. The step-level counts below come from the 223 active prep rows; the clear-vs-structured conflict count comes from the 243 pads carrying both saved sequence representations.

| Concurrent blocker/evidence | Count |
| --- | ---: |
| Public-road steps needing an official identity match | 211 |
| Exact `directions_clear` / `structured_road_sequence` conflicts | 240 |
| Generic or ambiguous steps | 42 |
| Private or lease steps | 153 |
| Forbidden fuzzy/name-only/nearest/semantic match methods | 0 |
| Unreviewed or missing exact-status match methods | 0 |
| Road-ID / match-status contradictions | 5 |

The forbidden-method count was rechecked read-only at **2026-08-29 23:14:14.091016+00:00** after that fail-closed audit rule was added. The reviewed exact-method allowlist had zero unknown exact-status methods at **2026-08-29 23:20:24.124166+00:00**. The cross-source sequence comparison was rechecked at **2026-08-29 23:17:02.049625+00:00**: 243 pads had both fields, 240 differed under the audit's exact normalization, and 3 matched exactly. A conflict records two preserved source representations; it does not choose one by fuzzy equivalence.

`SOURCE_STEP_DROPPED` does not mean the saved directions were deleted. It means the current prep representation does not exactly preserve the saved ordered source under the deliberately strict comparison. Those rows are the future reconciliation queue; no alias inference or geometry promotion was used to make them appear complete.

## Remaining exact blockers

- Active primary route prep is absent for 24 pads, including three of the four unstructured-source rows.
- The 222 pads with both cleaned source and active prep still have at least one exact ordered source/prep mismatch.
- Numbered saved instructions often lack an explicit per-step `matched_from_saved_text` link, so the audit reports that relationship unresolved instead of comparing prose semantically.
- Public road identities, generic steps, and private access remain separate concurrent work queues shown above.
- The additive migration in this checkpoint attaches exact-pad sanitized saved text to both exact-ready status paths without changing their status-revision, route, graph, geometry, or Google-release bytes. It also limits the `written_directions` fallback to the measured Ascent Ohio six-county scope. The migration is committed for review only and has not been applied to production.

Production writes: **0**. Graph changes: **0**. Public Google changes: **0**. Cutover changes: **0**.
