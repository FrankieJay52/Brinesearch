# Issue #97 — Ascent reviewed Google handoffs batch 3 — 2026-08-28

## Scope

This batch adds eight exact-record, owner-reviewed Google handoffs. It does not create graph geometry, approve a lease road, publish a public Google route, change cutover, run a migration, or write production data.

Every app URL omits `origin`, so Google starts from the phone's current location. Ordered shaping points preserve each reviewed local-road approach. The upstream state/highway path remains Google-selected. Each link stays separate from exact graph and public-Google authority.

## Google turn-list validation

Each exact URL was opened in Google Maps using the browser's current-location context at review time, and the rendered turn list was inspected. This proves the ordered local shaping segment for that tested rendering; it does not prove one fixed upstream approach from every possible phone location. Because every URL omits `origin`, Google remains free to choose the upstream state/highway route. No loop, backtrack, wrong-side local approach, or unreviewed local-road shortcut appeared in the tested rendering.

| Pad | Exact record | Trusted destination | Shaping points | Checked local turn list | Result |
| --- | --- | --- | --- | --- | --- |
| ALBATROSS | `48d810bf-e59f-4314-9efb-8103a818a3bd` · rev `1786265812046205` | saved pad GPS `40.079353,-81.224381` | `40.0817058,-81.2127365` | OH-800 near Brooks Rd → Brooks Rd → saved GPS | Passed for tested rendering; movement to saved GPS remains unapproved |
| MALDON | `8f616827-d7da-4b40-b9c2-49fd5e713822` · rev `1786265812046205` | saved pad GPS `40.010241,-81.197285` | `40.0068106,-81.1762346`; `40.0106308,-81.1957784` | Shannon Rd → Lowe Rd → saved GPS | Passed for tested rendering; 446-foot forward final GPS handoff remains unapproved |
| WITHEY | `f2df293f-13a2-401e-96b2-21e71ac63e6a` · rev `1786246617744175` | verified driver entrance `39.962005,-81.216813` | `39.967149,-81.2055552` | Gobblers Knob Rd → verified entrance | Passed for tested rendering; destination reached with no local detour |
| SKULL FORK | `06ac93a2-3b46-44fd-9fa6-2fd29201858a` · rev `1787459253071652` | exact trusted pin (directory role remains verified driver entrance) `40.159734,-81.260675` | `40.167610,-81.259685` | Cadiz Rd / US-22 → Repik Ln / TR-9876 → exact pin | Owner live proof and repeated Cadiz turn-list QA passed: Google stayed on US-22, turned left onto Repik, then continued on Repik to the exact pin. The existing URL/control stays frozen; named road to pin is sufficient without inventing pad-deck or lease geometry or promoting graph/public-Google authority. |
| HOOP | `351b72fb-eb48-4355-b6fc-d8e9a867f79c` · rev `1787459253071652` | saved pad GPS `40.166384,-81.325728` | `40.053083897672,-81.551936547892`; `40.1495834623593,-81.3150932898081`; `40.1536867643988,-81.3127475000983` | I-77 N Exit 47 → US-22 E (15.5 mi) → Titus Rd → saved GPS | Passed for tested rendering with no Pennyroyal shortcut or backtrack; the first point sits inside US-22 about 91 m beyond the Broom Road junction, the next two are inside US-22/Titus, and Google's Hoop Lane label plus all post-Titus movement remain an unapproved GPS/lease handoff |
| BRAVO | `4c73e244-6132-4d40-83fc-3fe5e6e65bf6` · rev `1786265812046205` | saved pad GPS `40.178556,-81.015064` | `40.1849138,-80.9958138` | Hite Rd (Google displays Crazy Rd) → saved GPS | Passed for tested rendering; the exact stored sequence names Hite Rd, so Google's Crazy Rd label is display context only, not a new road identity |
| RUTH | `7dcd1f71-fa32-4edc-ae3d-aa9717d0c72c` · rev `1787459253071652` | verified driver entrance `40.173626,-80.879115` | `40.1771191,-80.8806516` | US-250 near entrance → entrance turn → verified entrance | Passed for tested rendering; final entrance movement remains an unapproved handoff |
| ATHENA | `3850e94a-826f-4b6b-a54f-d21d482fca46` · rev `1787459253071652` | saved pad GPS `40.278613,-80.765988` | `40.2799914,-80.7619003` | OH-151 near pad → saved GPS | Passed for tested rendering; movement to the saved point remains an unapproved GPS handoff, not a verified entrance |

Google sometimes displays a street address or its own alias at a shaping point. The contract binds the exact pad identity, record revision, stored road sequence, trusted coordinate source, destination coordinate, and ordered shaping coordinates—not Google's address prose.

## Fail-closed boundary

- A stale record revision, changed identity, changed stored sequence, changed coordinate, or changed coordinate source removes the reviewed handoff.
- Saved pad GPS is never relabeled as a verified entrance.
- HOOP's entire post-Titus movement (including Google's Hoop Lane label), BRAVO's final short unnamed turn, and every saved-pin/lease movement described above remain unapproved.
- Existing released or approved routes continue to outrank these reviewed handoffs.
- Public Google publication is unchanged.
- Cutover remains off.
- Production database writes: zero.
- Migrations: zero.

## Result

Eight pads move from the GPS-only action to one exact-record reviewed Google handoff. All eight remain `reviewed_handoff_authority_held` for graph and public-Google authority.
