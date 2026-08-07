# BrineSearch V17.2 — Road Manager owner-access correction

## What was wrong
- Settings displayed two Road Manager cards because both the V17 compatibility runtime and the older device-local Road Manager injected their own entry.
- The shared Road Manager screen was presented as an editor-capable tool even though it controls master road records used across pads.
- Supabase allowed Editor, Administrator, and Owner accounts to create or update master road records.

## What changed
- Removed both obsolete injected Settings entries from normal layout and keyboard/screen-reader navigation.
- Added one Road Manager entry at the top of the existing **Owner controls** section.
- Redirected the old `#/roads` route and legacy Road Manager launch methods to the central `#/settings/roads` screen.
- Guarded direct Road Manager URLs by checking the signed-in account against the live Supabase `editor_accounts` record.
- Hid the Pad Editor **Open Road Manager** shortcut from non-owner accounts.
- Kept the Pad Editor road search/picker available for its existing route workflow, while the master Road Manager itself remains owner-only.
- Changed Supabase row-level security so only the BrineSearch Owner can insert, update, or delete master `brinesearch_roads` records. Public road reads remain available.
- Added an automated build verification that checks the owner-only entry, legacy duplicate suppression, direct-route guard, Pad Editor shortcut, and database policy migration.

## Implementation audit
- The central V17 Road Manager correctly uses the live Supabase `brinesearch_roads` table rather than the older device-local IndexedDB road manager.
- The road schema supports official names, aliases, road type, location, surface, truck-route designation, road warnings/restrictions, CB channel, notes, and verification status.
- Pad-to-road linking is supported by the `brinesearch_pad_roads` table with ordered primary/alternate route steps.
- At the time of this correction, the live database contained 1,173 pads but no master road records or pad-road links yet. No road data was invented or seeded during this fix.
