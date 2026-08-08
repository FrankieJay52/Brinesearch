# Ruby-Opal route and public projection rollout — August 8, 2026

## Ruby-Opal

Ruby-Opal receives the first published Clear Directions record after all remaining field facts were resolved.

- I-77 south
- Exit 28 for OH-821 / Belle Valley
- OH-821 south
- Left onto OH-215 east / Wolf Run Road
- Continue onto OH-285 / Sarahsville Road
- Continue onto OH-146
- Right to stay on OH-146 / Zep Road
- Left onto Roberta Cleary Lane / TR-226
- Ruby-Opal entrance on the left

Mileage is rounded and kept on the road card it describes. The route was checked against official ODOT Road Inventory identities/intersections and route geometry. No unnamed local road, private-road mileage, gate fact, or landmark was invented.

## ABLE and DURR

These remain intentionally unpublished:

- **ABLE:** the only saved direction is `North`. It has no complete road sequence or confirmed lease entrance route.
- **DURR:** every saved approach explicitly ends at the Sidwell pad. Durr has no independent GPS, address, API, official pad match, or route evidence tying the Sidwell directions to Durr.

Their `directions_clear` fields remain blank under the no-guess policy.

## All-Ascent audit

The production preflight found:

- 252 Ascent records total
- 249 existing standardized Clear Directions records before Ruby-Opal
- 250 standardized Clear Directions records after Ruby-Opal
- ABLE and DURR remain the only blocked records
- Zero separate mileage-only direction cards
- Zero warning/landmark/note-only driving cards
- Zero nonstandard Clear Directions records
- Zero blocked pads with published Clear Directions

## Public database boundary

The owner-rights public pad views are replaced by a synchronized, read-only projection table plus a `security_invoker` summary view.

- Browser roles still cannot select from `public.pads`.
- Public consumers keep the existing `public_pad_detail` and `public_pad_directory_summary` API names and column contract.
- Only the explicitly filtered public fields are copied into the projection.
- Inserts, edits, and deletes on `public.pads` synchronize automatically through a non-callable trigger function.
- Internal ODOT work tables, the submission queue, and public-submission rate events receive explicit deny policies.
- The completed temporary source-provenance transfer payload is archived privately and its leftover public table is removed.

## Validation gates

Before production application, both migrations were executed inside a rollback transaction against the live schema. The projection preserved all 1,173 current pad records, retained anonymous safe-view access, and kept direct anonymous `pads` access denied. Ruby-Opal passed its route assertions while ABLE and DURR remained blank.

The release branch also runs the full V17 build, assembled-JavaScript syntax check, security wiring checks, migration guard checks, and production dependency audit before merge.

## Deliberate fail-closed control

The anonymous Add-a-Pad gateway remains unavailable until production Cloudflare Turnstile credentials are configured. It returns a controlled temporary-unavailable response rather than accepting unchallenged public submissions. Signed-in editor tools and the public directory are separate from this control.
