# BrineSearch V17.3 — Source provenance correction

- Official pad information now identifies the agency and public dataset it came from.
- Added a **View official source** link when a public source URL is available.
- Added the official source record ID, match date, and location method to the pad-information panel.
- Backfilled missing source metadata for all 845 pads that currently have an attached official pad record; none remain without a named source.
- Corrected the Lance record to identify the Ohio Department of Natural Resources `DOG_Services/WellPads` public GIS layer, ODNR object ID 692, checked August 4, 2026.
- Corrected API summary logic so an API used for an exact official pad match counts as confirmed even when a separate well-record array was not attached.
- Changed unreviewed APIs from the misleading “not in the public layer” wording to **Not individually confirmed yet**.
- Corrected the status label from “Api” to **API**.
- Added source-provenance regression checks and changed the offline cache marker so installed iPhone web apps receive the correction.

This is a correction during V17.3 review. It does not mark the overall V17.3 redesign as accepted.
